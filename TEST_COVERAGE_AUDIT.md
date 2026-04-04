# Test Coverage Audit Report

**Date:** 2026-04-05
**Auditor:** Claude Code (AI Agent)
**Repository:** harshitsinghbhandari/rmap

---

## Executive Summary

| Category | Source Files | Test Files | Coverage |
|----------|-------------|------------|----------|
| Core | 13 | 10 | 77% |
| Config | 5 | 0 | **0%** |
| Levels | 23 | 15 | 65% |
| Coordinator | 13 | 7 | 54% |
| CLI | 8 | 2 | 25% |
| Query | 6 | 5 | 83% |
| **Total** | **68** | **39** | **57%** |

---

## Phase 1: GitHub Workflows & CI Configuration Audit

### Workflow Overview

| Workflow | Trigger | Node Versions | Purpose |
|----------|---------|---------------|---------|
| `ci.yml` | push/PR to main, feat/task-2 | 20.x only | typecheck + build + tests |
| `test.yml` | push/PR to main, feat/** | 20.x, 22.x | tests only |
| `build.yml` | push/PR to main, feat/** | 20.x only | build + verify dist/ |
| `lint.yml` | push/PR to main, feat/** | 20.x only | TypeScript noEmit |
| `typecheck.yml` | push/PR to main, feat/** | 20.x only | TypeScript strict |
| `publish.yml` | release created | 20.x only | tests + build + publish |

### Issues Found

#### 1. Inconsistent PNPM Versions (Critical)
```yaml
# publish.yml uses:
pnpm/action-setup@v2
version: 8

# All others use:
pnpm/action-setup@v4
version: 9
```
**Risk:** Publish workflow may fail or behave differently than development.

#### 2. Hardcoded Branch in ci.yml (Critical)
```yaml
# ci.yml
on:
  push:
    branches: [main, feat/task-2]  # Hardcoded!
  pull_request:
    branches: [main, feat/task-2]

# Others correctly use:
    branches: [main, feat/**]  # Glob pattern
```
**Risk:** CI won't run on new feature branches.

#### 3. No Coverage Collection
- No workflow collects or reports code coverage
- No integration with Codecov, Coveralls, or similar

#### 4. No Scheduled Tests
- No cron-based workflow to catch dependency drift
- Recommend weekly scheduled runs

#### 5. Redundant Workflows
- 5 separate workflows that could be consolidated
- `lint.yml` and `typecheck.yml` both run TypeScript checks

---

## Phase 2: Core Module Test Coverage

### Coverage Matrix

| Source File | Test File | Status |
|-------------|-----------|--------|
| `src/core/concurrency.ts` | `tests/core/concurrency.test.ts` | ✅ |
| `src/core/constants.ts` | `tests/core/constants.test.ts` | ✅ |
| `src/core/errors.ts` | `tests/core/errors.test.ts` | ✅ |
| `src/core/git-utils.ts` | `tests/core/git-utils.test.ts` | ✅ |
| `src/core/ignore-patterns.ts` | `tests/core/ignore-patterns.test.ts` | ✅ |
| `src/core/index.ts` | `tests/core/index.test.ts` | ✅ |
| `src/core/metrics.ts` | `tests/core/metrics.test.ts` | ✅ |
| `src/core/rate-limiter.ts` | `tests/core/rate-limiter.test.ts` | ✅ |
| `src/core/types.ts` | `tests/core/types.test.ts` | ✅ |
| `src/core/validation.ts` | `tests/core/validation.test.ts` | ✅ |
| `src/core/llm-client.ts` | ❌ None | **MISSING** |
| `src/core/metrics-logger.ts` | ❌ None | **MISSING** |
| `src/core/prompt-logger.ts` | ❌ None | **MISSING** |

### Config Module - COMPLETELY UNTESTED

| Source File | Test File | Status |
|-------------|-----------|--------|
| `src/config/defaults.ts` | ❌ None | **MISSING** |
| `src/config/env.ts` | ❌ None | **MISSING** |
| `src/config/index.ts` | ❌ None | **MISSING** |
| `src/config/models.ts` | ❌ None | **MISSING** |
| `src/config/rmapignore-defaults.ts` | ❌ None | **MISSING** |

### Critical Missing: `llm-client.ts`

This 288-line file contains:
- `LLMClient` class with exponential backoff retry logic
- `withRetry()` standalone function
- `calculateBackoff()` function
- Network error handling
- Rate limit retry behavior

**Recommendation:** Add unit tests with mocked Anthropic SDK.

---

## Phase 3: Pipeline Levels Test Coverage

### Level 0 (Metadata Harvesting)

| Source File | Status |
|-------------|--------|
| `level0/harvester.ts` | ✅ |
| `level0/index.ts` | ⚠️ Partial |
| `level0/parsers/fallback.ts` | ✅ |
| `level0/parsers/index.ts` | ✅ |
| `level0/parsers/javascript.ts` | ✅ |

### Level 1 (Import Detection)

| Source File | Status |
|-------------|--------|
| `level1/detector.ts` | ✅ |
| `level1/index.ts` | ⚠️ Partial |
| `level1/validation.ts` | **MISSING** |

### Level 2 (Code Chunking)

| Source File | Status |
|-------------|--------|
| `level2/divider.ts` | ✅ |
| `level2/prompt.ts` | ✅ |
| `level2/validation.ts` | ✅ |

### Level 3 (Semantic Annotation)

| Source File | Status |
|-------------|--------|
| `level3/annotator.ts` | ✅ |
| `level3/parser.ts` | ✅ |
| `level3/tag-validator.ts` | ✅ |
| `level3/prompt.ts` | **MISSING** |

### Level 4 (Validation)

| Source File | Status |
|-------------|--------|
| `level4/autofix.ts` | ✅ |
| `level4/checks.ts` | ✅ |
| `level4/orphans.ts` | ✅ |
| `level4/validator.ts` | ✅ |

### Coordinator Module

| Source File | Status |
|-------------|--------|
| `coordinator/assembler.ts` | ✅ |
| `coordinator/checkpoint.ts` | ✅ |
| `coordinator/delta.ts` | ✅ |
| `coordinator/graph.ts` | ✅ |
| `coordinator/incremental-annotations.ts` | ✅ |
| `coordinator/pipeline.ts` | ✅ |
| `coordinator/progress.ts` | ✅ |
| `coordinator/checkpoint-orchestrator.ts` | **MISSING** |
| `coordinator/delta-update.ts` | **MISSING** |
| `coordinator/graph-repair.ts` | **MISSING** |
| `coordinator/shutdown-handler.ts` | **MISSING** |
| `coordinator/versioning.ts` | **MISSING** |

---

## Phase 4: CLI & Query Engine Test Coverage

### CLI Module

| Source File | Status | Notes |
|-------------|--------|-------|
| `cli/commands/get-context.ts` | ⚠️ Partial | Structure tested, not execution |
| `cli/commands/map.ts` | ⚠️ Partial | Structure tested, not execution |
| `cli/display.ts` | **MISSING** | |
| `cli/index.ts` | **MISSING** | Main entry point |
| `cli/progress-ui.ts` | **MISSING** | |
| `cli/ui-constants.ts` | **MISSING** | |

### Query Engine

| Source File | Status |
|-------------|--------|
| `query/engine.ts` | ✅ |
| `query/filter.ts` | ✅ |
| `query/formatter.ts` | ✅ |
| `query/ranking.ts` | ✅ |
| `query/schemas.ts` | **MISSING** |

### Integration Tests - CRITICAL

**`tests/integration/pipeline.test.ts`** contains **only placeholder tests**:
```typescript
it('should run Level 0 harvest and pass results to Level 1', async () => {
  // TODO: Implement integration test
  assert.ok(true, 'Placeholder for Level 0 → Level 1 integration test');
});
```

All tests in this file are `assert.ok(true)` placeholders. No actual E2E testing exists.

---

## Recommendations

### Priority 1: Critical Fixes

1. **Fix `ci.yml` branch pattern**
   ```yaml
   branches: [main, feat/**]  # Instead of [main, feat/task-2]
   ```

2. **Unify PNPM version in `publish.yml`**
   ```yaml
   pnpm/action-setup@v4
   version: 9
   ```

3. **Implement real integration tests** - Replace all placeholders in `pipeline.test.ts`

4. **Add config module tests** - Currently 0% coverage

### Priority 2: High Value Additions

1. Add `llm-client.ts` unit tests (mock Anthropic SDK)
2. Add tests for `shutdown-handler.ts`
3. Add coverage reporting to CI (e.g., Codecov)
4. Add scheduled weekly test runs

### Priority 3: Good to Have

1. Add E2E tests that actually run CLI commands
2. Consolidate redundant workflows
3. Add test coverage gates (require minimum 80%)
4. Test CLI command execution, not just structure

---

## Files Requiring Tests (Prioritized)

| Priority | File | Lines | Reason |
|----------|------|-------|--------|
| P1 | `src/core/llm-client.ts` | 288 | Critical retry logic |
| P1 | `src/config/*.ts` | 400+ | Entire module untested |
| P1 | `tests/integration/pipeline.test.ts` | - | Replace placeholders |
| P2 | `src/coordinator/shutdown-handler.ts` | ~50 | Graceful shutdown |
| P2 | `src/coordinator/delta-update.ts` | ~100 | Delta logic |
| P2 | `src/coordinator/graph-repair.ts` | ~80 | Graph consistency |
| P3 | `src/cli/display.ts` | ~150 | Output formatting |
| P3 | `src/cli/progress-ui.ts` | ~200 | Progress display |
| P3 | `src/query/schemas.ts` | ~100 | Schema validation |

---

## Test Infrastructure Notes

- **Framework:** Node.js built-in `node:test` module
- **Assertions:** Node.js built-in `node:assert`
- **Runner:** `tsx` for TypeScript support
- **Test command:** `pnpm test`
- **No coverage tool configured**

---

## Appendix: Source-to-Test Mapping

```
src/                           tests/
├── cli/                       ├── cli/
│   ├── commands/             │   ├── commands.test.ts (partial)
│   ├── display.ts (MISSING)  │   └── compute.test.ts
│   ├── index.ts (MISSING)    │
│   ├── progress-ui.ts (MISS) │
│   └── ui-constants.ts (MISS)│
├── config/ (ALL MISSING)     │ (no tests/)
├── coordinator/              ├── coordinator/
│   ├── assembler.ts          │   ├── assembler.test.ts
│   ├── checkpoint.ts         │   ├── checkpoint.test.ts
│   ├── delta.ts              │   ├── delta.test.ts
│   ├── graph.ts              │   ├── graph.test.ts
│   ├── pipeline.ts           │   ├── pipeline.test.ts
│   ├── progress.ts           │   ├── progress.test.ts
│   ├── checkpoint-orch (MISS)│   └── incremental-annotations.test.ts
│   ├── delta-update.ts (MISS)│
│   ├── graph-repair.ts (MISS)│
│   ├── shutdown-handler (MISS│
│   └── versioning.ts (MISS)  │
├── core/                     ├── core/
│   ├── (10 files tested)     │   ├── (10 test files)
│   ├── llm-client.ts (MISS)  │
│   ├── metrics-logger (MISS) │
│   └── prompt-logger (MISS)  │
├── levels/                   ├── levels/
│   ├── level0/ (tested)      │   ├── level0/
│   ├── level1/validation(MIS)│   ├── level1/
│   ├── level2/ (tested)      │   ├── level2/
│   ├── level3/prompt (MISS)  │   ├── level3/
│   └── level4/ (tested)      │   └── level4/
└── query/                    ├── query/
    ├── (5 files tested)      │   ├── (5 test files)
    └── schemas.ts (MISS)     │
                              └── integration/
                                  ├── checkpoint.test.ts (real)
                                  └── pipeline.test.ts (PLACEHOLDERS)
```
