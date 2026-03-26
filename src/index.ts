/**
 * GitHub Action Entry Point
 *
 * Orchestrates the full AI PR review flow:
 * 1. Detect platform and initialize client
 * 2. Fetch changed files from PR/MR diff
 * 3. Filter excluded files and apply limits
 * 4. Run parallel AI review tracks (code quality, security, cross-file)
 * 5. Filter findings by severity, diff scope, and deduplication
 * 6. Post review with inline comments and summary
 */

import { getConfig, shouldExcludeFile } from './config';
import { GitHubClient } from './github-client';
import { GitLabClient } from './gitlab-client';
import { BitbucketClient } from './bitbucket-client';
import { PlatformClient, detectPlatform } from './platform-client';
import { AIReviewer } from './ai-reviewer';
import { filterBySeverity, filterToDiff, limitFindings } from './review-filter';
import { formatAllFindings } from './comment-formatter';
import { deduplicateFindings } from './deduplication';
import * as log from './logger';

function createPlatformClient(token: string): PlatformClient {
  const platform = detectPlatform();

  switch (platform) {
    case 'github':
      return new GitHubClient(token);
    case 'gitlab':
      return new GitLabClient(process.env.GITLAB_TOKEN || token);
    case 'bitbucket-cloud':
    case 'bitbucket-server':
      return new BitbucketClient(process.env.BITBUCKET_TOKEN || token, platform);
    default:
      return new GitHubClient(token);
  }
}

async function run(): Promise<void> {
  try {
    const config = getConfig();
    const platform = detectPlatform();
    log.info(`AI PR Reviewer starting (platform: ${platform}, model: ${config.model}, tracks: ${config.tracks.join(', ')})`);

    // 1. Initialize platform client
    const client = createPlatformClient(config.githubToken);
    const ctx = client.getContext();
    log.info(`Reviewing PR #${ctx.pullNumber}: ${ctx.title} (${ctx.headBranch} -> ${ctx.baseBranch})`);

    // 2. Fetch changed files
    let files = await client.getChangedFiles();
    log.info(`Found ${files.length} changed files`);

    // 3. Filter excluded files and binary files
    files = files.filter((f) => {
      if (shouldExcludeFile(f.filename, config.excludePatterns)) return false;
      if (isBinaryFile(f.filename)) return false;
      if (f.status === 'removed') return false; // Skip deleted files
      return true;
    });
    log.info(`After exclusions: ${files.length} files to review`);

    if (files.length === 0) {
      log.info('No reviewable files — skipping');
      return;
    }

    // 4. Limit file count
    if (files.length > config.maxFiles) {
      log.warning(`Too many files (${files.length}), reviewing first ${config.maxFiles}`);
      files = files.slice(0, config.maxFiles);
    }

    // 5. Get existing bot comments for deduplication
    const existingComments = await client.getExistingBotComments();
    log.info(`Found ${existingComments.length} existing bot comments`);

    // 6. Run AI review (parallel tracks)
    const reviewer = new AIReviewer(
      config.anthropicApiKey,
      config.model,
      config.maxRetries,
      config.requestTimeoutMs
    );
    const result = await reviewer.review(
      files,
      config.tracks,
      config.customInstructions,
      config.maxDiffTokens
    );
    log.info(`AI returned ${result.reviews.length} raw findings`);

    // 7. Filter pipeline: severity -> diff -> dedup -> limit -> format
    let findings = filterBySeverity(result.reviews, config.severityThreshold);
    log.info(`After severity filter (>= ${config.severityThreshold}): ${findings.length}`);

    findings = filterToDiff(findings, files);
    log.info(`After diff filter: ${findings.length}`);

    findings = deduplicateFindings(findings, existingComments);
    log.info(`After deduplication: ${findings.length}`);

    findings = limitFindings(findings, config.maxComments);
    log.info(`After limit (max ${config.maxComments}): ${findings.length}`);

    findings = formatAllFindings(findings);

    // 8. Post review
    await client.postReview(findings, result.summary, config.postSummary);

    // 9. Set outputs
    log.setOutput('findings_count', findings.length);
    log.setOutput('critical_count', findings.filter((f) => f.severity === 'critical').length);
    log.setOutput('high_count', findings.filter((f) => f.severity === 'high').length);
    log.setOutput('medium_count', findings.filter((f) => f.severity === 'medium').length);

    log.info(`Done! Posted ${findings.length} findings.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.setFailed(`AI PR Review failed: ${message}`);
  }
}

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.exe', '.dll', '.so', '.dylib', '.class', '.jar', '.war',
  '.mp3', '.mp4', '.avi', '.mov', '.wav', '.flac',
  '.db', '.sqlite', '.sqlite3',
]);

function isBinaryFile(filename: string): boolean {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

run();
