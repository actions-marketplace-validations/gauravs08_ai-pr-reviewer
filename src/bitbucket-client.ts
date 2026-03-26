/**
 * Bitbucket Platform Client
 *
 * Implements PlatformClient for Bitbucket pull requests.
 * Supports both Bitbucket Cloud and Bitbucket Server/Data Center.
 * Uses REST API directly (no SDK dependency).
 *
 * For Bitbucket Cloud (Pipelines):
 *   BITBUCKET_WORKSPACE    - workspace slug
 *   BITBUCKET_REPO_SLUG    - repository slug
 *   BITBUCKET_PR_ID        - pull request ID
 *   BITBUCKET_COMMIT       - head commit SHA
 *
 * For Bitbucket Server:
 *   BITBUCKET_SERVER_URL   - e.g. https://git.example.com
 *   BITBUCKET_PROJECT_KEY  - project key (e.g. PROJ)
 *   BITBUCKET_REPO_SLUG    - repository slug
 *   BITBUCKET_PR_ID        - pull request ID
 *
 * Required secrets:
 *   BITBUCKET_TOKEN        - Access token with PR read/write scope
 */

import { DiffFile, parsePatch } from './diff-parser';
import { ReviewFinding } from './ai-reviewer';
import { PlatformClient, PRContext, ExistingComment, Platform } from './platform-client';

function log(msg: string): void {
  console.log(`[bitbucket] ${msg}`);
}

function warn(msg: string): void {
  console.warn(`[bitbucket] WARNING: ${msg}`);
}

export class BitbucketClient implements PlatformClient {
  private baseUrl: string;
  private token: string;
  private isCloud: boolean;
  private context: PRContext;
  private workspace: string;
  private repoSlug: string;
  private prId: string;

  constructor(token: string, platform: Platform) {
    this.token = token;
    this.isCloud = platform === 'bitbucket-cloud';

    if (this.isCloud) {
      this.baseUrl = 'https://api.bitbucket.org/2.0';
      this.workspace = process.env.BITBUCKET_WORKSPACE || '';
      this.repoSlug = process.env.BITBUCKET_REPO_SLUG || '';
      this.prId = process.env.BITBUCKET_PR_ID || '';
    } else {
      const serverUrl = process.env.BITBUCKET_SERVER_URL || '';
      this.baseUrl = `${serverUrl}/rest/api/1.0`;
      this.workspace = process.env.BITBUCKET_PROJECT_KEY || '';
      this.repoSlug = process.env.BITBUCKET_REPO_SLUG || '';
      this.prId = process.env.BITBUCKET_PR_ID || '';
    }

    if (!this.workspace || !this.repoSlug || !this.prId) {
      throw new Error(
        'Bitbucket environment not detected. Required: BITBUCKET_WORKSPACE/BITBUCKET_PROJECT_KEY, BITBUCKET_REPO_SLUG, BITBUCKET_PR_ID'
      );
    }

    this.context = {
      owner: this.workspace,
      repo: this.repoSlug,
      pullNumber: parseInt(this.prId, 10),
      headSha: process.env.BITBUCKET_COMMIT || '',
      baseBranch: process.env.BITBUCKET_PR_DESTINATION_BRANCH || 'main',
      headBranch: process.env.BITBUCKET_BRANCH || '',
      title: '',
      platform,
    };
  }

  getContext(): PRContext {
    return this.context;
  }

  private async apiCall(endpoint: string, options: RequestInit = {}): Promise<any> {
    let url: string;
    if (this.isCloud) {
      url = `${this.baseUrl}/repositories/${this.workspace}/${this.repoSlug}/pullrequests/${this.prId}${endpoint}`;
    } else {
      url = `${this.baseUrl}/projects/${this.workspace}/repos/${this.repoSlug}/pull-requests/${this.prId}${endpoint}`;
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Bitbucket API ${response.status}: ${text}`);
    }

    return response.json();
  }

  async getChangedFiles(): Promise<DiffFile[]> {
    const files: DiffFile[] = [];

    if (this.isCloud) {
      // Bitbucket Cloud: GET /diffstat
      let url: string | null = `/diffstat?pagelen=100`;
      while (url) {
        const data = await this.apiCall(url);
        for (const entry of data.values || []) {
          const filename = entry.new?.path || entry.old?.path || '';
          let status = 'modified';
          if (entry.status === 'added') status = 'added';
          if (entry.status === 'removed') status = 'removed';
          if (entry.status === 'renamed') status = 'renamed';

          files.push({
            filename,
            status,
            additions: entry.lines_added || 0,
            deletions: entry.lines_removed || 0,
            patch: '', // Cloud diffstat doesn't include patch; fetched separately
            changedLines: new Set(),
          });
        }
        url = data.next ? data.next.replace(this.baseUrl, '') : null;
      }

      // Fetch actual diff for patch content
      const diffUrl = `${this.baseUrl}/repositories/${this.workspace}/${this.repoSlug}/pullrequests/${this.prId}/diff`;
      const diffResponse = await fetch(diffUrl, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      if (diffResponse.ok) {
        const rawDiff = await diffResponse.text();
        this.enrichFilesWithPatch(files, rawDiff);
      }
    } else {
      // Bitbucket Server: GET /diff
      const data = await this.apiCall('/diff?contextLines=5&withComments=false');
      for (const diff of data.diffs || []) {
        const filename = diff.destination?.toString || diff.source?.toString || '';
        let status = 'modified';
        if (!diff.source) status = 'added';
        if (!diff.destination) status = 'removed';

        let patch = '';
        let additions = 0;
        let deletions = 0;

        for (const hunk of diff.hunks || []) {
          for (const segment of hunk.segments || []) {
            for (const line of segment.lines || []) {
              if (segment.type === 'ADDED') {
                patch += `+${line.line}\n`;
                additions++;
              } else if (segment.type === 'REMOVED') {
                patch += `-${line.line}\n`;
                deletions++;
              } else {
                patch += ` ${line.line}\n`;
              }
            }
          }
        }

        const { changedLines } = parsePatch(patch);
        files.push({ filename, status, additions, deletions, patch, changedLines });
      }
    }

    return files;
  }

  /**
   * Parse raw unified diff and attach patches to corresponding files.
   */
  private enrichFilesWithPatch(files: DiffFile[], rawDiff: string): void {
    const fileDiffs = rawDiff.split(/^diff --git /m).filter(Boolean);

    for (const fileDiff of fileDiffs) {
      const headerMatch = fileDiff.match(/a\/(.+?) b\/(.+)/);
      if (!headerMatch) continue;

      const filename = headerMatch[2];
      const file = files.find((f) => f.filename === filename);
      if (!file) continue;

      const patchStart = fileDiff.indexOf('@@');
      if (patchStart >= 0) {
        file.patch = fileDiff.slice(patchStart);
        const { changedLines } = parsePatch(file.patch);
        file.changedLines = changedLines;
      }
    }
  }

  async getExistingBotComments(): Promise<ExistingComment[]> {
    const botComments: ExistingComment[] = [];

    try {
      const endpoint = this.isCloud ? '/comments?pagelen=100' : '/comments?limit=500';
      const data = await this.apiCall(endpoint);
      const comments = this.isCloud ? data.values || [] : data.values || [];

      for (const comment of comments) {
        const body = this.isCloud
          ? comment.content?.raw || ''
          : comment.text || '';

        if (body.includes('AI Review') || body.includes('AI Finding')) {
          let path = '';
          let line = 0;

          if (this.isCloud && comment.inline) {
            path = comment.inline.path || '';
            line = comment.inline.to || 0;
          } else if (!this.isCloud && comment.anchor) {
            path = comment.anchor.path || '';
            line = comment.anchor.line || 0;
          }

          botComments.push({ path, line, body });
        }
      }
    } catch (error: any) {
      warn(`Failed to fetch existing comments: ${error.message}`);
    }

    return botComments;
  }

  async postReview(
    findings: ReviewFinding[],
    summary: string,
    postSummary: boolean
  ): Promise<void> {
    const inlineFindings = findings.filter(
      (f) => f.commentType === 'inline' && f.file && f.line
    );

    let posted = 0;
    for (const finding of inlineFindings) {
      try {
        if (this.isCloud) {
          await this.apiCall('/comments', {
            method: 'POST',
            body: JSON.stringify({
              content: { raw: finding.description },
              inline: {
                path: finding.file,
                to: finding.line,
              },
            }),
          });
        } else {
          await this.apiCall('/comments', {
            method: 'POST',
            body: JSON.stringify({
              text: finding.description,
              anchor: {
                path: finding.file,
                line: finding.line,
                lineType: finding.lineType || 'ADDED',
                fileType: 'TO',
              },
            }),
          });
        }
        posted++;
      } catch (error: any) {
        warn(`Inline comment failed for ${finding.file}:${finding.line}: ${error.message}`);
        // Fallback: post as general comment
        try {
          await this.postGeneralComment(
            `**${finding.file}:${finding.line}**\n\n${finding.description}`
          );
          posted++;
        } catch (fallbackError: any) {
          warn(`Fallback comment also failed: ${fallbackError.message}`);
        }
      }
    }

    log(`Posted ${posted}/${inlineFindings.length} inline comments`);

    // General findings
    const generalFindings = findings.filter((f) => f.commentType === 'general');
    for (const finding of generalFindings) {
      await this.postGeneralComment(finding.description);
    }

    // Summary
    if (postSummary && summary) {
      await this.postGeneralComment(summary);
      log('Posted summary comment');
    }
  }

  private async postGeneralComment(text: string): Promise<void> {
    try {
      if (this.isCloud) {
        await this.apiCall('/comments', {
          method: 'POST',
          body: JSON.stringify({ content: { raw: text } }),
        });
      } else {
        await this.apiCall('/comments', {
          method: 'POST',
          body: JSON.stringify({ text }),
        });
      }
    } catch (error: any) {
      warn(`Failed to post comment: ${error.message}`);
    }
  }
}
