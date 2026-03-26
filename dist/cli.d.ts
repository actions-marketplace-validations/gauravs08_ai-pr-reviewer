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
export {};
