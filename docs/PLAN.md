# ai-pr-reviewer — Implementation Plan

## Overview

Generic, configurable AI-powered PR review tool for GitHub. Inspired by existing PR review systems but platform-independent and open-source.

**Repo**: `github.com/gauravs08/ai-pr-reviewer`

---

## Two Deployment Options

| Option | How | Best For |
|--------|-----|----------|
| **A. GitHub Action** (primary) | Triggers on PR events, calls Claude API, posts inline review | Any GitHub repo — zero infra |
| **B. Polling Server** (optional) | Background threads poll GitHub for new PRs | Self-hosted, multi-platform |

---

## Review Architecture (3-Track Parallel)

Learned from existing PR review systems — adapted for generic use:

### Track 1: Code Quality & Efficiency

| Check | What it catches |
|-------|----------------|
| Logic errors | Null dereference, off-by-one, missing return |
| Code smells | Duplicate code, god methods, deep nesting |
| Naming | Misleading names, inconsistent conventions |
| Error handling | Swallowed exceptions, missing error propagation |
| Reuse | Missed abstractions, existing utility not used |
| Efficiency | Unnecessary allocations, N+1 queries, redundant ops |

### Track 2: Security Review (OWASP Top 10)

| # | Category | Checks |
|---|----------|--------|
| 1 | Injection | Unsanitized SQL, command injection, LDAP, XPath |
| 2 | Broken Auth | Hardcoded credentials, weak validation, tokens in logs |
| 3 | Sensitive Data | PII in logs, secrets in source, missing encryption |
| 4 | XXE | XML parsers without secure processing |
| 5 | Broken Access Control | Missing auth annotations, IDOR, no tenant isolation |
| 6 | Security Misconfiguration | Debug mode, CORS `*`, exposed actuator/debug endpoints |
| 7 | XSS | `dangerouslySetInnerHTML`, unsanitized user content |
| 8 | Insecure Deserialization | `ObjectInputStream`, polymorphic type handling |
| 9 | Known Vulnerabilities | Outdated deps with known CVEs |
| 10 | Insufficient Logging | Missing audit logs, logging sensitive data |

### Track 3: Cross-File Impact Analysis

| Check | What it catches |
|-------|----------------|
| API contracts | Changed request/response shapes not updated in callers |
| Shared types | DTO/model changes breaking other modules |
| Config changes | New required config not documented |
| DB migrations | Schema changes without migration scripts |
| Test coverage | Changed code without corresponding test updates |

---

## Severity Levels (only 3)

| Level | Emoji | Meaning |
|-------|-------|---------|
| `critical` | Red circle | Must fix before merge — security holes, data loss, breaking changes |
| `high` | Orange circle | Should fix — significant bugs, missed error handling |
| `medium` | Yellow circle | Consider fixing — code smells, minor improvements |

**Filtered out**: `low`, `info`, `minor`, `suggestion` — never posted as comments.

---

## Comment Format

### Inline Comment (on specific file:line)
```
AI Review | SEVERITY | Category

Technical description of the issue.

Suggestion: Concrete fix recommendation.
```

### Summary Comment (on PR conversation)
```
AI Code Review Summary

Reviewed X files across Y tracks.
Found Z issues: A critical, B high, C medium.

Overall: {Looks good | Minor issues | Needs changes}
```

---

## Output JSON Schema

```json
{
  "summary": "Review summary text",
  "reviews": [
    {
      "category": "Broken Access Control",
      "severity": "critical",
      "title": "DELETE endpoint missing auth check",
      "description": "Full description with suggestion",
      "file": "src/main/java/.../Controller.java",
      "line": 112,
      "lineType": "ADDED",
      "commentType": "inline"
    }
  ]
}
```

---

## Deduplication Strategy

1. Same file + line range (within 5 lines) -> merge, keep highest severity
2. On re-push (new commits), check existing bot comments -> skip duplicates
3. Only post on lines that appear in the PR diff

---

## Project Structure

```
ai-pr-reviewer/
├── .github/
│   └── workflows/
│       └── pr-review.yml            # Self-test: reviews PRs to this repo
├── src/
│   ├── index.ts                     # Action entry point
│   ├── github-client.ts             # GitHub API: fetch diff, post reviews
│   ├── ai-reviewer.ts              # Claude API integration
│   ├── diff-parser.ts              # Unified diff -> file/line mappings
│   ├── review-filter.ts            # Severity filtering, diff-only filtering
│   ├── comment-formatter.ts        # Format findings -> GitHub review comments
│   ├── deduplication.ts            # Skip already-posted findings
│   └── config.ts                   # Configuration & defaults
├── prompts/
│   ├── code-quality.md             # Track 1 system prompt
│   ├── security-review.md          # Track 2 system prompt (OWASP)
│   └── cross-file-impact.md        # Track 3 system prompt
├── action.yml                       # GitHub Action metadata
├── .env.example
├── tsconfig.json
├── package.json
├── README.md
└── LICENSE
```

---

## Configuration

### Required Secrets (per repo using the action)

| Secret | Description | Where to get |
|--------|-------------|--------------|
| `ANTHROPIC_API_KEY` | Claude API key | console.anthropic.com |

`GITHUB_TOKEN` is automatic — no setup needed.

### Configurable Inputs (action.yml)

| Input | Default | Description |
|-------|---------|-------------|
| `anthropic_api_key` | (required) | Claude API key |
| `model` | `claude-sonnet-4-5-20250929` | Claude model |
| `tracks` | `code-quality,security` | Comma-separated review tracks to run |
| `max_files` | `20` | Max files to review per PR |
| `max_comments` | `15` | Max inline comments per review |
| `exclude_patterns` | `*.lock,*.min.js,dist/**` | Glob patterns to skip |
| `severity_threshold` | `medium` | Min severity to post |
| `custom_instructions` | `""` | Extra review context (e.g., "This is a Spring Boot app") |
| `post_summary` | `true` | Post summary comment on PR |
| `language` | `auto` | Force language detection or auto-detect |

---

## How Repos Get Reviewed (answering: "where is it configured?")

### Option A: GitHub Action (per-repo opt-in)

Each repo that wants reviews adds ONE file:

```yaml
# .github/workflows/ai-review.yml
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
    steps:
      - uses: gauravs08/ai-pr-reviewer@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

So YES — if you create a new repo under `gauravs08/`, add this workflow file,
and set the `ANTHROPIC_API_KEY` secret, every PR will be auto-reviewed.

**To review ALL your repos**: Add this workflow to each repo, or use a
GitHub Organization-level workflow (reusable workflows).

### Option B: Org-wide with Reusable Workflow

1. In `ai-pr-reviewer` repo, define a reusable workflow:
   ```yaml
   # .github/workflows/reusable-review.yml
   on:
     workflow_call:
       secrets:
         ANTHROPIC_API_KEY:
           required: true
   ```

2. In each repo, just call it:
   ```yaml
   jobs:
     review:
       uses: gauravs08/ai-pr-reviewer/.github/workflows/reusable-review.yml@v1
       secrets:
         ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
   ```

### Option C: Polling Server (centralized config)

Web UI with project/repo tracking (like existing PR review systems):
- Add GitHub org/user as "project" with token
- Auto-discovers repos
- Toggle tracking per repo
- No workflow files needed in target repos

---

## Implementation Phases

### Phase 1: Core Action (MVP)
- [ ] GitHub Action scaffolding (action.yml, TypeScript)
- [ ] Fetch PR diff via GitHub API (`/pulls/{n}/files`)
- [ ] Diff parser: unified diff -> file/line/content mappings
- [ ] Claude API integration (Anthropic SDK)
- [ ] Code quality prompt (Track 1)
- [ ] Security review prompt (Track 2)
- [ ] Map AI findings to GitHub review comments (file:line)
- [ ] Post single review with inline comments via GitHub API
- [ ] Post summary comment
- [ ] Basic filtering: skip lockfiles, generated code, binaries

### Phase 2: Smart Filtering
- [ ] `.ai-review-ignore` file support (like .gitignore for review)
- [ ] Auto-detect language and apply language-specific rules
- [ ] Diff-only filtering (only comment on changed functions/blocks)
- [ ] Max token budget management (chunk large PRs)

### Phase 3: Deduplication & Polish
- [ ] Check existing bot comments before posting
- [ ] Skip re-review if only commit message changed
- [ ] Configurable tracks (enable/disable per repo)
- [ ] Cost tracking in workflow summary

### Phase 4: Polling Server (Optional)
- [ ] GitHub API client (polling mode)
- [ ] Background polling threads (reuse architecture)
- [ ] Web UI for project/repo management
- [ ] SQLite database for review history

---

## Cost Estimates

| Model | Small PR (~500 lines) | Medium PR (~2K lines) | Large PR (~5K lines) |
|-------|----------------------|----------------------|---------------------|
| Haiku 3.5 | ~$0.005 | ~$0.01 | ~$0.02 |
| Sonnet 4 | ~$0.03 | ~$0.08 | ~$0.15 |
| Opus 4 | ~$0.15 | ~$0.40 | ~$0.75 |

GitHub Actions compute: **free for public repos**, 2000 min/month free for private.

---

## Things to Set Up

| # | What | How |
|---|------|-----|
| 1 | GitHub repo | `github.com/gauravs08/ai-pr-reviewer` |
| 2 | Anthropic API key | console.anthropic.com -> API Keys |
| 3 | GitHub repo secret | Repo Settings -> Secrets -> `ANTHROPIC_API_KEY` |
| 4 | Node.js 20+ | For local development |
| 5 | (Optional) GitHub PAT | Only for polling server mode or cross-org access |
| 6 | (Optional) Org-level secret | If reviewing multiple repos, set at org level |
