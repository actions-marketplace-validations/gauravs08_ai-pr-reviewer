import { DiffFile } from './diff-parser';
import { ReviewFinding } from './ai-reviewer';

/**
 * Common interface for all Git platform clients (GitHub, GitLab, Bitbucket).
 * Each platform implements this to normalize PR/MR operations.
 */
export interface PRContext {
  owner: string;        // GitHub org, GitLab namespace, Bitbucket project
  repo: string;         // Repository slug
  pullNumber: number;   // PR/MR number
  headSha: string;      // Latest commit SHA
  baseBranch: string;   // Target branch
  headBranch: string;   // Source branch
  title: string;        // PR/MR title
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
  postReview(
    findings: ReviewFinding[],
    summary: string,
    postSummary: boolean
  ): Promise<void>;
}

/**
 * Detect platform from environment variables set by CI systems.
 */
export function detectPlatform(): Platform {
  // GitHub Actions
  if (process.env.GITHUB_ACTIONS === 'true') {
    return 'github';
  }

  // GitLab CI
  if (process.env.GITLAB_CI === 'true') {
    return 'gitlab';
  }

  // Bitbucket Pipelines
  if (process.env.BITBUCKET_PIPELINE_UUID) {
    return 'bitbucket-cloud';
  }

  // Bitbucket Server (manual/custom setup)
  if (process.env.BITBUCKET_SERVER_URL) {
    return 'bitbucket-server';
  }

  // Default to GitHub
  return 'github';
}
