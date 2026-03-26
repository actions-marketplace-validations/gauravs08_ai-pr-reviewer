import { DiffFile } from './diff-parser';
import { ReviewFinding } from './ai-reviewer';
/**
 * Common interface for all Git platform clients (GitHub, GitLab, Bitbucket).
 * Each platform implements this to normalize PR/MR operations.
 */
export interface PRContext {
    owner: string;
    repo: string;
    pullNumber: number;
    headSha: string;
    baseBranch: string;
    headBranch: string;
    title: string;
    platform: Platform;
}
export type Platform = 'github' | 'gitlab' | 'bitbucket-cloud' | 'bitbucket-server';
export interface ExistingComment {
    path: string;
    line: number;
    body: string;
}
export interface PlatformClient {
    /** Get PR/MR context (owner, repo, number, branches, etc.) */
    getContext(): PRContext;
    /** Fetch all changed files with their patches/diffs */
    getChangedFiles(): Promise<DiffFile[]>;
    /** Get existing bot review comments for deduplication */
    getExistingBotComments(): Promise<ExistingComment[]>;
    /** Post review with inline comments and optional summary */
    postReview(findings: ReviewFinding[], summary: string, postSummary: boolean): Promise<void>;
}
/**
 * Detect platform from environment variables set by CI systems.
 */
export declare function detectPlatform(): Platform;
