/**
 * GitHub Platform Client
 *
 * Implements PlatformClient for GitHub pull requests.
 * Uses @actions/github (Octokit) for API calls.
 * Supports: fetching PR diff, posting batch/individual review comments, summary comments.
 */
import { DiffFile } from './diff-parser';
import { ReviewFinding } from './ai-reviewer';
import { PlatformClient, PRContext, ExistingComment } from './platform-client';
export declare class GitHubClient implements PlatformClient {
    private octokit;
    private context;
    constructor(token: string);
    getContext(): PRContext;
    getChangedFiles(): Promise<DiffFile[]>;
    getExistingBotComments(): Promise<ExistingComment[]>;
    postReview(findings: ReviewFinding[], summary: string, postSummary: boolean): Promise<void>;
    private postCommentsIndividually;
    private postSummaryComment;
    private postPRComment;
}
