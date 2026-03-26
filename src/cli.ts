#!/usr/bin/env node

/**
 * Dry-Run CLI
 *
 * Review your local changes before pushing — works with any Git repo.
 * Reads git diff locally, sends to Claude API, prints findings to terminal.
 * Does NOT post comments to any platform (GitHub/GitLab/Bitbucket).
 *
 * Usage:
 *   npx ts-node src/cli.ts                    # Review uncommitted changes
 *   npx ts-node src/cli.ts --base main        # Review diff against main branch
 *   npx ts-node src/cli.ts --base HEAD~3      # Review last 3 commits
 *
 * Environment:
 *   ANTHROPIC_API_KEY (required)
 *   AI_MODEL (optional, default: claude-sonnet-4-5-20250929)
 */

import { execSync } from 'child_process';
import { AIReviewer, ReviewFinding } from './ai-reviewer';
import { DiffFile, parsePatch } from './diff-parser';
import { filterBySeverity, filterToDiff, limitFindings } from './review-filter';
import { Config } from './config';

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '!',
  high: '*',
  medium: '-',
};

interface CliOptions {
  base: string;
  tracks: string[];
  model: string;
  maxFiles: number;
  maxComments: number;
  severityThreshold: Config['severityThreshold'];
  customInstructions: string;
  maxDiffTokens: number;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = {
    base: 'HEAD',
    tracks: ['code-quality', 'security'],
    model: process.env.AI_MODEL || 'claude-sonnet-4-5-20250929',
    maxFiles: 20,
    maxComments: 15,
    severityThreshold: 'medium',
    customInstructions: '',
    maxDiffTokens: 80000,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--base':
      case '-b':
        options.base = args[++i];
        break;
      case '--tracks':
      case '-t':
        options.tracks = args[++i].split(',');
        break;
      case '--model':
      case '-m':
        options.model = args[++i];
        break;
      case '--max-files':
        options.maxFiles = parseInt(args[++i], 10);
        break;
      case '--max-comments':
        options.maxComments = parseInt(args[++i], 10);
        break;
      case '--severity':
      case '-s':
        options.severityThreshold = args[++i] as Config['severityThreshold'];
        break;
      case '--instructions':
      case '-i':
        options.customInstructions = args[++i];
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        if (!args[i].startsWith('-')) {
          options.base = args[i];
        }
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
AI PR Reviewer - Dry Run Mode

Usage:
  npx ts-node src/cli.ts [options]

Options:
  --base, -b <ref>       Git ref to diff against (default: HEAD for uncommitted, or "main")
  --tracks, -t <tracks>  Comma-separated tracks: code-quality,security,cross-file
  --model, -m <model>    Claude model (default: claude-sonnet-4-5-20250929)
  --severity, -s <level> Min severity: medium, high, critical (default: medium)
  --max-files <n>        Max files to review (default: 20)
  --max-comments <n>     Max findings to show (default: 15)
  --instructions, -i <s> Custom review instructions
  --help, -h             Show this help

Examples:
  npx ts-node src/cli.ts                     # Review uncommitted changes
  npx ts-node src/cli.ts --base main         # Review current branch vs main
  npx ts-node src/cli.ts --base HEAD~3       # Review last 3 commits
  npx ts-node src/cli.ts -t security -s high # Security-only, high+ severity

Environment:
  ANTHROPIC_API_KEY      Required. Your Anthropic API key.
  AI_MODEL               Optional. Override default model.
`);
}

function getGitDiff(base: string): string {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf-8' }).trim();

    if (base === 'HEAD' && status) {
      return execSync('git diff HEAD', { encoding: 'utf-8' });
    }

    return execSync(`git diff ${base}...HEAD`, { encoding: 'utf-8' });
  } catch {
    try {
      return execSync(`git diff ${base}`, { encoding: 'utf-8' });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to get git diff: ${message}`);
    }
  }
}

function parseDiffToFiles(rawDiff: string): DiffFile[] {
  const files: DiffFile[] = [];
  const fileDiffs = rawDiff.split(/^diff --git /m).filter(Boolean);

  for (const fileDiff of fileDiffs) {
    const headerMatch = fileDiff.match(/a\/(.+?) b\/(.+)/);
    if (!headerMatch) continue;

    const filename = headerMatch[2];

    // Skip binary files
    if (fileDiff.includes('Binary files')) continue;

    let status = 'modified';
    if (fileDiff.includes('new file mode')) status = 'added';
    if (fileDiff.includes('deleted file mode')) status = 'removed';
    if (fileDiff.includes('rename from')) status = 'renamed';

    // Skip deleted files
    if (status === 'removed') continue;

    const patchStart = fileDiff.indexOf('@@');
    const patch = patchStart >= 0 ? fileDiff.slice(patchStart) : '';

    const { changedLines } = parsePatch(patch);

    const additions = patch.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
    const deletions = patch.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---')).length;

    files.push({ filename, status, additions, deletions, patch, changedLines });
  }

  return files;
}

function printFindings(findings: ReviewFinding[]): void {
  if (findings.length === 0) {
    console.log('\n  No significant issues found!\n');
    return;
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  REVIEW RESULTS: ${findings.length} finding(s)`);
  console.log(`${'='.repeat(70)}\n`);

  const critical = findings.filter((f) => f.severity === 'critical').length;
  const high = findings.filter((f) => f.severity === 'high').length;
  const medium = findings.filter((f) => f.severity === 'medium').length;

  if (critical) console.log(`  [!] Critical: ${critical}`);
  if (high) console.log(`  [*] High: ${high}`);
  if (medium) console.log(`  [-] Medium: ${medium}`);
  console.log('');

  for (const f of findings) {
    const marker = SEVERITY_EMOJI[f.severity] || '-';
    const location = f.file ? `${f.file}:${f.line || '?'}` : '(general)';

    console.log(`${'-'.repeat(70)}`);
    console.log(`  [${marker}] ${f.severity.toUpperCase()} | ${f.category} | ${f.title}`);
    console.log(`      ${location}`);
    console.log('');
    const desc = f.description
      .replace(/\*\*AI Review\*\*.*\n\n/, '')
      .replace(/\*\*AI Finding\*\*.*\n\n/, '');
    console.log(`  ${desc.split('\n').join('\n  ')}`);
    console.log('');
  }

  console.log(`${'='.repeat(70)}\n`);

  if (critical > 0) {
    console.log('  [!] Critical issues found -- these should be fixed before pushing.\n');
  }
}

async function main(): Promise<void> {
  const options = parseArgs();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ERROR: ANTHROPIC_API_KEY environment variable is required.');
    console.error('  Set it: export ANTHROPIC_API_KEY=sk-ant-xxxxx');
    process.exit(1);
  }

  console.log(`\n  AI PR Reviewer -- Dry Run`);
  console.log(`  Model: ${options.model}`);
  console.log(`  Base: ${options.base}`);
  console.log(`  Tracks: ${options.tracks.join(', ')}`);
  console.log(`  Severity: >= ${options.severityThreshold}\n`);

  console.log('  Getting git diff...');
  const rawDiff = getGitDiff(options.base);

  if (!rawDiff.trim()) {
    console.log('  No changes found. Nothing to review.\n');
    return;
  }

  let files = parseDiffToFiles(rawDiff);
  console.log(`  Found ${files.length} changed files`);

  if (files.length > options.maxFiles) {
    console.log(`  Limiting to first ${options.maxFiles} files`);
    files = files.slice(0, options.maxFiles);
  }

  console.log('\n  Running AI review...');
  const reviewer = new AIReviewer(apiKey, options.model);
  const result = await reviewer.review(
    files,
    options.tracks,
    options.customInstructions,
    options.maxDiffTokens
  );
  console.log(`  Raw findings: ${result.reviews.length}`);

  let findings = filterBySeverity(result.reviews, options.severityThreshold);
  findings = filterToDiff(findings, files);
  findings = limitFindings(findings, options.maxComments);

  printFindings(findings);

  const criticalCount = findings.filter((f) => f.severity === 'critical').length;
  if (criticalCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\n  ERROR: ${message}\n`);
  process.exit(1);
});
