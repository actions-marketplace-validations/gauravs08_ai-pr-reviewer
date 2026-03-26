/**
 * Configuration Module
 *
 * Reads configuration from GitHub Action inputs (action.yml) when running in
 * GitHub Actions, or from environment variables when running standalone (CLI/GitLab/Bitbucket).
 * Validates all values and provides typed configuration with sensible defaults.
 */

import { minimatch } from 'minimatch';

export interface Config {
  anthropicApiKey: string;
  githubToken: string;
  model: string;
  tracks: string[];
  maxFiles: number;
  maxComments: number;
  excludePatterns: string[];
  severityThreshold: 'medium' | 'high' | 'critical';
  customInstructions: string;
  postSummary: boolean;
  maxDiffTokens: number;
  requestTimeoutMs: number;
  maxRetries: number;
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 3,
  high: 2,
  medium: 1,
};

const VALID_TRACKS = ['code-quality', 'security', 'cross-file'];
const VALID_THRESHOLDS = ['medium', 'high', 'critical'];
const DEFAULT_EXCLUDE = '*.lock,*.min.js,*.min.css,dist/**,build/**,*.generated.*,package-lock.json,pnpm-lock.yaml,yarn.lock';

/**
 * Read a config value from GitHub Actions input or environment variable.
 * GitHub Actions inputs are exposed as INPUT_<NAME> env vars.
 */
function getInput(name: string, envAlias?: string): string {
  // GitHub Actions format: INPUT_ANTHROPIC_API_KEY
  const actionsKey = `INPUT_${name.toUpperCase().replace(/-/g, '_')}`;
  const val = process.env[actionsKey] || (envAlias ? process.env[envAlias] : '') || '';
  return val.trim();
}

export function getConfig(): Config {
  const anthropicApiKey =
    getInput('anthropic_api_key', 'ANTHROPIC_API_KEY');

  if (!anthropicApiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is required. Set it as a GitHub Actions secret, CI/CD variable, or environment variable.'
    );
  }

  const githubToken =
    getInput('github_token', 'GITHUB_TOKEN') || '';

  const model =
    getInput('model', 'AI_MODEL') || 'claude-sonnet-4-5-20250929';

  const tracksRaw = getInput('tracks', 'AI_TRACKS') || 'code-quality,security';
  const tracks = tracksRaw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  // Validate tracks
  for (const track of tracks) {
    if (!VALID_TRACKS.includes(track)) {
      throw new Error(
        `Invalid track "${track}". Valid tracks: ${VALID_TRACKS.join(', ')}`
      );
    }
  }

  const excludeRaw = getInput('exclude_patterns', 'AI_EXCLUDE_PATTERNS') || DEFAULT_EXCLUDE;
  const excludePatterns = excludeRaw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  const thresholdRaw = getInput('severity_threshold', 'AI_SEVERITY_THRESHOLD') || 'medium';
  if (!VALID_THRESHOLDS.includes(thresholdRaw)) {
    throw new Error(
      `Invalid severity_threshold "${thresholdRaw}". Valid: ${VALID_THRESHOLDS.join(', ')}`
    );
  }

  const maxFiles = parseInt(getInput('max_files', 'AI_MAX_FILES') || '20', 10);
  const maxComments = parseInt(getInput('max_comments', 'AI_MAX_COMMENTS') || '15', 10);

  if (isNaN(maxFiles) || maxFiles < 1) {
    throw new Error('max_files must be a positive integer');
  }
  if (isNaN(maxComments) || maxComments < 1) {
    throw new Error('max_comments must be a positive integer');
  }

  const postSummaryRaw = getInput('post_summary', 'AI_POST_SUMMARY');
  const postSummary = postSummaryRaw === '' ? true : postSummaryRaw === 'true';

  return {
    anthropicApiKey,
    githubToken,
    model,
    tracks,
    maxFiles,
    maxComments,
    excludePatterns,
    severityThreshold: thresholdRaw as Config['severityThreshold'],
    customInstructions: getInput('custom_instructions', 'AI_CUSTOM_INSTRUCTIONS'),
    postSummary,
    maxDiffTokens: parseInt(getInput('max_diff_tokens', 'AI_MAX_DIFF_TOKENS') || '80000', 10),
    requestTimeoutMs: parseInt(getInput('request_timeout_ms', 'AI_REQUEST_TIMEOUT_MS') || '120000', 10),
    maxRetries: parseInt(getInput('max_retries', 'AI_MAX_RETRIES') || '2', 10),
  };
}

export function shouldExcludeFile(filename: string, patterns: string[]): boolean {
  return patterns.some((pattern) => minimatch(filename, pattern, { matchBase: true }));
}

export function meetsThreshold(severity: string, threshold: Config['severityThreshold']): boolean {
  const severityLevel = SEVERITY_ORDER[severity.toLowerCase()] ?? 0;
  const thresholdLevel = SEVERITY_ORDER[threshold] ?? 1;
  return severityLevel >= thresholdLevel;
}

/**
 * Rough token estimation: ~4 chars per token for code.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
