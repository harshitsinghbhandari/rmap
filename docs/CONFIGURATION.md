# Configuration Reference

Complete reference for configuring `rmap` via environment variables.

## Table of Contents

- [Overview](#overview)
- [Required Configuration](#required-configuration)
- [Optional Configuration](#optional-configuration)
  - [Delta Update](#delta-update)
  - [Validation](#validation)
  - [Retry & Backoff](#retry--backoff)
  - [Concurrency](#concurrency)
  - [Scoring](#scoring)
  - [Output](#output)
  - [Token Limits](#token-limits)
  - [File Processing](#file-processing)
- [Model Configuration](#model-configuration)
- [Configuration Examples](#configuration-examples)
- [Performance Tuning](#performance-tuning)
- [File Exclusion (.rmapignore)](#file-exclusion-rmapignore)

## Overview

`rmap` is configured primarily through environment variables with the `RMAP_*` prefix and a `.rmapignore` file for excluding files from annotation. All settings have sensible defaults optimized for typical repositories.

Configuration sources (in order of precedence):
1. Environment variables (`RMAP_*`)
2. `.rmapignore` file (for file exclusion patterns)
3. Default values (defined in `src/config/defaults.ts`)

## Required Configuration

### ANTHROPIC_API_KEY

**Required**: Yes
**Type**: String
**Description**: Your Anthropic API key for Claude LLM access

```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

Get your API key from: https://console.anthropic.com/

## Optional Configuration

All optional configuration has sensible defaults. Override only when needed.

---

## Delta Update

Controls when to use delta updates vs full rebuilds.

### RMAP_DELTA_MIN_VALIDATION

**Default**: `20`
**Type**: Integer (1-1000)
**Description**: Minimum files changed to trigger validation during delta update

- Files changed < this value: Fast delta update only
- Files changed ≥ this value: Delta update with validation

```bash
export RMAP_DELTA_MIN_VALIDATION=20
```

### RMAP_DELTA_MAX_UPDATE

**Default**: `100`
**Type**: Integer (1-10000)
**Description**: Maximum files changed for delta update

- Files changed ≤ this value: Delta update
- Files changed > this value: Force full rebuild

```bash
export RMAP_DELTA_MAX_UPDATE=100
```

**Strategy Decision Tree:**
```
Files Changed | Strategy
--------------|----------
0             | No update needed
1-19          | Delta update
20-100        | Delta update + validation
100+          | Full rebuild
```

---

## Validation

Controls validation thresholds and warnings.

### RMAP_VALIDATION_MAX_DEVIATION

**Default**: `15`
**Type**: Integer (1-100)
**Description**: Maximum allowed deviation percentage for task distribution

Used in Level 2 to validate work division quality.

```bash
export RMAP_VALIDATION_MAX_DEVIATION=15
```

### RMAP_VALIDATION_MAX_MINUTES_PER_FILE

**Default**: `5`
**Type**: Integer (1-60)
**Description**: Warning threshold for estimated minutes per file

Warns if annotation is projected to take longer than this per file.

```bash
export RMAP_VALIDATION_MAX_MINUTES_PER_FILE=5
```

### RMAP_VALIDATION_TASK_IMBALANCE_HIGH

**Default**: `1.5`
**Type**: Float (1.0-10.0)
**Description**: Multiplier for detecting large tasks

Tasks with files > average × this value are flagged as imbalanced.

```bash
export RMAP_VALIDATION_TASK_IMBALANCE_HIGH=1.5
```

### RMAP_VALIDATION_TASK_IMBALANCE_LOW

**Default**: `0.5`
**Type**: Float (0.01-1.0)
**Description**: Multiplier for detecting small tasks

Tasks with files < average × this value are flagged as imbalanced.

```bash
export RMAP_VALIDATION_TASK_IMBALANCE_LOW=0.5
```

### RMAP_VALIDATION_MIN_TASK_COUNT

**Default**: `3`
**Type**: Integer (1-100)
**Description**: Minimum task count threshold for large repositories

```bash
export RMAP_VALIDATION_MIN_TASK_COUNT=3
```

### RMAP_VALIDATION_LARGE_REPO_THRESHOLD

**Default**: `100`
**Type**: Integer (10-10000)
**Description**: File count threshold for considering a repo "large"

```bash
export RMAP_VALIDATION_LARGE_REPO_THRESHOLD=100
```

### RMAP_VALIDATION_SMALL_TASK_THRESHOLD

**Default**: `50`
**Type**: Integer (10-10000)
**Description**: File count threshold for suggesting small tasks

```bash
export RMAP_VALIDATION_SMALL_TASK_THRESHOLD=50
```

---

## Retry & Backoff

Controls API retry behavior for rate limiting and transient failures.

### RMAP_RETRY_MAX

**Default**: `5`
**Type**: Integer (0-20)
**Description**: Maximum retry attempts for failed API calls

```bash
export RMAP_RETRY_MAX=5
```

**Retry sequence example:**
- Attempt 1: Immediate
- Attempt 2: Wait 2s
- Attempt 3: Wait 4s
- Attempt 4: Wait 8s
- Attempt 5: Wait 16s
- Attempt 6: Wait 32s

### RMAP_RETRY_BASE_BACKOFF_MS

**Default**: `2000` (2 seconds)
**Type**: Integer (100-10000)
**Description**: Base backoff multiplier in milliseconds

Formula: `Math.pow(2, attempt) × BASE_BACKOFF_MS`

```bash
export RMAP_RETRY_BASE_BACKOFF_MS=2000
```

### RMAP_RETRY_REQUEST_DELAY_MS

**Default**: `500` (0.5 seconds)
**Type**: Integer (0-5000)
**Description**: Delay between sequential API requests

Helps avoid hitting rate limits when processing multiple files.

```bash
export RMAP_RETRY_REQUEST_DELAY_MS=500
```

### RMAP_RETRY_MAX_BACKOFF_MS

**Default**: `32000` (32 seconds)
**Type**: Integer (1000-120000)
**Description**: Maximum backoff delay cap

Prevents exponential backoff from growing too large.

```bash
export RMAP_RETRY_MAX_BACKOFF_MS=32000
```

### RMAP_RETRY_VALIDATION_ERRORS

**Default**: `1`
**Type**: Integer (0-10)
**Description**: Retry attempts specifically for validation errors in Level 3

```bash
export RMAP_RETRY_VALIDATION_ERRORS=1
```

---

## Concurrency

Controls parallel processing during Level 3 annotations.

### RMAP_CONCURRENCY

**Default**: `10`
**Type**: Integer (1-100)
**Description**: Maximum concurrent Level 3 annotation tasks

**Impact:**
- Higher values = Faster processing, more API load
- Lower values = Slower but safer for API rate limits
- Typical speedup: ~7x vs sequential at default

```bash
export RMAP_CONCURRENCY=10
```

**Recommended values by API tier:**
- Free tier: `3-5`
- Standard tier: `10-15`
- Enterprise tier: `20-30`

### RMAP_TASK_DELAY

**Default**: `100` (0.1 seconds)
**Type**: Integer (0-60000)
**Description**: Delay in milliseconds between starting each annotation task

Helps smooth out API request bursts.

```bash
export RMAP_TASK_DELAY=100
```

### RMAP_MAX_PARALLEL

**Default**: `10`
**Type**: Integer (1-100)
**Description**: Maximum parallel file processing operations

```bash
export RMAP_MAX_PARALLEL=10
```

---

## Scoring

Controls relevance scoring weights for query ranking.

### RMAP_SCORING_POINTS_PER_TAG

**Default**: `10`
**Type**: Integer (0-1000)
**Description**: Points awarded per matching tag

Primary ranking factor.

```bash
export RMAP_SCORING_POINTS_PER_TAG=10
```

### RMAP_SCORING_POINTS_PER_IMPORTED_BY

**Default**: `5`
**Type**: Integer (0-1000)
**Description**: Points per file that imports this file

Rewards central, widely-used files.

```bash
export RMAP_SCORING_POINTS_PER_IMPORTED_BY=5
```

### RMAP_SCORING_POINTS_PER_IMPORT

**Default**: `2`
**Type**: Integer (0-1000)
**Description**: Points per import in this file

Minor factor for dependency tracking.

```bash
export RMAP_SCORING_POINTS_PER_IMPORT=2
```

### RMAP_SCORING_POINTS_PER_EXPORT

**Default**: `3`
**Type**: Integer (0-1000)
**Description**: Points per export in this file

Rewards files that provide functionality.

```bash
export RMAP_SCORING_POINTS_PER_EXPORT=3
```

### RMAP_SCORING_LARGE_FILE_THRESHOLD

**Default**: `1000`
**Type**: Integer (100-100000)
**Description**: Line count threshold for large file penalty

Files exceeding this receive a penalty.

```bash
export RMAP_SCORING_LARGE_FILE_THRESHOLD=1000
```

### RMAP_SCORING_LARGE_FILE_PENALTY

**Default**: `5`
**Type**: Integer (0-1000)
**Description**: Penalty points for large files

Prefers smaller, focused files over large ones.

```bash
export RMAP_SCORING_LARGE_FILE_PENALTY=5
```

---

## Output

Controls display and output formatting.

### RMAP_OUTPUT_MAX_FILES

**Default**: `10`
**Type**: Integer (1-1000)
**Description**: Maximum files to display per section in query results

```bash
export RMAP_OUTPUT_MAX_FILES=10
```

### RMAP_OUTPUT_MAX_EXPORTS

**Default**: `5`
**Type**: Integer (1-100)
**Description**: Maximum exports to display per file

```bash
export RMAP_OUTPUT_MAX_EXPORTS=5
```

### RMAP_OUTPUT_MAX_CONVENTIONS

**Default**: `5`
**Type**: Integer (1-100)
**Description**: Maximum conventions to display

```bash
export RMAP_OUTPUT_MAX_CONVENTIONS=5
```

### RMAP_OUTPUT_MAX_FILES_IN_PROMPT

**Default**: `10`
**Type**: Integer (1-1000)
**Description**: Maximum files to show in Level 2 prompt output

```bash
export RMAP_OUTPUT_MAX_FILES_IN_PROMPT=10
```

### RMAP_OUTPUT_PROGRESS_INTERVAL

**Default**: `100`
**Type**: Integer (1-10000)
**Description**: Progress update frequency (every N files)

```bash
export RMAP_OUTPUT_PROGRESS_INTERVAL=100
```

### RMAP_OUTPUT_PROGRESS_INTERVAL_L3

**Default**: `10`
**Type**: Integer (1-1000)
**Description**: Progress update frequency for Level 3 (every N files)

```bash
export RMAP_OUTPUT_PROGRESS_INTERVAL_L3=10
```

---

## Token Limits

Controls token budgets for LLM API calls.

### RMAP_TOKEN_MAX_L1

**Default**: `2000`
**Type**: Integer (100-100000)
**Description**: Maximum tokens for Level 1 (structure detection)

```bash
export RMAP_TOKEN_MAX_L1=2000
```

### RMAP_TOKEN_MAX_L2

**Default**: `4000`
**Type**: Integer (100-100000)
**Description**: Maximum tokens for Level 2 (work division)

```bash
export RMAP_TOKEN_MAX_L2=4000
```

### RMAP_TOKEN_MAX_L3

**Default**: `2000`
**Type**: Integer (100-100000)
**Description**: Maximum tokens for Level 3 (deep annotation)

```bash
export RMAP_TOKEN_MAX_L3=2000
```

### RMAP_TOKEN_MAX_LINES_IN_PROMPT

**Default**: `10000`
**Type**: Integer (100-1000000)
**Description**: Maximum lines to include in Level 3 prompt

Files exceeding this are truncated.

```bash
export RMAP_TOKEN_MAX_LINES_IN_PROMPT=10000
```

### RMAP_TOKEN_MAX_PURPOSE_CHARS

**Default**: `100`
**Type**: Integer (10-1000)
**Description**: Maximum characters for purpose field

```bash
export RMAP_TOKEN_MAX_PURPOSE_CHARS=100
```

---

## File Processing

Controls file processing thresholds and behavior.

### RMAP_FILE_MAX_LINE_COUNT

**Default**: `10000`
**Type**: Integer (100-1000000)
**Description**: Maximum line count for files

Files exceeding this are skipped during annotation.

```bash
export RMAP_FILE_MAX_LINE_COUNT=10000
```

### RMAP_FILE_BINARY_BUFFER_SIZE

**Default**: `8192`
**Type**: Integer (1024-65536)
**Description**: Buffer size for binary file detection

```bash
export RMAP_FILE_BINARY_BUFFER_SIZE=8192
```

### RMAP_FILE_TRUNCATION_RATIO

**Default**: `0.7` (70%)
**Type**: Float (0.1-0.9)
**Description**: Percentage of file content to show from beginning when truncating

When files exceed max lines, show this much from the start, rest from end.

```bash
export RMAP_FILE_TRUNCATION_RATIO=0.7
```

### RMAP_FILE_MAX_TAGS

**Default**: `5`
**Type**: Integer (1-20)
**Description**: Maximum tags per file

```bash
export RMAP_FILE_MAX_TAGS=5
```

### RMAP_FILE_MAX_PER_TASK

**Default**: `50`
**Type**: Integer (1-1000)
**Description**: Maximum files per Level 3 annotation task

Larger tasks = fewer API calls but longer processing.

```bash
export RMAP_FILE_MAX_PER_TASK=50
```

---

## Model Configuration

Model selection is controlled programmatically, not via environment variables.

**Level 1 (Structure Detection)**: `claude-haiku-4-5-20251001` (Haiku)
**Level 2 (Work Division)**: `claude-sonnet-4-5-20250929` (Sonnet)
**Level 3 (Annotations)**: Model chosen by Level 2 based on complexity
- Small tasks: Haiku (fast, cheap)
- Medium/Large tasks: Sonnet (slower, more capable)

See `src/config/models.ts` for implementation details.

---

## Configuration Examples

### High-Speed Build (More API Load)

```bash
export ANTHROPIC_API_KEY="your-key"
export RMAP_CONCURRENCY=20
export RMAP_TASK_DELAY=50
export RMAP_RETRY_REQUEST_DELAY_MS=200
```

### Conservative Build (API Rate Limit Friendly)

```bash
export ANTHROPIC_API_KEY="your-key"
export RMAP_CONCURRENCY=3
export RMAP_TASK_DELAY=500
export RMAP_RETRY_REQUEST_DELAY_MS=1000
export RMAP_RETRY_MAX=10
```

### Large Repository Optimization

```bash
export ANTHROPIC_API_KEY="your-key"
export RMAP_FILE_MAX_LINE_COUNT=5000
export RMAP_FILE_MAX_PER_TASK=30
export RMAP_DELTA_MAX_UPDATE=200
export RMAP_VALIDATION_LARGE_REPO_THRESHOLD=500
```

### High Precision Queries

```bash
export RMAP_SCORING_POINTS_PER_TAG=20
export RMAP_SCORING_POINTS_PER_IMPORTED_BY=10
export RMAP_OUTPUT_MAX_FILES=20
export RMAP_OUTPUT_MAX_EXPORTS=10
```

### Development/Testing

```bash
export ANTHROPIC_API_KEY="your-key"
export RMAP_CONCURRENCY=2
export RMAP_FILE_MAX_PER_TASK=10
export RMAP_TOKEN_MAX_L3=1000
export RMAP_OUTPUT_PROGRESS_INTERVAL_L3=1
```

---

## Performance Tuning

### Optimizing Build Speed

**Fastest** (high API usage):
```bash
RMAP_CONCURRENCY=30
RMAP_TASK_DELAY=50
RMAP_RETRY_REQUEST_DELAY_MS=200
```

**Balanced** (default):
```bash
RMAP_CONCURRENCY=10
RMAP_TASK_DELAY=100
RMAP_RETRY_REQUEST_DELAY_MS=500
```

**Safest** (low API usage):
```bash
RMAP_CONCURRENCY=3
RMAP_TASK_DELAY=500
RMAP_RETRY_REQUEST_DELAY_MS=1000
```

### Optimizing for Cost

Reduce token usage:
```bash
RMAP_FILE_MAX_LINE_COUNT=5000
RMAP_TOKEN_MAX_L3=1500
RMAP_FILE_TRUNCATION_RATIO=0.6
```

Use more delta updates:
```bash
RMAP_DELTA_MAX_UPDATE=200
RMAP_DELTA_MIN_VALIDATION=30
```

### Optimizing for Accuracy

Increase validation:
```bash
RMAP_VALIDATION_MAX_DEVIATION=10
RMAP_RETRY_VALIDATION_ERRORS=2
```

More context in queries:
```bash
RMAP_OUTPUT_MAX_FILES=20
RMAP_SCORING_POINTS_PER_TAG=15
```

---

## Environment File

Create a `.env` file in your project:

```bash
# Required
ANTHROPIC_API_KEY=your-api-key-here

# Optional - uncomment and adjust as needed
# RMAP_CONCURRENCY=10
# RMAP_RETRY_MAX=5
# RMAP_DELTA_MAX_UPDATE=100
# RMAP_FILE_MAX_LINE_COUNT=10000
```

Load with:
```bash
set -a
source .env
set +a
rmap map
```

---

## Validation

Check your configuration:

```bash
# Test with dry-run (check only, no changes)
rmap map --status

# View current settings (no env var for this yet)
# Settings are shown in error messages and logs
```

## Troubleshooting

### Rate Limiting

If you see rate limit errors:
```bash
export RMAP_CONCURRENCY=3
export RMAP_RETRY_REQUEST_DELAY_MS=1000
export RMAP_RETRY_MAX=10
```

### Slow Builds

Speed up by increasing concurrency:
```bash
export RMAP_CONCURRENCY=20
export RMAP_TASK_DELAY=50
```

### Large Files Causing Issues

Reduce file size limits:
```bash
export RMAP_FILE_MAX_LINE_COUNT=5000
export RMAP_TOKEN_MAX_LINES_IN_PROMPT=5000
```

### Memory Issues

Reduce batch sizes:
```bash
export RMAP_FILE_MAX_PER_TASK=20
export RMAP_MAX_PARALLEL=5
```

---

## File Exclusion (.rmapignore)

The `.rmapignore` file allows you to exclude files and directories from being annotated. It uses the same syntax as `.gitignore`.

### Auto-generation

On the first run, if `.rmapignore` doesn't exist, `rmap` automatically creates one with sensible defaults:

```
Created .rmapignore with default patterns. Customize as needed.
```

### File Format

The `.rmapignore` file uses gitignore syntax:

```gitignore
# Build artifacts
dist/
build/
.next/
.nuxt/
out/

# Dependencies
node_modules/
vendor/

# Logs
*.log
logs/
*.log.*

# OS files
.DS_Store
Thumbs.db

# IDE/Editor
.vscode/
.idea/
*.swp
*.swo

# Lock files (too large, limited semantic value)
pnpm-lock.yaml
package-lock.json
yarn.lock
Cargo.lock

# Generated/compiled files
*.min.js
*.bundle.js
*.map

# Test coverage
coverage/
.nyc_output/

# Temporary files
*.tmp
*.temp
.cache/

# Python
__pycache__/
.pytest_cache/
.mypy_cache/
venv/
.venv/

# Build outputs
target/
bin/
obj/
```

### Pattern Syntax

| Pattern | Description |
|---------|-------------|
| `*.log` | Ignore all files with `.log` extension |
| `dist/` | Ignore directory named `dist` |
| `/root-only.txt` | Ignore file only at repository root |
| `**/test/**` | Ignore any `test` directory at any level |
| `!important.log` | Negation - don't ignore this file |
| `# comment` | Comments start with `#` |

### Always Ignored

The following paths are always ignored, regardless of `.rmapignore` content:

- `.git/` - Git directory
- `.repo_map/` - rmap output directory

### Benefits

Using `.rmapignore` provides:

1. **Cost savings**: Skip processing useless files (build artifacts, logs, lock files)
2. **Faster builds**: Less files = faster pipeline
3. **Cleaner results**: Query results aren't polluted with build artifacts
4. **User control**: Easy customization via familiar `.gitignore` syntax

### Example Impact

**Before (without .rmapignore):**
- 2,500 files discovered
- 1,800 actually useful code files
- 700 build artifacts, logs, lockfiles (wasted)

**After (with .rmapignore):**
- 2,500 files discovered
- 1,800 passed filter, annotated
- 700 ignored (saves API calls and time)

---

## See Also

- [README.md](../README.md) - Quick start and usage
- [ARCHITECTURE.md](ARCHITECTURE.md) - Deep dive into internals
- [CLI.md](CLI.md) - Command reference

---

**Configuration source code**: [`src/config/`](../src/config/)
