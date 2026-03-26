/**
 * Deduplication
 *
 * Prevents re-posting findings that already exist as bot comments on the PR.
 * Matches by file + line proximity (within 5 lines) for inline comments,
 * and by title/text similarity for general comments.
 */
import { ReviewFinding } from './ai-reviewer';
import { ExistingComment } from './platform-client';
/**
 * Remove findings that overlap with existing bot comments.
 * Two findings are considered duplicates if they're on the same file
 * and within LINE_TOLERANCE lines of each other.
 */
export declare function deduplicateFindings(findings: ReviewFinding[], existingComments: ExistingComment[]): ReviewFinding[];
