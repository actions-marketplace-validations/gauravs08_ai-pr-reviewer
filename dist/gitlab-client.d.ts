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
import { DiffFile } from './diff-parser';
import { ReviewFinding } from './ai-reviewer';
import { PlatformClient, PRContext, ExistingComment } from './platform-client';
export declare class GitLabClient implements PlatformClient {
    private apiUrl;
    private projectId;
    private mrIid;
    private token;
    private context;
    constructor(token: string);
    getContext(): PRContext;
    private apiCall;
    getChangedFiles(): Promise<DiffFile[]>;
    getExistingBotComments(): Promise<ExistingComment[]>;
    postReview(findings: ReviewFinding[], summary: string, postSummary: boolean): Promise<void>;
}
