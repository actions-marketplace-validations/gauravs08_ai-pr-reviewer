/**
 * GitHub Platform Client
 *
 * Implements PlatformClient for GitHub pull requests.
 * Uses @actions/github (Octokit) for API calls.
 * Supports: fetching PR diff, posting batch/individual review comments, summary comments.
 */

import * as github from '@actions/github';
import { DiffFile, parsePatch } from './diff-parser';
import { ReviewFinding } from './ai-reviewer';
import { PlatformClient, PRContext, ExistingComment } from './platform-client';
import * as log from './logger';

type Octokit = ReturnType<typeof github.getOctokit>;

export class GitHubClient implements PlatformClient {
  private octokit: Octokit;
  private context: PRContext;

  constructor(token: string) {
    this.octokit = github.getOctokit(token);
    const ctx = github.context;

    if (!ctx.payload.pull_request) {
      throw new Error('This action can only run on pull_request events');
    }

    this.context = {
      owner: ctx.repo.owner,
      repo: ctx.repo.repo,
      pullNumber: ctx.payload.pull_request.number,
      headSha: ctx.payload.pull_request.head.sha,
      baseBranch: ctx.payload.pull_request.base.ref,
      headBranch: ctx.payload.pull_request.head.ref,
      title: ctx.payload.pull_request.title,
      platform: 'github',
    };
  }

  getContext(): PRContext {
    return this.context;
  }

  async getChangedFiles(): Promise<DiffFile[]> {
    const files: DiffFile[] = [];
    let page = 1;

    while (true) {
      const { data } = await this.octokit.rest.pulls.listFiles({
        owner: this.context.owner,
        repo: this.context.repo,
        pull_number: this.context.pullNumber,
        per_page: 100,
        page,
      });

      if (data.length === 0) break;

      for (const file of data) {
        const { changedLines } = parsePatch(file.patch ?? '');
        files.push({
          filename: file.filename,
          status: file.status,
          additions: file.additions,
          deletions: file.deletions,
          patch: file.patch ?? '',
          changedLines,
        });
      }

      if (data.length < 100) break;
      page++;
    }

    return files;
  }

  async getExistingBotComments(): Promise<ExistingComment[]> {
    const botComments: ExistingComment[] = [];

    try {
      // Fetch all review comments once (not per-review)
      const { data: comments } = await this.octokit.rest.pulls.listReviewComments({
        owner: this.context.owner,
        repo: this.context.repo,
        pull_number: this.context.pullNumber,
        per_page: 100,
      });

      for (const comment of comments) {
        if (comment.body.includes('AI Finding') || comment.body.includes('AI Review')) {
          botComments.push({
            path: comment.path,
            line: comment.line ?? comment.original_line ?? 0,
            body: comment.body,
          });
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warning(`Failed to fetch existing comments: ${message}`);
    }

    return botComments;
  }

  async postReview(
    findings: ReviewFinding[],
    summary: string,
    postSummary: boolean
  ): Promise<void> {
    const inlineComments = findings
      .filter((f) => f.commentType === 'inline' && f.file && f.line)
      .map((f) => ({
        path: f.file!,
        line: f.line!,
        body: f.description,
      }));

    // Post review with inline comments
    if (inlineComments.length > 0) {
      try {
        await this.octokit.rest.pulls.createReview({
          owner: this.context.owner,
          repo: this.context.repo,
          pull_number: this.context.pullNumber,
          commit_id: this.context.headSha,
          event: 'COMMENT',
          body: postSummary ? summary : undefined,
          comments: inlineComments,
        });
        log.info(`Posted review with ${inlineComments.length} inline comments`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warning(`Batch review failed: ${message}. Posting individually.`);
        await this.postCommentsIndividually(inlineComments);
        if (postSummary && summary) {
          await this.postSummaryComment(summary);
        }
      }
    } else if (postSummary && summary) {
      await this.postSummaryComment(summary);
    }

    // Post general comments (cross-file findings) as PR comments
    const generalFindings = findings.filter((f) => f.commentType === 'general');
    for (const finding of generalFindings) {
      await this.postPRComment(finding.description);
    }
  }

  private async postCommentsIndividually(
    comments: Array<{ path: string; line: number; body: string }>
  ): Promise<void> {
    let posted = 0;

    for (const comment of comments) {
      try {
        await this.octokit.rest.pulls.createReviewComment({
          owner: this.context.owner,
          repo: this.context.repo,
          pull_number: this.context.pullNumber,
          commit_id: this.context.headSha,
          path: comment.path,
          line: comment.line,
          body: comment.body,
        });
        posted++;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warning(`Failed to post comment on ${comment.path}:${comment.line}: ${message}`);
      }
    }

    log.info(`Posted ${posted}/${comments.length} individual comments`);
  }

  private async postSummaryComment(summary: string): Promise<void> {
    try {
      await this.octokit.rest.issues.createComment({
        owner: this.context.owner,
        repo: this.context.repo,
        issue_number: this.context.pullNumber,
        body: summary,
      });
      log.info('Posted summary comment');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warning(`Failed to post summary: ${message}`);
    }
  }

  private async postPRComment(body: string): Promise<void> {
    try {
      await this.octokit.rest.issues.createComment({
        owner: this.context.owner,
        repo: this.context.repo,
        issue_number: this.context.pullNumber,
        body,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.warning(`Failed to post general comment: ${message}`);
    }
  }
}
