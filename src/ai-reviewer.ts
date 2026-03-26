/**
 * AI Reviewer
 *
 * Orchestrates parallel review tracks using the Claude API (Anthropic SDK).
 * Each track (code-quality, security, cross-file) runs as an independent API call.
 * Includes retry logic with exponential backoff, token budget management,
 * and resilient JSON parsing for Claude's response format.
 */

import Anthropic from '@anthropic-ai/sdk';
import { DiffFile, buildDiffSummary } from './diff-parser';
import { estimateTokens } from './config';
import * as log from './logger';

export interface ReviewFinding {
  category: string;
  severity: 'critical' | 'high' | 'medium';
  title: string;
  description: string;
  file: string | null;
  line: number | null;
  lineType: 'ADDED' | 'CONTEXT' | null;
  commentType: 'inline' | 'general';
}

export interface ReviewResult {
  summary: string;
  reviews: ReviewFinding[];
}

const VALID_SEVERITIES = new Set(['critical', 'high', 'medium']);
const MAX_FINDINGS_PER_TRACK = 10;

export class AIReviewer {
  private client: Anthropic;
  private model: string;
  private maxRetries: number;
  private timeoutMs: number;

  constructor(apiKey: string, model: string, maxRetries: number = 2, timeoutMs: number = 120000) {
    this.client = new Anthropic({ apiKey, timeout: timeoutMs });
    this.model = model;
    this.maxRetries = maxRetries;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Run all configured review tracks in parallel and merge results.
   */
  async review(
    files: DiffFile[],
    tracks: string[],
    customInstructions: string,
    maxDiffTokens: number = 80000
  ): Promise<ReviewResult> {
    const diffSummary = buildDiffSummary(files);
    const diffTokens = estimateTokens(diffSummary);
    const fileList = files.map((f) => `${f.filename} (${f.status})`).join('\n');

    log.info(`Reviewing ${files.length} files across tracks: ${tracks.join(', ')}`);
    log.info(`Estimated diff size: ~${diffTokens} tokens`);

    // Guard: truncate if diff is too large
    let reviewDiff = diffSummary;
    if (diffTokens > maxDiffTokens) {
      log.warning(`Diff too large (${diffTokens} tokens). Truncating to ~${maxDiffTokens} tokens.`);
      const maxChars = maxDiffTokens * 4;
      reviewDiff = diffSummary.slice(0, maxChars) + '\n\n[... diff truncated due to size ...]';
    }

    const trackPromises: Promise<{ track: string; findings: ReviewFinding[] }>[] = [];

    for (const track of tracks) {
      const prompt = this.buildPrompt(track, reviewDiff, fileList, customInstructions);
      if (prompt) {
        trackPromises.push(
          this.runTrackWithRetry(track, prompt).then((findings) => ({ track, findings }))
        );
      }
    }

    const trackResults = await Promise.allSettled(trackPromises);
    const allFindings: ReviewFinding[] = [];
    let failedTracks = 0;

    for (const result of trackResults) {
      if (result.status === 'fulfilled') {
        allFindings.push(...result.value.findings);
        log.info(`Track "${result.value.track}": ${result.value.findings.length} findings`);
      } else {
        failedTracks++;
        log.warning(`Track failed: ${result.reason}`);
      }
    }

    if (failedTracks === tracks.length) {
      log.error('All review tracks failed. Check API key and model configuration.');
    }

    const summary = this.buildSummary(allFindings, files.length, tracks, failedTracks);

    return { summary, reviews: allFindings };
  }

  private buildPrompt(
    track: string,
    diffSummary: string,
    fileList: string,
    customInstructions: string
  ): string | null {
    const systemPrompt = this.getPrompt(track);
    if (!systemPrompt) {
      log.warning(`Unknown track: ${track}, skipping`);
      return null;
    }

    let prompt = systemPrompt;
    if (customInstructions) {
      prompt += `\n\n## Additional Instructions\n${customInstructions}`;
    }

    return `${prompt}\n\n## Changed Files\n${fileList}\n\n## Diff\n${diffSummary}`;
  }

  private getPrompt(track: string): string {
    switch (track) {
      case 'code-quality':
        return CODE_QUALITY_PROMPT;
      case 'security':
        return SECURITY_PROMPT;
      case 'cross-file':
        return CROSS_FILE_PROMPT;
      default:
        return '';
    }
  }

  /**
   * Run a track with retry and exponential backoff.
   */
  private async runTrackWithRetry(track: string, userPrompt: string): Promise<ReviewFinding[]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.runTrack(track, userPrompt);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
          log.warning(`Track "${track}" attempt ${attempt + 1} failed: ${lastError.message}. Retrying in ${Math.round(delay)}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error(`Track "${track}" failed after ${this.maxRetries + 1} attempts`);
  }

  private async runTrack(track: string, userPrompt: string): Promise<ReviewFinding[]> {
    const systemPrompt = `You are an expert code reviewer. Analyze the provided pull request diff and return findings as JSON.

IMPORTANT RULES:
1. Only return findings with severity: "critical", "high", or "medium". Never return low/info/suggestion.
2. Only comment on code that appears in the diff (changed lines).
3. Be concise and actionable — write like a human reviewer, not a report.
4. Each finding must have: category, severity, title, description, file, line, lineType, commentType.
5. For inline comments: set file (relative path), line (positive number in new file), lineType ("ADDED"), commentType "inline".
6. For general/cross-file comments: set file null, line null, lineType null, commentType "general".
7. Return ONLY valid JSON: {"findings": [...]}. No markdown wrapping, no prose.
8. If no issues found, return {"findings": []}.
9. Maximum ${MAX_FINDINGS_PER_TRACK} findings per review — prioritize by severity.
10. The "description" field is posted as the review comment. Format it with:
    - First line: "**AI Review** | SEVERITY | Category"
    - Then: concise technical description
    - Then: "**Suggestion:** concrete fix"`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      system: systemPrompt,
    });

    const text =
      response.content[0].type === 'text' ? response.content[0].text : '';

    return this.parseResponse(text, track);
  }

  private parseResponse(text: string, track: string): ReviewFinding[] {
    let parsed: any;

    // Try direct JSON parse first
    try {
      parsed = JSON.parse(text);
    } catch {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[1].trim());
        } catch {
          // continue to next strategy
        }
      }

      if (!parsed) {
        // Try to find first complete JSON object
        const braceStart = text.indexOf('{');
        const braceEnd = text.lastIndexOf('}');
        if (braceStart >= 0 && braceEnd > braceStart) {
          try {
            parsed = JSON.parse(text.slice(braceStart, braceEnd + 1));
          } catch {
            log.warning(`Failed to parse JSON from track "${track}"`);
            return [];
          }
        } else {
          log.warning(`No JSON found in track "${track}" response`);
          return [];
        }
      }
    }

    const rawFindings = parsed.findings || parsed.reviews || [];

    if (!Array.isArray(rawFindings)) {
      log.warning(`Track "${track}" returned non-array findings`);
      return [];
    }

    const findings: ReviewFinding[] = [];

    for (const f of rawFindings) {
      // Validate severity
      const severity = (f.severity || '').toLowerCase();
      if (!VALID_SEVERITIES.has(severity)) continue;

      // Validate line number
      const line = f.line ? parseInt(String(f.line), 10) : null;
      if (line !== null && (isNaN(line) || line < 1)) continue;

      findings.push({
        category: String(f.category || track),
        severity: severity as ReviewFinding['severity'],
        title: String(f.title || 'Untitled finding'),
        description: String(f.description || f.title || ''),
        file: f.file ? String(f.file) : null,
        line,
        lineType: f.lineType || (f.file ? 'ADDED' : null),
        commentType: f.commentType || (f.file && line ? 'inline' : 'general'),
      });
    }

    return findings.slice(0, MAX_FINDINGS_PER_TRACK);
  }

  private buildSummary(
    findings: ReviewFinding[],
    fileCount: number,
    tracks: string[],
    failedTracks: number
  ): string {
    const critical = findings.filter((f) => f.severity === 'critical').length;
    const high = findings.filter((f) => f.severity === 'high').length;
    const medium = findings.filter((f) => f.severity === 'medium').length;

    let verdict: string;
    if (failedTracks === tracks.length) {
      verdict = 'Review incomplete - all tracks failed. Please check configuration.';
    } else if (critical > 0) {
      verdict = 'Needs changes - critical issues must be resolved before merge.';
    } else if (high > 0) {
      verdict = 'Minor issues - consider addressing before merge.';
    } else if (medium > 0) {
      verdict = 'Looks good with minor suggestions.';
    } else {
      verdict = 'Looks good - no significant issues found.';
    }

    const severityLine =
      findings.length > 0
        ? `Found ${findings.length} issues: ${critical} critical, ${high} high, ${medium} medium.`
        : 'No significant issues found.';

    const failNote =
      failedTracks > 0 ? `\n\n> Note: ${failedTracks}/${tracks.length} review tracks failed.` : '';

    return `## AI Code Review Summary

Reviewed **${fileCount} files** across ${tracks.length} tracks (${tracks.join(', ')}).
${severityLine}

**Overall: ${verdict}**${failNote}

---
*Powered by [ai-pr-reviewer](https://github.com/gauravs08/ai-pr-reviewer)*`;
  }
}

// --- Embedded prompts ---

const CODE_QUALITY_PROMPT = `# Code Quality & Efficiency Review

Analyze the PR diff for these categories:

## Logic & Correctness
- Null/undefined dereference, off-by-one errors, missing return statements
- Incorrect boolean logic, wrong comparison operators
- Unhandled edge cases in changed code

## Code Smells
- Duplicate code that should be extracted
- Methods that are too long or do too many things
- Deep nesting (3+ levels) that hurts readability
- Misleading variable/function names

## Error Handling
- Swallowed exceptions (empty catch blocks)
- Missing error propagation
- Generic catch-all that hides specific errors

## Efficiency
- Unnecessary object creation in loops
- N+1 query patterns
- Redundant computations that could be cached
- Inefficient data structure choices

## Reuse
- Existing utility functions not used (reinventing)
- Copy-pasted blocks that should be shared

Focus ONLY on changed lines. Be concise. Write like a human reviewer.`;

const SECURITY_PROMPT = `# Security Review (OWASP Top 10)

Analyze the PR diff for security vulnerabilities:

## 1. Injection
- SQL built with string concatenation or String.format
- Command injection via Runtime.exec() or child_process
- LDAP, XPath, template injection

## 2. Broken Authentication
- Hardcoded credentials, API keys, tokens
- Weak password validation
- Tokens or secrets logged to console/files

## 3. Sensitive Data Exposure
- PII (emails, names, IDs) in log statements
- Secrets in source code or config files
- Missing encryption for sensitive data at rest/transit

## 4. XXE
- XML parsers without disabling external entities
- Unvalidated XML input processing

## 5. Broken Access Control
- Missing authorization checks on endpoints
- IDOR (direct object reference without ownership check)
- Missing data isolation between users/organizations

## 6. Security Misconfiguration
- Debug mode enabled in production config
- CORS with wildcard origin (*)
- Exposed management/actuator endpoints
- Verbose error messages leaking internals

## 7. XSS
- dangerouslySetInnerHTML or v-html with user content
- Unsanitized user input rendered in HTML

## 8. Insecure Deserialization
- ObjectInputStream on untrusted data
- JSON deserialization with polymorphic types

## 9. Known Vulnerabilities
- Outdated dependencies with known CVEs (check version numbers)

## 10. Insufficient Logging
- Security events not logged (auth failures, access denied)
- Sensitive data IN log statements

Focus ONLY on changed lines. Be specific about the vulnerability and how to fix it.`;

const CROSS_FILE_PROMPT = `# Cross-File Impact Analysis

Analyze the PR diff for changes that may break or require updates in other files:

## API Contracts
- Changed function signatures (added/removed/retyped parameters)
- Changed return types or response shapes
- Changed HTTP endpoint paths, methods, or status codes
- Changed request/response DTOs or interfaces

## Shared Types
- Modified interfaces, types, or classes used by multiple files
- Changed enum values that others may switch on
- Changed constants or configuration keys

## Database
- Schema changes without migration scripts
- Changed column names/types referenced elsewhere
- New required fields without defaults

## Configuration
- New environment variables without documentation
- Changed config keys without updating all consumers

## Test Coverage
- Changed business logic without corresponding test updates
- New branches/conditions without test coverage

For each finding, identify WHICH other files might be affected and WHY.
Set commentType to "general" and file/line to null for cross-file findings.`;
