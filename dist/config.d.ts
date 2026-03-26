/**
 * Configuration Module
 *
 * Reads configuration from GitHub Action inputs (action.yml) when running in
 * GitHub Actions, or from environment variables when running standalone (CLI/GitLab/Bitbucket).
 * Validates all values and provides typed configuration with sensible defaults.
 */
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
export declare function getConfig(): Config;
export declare function shouldExcludeFile(filename: string, patterns: string[]): boolean;
export declare function meetsThreshold(severity: string, threshold: Config['severityThreshold']): boolean;
/**
 * Rough token estimation: ~4 chars per token for code.
 */
export declare function estimateTokens(text: string): number;
