/**
 * Review Filter
 *
 * Applies a multi-stage filtering pipeline to AI findings:
 * 1. Severity threshold — drop findings below configured minimum
 * 2. Diff-only — drop findings on lines not in the PR diff
 * 3. Limit — keep top N findings sorted by severity
 */

import { ReviewFinding } from './ai-reviewer';
import { DiffFile, isLineInDiff, parsePatch } from './diff-parser';
import { Config, meetsThreshold } from './config';

/**
 * Filter findings by severity threshold.
 */
export function filterBySeverity(
  findings: ReviewFinding[],
  threshold: Config['severityThreshold']
): ReviewFinding[] {
  return findings.filter((f) => meetsThreshold(f.severity, threshold));
}

/**
 * Filter findings to only those on lines in the PR diff.
 * General comments (no file/line) are always kept.
 */
export function filterToDiff(
  findings: ReviewFinding[],
  files: DiffFile[]
): ReviewFinding[] {
  const fileMap = new Map<string, DiffFile>();
  for (const file of files) {
    fileMap.set(file.filename, file);
  }

  return findings.filter((f) => {
    // General comments always pass
    if (!f.file || !f.line) return true;

    const diffFile = fileMap.get(f.file);
    if (!diffFile) {
      // File not in diff — drop
      return false;
    }

    const { hunks } = parsePatch(diffFile.patch);
    return isLineInDiff(f.line, hunks);
  });
}

/**
 * Limit findings to max count, prioritized by severity.
 */
export function limitFindings(
  findings: ReviewFinding[],
  maxComments: number
): ReviewFinding[] {
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
  };

  const sorted = [...findings].sort(
    (a, b) =>
      (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3)
  );

  return sorted.slice(0, maxComments);
}
