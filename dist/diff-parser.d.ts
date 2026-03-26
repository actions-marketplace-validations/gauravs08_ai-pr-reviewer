/**
 * Diff Parser
 *
 * Parses unified diff patches (from GitHub/GitLab/Bitbucket APIs) into
 * structured data with line number mappings. Used to determine which
 * lines were changed so review comments target only modified code.
 */
export interface DiffFile {
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch: string;
    changedLines: Set<number>;
}
export interface DiffHunk {
    startLine: number;
    endLine: number;
    content: string;
}
/**
 * Parse the patch string from GitHub API into a structured diff with line mappings.
 * GitHub's patch format is unified diff without the file headers.
 */
export declare function parsePatch(patch: string): {
    hunks: DiffHunk[];
    changedLines: Set<number>;
};
/**
 * Check if a given line number falls within any changed hunk
 * (with a tolerance window for context).
 */
export declare function isLineInDiff(line: number, hunks: DiffHunk[], tolerance?: number): boolean;
/**
 * Build a compact diff summary for sending to AI.
 * Includes file name, status, and patch content.
 */
export declare function buildDiffSummary(files: DiffFile[]): string;
