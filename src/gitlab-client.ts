/**
 * GitLab Platform Client
 *
 * Implements PlatformClient for GitLab merge requests.
 * Uses GitLab REST API v4 directly (no SDK dependency).
 * Supports: fetching MR diff, posting inline discussion notes, summary notes.
 *
 * Required env vars (set automatically by GitLab CI):
 *   CI_API_V4_URL        - e.g. https://gitlab.com/api/v4
 *   CI_PROJECT_ID        - numeric project ID
 *   CI_MERGE_REQUEST_IID - merge request number
 *   CI_COMMIT_SHA        - head commit SHA
 *
 * Required secrets:
 *   GITLAB_TOKEN          - Personal/project access token with api scope
 */

import { DiffFile, parsePatch } from './diff-parser';
import { ReviewFinding } from './ai-reviewer';
import { PlatformClient, PRContext, ExistingComment } from './platform-client';

function log(msg: string): void {
  console.log(`[gitlab] ${msg}`);
}

function warn(msg: string): void {
  console.warn(`[gitlab] WARNING: ${msg}`);
}

export class GitLabClient implements PlatformClient {
  private apiUrl: string;
  private projectId: string;
  private mrIid: string;
  private token: string;
  private context: PRContext;

  constructor(token: string) {
    this.apiUrl = process.env.CI_API_V4_URL || 'https://gitlab.com/api/v4';
    this.projectId = process.env.CI_PROJECT_ID || '';
    this.mrIid = process.env.CI_MERGE_REQUEST_IID || '';
    this.token = token;

    if (!this.projectId || !this.mrIid) {
      throw new Error(
        'GitLab CI environment not detected. Required: CI_PROJECT_ID, CI_MERGE_REQUEST_IID'
      );
    }

    this.context = {
      owner: process.env.CI_PROJECT_NAMESPACE || '',
      repo: process.env.CI_PROJECT_NAME || '',
      pullNumber: parseInt(this.mrIid, 10),
      headSha: process.env.CI_COMMIT_SHA || '',
      baseBranch: process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME || 'main',
      headBranch: process.env.CI_MERGE_REQUEST_SOURCE_BRANCH_NAME || '',
      title: process.env.CI_MERGE_REQUEST_TITLE || '',
      platform: 'gitlab',
    };
  }

  getContext(): PRContext {
    return this.context;
  }

  private async apiCall(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.apiUrl}/projects/${this.projectId}/merge_requests/${this.mrIid}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'PRIVATE-TOKEN': this.token,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitLab API ${response.status}: ${text}`);
    }

    return response.json();
  }

  async getChangedFiles(): Promise<DiffFile[]> {
    const files: DiffFile[] = [];
    let page = 1;

    while (true) {
      const diffs = await this.apiCall(`/diffs?per_page=100&page=${page}`);

      if (!diffs || diffs.length === 0) break;

      for (const diff of diffs) {
        const { changedLines } = parsePatch(diff.diff || '');

        let status = 'modified';
        if (diff.new_file) status = 'added';
        if (diff.deleted_file) status = 'removed';
        if (diff.renamed_file) status = 'renamed';

        const additions = (diff.diff || '').split('\n').filter((l: string) => l.startsWith('+') && !l.startsWith('+++')).length;
        const deletions = (diff.diff || '').split('\n').filter((l: string) => l.startsWith('-') && !l.startsWith('---')).length;

        files.push({
          filename: diff.new_path || diff.old_path,
          status,
          additions,
          deletions,
          patch: diff.diff || '',
          changedLines,
        });
      }

      if (diffs.length < 100) break;
      page++;
    }

    return files;
  }

  async getExistingBotComments(): Promise<ExistingComment[]> {
    const botComments: ExistingComment[] = [];

    try {
      const notes = await this.apiCall('/notes?per_page=100');

      for (const note of notes) {
        if (
          note.body &&
          (note.body.includes('AI Review') || note.body.includes('AI Finding'))
        ) {
          // GitLab inline notes have position data
          if (note.position) {
            botComments.push({
              path: note.position.new_path || note.position.old_path || '',
              line: note.position.new_line || note.position.old_line || 0,
              body: note.body,
            });
          }
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
    // Post inline findings as discussion notes with position
    const inlineFindings = findings.filter(
      (f) => f.commentType === 'inline' && f.file && f.line
    );

    let posted = 0;
    for (const finding of inlineFindings) {
      try {
        await this.apiCall('/discussions', {
          method: 'POST',
          body: JSON.stringify({
            body: finding.description,
            position: {
              base_sha: this.context.headSha, // GitLab needs base SHA; CI provides commit SHA
              start_sha: this.context.headSha,
              head_sha: this.context.headSha,
              position_type: 'text',
              new_path: finding.file,
              new_line: finding.line,
            },
          }),
        });
        posted++;
      } catch (error: any) {
        // Fall back to regular note if position-based comment fails
        warn(`Inline comment failed for ${finding.file}:${finding.line}: ${error.message}`);
        try {
          await this.apiCall('/notes', {
            method: 'POST',
            body: JSON.stringify({
              body: `**${finding.file}:${finding.line}**\n\n${finding.description}`,
            }),
          });
          posted++;
        } catch (fallbackError: any) {
          warn(`Fallback note also failed: ${fallbackError.message}`);
        }
      }
    }

    log(`Posted ${posted}/${inlineFindings.length} inline comments`);

    // Post general findings as regular notes
    const generalFindings = findings.filter((f) => f.commentType === 'general');
    for (const finding of generalFindings) {
      try {
        await this.apiCall('/notes', {
          method: 'POST',
          body: JSON.stringify({ body: finding.description }),
        });
      } catch (error: any) {
        warn(`Failed to post general comment: ${error.message}`);
      }
    }

    // Post summary
    if (postSummary && summary) {
      try {
        await this.apiCall('/notes', {
          method: 'POST',
          body: JSON.stringify({ body: summary }),
        });
        log('Posted summary comment');
      } catch (error: any) {
        warn(`Failed to post summary: ${error.message}`);
      }
    }
  }
}
