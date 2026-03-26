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
export function parsePatch(patch: string): { hunks: DiffHunk[]; changedLines: Set<number> } {
  const hunks: DiffHunk[] = [];
  const changedLines = new Set<number>();

  if (!patch) return { hunks, changedLines };

  const lines = patch.split('\n');
  let currentNewLine = 0;
  let currentHunkStart = 0;
  let currentHunkContent: string[] = [];

  for (const line of lines) {
    // Hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);

    if (hunkMatch) {
      // Save previous hunk
      if (currentHunkContent.length > 0) {
        hunks.push({
          startLine: currentHunkStart,
          endLine: currentNewLine - 1,
          content: currentHunkContent.join('\n'),
        });
      }
      currentNewLine = parseInt(hunkMatch[1], 10);
      currentHunkStart = currentNewLine;
      currentHunkContent = [line];
      continue;
    }

    if (line.startsWith('+')) {
      // Added line
      changedLines.add(currentNewLine);
      currentHunkContent.push(line);
      currentNewLine++;
    } else if (line.startsWith('-')) {
      // Removed line — doesn't advance new line counter
      currentHunkContent.push(line);
    } else {
      // Context line
      currentHunkContent.push(line);
      currentNewLine++;
    }
  }

  // Save last hunk
  if (currentHunkContent.length > 0) {
    hunks.push({
      startLine: currentHunkStart,
      endLine: currentNewLine - 1,
      content: currentHunkContent.join('\n'),
    });
  }

  return { hunks, changedLines };
}

/**
 * Check if a given line number falls within any changed hunk
 * (with a tolerance window for context).
 */
export function isLineInDiff(line: number, hunks: DiffHunk[], tolerance: number = 3): boolean {
  return hunks.some(
    (hunk) => line >= hunk.startLine - tolerance && line <= hunk.endLine + tolerance
  );
}

/**
 * Build a compact diff summary for sending to AI.
 * Includes file name, status, and patch content.
 */
export function buildDiffSummary(files: DiffFile[]): string {
  const parts: string[] = [];

  for (const file of files) {
    parts.push(`--- File: ${file.filename} (${file.status}) [+${file.additions}/-${file.deletions}]`);
    if (file.patch) {
      parts.push(file.patch);
    }
    parts.push('');
  }

  return parts.join('\n');
}
