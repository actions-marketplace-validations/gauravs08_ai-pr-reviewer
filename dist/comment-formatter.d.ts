/**
 * Comment Formatter
 *
 * Formats AI review findings into branded comment bodies for posting
 * to GitHub/GitLab/Bitbucket. Adds severity emoji and category headers.
 */
import { ReviewFinding } from './ai-reviewer';
/**
 * Format a finding into a GitHub review comment body.
 * If the AI already formatted the description, use it as-is.
 * Otherwise, wrap it in our standard format.
 */
export declare function formatFindingComment(finding: ReviewFinding): string;
/**
 * Apply formatting to all findings in place (mutates description field).
 */
export declare function formatAllFindings(findings: ReviewFinding[]): ReviewFinding[];
