/**
 * Deduplication
 *
 * Prevents re-posting findings that already exist as bot comments on the PR.
 * Matches by file + line proximity (within 5 lines) for inline comments,
 * and by title/text similarity for general comments.
 */

import { ReviewFinding } from './ai-reviewer';
import { ExistingComment } from './platform-client';

const LINE_TOLERANCE = 5;

/**
 * Remove findings that overlap with existing bot comments.
 * Two findings are considered duplicates if they're on the same file
 * and within LINE_TOLERANCE lines of each other.
 */
export function deduplicateFindings(
  findings: ReviewFinding[],
  existingComments: ExistingComment[]
): ReviewFinding[] {
  if (existingComments.length === 0) return findings;

  return findings.filter((finding) => {
    // General comments — check by text similarity
    if (!finding.file || !finding.line) {
      return !existingComments.some(
        (c) => c.body.includes(finding.title) || finding.description.includes(c.body.slice(0, 100))
      );
    }

    // Inline comments — check file + line proximity
    return !existingComments.some(
      (c) =>
        c.path === finding.file &&
        Math.abs(c.line - (finding.line ?? 0)) <= LINE_TOLERANCE
    );
  });
}
