/**
 * Review Filter
 *
 * Applies a multi-stage filtering pipeline to AI findings:
 * 1. Severity threshold — drop findings below configured minimum
 * 2. Diff-only — drop findings on lines not in the PR diff
 * 3. Limit — keep top N findings sorted by severity
 */
import { ReviewFinding } from './ai-reviewer';
import { DiffFile } from './diff-parser';
import { Config } from './config';
/**
 * Filter findings by severity threshold.
 */
export declare function filterBySeverity(findings: ReviewFinding[], threshold: Config['severityThreshold']): ReviewFinding[];
/**
 * Filter findings to only those on lines in the PR diff.
 * General comments (no file/line) are always kept.
 */
export declare function filterToDiff(findings: ReviewFinding[], files: DiffFile[]): ReviewFinding[];
/**
 * Limit findings to max count, prioritized by severity.
 */
export declare function limitFindings(findings: ReviewFinding[], maxComments: number): ReviewFinding[];
