/**
 * Comment Formatter
 *
 * Formats AI review findings into branded comment bodies for posting
 * to GitHub/GitLab/Bitbucket. Adds severity emoji and category headers.
 */

import { ReviewFinding } from './ai-reviewer';

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
};

/**
 * Format a finding into a GitHub review comment body.
 * If the AI already formatted the description, use it as-is.
 * Otherwise, wrap it in our standard format.
 */
export function formatFindingComment(finding: ReviewFinding): string {
  // If description already contains our header format, use it directly
  if (finding.description.includes('**AI Review**') || finding.description.includes('**AI Finding**')) {
    return finding.description;
  }

  const emoji = SEVERITY_EMOJI[finding.severity] || '🟡';
  const severity = finding.severity.toUpperCase();

  let comment = `**AI Review** | ${emoji} ${severity} | ${finding.category}\n\n`;
  comment += finding.description;

  return comment;
}

/**
 * Apply formatting to all findings in place (mutates description field).
 */
export function formatAllFindings(findings: ReviewFinding[]): ReviewFinding[] {
  return findings.map((f) => ({
    ...f,
    description: formatFindingComment(f),
  }));
}
