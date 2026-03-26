# AI PR Reviewer

AI-powered pull request code review using Claude. Works with **GitHub, GitLab, and Bitbucket**. Posts inline review comments on your PRs/MRs automatically.

## Supported Platforms

| Platform | CI/CD Integration | Dry-Run CLI |
|----------|------------------|-------------|
| **GitHub** | GitHub Actions (native) | Yes |
| **GitLab** | GitLab CI (template) | Yes |
| **Bitbucket Cloud** | Bitbucket Pipelines (template) | Yes |
| **Bitbucket Server** | Any CI + env vars | Yes |

## How It Works

```
PR/MR Opened or New Commits Pushed
         |
         v
+------------------+
| CI/CD Triggers   |     GitHub Actions / GitLab CI / Bitbucket Pipelines
+------------------+
         |
         v
+------------------+
| Detect Platform  |     Auto-detects from CI environment variables
| & Init Client    |     (GITHUB_ACTIONS / GITLAB_CI / BITBUCKET_PIPELINE_UUID)
+------------------+
         |
         v
+------------------+
| Fetch PR Diff    |     Platform API: changed files with patches
| & Changed Files  |     Returns: filename, status, unified diff per file
+------------------+
         |
         v
+------------------+
| Filter Files     |     Skip: *.lock, dist/**, generated code
|                  |     Limit: max_files (default 20)
+------------------+
         |
         v
+-------------------------------------------+
| Run Review Tracks in Parallel             |
|                                           |
|  +-------------+  +----------+  +-------+ |
|  | Code Quality|  | Security |  | Cross | |
|  | Track       |  | Track    |  | File  | |
|  | (Claude API)|  | (Claude) |  | Track | |
|  +-------------+  +----------+  +-------+ |
+-------------------------------------------+
         |
         v
+------------------+
| Filter Pipeline  |     1. Severity threshold (>= medium)
|                  |     2. Diff-only (changed lines only)
|                  |     3. Deduplication (skip existing bot comments)
|                  |     4. Limit (max_comments, sorted by severity)
+------------------+
         |
         v
+------------------+
| Post Review      |     - Inline comments on file:line
| to PR/MR         |     - Summary comment with verdict
+------------------+
```

### Data Flow Detail

1. **Trigger**: CI/CD detects PR/MR event (open, push, reopen)
2. **Platform Detection**: Auto-detects GitHub/GitLab/Bitbucket from environment
3. **Diff Fetch**: Calls platform API for changed files with unified diff patches
4. **File Filtering**: Excludes lockfiles, build artifacts, generated code via configurable globs
5. **Diff Parsing**: Unified diff patches parsed into structured hunks with line number mappings
6. **AI Review**: Each track sends diff to Claude API with a specialized system prompt
7. **Response Parsing**: Claude returns JSON findings with file, line, severity, description
8. **Filter Pipeline**: Severity threshold -> diff-only -> deduplication -> limit
9. **Comment Posting**: Findings posted as inline review comments + summary

## Features

- **Multi-Platform**: Works with GitHub, GitLab, and Bitbucket (Cloud + Server)
- **3 Review Tracks** running in parallel:
  - **Code Quality**: Logic errors, code smells, error handling, efficiency, reuse
  - **Security**: OWASP Top 10 vulnerability scanning
  - **Cross-File Impact**: API contract changes, shared type breaks, missing tests
- **Inline Comments**: Posted on specific file:line in the PR diff
- **Summary Comment**: Overview with severity counts and verdict
- **Smart Filtering**: Only comments on changed lines, skips lockfiles/generated code
- **Deduplication**: Won't re-post on re-push if same finding exists
- **Dry-Run CLI**: Review locally before pushing (works with any Git host)
- **Configurable**: Choose tracks, model, severity threshold, exclusions

## Project Structure

```
ai-pr-reviewer/
├── src/                          # TypeScript source code
│   ├── index.ts                  # GitHub Action entry point — orchestrates full review flow
│   ├── cli.ts                    # Dry-run CLI — review local changes before pushing
│   ├── platform-client.ts        # Abstract interface for GitHub/GitLab/Bitbucket clients
│   ├── github-client.ts          # GitHub API client — fetch PR diff, post reviews
│   ├── gitlab-client.ts          # GitLab API client — fetch MR diff, post discussion notes
│   ├── bitbucket-client.ts       # Bitbucket API client — Cloud + Server support
│   ├── ai-reviewer.ts            # Claude API integration — runs parallel review tracks
│   ├── diff-parser.ts            # Unified diff parser — extracts file/line/hunk mappings
│   ├── review-filter.ts          # Filter pipeline — severity, diff-only, limit
│   ├── comment-formatter.ts      # Formats findings into branded review comments
│   ├── deduplication.ts          # Prevents re-posting existing bot comments
│   └── config.ts                 # Configuration from action inputs / env vars
├── prompts/                      # AI system prompts (customizable)
│   ├── code-quality.md           # Track 1: code quality & efficiency rules
│   ├── security-review.md        # Track 2: OWASP Top 10 security checks
│   └── cross-file-impact.md      # Track 3: cross-file/API impact analysis
├── templates/                    # CI/CD templates for each platform
│   ├── github-workflow.yml       # GitHub Actions workflow template
│   ├── gitlab-ci.yml             # GitLab CI job template
│   └── bitbucket-pipelines.yml   # Bitbucket Pipelines step template
├── docs/
│   └── PLAN.md                   # Implementation plan and architecture decisions
├── dist/                         # Compiled GitHub Action (built with ncc)
│   └── index.js                  # Bundled entry point
├── action.yml                    # GitHub Action metadata — inputs, outputs, branding
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── .env.example                  # Required environment variables template
├── .gitignore                    # Git ignore rules
└── README.md                     # This file
```

## Quick Start

### GitHub (Recommended)

#### 1. Get an Anthropic API Key
Go to [console.anthropic.com](https://console.anthropic.com) and create an API key.

#### 2. Add Secret to Your Repo
Go to **Settings > Secrets and variables > Actions > New repository secret**:
- Name: `ANTHROPIC_API_KEY`
- Value: your API key

#### 3. Add Workflow File
Create `.github/workflows/ai-review.yml` in your repo:

```yaml
name: AI PR Review
on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  pull-requests: write
  contents: read

jobs:
  review:
    runs-on: ubuntu-latest
    if: github.event.pull_request.draft == false
    steps:
      - uses: gauravs08/ai-pr-reviewer@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

Or copy `templates/github-workflow.yml` into your repo.

### GitLab

#### 1. Add CI/CD Variables
Go to **Settings > CI/CD > Variables**:
- `ANTHROPIC_API_KEY` — Anthropic API key
- `GITLAB_TOKEN` — GitLab access token with `api` scope

#### 2. Add CI Job
Copy `templates/gitlab-ci.yml` into your `.gitlab-ci.yml`.

### Bitbucket

#### 1. Add Repository Variables
Go to **Settings > Pipelines > Repository Variables**:
- `ANTHROPIC_API_KEY` — Anthropic API key
- `BITBUCKET_TOKEN` — Bitbucket access token with PR read/write scope

#### 2. Add Pipeline Step
Copy `templates/bitbucket-pipelines.yml` into your `bitbucket-pipelines.yml`.

## Configuration

| Input | Default | Description |
|-------|---------|-------------|
| `anthropic_api_key` | (required) | Anthropic API key |
| `model` | `claude-sonnet-4-5-20250929` | Claude model |
| `tracks` | `code-quality,security` | Review tracks to run |
| `max_files` | `20` | Max files to review |
| `max_comments` | `15` | Max inline comments |
| `exclude_patterns` | `*.lock,dist/**,...` | Glob patterns to skip |
| `severity_threshold` | `medium` | Min severity: `medium`, `high`, `critical` |
| `custom_instructions` | `""` | Extra context for the reviewer |
| `post_summary` | `true` | Post summary comment on PR |

### Full Example (GitHub)

```yaml
- uses: gauravs08/ai-pr-reviewer@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    model: claude-sonnet-4-5-20250929
    tracks: 'code-quality,security,cross-file'
    max_files: '30'
    max_comments: '20'
    exclude_patterns: '*.lock,dist/**,*.generated.*,migrations/**'
    severity_threshold: 'high'
    custom_instructions: 'This is a Spring Boot 3 REST API'
    post_summary: 'true'
```

## Review Tracks

### Code Quality
- Logic errors (null deref, off-by-one, missing returns)
- Code smells (duplication, god methods, deep nesting)
- Error handling (swallowed exceptions, generic catches)
- Efficiency (N+1 queries, unnecessary allocations)
- Reuse (missed abstractions, reinvented utilities)

### Security (OWASP Top 10)
1. Injection (SQL, command, template)
2. Broken Authentication (hardcoded creds, weak validation)
3. Sensitive Data Exposure (PII in logs, secrets in source)
4. XXE (unsafe XML parsing)
5. Broken Access Control (missing auth, IDOR)
6. Security Misconfiguration (debug mode, CORS *, exposed endpoints)
7. XSS (unsanitized user content)
8. Insecure Deserialization
9. Known Vulnerabilities (outdated deps)
10. Insufficient Logging

### Cross-File Impact
- API contract changes (signatures, DTOs, endpoints)
- Shared type modifications
- Database schema changes without migrations
- Missing test coverage for changed logic

## Severity Levels

| Level | Posted As | Meaning |
|-------|-----------|---------|
| `critical` | 🔴 CRITICAL | Must fix — security holes, data loss, breaking changes |
| `high` | 🟠 HIGH | Should fix — bugs, missed error handling |
| `medium` | 🟡 MEDIUM | Consider fixing — code smells, minor improvements |

Findings below your `severity_threshold` are filtered out.

## Comment Format

Inline comments look like:

> **AI Review** | 🔴 CRITICAL | Broken Access Control
>
> DELETE endpoint has no authorization check — any authenticated user can delete records.
>
> **Suggestion:** Add an authorization guard or role check to restrict access.

## Outputs (GitHub Actions)

| Output | Description |
|--------|-------------|
| `findings_count` | Total findings posted |
| `critical_count` | Critical findings |
| `high_count` | High findings |
| `medium_count` | Medium findings |

Use in subsequent steps:
```yaml
- uses: gauravs08/ai-pr-reviewer@v1
  id: review
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}

- name: Fail on critical
  if: steps.review.outputs.critical_count > 0
  run: exit 1
```

## Dry Run (Local Review)

Review your changes locally **before pushing** — works with any Git repo regardless of platform.

### Setup
```bash
git clone https://github.com/gauravs08/ai-pr-reviewer.git
cd ai-pr-reviewer
npm install
export ANTHROPIC_API_KEY=sk-ant-xxxxx
```

### Usage
```bash
cd /path/to/your/project

# Review uncommitted changes
npx ts-node /path/to/ai-pr-reviewer/src/cli.ts

# Review current branch vs main
npx ts-node /path/to/ai-pr-reviewer/src/cli.ts --base main

# Review last 3 commits
npx ts-node /path/to/ai-pr-reviewer/src/cli.ts --base HEAD~3

# Security-only review, high+ severity
npx ts-node /path/to/ai-pr-reviewer/src/cli.ts -t security -s high

# Custom review instructions
npx ts-node /path/to/ai-pr-reviewer/src/cli.ts -i "This is a React app with Redux"
```

### CLI Options

| Flag | Short | Default | Description |
|------|-------|---------|-------------|
| `--base` | `-b` | `HEAD` | Git ref to diff against |
| `--tracks` | `-t` | `code-quality,security` | Comma-separated tracks |
| `--model` | `-m` | `claude-sonnet-4-5-20250929` | Claude model |
| `--severity` | `-s` | `medium` | Min severity threshold |
| `--max-files` | | `20` | Max files to review |
| `--max-comments` | | `15` | Max findings to show |
| `--instructions` | `-i` | `""` | Custom review instructions |
| `--help` | `-h` | | Show help |

### Example Output

```
AI PR Reviewer -- Dry Run
   Model: claude-sonnet-4-5-20250929
   Base: main
   Tracks: code-quality, security
   Severity: >= medium

Getting git diff...
   Found 3 changed files

Running AI review...
   Raw findings: 4

======================================================================
  REVIEW RESULTS: 2 finding(s)
======================================================================

  Critical: 1
  Medium: 1

----------------------------------------------------------------------
  CRITICAL | Injection | SQL query built with string concatenation
  src/db/users.ts:42

  User input is directly interpolated into SQL query without parameterization.

  Suggestion: Use parameterized queries: db.query('SELECT * FROM users WHERE id = $1', [userId])

----------------------------------------------------------------------
  MEDIUM | Code Quality | Empty catch block swallows errors
  src/services/auth.ts:87

  Exception is caught but neither logged nor rethrown.

  Suggestion: Add logging: catch (e) { logger.error('Auth failed', e); throw e; }

======================================================================
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | No critical issues (safe to push) |
| `1` | Critical issues found or error occurred |

Use in a pre-push hook:
```bash
# .git/hooks/pre-push
npx ts-node /path/to/ai-pr-reviewer/src/cli.ts --base main -s critical
```

## Cost

| Model | Small PR (~500 lines) | Medium PR (~2K lines) |
|-------|----------------------|----------------------|
| Haiku 3.5 | ~$0.005 | ~$0.02 |
| Sonnet 4 | ~$0.03 | ~$0.15 |

GitHub Actions compute: free for public repos, 2000 min/month for private.
GitLab CI: 400 min/month free.
Bitbucket Pipelines: 50 min/month free.

## Development

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Build GitHub Action dist
npm run build

# Build CLI dist
npm run build:cli

# Run dry-run locally
npm run dry-run
```

## License

MIT
