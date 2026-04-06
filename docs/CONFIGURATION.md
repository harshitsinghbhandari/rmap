# Configuration Reference

Complete reference for configuring `rmap` via environment variables.

## Table of Contents

- [Overview](#overview)
- [Required Configuration](#required-configuration)
- [Optional Configuration](#optional-configuration)
  - [Delta Update](#delta-update)
  - [Validation](#validation)
  - [Retry & Backoff](#retry--backoff)
  - [Rate Limiting](#rate-limiting)
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

### RMAP_DELTA_MAX_UPDATE

**Default**: `100`
**Type**: Integer (1-10000)
**Description**: Maximum files changed for delta update

---

## Validation

Controls validation thresholds and warnings.

### RMAP_VALIDATION_MAX_DEVIATION

**Default**: `15`
**Type**: Integer (1-100)
**Description**: Maximum allowed deviation percentage for task distribution

### RMAP_VALIDATION_MAX_MINUTES_PER_FILE

**Default**: `5`
**Type**: Integer (1-60)
**Description**: Warning threshold for estimated minutes per file

---

## Retry & Backoff

Controls API retry behavior for rate limiting and transient failures.

### RMAP_RETRY_MAX

**Default**: `5`
**Type**: Integer (0-20)
**Description**: Maximum retry attempts for failed API calls

### RMAP_RETRY_BASE_BACKOFF_MS

**Default**: `2000` (2 seconds)
**Type**: Integer (100-10000)
**Description**: Base backoff multiplier in milliseconds for general errors

---

## Rate Limiting

Controls global rate limits to prevent hitting API quotas.

### RMAP_RATE_LIMIT_RPM

**Default**: `50`
**Type**: Integer (1-1000)
**Description**: Maximum requests per minute

### RMAP_RATE_LIMIT_TPM

**Default**: `8000`
**Type**: Integer (100-1000000)
**Description**: Maximum input tokens per minute

---

## Concurrency

Controls parallel processing during Level 3 annotations.

### RMAP_CONCURRENCY

**Default**: `10`
**Type**: Integer (1-100)
**Description**: Maximum concurrent Level 3 annotation tasks

---

## Scoring

Controls relevance scoring weights for query ranking.

### RMAP_SCORING_POINTS_PER_IMPORTED_BY

**Default**: `5`
**Type**: Integer (0-1000)
**Description**: Points per file that imports this file

### RMAP_SCORING_POINTS_PER_IMPORT

**Default**: `2`
**Type**: Integer (0-1000)
**Description**: Points per import in this file

### RMAP_SCORING_POINTS_PER_EXPORT

**Default**: `3`
**Type**: Integer (0-1000)
**Description**: Points per export in this file

---

## Output

Controls display and output formatting.

### RMAP_OUTPUT_MAX_FILES

**Default**: `10`
**Type**: Integer (1-1000)
**Description**: Maximum files to display per section in query results

### RMAP_OUTPUT_MAX_EXPORTS

**Default**: `5`
**Type**: Integer (1-100)
**Description**: Maximum exports to display per file

---

## Token Limits

Controls token budgets for LLM API calls.

### RMAP_TOKEN_MAX_L1

**Default**: `2000`
**Type**: Integer (100-100000)
**Description**: Maximum tokens for Level 1 (structure detection)

### RMAP_TOKEN_MAX_L2

**Default**: `4000`
**Type**: Integer (100-100000)
**Description**: Maximum tokens for Level 2 (work division)

### RMAP_TOKEN_MAX_L3

**Default**: `2000`
**Type**: Integer (100-100000)
**Description**: Maximum tokens for Level 3 (deep annotation)

---

## File Processing

Controls file processing thresholds and behavior.

### RMAP_FILE_MAX_LINE_COUNT

**Default**: `10000`
**Type**: Integer (100-1000000)
**Description**: Maximum line count for files

### RMAP_FILE_MAX_PER_TASK

**Default**: `50`
**Type**: Integer (1-1000)
**Description**: Maximum files per Level 3 annotation task

---

## Model Configuration

Model selection is controlled programmatically.

- **Level 1**: `claude-haiku-4-5-20251001`
- **Level 2**: `claude-sonnet-4-5-20250929`
- **Level 3**: Chosen by Level 2 based on complexity

---

## Performance Tuning

### Optimizing Build Speed

Fastest (high API usage):
```bash
RMAP_CONCURRENCY=30
RMAP_TASK_DELAY=50
RMAP_RETRY_REQUEST_DELAY_MS=200
```

Balanced (default):
```bash
RMAP_CONCURRENCY=10
RMAP_TASK_DELAY=100
RMAP_RETRY_REQUEST_DELAY_MS=500
```
