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
import { DiffFile } from './diff-parser';
import { ReviewFinding } from './ai-reviewer';
import { PlatformClient, PRContext, ExistingComment, Platform } from './platform-client';
export declare class BitbucketClient implements PlatformClient {
    private baseUrl;
    private token;
    private isCloud;
    private context;
    private workspace;
    private repoSlug;
    private prId;
    constructor(token: string, platform: Platform);
    getContext(): PRContext;
    private apiCall;
    getChangedFiles(): Promise<DiffFile[]>;
    /**
     * Parse raw unified diff and attach patches to corresponding files.
     */
    private enrichFilesWithPatch;
    getExistingBotComments(): Promise<ExistingComment[]>;
    postReview(findings: ReviewFinding[], summary: string, postSummary: boolean): Promise<void>;
    private postGeneralComment;
}
