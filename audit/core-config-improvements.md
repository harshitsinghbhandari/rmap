# Core & Config Improvements Roadmap

**Generated**: 2026-04-01
**Based on**: Code Quality Audit Report (audit/core-config-audit.md)
**Target**: src/core/ and src/config/
**Estimated Effort**: 2-3 developer days

---

## Table of Contents

1. [Overview](#overview)
2. [Priority 0: Critical Fixes](#priority-0-critical-fixes)
3. [Priority 1: High Priority](#priority-1-high-priority)
4. [Priority 2: Medium Priority](#priority-2-medium-priority)
5. [Priority 3: Low Priority](#priority-3-low-priority)
6. [Implementation Order](#implementation-order)
7. [Testing Strategy](#testing-strategy)
8. [Migration Guide](#migration-guide)

---

## Overview

This document provides a detailed roadmap for addressing the 15 issues identified in the Core & Config audit. Issues are organized by priority (P0-P3) with specific implementation steps, code examples, and testing requirements.

### Quick Stats
- **Total Issues**: 15
- **Critical (P0)**: 3 issues (~2 hours)
- **High (P1)**: 4 issues (~1 day)
- **Medium (P2)**: 5 issues (~1 day)
- **Low (P3)**: 3 issues (~0.5 day)

---

## Priority 0: Critical Fixes

**Timeline**: Immediate (within 24 hours)
**Estimated Effort**: 2 hours
**Risk if delayed**: Breaking changes, logic bugs, API incompleteness

---

### P0.1: Fix UPDATE_THRESHOLDS Ambiguity

**Issue**: `DELTA_WITH_VALIDATION` and `FULL_REBUILD` both set to 100, causing logic ambiguity
**File**: `src/core/constants.ts:134-141`
**Severity**: Critical (logic bug risk)

#### Current Code
```typescript
export const UPDATE_THRESHOLDS = {
  DELTA_ONLY: 20,
  DELTA_WITH_VALIDATION: 100,  // ❌ Same as FULL_REBUILD
  FULL_REBUILD: 100,            // ❌ Same as DELTA_WITH_VALIDATION
} as const;
```

#### Proposed Fix
```typescript
/**
 * Update strategy thresholds
 *
 * Determines whether to do a delta update or full rebuild based on
 * the number of files changed since the last map.
 *
 * Strategy:
 * - 0-19 files: Delta update only (no re-validation)
 * - 20-99 files: Delta update with validation pass
 * - 100+ files: Full rebuild from scratch
 */
export const UPDATE_THRESHOLDS = {
  /** Below this: delta update only */
  DELTA_ONLY: 20,

  /** Between DELTA_ONLY and this: delta update + validation */
  DELTA_WITH_VALIDATION: 20,

  /** At or above this: force full rebuild */
  FULL_REBUILD: 100,
} as const;
```

#### Implementation Steps
1. Update `constants.ts` with new threshold values
2. Update any logic that uses these thresholds (check coordinator/pipeline.ts)
3. Add validation that `DELTA_ONLY <= DELTA_WITH_VALIDATION < FULL_REBUILD`
4. Update tests to reflect new threshold behavior

#### Testing
```typescript
// Add to tests/core/constants.test.ts
describe('UPDATE_THRESHOLDS validation', () => {
  it('should have valid threshold ordering', () => {
    expect(UPDATE_THRESHOLDS.DELTA_ONLY).toBeLessThanOrEqual(
      UPDATE_THRESHOLDS.DELTA_WITH_VALIDATION
    );
    expect(UPDATE_THRESHOLDS.DELTA_WITH_VALIDATION).toBeLessThan(
      UPDATE_THRESHOLDS.FULL_REBUILD
    );
  });
});
```

#### Files to Update
- ✅ `src/core/constants.ts`
- ✅ `tests/core/constants.test.ts`
- ⚠️ Review usage in `src/coordinator/pipeline.ts` or similar

---

### P0.2: Add Missing Type Exports

**Issue**: Critical types used throughout codebase not exported from public API
**File**: `src/core/index.ts:8-22`
**Severity**: Critical (blocks external usage)

#### Missing Exports
- `CheckpointState` (used in checkpoint.ts, pipeline.ts, tests)
- `LevelCheckpoint` (used in checkpoint.ts)
- `LevelStatus` (used in checkpoint.ts)
- `Level0Output` (used in detector.ts, pipeline.ts)
- `Level1Output` (used in pipeline.ts, divider.ts)

#### Current Code
```typescript
export type {
  FileAnnotation,
  Module,
  MetaJson,
  GraphNode,
  GraphJson,
  TagsJson,
  StatsJson,
  ValidationSeverity,
  ValidationIssue,
  ValidationJson,
  DelegationTask,
  TaskDelegation,
  RawFileMetadata,
} from './types.js';
```

#### Proposed Fix
```typescript
export type {
  // File and repository metadata
  FileAnnotation,
  Module,
  MetaJson,
  RawFileMetadata,

  // Graph and indexing
  GraphNode,
  GraphJson,
  TagsJson,
  StatsJson,

  // Validation
  ValidationSeverity,
  ValidationIssue,
  ValidationJson,

  // Work delegation
  DelegationTask,
  TaskDelegation,

  // Pipeline outputs
  Level0Output,
  Level1Output,

  // Checkpoint system
  CheckpointState,
  LevelCheckpoint,
  LevelStatus,
} from './types.js';
```

#### Implementation Steps
1. Add missing type exports to `src/core/index.ts`
2. Update imports in test files to use public API
3. Verify no direct imports from `types.js` remain in tests
4. Add export verification test

#### Testing
```typescript
// Add to tests/core/exports.test.ts (NEW FILE)
import * as Core from '../src/core/index.js';

describe('Core module exports', () => {
  const requiredTypeExports = [
    'CheckpointState',
    'LevelCheckpoint',
    'LevelStatus',
    'Level0Output',
    'Level1Output',
  ];

  // Note: TypeScript types don't exist at runtime, so we verify via TypeScript compilation
  it('should compile with all required types', () => {
    // This test passes if TypeScript compilation succeeds
    const _checkpoint: Core.CheckpointState = {} as any;
    const _level0: Core.Level0Output = {} as any;
    // ... etc
    expect(true).toBe(true);
  });
});
```

#### Files to Update
- ✅ `src/core/index.ts`
- ✅ `tests/core/exports.test.ts` (NEW)
- ✅ Update test imports to use public API

---

### P0.3: Add Missing Constant Exports

**Issue**: Checkpoint constants not exported from public API
**File**: `src/core/index.ts:25-32`
**Severity**: Critical (forces internal imports)

#### Missing Exports
- `CHECKPOINT_DIR` (used in checkpoint.ts)
- `CHECKPOINT_VERSION` (used in checkpoint.ts)
- `CHECKPOINT_FILES` (used in checkpoint.ts, pipeline.ts)

#### Current Code
```typescript
export {
  SCHEMA_VERSION,
  TAG_TAXONOMY,
  TAG_ALIASES,
  UPDATE_THRESHOLDS,
  MAX_TAGS_PER_FILE,
  MAX_FILES_PER_TASK,
} from './constants.js';
```

#### Proposed Fix
```typescript
export {
  // Schema and versioning
  SCHEMA_VERSION,

  // Tag taxonomy
  TAG_TAXONOMY,
  TAG_ALIASES,

  // Pipeline configuration
  UPDATE_THRESHOLDS,
  MAX_TAGS_PER_FILE,
  MAX_FILES_PER_TASK,

  // Checkpoint system
  CHECKPOINT_DIR,
  CHECKPOINT_VERSION,
  CHECKPOINT_FILES,
} from './constants.js';
```

#### Implementation Steps
1. Add checkpoint constant exports to `src/core/index.ts`
2. Update imports in checkpoint-related files
3. Add export verification test
4. Document in README which constants are public API

#### Testing
```typescript
// Add to tests/core/exports.test.ts
import * as Core from '../src/core/index.js';

describe('Core module constant exports', () => {
  it('should export all checkpoint constants', () => {
    expect(Core.CHECKPOINT_DIR).toBe('.checkpoint');
    expect(Core.CHECKPOINT_VERSION).toBe('1.0');
    expect(Core.CHECKPOINT_FILES).toHaveProperty('STATE');
    expect(Core.CHECKPOINT_FILES).toHaveProperty('LEVEL0');
  });
});
```

#### Files to Update
- ✅ `src/core/index.ts`
- ✅ `tests/core/exports.test.ts`
- ✅ Update imports in checkpoint.ts, pipeline.ts

---

## Priority 1: High Priority

**Timeline**: This sprint (within 1 week)
**Estimated Effort**: 1 day
**Risk if delayed**: Runtime bugs, inflexibility, maintenance burden

---

### P1.1: Add Runtime Validation for Tag Taxonomy

**Issue**: No validation that tags are unique or follow conventions
**File**: `src/core/constants.ts:19-107`
**Severity**: High (runtime bugs possible)

#### Proposed Implementation

Create a new validation utility:

```typescript
// src/core/validation.ts (NEW FILE)

import { TAG_TAXONOMY, TAG_ALIASES, Tag } from './constants.js';

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(`[Config Validation] ${message}`);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Validates the tag taxonomy for consistency and correctness
 * Called at module initialization to catch configuration errors early
 */
export function validateTagTaxonomy(): void {
  const tags = TAG_TAXONOMY as readonly string[];

  // Check for duplicates
  const tagSet = new Set(tags);
  if (tagSet.size !== tags.length) {
    const duplicates = tags.filter((tag, index) => tags.indexOf(tag) !== index);
    throw new ConfigValidationError(
      `Duplicate tags found in taxonomy: ${duplicates.join(', ')}`
    );
  }

  // Check for empty taxonomy
  if (tags.length === 0) {
    throw new ConfigValidationError('Tag taxonomy cannot be empty');
  }

  // Check naming convention (lowercase and snake_case only)
  const invalidTags = tags.filter(tag => !/^[a-z][a-z0-9_]*$/.test(tag));
  if (invalidTags.length > 0) {
    throw new ConfigValidationError(
      `Tags must be lowercase snake_case: ${invalidTags.join(', ')}`
    );
  }

  // Validate aliases reference real tags
  for (const [alias, aliasTags] of Object.entries(TAG_ALIASES)) {
    for (const tag of aliasTags) {
      if (!tagSet.has(tag)) {
        throw new ConfigValidationError(
          `Alias "${alias}" references non-existent tag: ${tag}`
        );
      }
    }
  }
}

/**
 * Validates that a tag is in the taxonomy
 */
export function isValidTag(tag: string): tag is Tag {
  return TAG_TAXONOMY.includes(tag as Tag);
}

/**
 * Validates an array of tags for a file
 */
export function validateFileTags(tags: string[]): void {
  if (tags.length === 0) {
    throw new ConfigValidationError('File must have at least one tag');
  }

  if (tags.length > 5) {
    throw new ConfigValidationError(
      `File has too many tags (${tags.length}). Maximum is 5.`
    );
  }

  const invalidTags = tags.filter(tag => !isValidTag(tag));
  if (invalidTags.length > 0) {
    throw new ConfigValidationError(
      `Invalid tags: ${invalidTags.join(', ')}. Must be from TAG_TAXONOMY.`
    );
  }

  // Check for duplicates
  const tagSet = new Set(tags);
  if (tagSet.size !== tags.length) {
    throw new ConfigValidationError('File has duplicate tags');
  }
}

// Run validation on module load
validateTagTaxonomy();
```

#### Update core/index.ts
```typescript
// Add to exports
export { validateFileTags, isValidTag } from './validation.js';

// Import validation to run on load
import './validation.js';
```

#### Implementation Steps
1. Create `src/core/validation.ts` with validation functions
2. Import validation in `src/core/index.ts` to run on load
3. Export validation utilities for use in Level 3
4. Add comprehensive tests
5. Update Level 3 agents to use `validateFileTags()`

#### Testing
```typescript
// tests/core/validation.test.ts (NEW FILE)
import { validateFileTags, isValidTag } from '../src/core/validation.js';

describe('Tag validation', () => {
  it('should accept valid tags', () => {
    expect(() => validateFileTags(['authentication'])).not.toThrow();
    expect(() => validateFileTags(['auth', 'api'])).not.toThrow();
  });

  it('should reject invalid tags', () => {
    expect(() => validateFileTags(['fake_tag'])).toThrow('Invalid tags');
  });

  it('should reject too many tags', () => {
    expect(() =>
      validateFileTags(['auth', 'api', 'db', 'test', 'frontend', 'backend'])
    ).toThrow('too many tags');
  });

  it('should reject duplicate tags', () => {
    expect(() => validateFileTags(['auth', 'auth'])).toThrow('duplicate');
  });
});
```

#### Files to Create/Update
- ✅ `src/core/validation.ts` (NEW)
- ✅ `src/core/index.ts` (update exports)
- ✅ `tests/core/validation.test.ts` (NEW)
- ✅ Update Level 3 annotation code to use validation

---

### P1.2: Add Environment Variable Overrides

**Issue**: All configuration hardcoded, no runtime customization
**File**: `src/core/constants.ts`, `src/config/models.ts`
**Severity**: High (limited flexibility)

#### Proposed Implementation

Update `constants.ts`:
```typescript
/**
 * Maximum number of tags per file
 * Override with RMAP_MAX_TAGS_PER_FILE
 */
export const MAX_TAGS_PER_FILE = parseInt(
  process.env.RMAP_MAX_TAGS_PER_FILE || '5',
  10
);

/**
 * Maximum number of files per Level 3 annotation task
 * Override with RMAP_MAX_FILES_PER_TASK
 */
export const MAX_FILES_PER_TASK = parseInt(
  process.env.RMAP_MAX_FILES_PER_TASK || '50',
  10
);

/**
 * Threshold for delta-only updates
 * Override with RMAP_DELTA_ONLY_THRESHOLD
 */
const DELTA_ONLY_THRESHOLD = parseInt(
  process.env.RMAP_DELTA_ONLY_THRESHOLD || '20',
  10
);

/**
 * Threshold for full rebuild
 * Override with RMAP_FULL_REBUILD_THRESHOLD
 */
const FULL_REBUILD_THRESHOLD = parseInt(
  process.env.RMAP_FULL_REBUILD_THRESHOLD || '100',
  10
);

export const UPDATE_THRESHOLDS = {
  DELTA_ONLY: DELTA_ONLY_THRESHOLD,
  DELTA_WITH_VALIDATION: DELTA_ONLY_THRESHOLD,
  FULL_REBUILD: FULL_REBUILD_THRESHOLD,
} as const;
```

Update `models.ts`:
```typescript
/**
 * Available Claude models
 * Override with RMAP_HAIKU_MODEL and RMAP_SONNET_MODEL
 */
export const MODELS = {
  HAIKU: process.env.RMAP_HAIKU_MODEL || 'claude-haiku-4-5-20251001',
  SONNET: process.env.RMAP_SONNET_MODEL || 'claude-sonnet-4-5-20250929',
} as const;

/**
 * Retry and timeout configuration for API calls
 */
export const RETRY_CONFIG = {
  MAX_RETRIES: parseInt(process.env.RMAP_MAX_RETRIES || '5', 10),
  BASE_BACKOFF_MS: parseInt(process.env.RMAP_BASE_BACKOFF_MS || '2000', 10),
  REQUEST_DELAY_MS: parseInt(process.env.RMAP_REQUEST_DELAY_MS || '500', 10),
  REQUEST_TIMEOUT_MS: parseInt(process.env.RMAP_REQUEST_TIMEOUT_MS || '30000', 10),
} as const;
```

Add validation:
```typescript
// src/core/validation.ts (add to existing file)

export function validateConfig(): void {
  // Validate MAX_TAGS_PER_FILE
  if (MAX_TAGS_PER_FILE < 1 || MAX_TAGS_PER_FILE > 10) {
    throw new ConfigValidationError(
      `MAX_TAGS_PER_FILE must be between 1 and 10 (got ${MAX_TAGS_PER_FILE})`
    );
  }

  // Validate MAX_FILES_PER_TASK
  if (MAX_FILES_PER_TASK < 1 || MAX_FILES_PER_TASK > 200) {
    throw new ConfigValidationError(
      `MAX_FILES_PER_TASK must be between 1 and 200 (got ${MAX_FILES_PER_TASK})`
    );
  }

  // Validate UPDATE_THRESHOLDS
  if (UPDATE_THRESHOLDS.DELTA_ONLY > UPDATE_THRESHOLDS.FULL_REBUILD) {
    throw new ConfigValidationError(
      'DELTA_ONLY threshold cannot exceed FULL_REBUILD threshold'
    );
  }
}

// Run config validation on module load
validateConfig();
```

#### Documentation Update

Add to README.md:
```markdown
## Environment Variables

### Required
- `ANTHROPIC_API_KEY` - Your Anthropic API key for Claude access

### Optional Configuration

#### Model Selection
- `RMAP_HAIKU_MODEL` - Claude Haiku model version (default: `claude-haiku-4-5-20251001`)
- `RMAP_SONNET_MODEL` - Claude Sonnet model version (default: `claude-sonnet-4-5-20250929`)

#### Pipeline Configuration
- `RMAP_MAX_TAGS_PER_FILE` - Maximum tags per file (default: `5`, range: 1-10)
- `RMAP_MAX_FILES_PER_TASK` - Files per annotation task (default: `50`, range: 1-200)
- `RMAP_DELTA_ONLY_THRESHOLD` - Files changed for delta update (default: `20`)
- `RMAP_FULL_REBUILD_THRESHOLD` - Files changed for full rebuild (default: `100`)

#### API Configuration
- `RMAP_MAX_RETRIES` - Maximum API retry attempts (default: `5`)
- `RMAP_BASE_BACKOFF_MS` - Base backoff for retries in ms (default: `2000`)
- `RMAP_REQUEST_DELAY_MS` - Delay between requests in ms (default: `500`)
- `RMAP_REQUEST_TIMEOUT_MS` - Request timeout in ms (default: `30000`)

### Example Usage
```bash
# Use different model versions
export RMAP_SONNET_MODEL=claude-sonnet-4-5-20250929

# Process larger batches for big repos
export RMAP_MAX_FILES_PER_TASK=100

# More aggressive rate limit handling
export RMAP_MAX_RETRIES=10
export RMAP_BASE_BACKOFF_MS=5000
```
```

#### Implementation Steps
1. Update `constants.ts` with env var support
2. Update `models.ts` with env var support
3. Add validation to `validation.ts`
4. Document in README.md
5. Add tests for env var parsing
6. Update CLI help text with env var info

#### Testing
```typescript
// tests/core/env-config.test.ts (NEW FILE)
describe('Environment variable configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use default values when env vars not set', () => {
    delete process.env.RMAP_MAX_TAGS_PER_FILE;
    // Re-import to get fresh config
    jest.resetModules();
    const { MAX_TAGS_PER_FILE } = require('../src/core/constants.js');
    expect(MAX_TAGS_PER_FILE).toBe(5);
  });

  it('should use env var overrides when set', () => {
    process.env.RMAP_MAX_TAGS_PER_FILE = '3';
    jest.resetModules();
    const { MAX_TAGS_PER_FILE } = require('../src/core/constants.js');
    expect(MAX_TAGS_PER_FILE).toBe(3);
  });

  it('should validate env var ranges', () => {
    process.env.RMAP_MAX_TAGS_PER_FILE = '100';
    jest.resetModules();
    expect(() => {
      require('../src/core/validation.js');
    }).toThrow('MAX_TAGS_PER_FILE must be between 1 and 10');
  });
});
```

#### Files to Update
- ✅ `src/core/constants.ts`
- ✅ `src/config/models.ts`
- ✅ `src/core/validation.ts`
- ✅ `README.md`
- ✅ `tests/core/env-config.test.ts` (NEW)

---

### P1.3: Add Timeout Configuration

**Issue**: No timeout value exported for API calls
**File**: `src/config/models.ts:40-61`
**Severity**: High (reliability concern)

#### Current Code
```typescript
export const RETRY_CONFIG = {
  MAX_RETRIES: 5,
  BASE_BACKOFF_MS: 2000,
  REQUEST_DELAY_MS: 500,
  // ❌ Missing timeout
} as const;
```

#### Proposed Fix
```typescript
export const RETRY_CONFIG = {
  /**
   * Maximum number of retry attempts for failed API calls
   */
  MAX_RETRIES: parseInt(process.env.RMAP_MAX_RETRIES || '5', 10),

  /**
   * Base backoff multiplier in milliseconds for exponential backoff
   * Formula: Math.pow(2, attempt) * BASE_BACKOFF_MS
   * Default: 2000ms (2s, 4s, 8s, 16s, 32s)
   */
  BASE_BACKOFF_MS: parseInt(process.env.RMAP_BASE_BACKOFF_MS || '2000', 10),

  /**
   * Delay between sequential API requests in milliseconds
   * Used to avoid hitting rate limits when processing multiple files
   */
  REQUEST_DELAY_MS: parseInt(process.env.RMAP_REQUEST_DELAY_MS || '500', 10),

  /**
   * Maximum time to wait for a single API request in milliseconds
   * Default: 30000ms (30 seconds)
   * Anthropic recommends 30-60s timeouts for Claude API
   */
  REQUEST_TIMEOUT_MS: parseInt(process.env.RMAP_REQUEST_TIMEOUT_MS || '30000', 10),
} as const;
```

#### Implementation Steps
1. Add `REQUEST_TIMEOUT_MS` to `RETRY_CONFIG`
2. Update all API call sites to use this timeout
3. Add validation for timeout range
4. Test timeout behavior

#### Files to Update
- ✅ `src/config/models.ts`
- ✅ `src/levels/level1/detector.ts` (use timeout)
- ✅ `src/levels/level2/divider.ts` (use timeout)
- ✅ `src/levels/level3/annotator.ts` (use timeout)
- ✅ `tests/config/models.test.ts`

---

### P1.4: Add Export Completeness Tests

**Issue**: No automated tests to verify public API exports
**File**: `tests/core/` (NEW)
**Severity**: High (prevents regressions)

#### Proposed Implementation

```typescript
// tests/core/exports.test.ts (NEW FILE)

import * as Core from '../../src/core/index.js';
import * as Config from '../../src/config/models.js';

describe('Core module exports', () => {
  describe('Type exports', () => {
    it('should export all file annotation types', () => {
      // TypeScript will fail compilation if these don't exist
      const _file: Core.FileAnnotation = {} as any;
      const _raw: Core.RawFileMetadata = {} as any;
      expect(true).toBe(true); // Compilation is the test
    });

    it('should export all repository metadata types', () => {
      const _meta: Core.MetaJson = {} as any;
      const _module: Core.Module = {} as any;
      expect(true).toBe(true);
    });

    it('should export all graph types', () => {
      const _graph: Core.GraphJson = {} as any;
      const _node: Core.GraphNode = {} as any;
      expect(true).toBe(true);
    });

    it('should export all checkpoint types', () => {
      const _state: Core.CheckpointState = {} as any;
      const _checkpoint: Core.LevelCheckpoint = {} as any;
      const _status: Core.LevelStatus = 'pending';
      expect(_status).toBe('pending');
    });

    it('should export all pipeline output types', () => {
      const _level0: Core.Level0Output = {} as any;
      const _level1: Core.Level1Output = {} as any;
      expect(true).toBe(true);
    });

    it('should export all validation types', () => {
      const _validation: Core.ValidationJson = {} as any;
      const _issue: Core.ValidationIssue = {} as any;
      const _severity: Core.ValidationSeverity = 'error';
      expect(_severity).toBe('error');
    });

    it('should export work delegation types', () => {
      const _delegation: Core.TaskDelegation = {} as any;
      const _task: Core.DelegationTask = {} as any;
      expect(true).toBe(true);
    });
  });

  describe('Constant exports', () => {
    it('should export schema version', () => {
      expect(Core.SCHEMA_VERSION).toBe('1.0');
    });

    it('should export tag taxonomy and aliases', () => {
      expect(Array.isArray(Core.TAG_TAXONOMY)).toBe(true);
      expect(Core.TAG_TAXONOMY.length).toBeGreaterThan(0);
      expect(typeof Core.TAG_ALIASES).toBe('object');
    });

    it('should export pipeline configuration', () => {
      expect(typeof Core.MAX_TAGS_PER_FILE).toBe('number');
      expect(typeof Core.MAX_FILES_PER_TASK).toBe('number');
      expect(Core.UPDATE_THRESHOLDS).toHaveProperty('DELTA_ONLY');
      expect(Core.UPDATE_THRESHOLDS).toHaveProperty('FULL_REBUILD');
    });

    it('should export checkpoint configuration', () => {
      expect(Core.CHECKPOINT_DIR).toBe('.checkpoint');
      expect(Core.CHECKPOINT_VERSION).toBe('1.0');
      expect(Core.CHECKPOINT_FILES).toHaveProperty('STATE');
      expect(Core.CHECKPOINT_FILES).toHaveProperty('LEVEL0');
      expect(Core.CHECKPOINT_FILES).toHaveProperty('LEVEL1');
    });
  });

  describe('Model configuration exports', () => {
    it('should export model constants', () => {
      expect(Config.MODELS).toHaveProperty('HAIKU');
      expect(Config.MODELS).toHaveProperty('SONNET');
      expect(typeof Config.MODELS.HAIKU).toBe('string');
      expect(typeof Config.MODELS.SONNET).toBe('string');
    });

    it('should export retry configuration', () => {
      expect(typeof Config.RETRY_CONFIG.MAX_RETRIES).toBe('number');
      expect(typeof Config.RETRY_CONFIG.BASE_BACKOFF_MS).toBe('number');
      expect(typeof Config.RETRY_CONFIG.REQUEST_DELAY_MS).toBe('number');
      expect(typeof Config.RETRY_CONFIG.REQUEST_TIMEOUT_MS).toBe('number');
    });

    it('should export model selection maps', () => {
      expect(Config.ANNOTATION_MODEL_MAP).toHaveProperty('small');
      expect(Config.ANNOTATION_MODEL_MAP).toHaveProperty('medium');
      expect(Config.ANNOTATION_MODEL_MAP).toHaveProperty('large');
      expect(typeof Config.DETECTION_MODEL).toBe('string');
      expect(typeof Config.DIVISION_MODEL).toBe('string');
    });
  });
});

describe('Export completeness regression test', () => {
  // This test will fail if any exports are removed
  const requiredCoreExports = [
    // Types
    'FileAnnotation', 'Module', 'MetaJson', 'GraphNode', 'GraphJson',
    'TagsJson', 'StatsJson', 'ValidationSeverity', 'ValidationIssue',
    'ValidationJson', 'DelegationTask', 'TaskDelegation', 'RawFileMetadata',
    'Level0Output', 'Level1Output', 'CheckpointState', 'LevelCheckpoint',
    'LevelStatus',
    // Constants
    'SCHEMA_VERSION', 'TAG_TAXONOMY', 'TAG_ALIASES', 'UPDATE_THRESHOLDS',
    'MAX_TAGS_PER_FILE', 'MAX_FILES_PER_TASK', 'CHECKPOINT_DIR',
    'CHECKPOINT_VERSION', 'CHECKPOINT_FILES',
  ];

  it('should have all required core exports', () => {
    for (const exportName of requiredCoreExports) {
      // Check that import doesn't throw
      expect(() => {
        const value = (Core as any)[exportName];
        // For types, this will be undefined at runtime (that's OK)
        // For constants, this will have a value
      }).not.toThrow();
    }
  });
});
```

#### Implementation Steps
1. Create `tests/core/exports.test.ts`
2. Run tests to verify current state
3. Add to CI pipeline
4. Document as regression prevention

#### Files to Create
- ✅ `tests/core/exports.test.ts` (NEW)

---

## Priority 2: Medium Priority

**Timeline**: Next sprint (1-2 weeks)
**Estimated Effort**: 1 day
**Risk if delayed**: Technical debt, inconsistency

---

### P2.1: Standardize Tag Naming Conventions

**Issue**: Mix of lowercase and snake_case in tag names
**File**: `src/core/constants.ts:19-107`
**Severity**: Medium (user confusion)

#### Current Issues
```typescript
'authentication',  // lowercase (multi-word)
'oauth',           // lowercase
'api_endpoint',    // snake_case
'e2e_test',        // snake_case
```

#### Proposed Solution
Standardize all multi-word tags to snake_case:

```typescript
export const TAG_TAXONOMY = [
  // Auth & Identity
  'authentication',  // ✅ Keep (single concept)
  'authorization',   // ✅ Keep
  'jwt',             // ✅ Keep (acronym)
  'oauth',           // ✅ Keep (brand name)
  'session',         // ✅ Keep

  // Data
  'database',        // ✅ Keep
  'orm',             // ✅ Keep (acronym)
  'query',           // ✅ Keep
  'migration',       // ✅ Keep
  'sql',             // ✅ Keep (acronym)
  'nosql',           // ✅ Keep (brand name)
  'cache',           // ✅ Keep

  // API & Communication
  'api_endpoint',    // ✅ Already snake_case
  'graphql',         // ✅ Keep (brand name)
  'rest',            // ✅ Keep (acronym)
  'grpc',            // ✅ Keep (acronym)
  'websocket',       // ✅ Keep (single concept, though compound word)
  'webhook',         // ✅ Keep

  // Infrastructure
  'error_handling',  // ✅ Already snake_case
  // ... etc
] as const;
```

#### Migration Strategy
No migration needed - tags are internal identifiers, not user-facing IDs

#### Implementation Steps
1. Review all tags for naming consistency
2. Update validation to enforce snake_case for multi-word tags
3. Document naming conventions in comments
4. Update any affected tests

#### Files to Update
- ✅ `src/core/constants.ts`
- ✅ `src/core/validation.ts` (update regex)
- ✅ `docs/TAG_TAXONOMY.md` (NEW - document conventions)

---

### P2.2: Create config/index.ts

**Issue**: No public API for config module
**File**: `src/config/` (NEW)
**Severity**: Medium (import consistency)

#### Proposed Implementation

```typescript
// src/config/index.ts (NEW FILE)

/**
 * Configuration module exports
 *
 * Re-exports all configuration constants and types
 */

export {
  MODELS,
  ANNOTATION_MODEL_MAP,
  DIVISION_MODEL,
  DETECTION_MODEL,
  RETRY_CONFIG,
} from './models.js';

export type { AgentSize } from './models.js';
```

Update main index:
```typescript
// src/index.ts
export * from './core/index.js';
export * from './config/index.js';
export * from './query/index.js';
// ... etc
```

#### Implementation Steps
1. Create `src/config/index.ts`
2. Update `src/index.ts` to export from config
3. Update imports to use clean path
4. Add to export tests

#### Files to Create/Update
- ✅ `src/config/index.ts` (NEW)
- ✅ `src/index.ts`
- ✅ `tests/core/exports.test.ts`

---

### P2.3: Document Optional Field Lifecycle

**Issue**: Optional fields in interfaces lack lifecycle documentation
**File**: `src/core/types.ts:331-346`
**Severity**: Medium (documentation gap)

#### Current Code
```typescript
export interface LevelCheckpoint {
  status: LevelStatus;
  started_at?: string;
  completed_at?: string;
  output_file?: string;
  // ...
}
```

#### Proposed Fix
```typescript
export interface LevelCheckpoint {
  /** Current status of this level */
  status: LevelStatus;

  /**
   * ISO 8601 timestamp when level started
   * Present when status is 'in_progress', 'completed', or 'interrupted'
   * Absent when status is 'pending'
   */
  started_at?: string;

  /**
   * ISO 8601 timestamp when level completed
   * Present only when status is 'completed'
   * Absent for 'pending', 'in_progress', or 'interrupted'
   */
  completed_at?: string;

  /**
   * Path to saved output file (relative to checkpoint dir)
   * Present when level has produced output (status 'completed' or 'interrupted')
   * Absent for 'pending' or early 'in_progress'
   */
  output_file?: string;

  /**
   * Total number of tasks (Level 3 only)
   * Present only for Level 3 checkpoints
   * Absent for Levels 0, 1, 2, and 4
   */
  tasks_total?: number;

  /**
   * Number of completed tasks (Level 3 only)
   * Present only for Level 3 checkpoints
   * Tracks progress: tasks_completed / tasks_total
   */
  tasks_completed?: number;

  /**
   * IDs of completed tasks (Level 3 only)
   * Present only for Level 3 checkpoints
   * Used to resume and skip completed work
   */
  completed_task_ids?: string[];
}
```

#### Implementation Steps
1. Update JSDoc for all optional fields in types.ts
2. Document when fields are present vs absent
3. Add examples in comments
4. Create lifecycle diagram in docs

#### Files to Update
- ✅ `src/core/types.ts`
- ✅ `docs/TYPES.md` (NEW - comprehensive type documentation)

---

### P2.4: Extract Common Type Patterns

**Issue**: Some type patterns are repeated and could be extracted
**File**: `src/core/types.ts`
**Severity**: Medium (type reusability)

#### Patterns to Extract

```typescript
// src/core/types.ts

/**
 * ISO 8601 timestamp string
 * Format: YYYY-MM-DDTHH:mm:ss.sssZ
 */
export type ISOTimestamp = string;

/**
 * File path relative to repository root
 * Always uses forward slashes, never starts with /
 * Example: "src/auth/jwt.ts"
 */
export type RepoPath = string;

/**
 * Git commit hash (SHA-1)
 * 40 character hexadecimal string
 */
export type GitCommit = string;

/**
 * Tag index mapping tags to file paths
 */
export type TagIndex = Record<Tag, RepoPath[]>;

/**
 * Semantic version string
 * Format: "major.minor" or "major.minor.patch"
 */
export type SemanticVersion = string;
```

Then use these types:
```typescript
export interface MetaJson {
  schema_version: SemanticVersion;
  git_commit: GitCommit;
  created_at: ISOTimestamp;
  last_updated: ISOTimestamp;
  // ...
}

export interface TagsJson {
  taxonomy_version: SemanticVersion;
  aliases: Record<string, Tag[]>;
  index: TagIndex;  // ✅ Extracted type
}
```

#### Implementation Steps
1. Add type aliases to types.ts
2. Update all interfaces to use new types
3. Export new types from core/index.ts
4. Update documentation

#### Files to Update
- ✅ `src/core/types.ts`
- ✅ `src/core/index.ts`
- ✅ `docs/TYPES.md`

---

### P2.5: Add Configuration Validation Layer

**Issue**: No comprehensive validation for all configuration
**File**: `src/core/validation.ts`
**Severity**: Medium (edge case handling)

#### Proposed Implementation

Expand validation.ts:
```typescript
// src/core/validation.ts

import { RETRY_CONFIG } from '../config/models.js';
import { MAX_TAGS_PER_FILE, MAX_FILES_PER_TASK, UPDATE_THRESHOLDS } from './constants.js';

/**
 * Validates retry configuration values
 */
export function validateRetryConfig(): void {
  if (RETRY_CONFIG.MAX_RETRIES < 0 || RETRY_CONFIG.MAX_RETRIES > 20) {
    throw new ConfigValidationError(
      `MAX_RETRIES must be between 0 and 20 (got ${RETRY_CONFIG.MAX_RETRIES})`
    );
  }

  if (RETRY_CONFIG.BASE_BACKOFF_MS < 100 || RETRY_CONFIG.BASE_BACKOFF_MS > 60000) {
    throw new ConfigValidationError(
      `BASE_BACKOFF_MS must be between 100ms and 60000ms (got ${RETRY_CONFIG.BASE_BACKOFF_MS})`
    );
  }

  if (RETRY_CONFIG.REQUEST_DELAY_MS < 0 || RETRY_CONFIG.REQUEST_DELAY_MS > 10000) {
    throw new ConfigValidationError(
      `REQUEST_DELAY_MS must be between 0ms and 10000ms (got ${RETRY_CONFIG.REQUEST_DELAY_MS})`
    );
  }

  if (RETRY_CONFIG.REQUEST_TIMEOUT_MS < 1000 || RETRY_CONFIG.REQUEST_TIMEOUT_MS > 300000) {
    throw new ConfigValidationError(
      `REQUEST_TIMEOUT_MS must be between 1s and 300s (got ${RETRY_CONFIG.REQUEST_TIMEOUT_MS})`
    );
  }
}

/**
 * Validates all configuration at module load
 */
export function validateAllConfig(): void {
  validateTagTaxonomy();
  validateConfig();
  validateRetryConfig();
}

// Run all validations on module load
validateAllConfig();
```

#### Implementation Steps
1. Expand validation.ts with retry config validation
2. Add validation for all configurable values
3. Test edge cases
4. Document validation rules

#### Files to Update
- ✅ `src/core/validation.ts`
- ✅ `tests/core/validation.test.ts`

---

## Priority 3: Low Priority

**Timeline**: Future sprints (nice-to-have)
**Estimated Effort**: 0.5 day
**Risk if delayed**: Minimal

---

### P3.1: Add Branded Types

**Issue**: No type-level enforcement for validated strings
**Severity**: Low (type safety enhancement)

#### Proposed Implementation

```typescript
// src/core/types.ts

/**
 * Branded type helper
 */
type Brand<K, T> = K & { __brand: T };

/**
 * ISO 8601 timestamp that has been validated
 */
export type ValidatedISOTimestamp = Brand<string, 'ISOTimestamp'>;

/**
 * Repository-relative path that has been validated
 */
export type ValidatedRepoPath = Brand<string, 'RepoPath'>;

/**
 * Git commit hash that has been validated
 */
export type ValidatedGitCommit = Brand<string, 'GitCommit'>;

// Validator functions
export function validateISOTimestamp(s: string): ValidatedISOTimestamp {
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
  if (!iso8601Regex.test(s)) {
    throw new Error(`Invalid ISO 8601 timestamp: ${s}`);
  }
  return s as ValidatedISOTimestamp;
}

export function validateRepoPath(s: string): ValidatedRepoPath {
  if (s.startsWith('/') || s.includes('\\')) {
    throw new Error(`Invalid repo path: ${s}. Must be relative with forward slashes.`);
  }
  return s as ValidatedRepoPath;
}

export function validateGitCommit(s: string): ValidatedGitCommit {
  if (!/^[0-9a-f]{40}$/.test(s)) {
    throw new Error(`Invalid git commit hash: ${s}. Must be 40-char SHA-1.`);
  }
  return s as ValidatedGitCommit;
}
```

#### Files to Update
- ✅ `src/core/types.ts`
- ✅ `src/core/validation.ts`
- ✅ `tests/core/validation.test.ts`

---

### P3.2: Document Null vs Undefined Convention

**Issue**: Mix of null and undefined needs documented rationale
**Severity**: Low (documentation)

#### Proposed Documentation

Add to `src/core/types.ts` file header:
```typescript
/**
 * Core TypeScript interfaces for rmap
 *
 * Defines the structure of all JSON files in the .repo_map/ directory
 * and internal data structures used during map generation
 *
 * ## Null vs Undefined Convention
 *
 * This codebase uses both `null` and `undefined` intentionally:
 *
 * - **null**: Explicit absence of a value that COULD exist
 *   - Used in JSON-serialized types (null serializes, undefined doesn't)
 *   - Example: `parent_version: number | null` (null means "no parent")
 *
 * - **undefined (optional)**: Field may or may not be present
 *   - Used for TypeScript-only types (not serialized)
 *   - Example: `started_at?: string` (absent until level starts)
 *
 * When in doubt:
 * - For JSON types → use `| null`
 * - For internal types → use `?` (optional)
 */
```

---

### P3.3: Add Runtime Validation with Zod

**Issue**: No runtime type checking for external data
**Severity**: Low (robustness enhancement)

#### Proposed Implementation

```typescript
// src/core/schemas.ts (NEW FILE)

import { z } from 'zod';
import { TAG_TAXONOMY } from './constants.js';

/**
 * Zod schemas for runtime validation
 */

export const FileAnnotationSchema = z.object({
  path: z.string(),
  language: z.string(),
  size_bytes: z.number().int().nonnegative(),
  line_count: z.number().int().nonnegative(),
  purpose: z.string(),
  tags: z.array(z.enum(TAG_TAXONOMY as any)).min(1).max(5),
  exports: z.array(z.string()),
  imports: z.array(z.string()),
});

export const MetaJsonSchema = z.object({
  schema_version: z.string(),
  map_version: z.number().int().positive(),
  git_commit: z.string().regex(/^[0-9a-f]{40}$/),
  created_at: z.string().datetime(),
  last_updated: z.string().datetime(),
  parent_version: z.number().int().positive().nullable(),
  update_type: z.enum(['full', 'delta']),
  files_changed: z.number().int().nonnegative().nullable(),
  repo_name: z.string(),
  purpose: z.string(),
  stack: z.string(),
  languages: z.array(z.string()),
  entrypoints: z.array(z.string()),
  modules: z.array(z.object({
    path: z.string(),
    description: z.string(),
  })),
  config_files: z.array(z.string()),
  conventions: z.array(z.string()),
});

// ... more schemas

/**
 * Validate and parse FileAnnotation from unknown data
 */
export function parseFileAnnotation(data: unknown): FileAnnotation {
  return FileAnnotationSchema.parse(data);
}

// ... more parse functions
```

#### Implementation Steps
1. Add zod as dependency
2. Create schemas.ts with Zod schemas
3. Use in file reading/parsing code
4. Add tests

#### Files to Create
- ✅ `src/core/schemas.ts` (NEW)
- ✅ Update package.json with zod dependency
- ✅ Use in file I/O operations

---

## Implementation Order

### Week 1: Critical Fixes
1. **Day 1 Morning**: P0.1 - Fix UPDATE_THRESHOLDS (30 min)
2. **Day 1 Morning**: P0.2 - Add missing type exports (30 min)
3. **Day 1 Afternoon**: P0.3 - Add missing constant exports (30 min)
4. **Day 1 Afternoon**: P1.4 - Add export completeness tests (2 hours)

### Week 1: High Priority
5. **Day 2 Morning**: P1.3 - Add timeout configuration (1 hour)
6. **Day 2 Afternoon**: P1.1 - Add tag taxonomy validation (3 hours)
7. **Day 3**: P1.2 - Add environment variable overrides (4 hours)

### Week 2: Medium Priority
8. **Day 4 Morning**: P2.1 - Standardize tag naming (2 hours)
9. **Day 4 Afternoon**: P2.2 - Create config/index.ts (1 hour)
10. **Day 4 Afternoon**: P2.3 - Document optional field lifecycle (2 hours)
11. **Day 5 Morning**: P2.4 - Extract common type patterns (2 hours)
12. **Day 5 Afternoon**: P2.5 - Add configuration validation layer (2 hours)

### Future: Low Priority
13. **As needed**: P3.1 - Add branded types
14. **As needed**: P3.2 - Document null/undefined convention
15. **As needed**: P3.3 - Add Zod validation

---

## Testing Strategy

### Unit Tests
- ✅ Test all new validation functions
- ✅ Test environment variable parsing
- ✅ Test configuration edge cases
- ✅ Test export completeness

### Integration Tests
- ✅ Test full pipeline with new config
- ✅ Test checkpoint resume with new types
- ✅ Test error handling for invalid config

### Regression Tests
- ✅ Verify existing functionality unchanged
- ✅ Test backward compatibility
- ✅ Test with real repos

---

## Migration Guide

### For Library Users

#### Before (old imports)
```typescript
// These would fail or require direct imports
import { CheckpointState } from 'rmap/dist/core/types.js';
import { CHECKPOINT_DIR } from 'rmap/dist/core/constants.js';
```

#### After (public API)
```typescript
// Clean public API imports
import { CheckpointState, CHECKPOINT_DIR } from 'rmap';
```

### For Developers

#### Environment Variables (New)
```bash
# Optional: Customize configuration
export RMAP_MAX_FILES_PER_TASK=100
export RMAP_REQUEST_TIMEOUT_MS=60000
```

#### Validation (New)
```typescript
// Validation happens automatically on import
import { validateFileTags } from 'rmap';

// Use in Level 3
const tags = ['authentication', 'jwt'];
validateFileTags(tags); // Throws if invalid
```

### Breaking Changes
**None** - All changes are backward compatible additions

---

## Success Metrics

### Code Quality
- ✅ All 15 issues addressed
- ✅ Test coverage > 90% for core/config
- ✅ Zero linting errors
- ✅ All types exported publicly

### Developer Experience
- ✅ Clean import paths
- ✅ Comprehensive documentation
- ✅ Validation catches errors early
- ✅ Flexible configuration

### Maintainability
- ✅ No hardcoded magic numbers
- ✅ Environment variable overrides
- ✅ Clear conventions documented
- ✅ Automated regression tests

---

## Rollback Plan

If issues are discovered after deployment:

1. **Critical Issues**: Revert the specific commit
2. **Tests Failing**: Fix forward (don't revert)
3. **API Changes**: None expected (all additive)

Git tags for each priority:
- `core-config-p0-complete` - After P0 fixes
- `core-config-p1-complete` - After P1 fixes
- `core-config-p2-complete` - After P2 fixes

---

## Conclusion

This roadmap addresses all 15 issues identified in the audit, prioritized by impact and risk. The improvements will:

1. **Fix critical bugs** (threshold ambiguity)
2. **Complete the public API** (missing exports)
3. **Add runtime validation** (catch errors early)
4. **Improve flexibility** (environment variables)
5. **Enhance documentation** (clear conventions)
6. **Prevent regressions** (comprehensive tests)

**Total Estimated Effort**: 2-3 developer days
**Expected Outcome**: Core & Config grade improves from B+ (87) to A (95+)

---

**Ready to implement!** 🚀

Start with P0 issues for immediate impact, then proceed through P1-P3 as time allows.
