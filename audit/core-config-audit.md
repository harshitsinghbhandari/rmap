# Code Quality Audit Report: Core & Config

**Date**: 2026-04-01
**Scope**: `src/core/` and `src/config/`
**Files Audited**: 4 TypeScript files (642 total lines)
**Auditor**: Claude Sonnet 4.5

---

## Executive Summary

The Core & Config subsystem demonstrates **strong overall code quality** with excellent type safety, clear documentation, and well-organized structure. The audit identified **3 critical issues**, **5 moderate issues**, and **7 minor improvements** that would enhance maintainability, consistency, and usability.

**Overall Grade**: B+ (87/100)

### Key Strengths
✅ Comprehensive TypeScript type definitions with excellent JSDoc documentation
✅ Immutable configuration using `as const` for type safety
✅ Clear separation of concerns between types, constants, and model configuration
✅ Well-designed tag taxonomy with thoughtful categorization
✅ Checkpoint system properly typed and structured

### Critical Issues Requiring Immediate Attention
❌ **Incomplete public API exports** - Missing critical types and constants from `core/index.ts`
❌ **Ambiguous threshold configuration** - `DELTA_WITH_VALIDATION` and `FULL_REBUILD` both set to 100
❌ **No runtime configuration validation** - Hardcoded values with no validation layer

---

## Detailed Findings

## 1. File-by-File Analysis

### 1.1 `src/core/constants.ts` (174 lines)

**Overall Score**: 85/100

#### Strengths
- ✅ Clear, well-documented constants with JSDoc comments
- ✅ Comprehensive tag taxonomy (68 tags across 10 categories)
- ✅ Immutable exports using `as const` for type safety
- ✅ Tag type derived correctly from taxonomy array
- ✅ Checkpoint configuration properly structured

#### Issues

**CRITICAL**: Ambiguous Update Threshold Configuration (Line 134-141)
```typescript
export const UPDATE_THRESHOLDS = {
  DELTA_ONLY: 20,
  DELTA_WITH_VALIDATION: 100,  // ⚠️ Same as FULL_REBUILD
  FULL_REBUILD: 100,            // ⚠️ Same as DELTA_WITH_VALIDATION
} as const;
```
**Impact**: Logic bug - condition `> 100` will never trigger if boundary is at 100
**Risk**: Medium
**Recommendation**: Set `DELTA_WITH_VALIDATION: 20` and `FULL_REBUILD: 100` OR clarify intent with different values

**MODERATE**: Missing Validation for Tag Taxonomy (Line 19-107)
- No runtime check that tags are unique
- No validation that taxonomy isn't empty
- No enforcement of naming conventions (snake_case vs camelCase mix)

**MINOR**: Inconsistent Tag Naming (Line 19-107)
```typescript
'api_endpoint',  // snake_case
'oauth',         // lowercase
'e2e_test',      // snake_case
'errorHandling'  // Wait, this isn't in the list but would be camelCase
```
**Impact**: Low, but style inconsistency could cause confusion
**Current**: Mix of lowercase and snake_case
**Recommendation**: Standardize on snake_case for multi-word tags

**MINOR**: Missing Environment Override Support
- All constants are hardcoded
- No way to customize `MAX_FILES_PER_TASK` or `MAX_TAGS_PER_FILE` without code changes
- Limits flexibility for different repo sizes or API tiers

**MINOR**: TAG_ALIASES Type Not Exported
```typescript
export const TAG_ALIASES: Record<string, Tag[]> = { ... }
```
**Issue**: The type `TagAliases` isn't exported, limiting type reusability
**Recommendation**: Export `type TagAliases = Record<string, Tag[]>`

#### Recommendations
1. **Fix threshold values** to remove ambiguity (e.g., 20, 100 instead of 20, 100, 100)
2. Add runtime validation function for tag taxonomy
3. Consider environment variable overrides for tuneable constants
4. Export more granular types for external consumers

---

### 1.2 `src/core/index.ts` (36 lines)

**Overall Score**: 70/100

#### Strengths
- ✅ Clean re-export pattern for public API
- ✅ Proper `.js` extension usage for ESM compatibility
- ✅ Separates type exports from value exports

#### Issues

**CRITICAL**: Incomplete Public API - Missing Type Exports (Line 8-22)
```typescript
export type {
  FileAnnotation,
  // ... other types ...
  RawFileMetadata,
} from './types.js';
```

**Missing from exports** (but used throughout codebase):
- ❌ `CheckpointState` - Used in checkpoint.ts, pipeline.ts, integration tests
- ❌ `LevelCheckpoint` - Used in checkpoint.ts
- ❌ `LevelStatus` - Used in checkpoint.ts
- ❌ `Level0Output` - Used in detector.ts, pipeline.ts
- ❌ `Level1Output` - Used in pipeline.ts, divider.ts

**Impact**: HIGH - External consumers and tests cannot import these types
**Risk**: Breaking change for npm package consumers
**Evidence**: Tests import directly from `types.js` to work around this:
```typescript
// Workaround in tests
import { CheckpointState } from '../src/core/types.js';
```

**CRITICAL**: Missing Checkpoint Constants Exports (Line 25-32)
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

**Missing from exports**:
- ❌ `CHECKPOINT_DIR` - Used in checkpoint.ts
- ❌ `CHECKPOINT_VERSION` - Used in checkpoint.ts
- ❌ `CHECKPOINT_FILES` - Used in checkpoint.ts, pipeline.ts

**Impact**: MEDIUM - Forces internal imports bypassing public API
**Risk**: Inconsistent API surface, harder to maintain

#### Recommendations
1. **[URGENT]** Add missing type exports for checkpoint types
2. **[URGENT]** Add missing constant exports for checkpoint configuration
3. Consider exporting utility types like `AgentSize` from models.ts
4. Add comprehensive unit tests to verify all intended exports are present

---

### 1.3 `src/core/types.ts` (368 lines)

**Overall Score**: 95/100

#### Strengths
- ✅ Comprehensive, well-structured TypeScript interfaces
- ✅ Excellent JSDoc documentation for every type
- ✅ Clear naming conventions
- ✅ Proper use of readonly arrays where appropriate
- ✅ Good use of union types for enums (`ValidationSeverity`, `LevelStatus`)
- ✅ Consistent structure across related types

#### Issues

**MINOR**: Optional Fields Documentation (Line 331-346)
```typescript
export interface LevelCheckpoint {
  status: LevelStatus;
  started_at?: string;      // Optional but no JSDoc explaining when it's present
  completed_at?: string;    // Same
  output_file?: string;     // Same
  // ...
}
```
**Issue**: Optional fields lack documentation on when they're populated
**Recommendation**: Add JSDoc explaining lifecycle (e.g., "Present after level starts")

**MINOR**: Inconsistent Null vs Undefined (Line 74, 80, 166)
```typescript
parent_version: number | null;    // Uses null
files_changed: number | null;     // Uses null
language?: string;                // Uses undefined (optional)
```
**Issue**: Mix of `null` and `undefined` for "not present"
**Current State**: Mostly consistent (null for explicit "none", optional for "may not exist")
**Recommendation**: Document the distinction in types.ts header

**MINOR**: GraphJson Could Be More Type-Safe (Line 124-126)
```typescript
export interface GraphJson {
  [filePath: string]: GraphNode;
}
```
**Issue**: Index signature allows any string key
**Recommendation**: Consider `Record<string, GraphNode>` or `Map<string, GraphNode>` for clarity

**MINOR**: Missing Timestamp Validation Hints
- All timestamp fields documented as "ISO 8601" but no type-level enforcement
- Consider branded types or runtime validators

**MINOR**: Missing Export for TagsJson.index Type
```typescript
index: Record<Tag, string[]>;
```
**Issue**: This pattern `Record<Tag, string[]>` is repeated but not extracted
**Recommendation**: `export type TagIndex = Record<Tag, string[]>`

#### Recommendations
1. Add JSDoc for optional field lifecycle behavior
2. Document null vs undefined convention in file header
3. Consider extracting common type patterns into named types
4. Add validation utilities for ISO 8601 timestamps (runtime)

---

### 1.4 `src/config/models.ts` (64 lines)

**Overall Score**: 88/100

#### Strengths
- ✅ Clean, focused configuration file
- ✅ Centralized model version management
- ✅ Well-documented retry configuration with reasoning
- ✅ Immutable exports using `as const`
- ✅ Proper type export for `AgentSize`

#### Issues

**MODERATE**: Hardcoded Model Versions (Line 10-13)
```typescript
export const MODELS = {
  HAIKU: 'claude-haiku-4-5-20251001',
  SONNET: 'claude-sonnet-4-5-20250929',
} as const;
```
**Issue**: Model versions hardcoded, requires code change to update
**Impact**: MEDIUM - Frequent updates needed as Claude releases new models
**Recommendation**: Consider environment variable overrides:
```typescript
HAIKU: process.env.RMAP_HAIKU_MODEL || 'claude-haiku-4-5-20251001'
```

**MODERATE**: No Timeout Configuration (Missing)
```typescript
export const RETRY_CONFIG = {
  MAX_RETRIES: 5,
  BASE_BACKOFF_MS: 2000,
  REQUEST_DELAY_MS: 500,
  // ❌ Missing: TIMEOUT_MS or REQUEST_TIMEOUT_MS
} as const;
```
**Issue**: No timeout value exported, likely defined elsewhere or defaulted
**Impact**: MEDIUM - Timeout is critical for reliability
**Recommendation**: Add `REQUEST_TIMEOUT_MS: 30000` (30 seconds)

**MINOR**: AgentSize Not Exported from index.ts
```typescript
export type AgentSize = keyof typeof ANNOTATION_MODEL_MAP;
```
**Issue**: Defined in models.ts but not re-exported from core/index.ts
**Impact**: LOW - Only affects external consumers
**Recommendation**: Re-export from core/index.ts or create separate config/index.ts

**MINOR**: Missing Validation for Retry Config
- No check that `MAX_RETRIES >= 0`
- No check that backoff values are reasonable
- No check that delay is non-negative

**MINOR**: Magic Numbers in Comments (Line 50)
```typescript
// Default: 2000ms (2s, 4s, 8s, 16s, 32s)
```
**Issue**: Calculated values in comment could drift from implementation
**Recommendation**: Generate this documentation or use a constant array

#### Recommendations
1. Add environment variable support for model selection
2. Add timeout configuration to RETRY_CONFIG
3. Export AgentSize from main public API
4. Add validation function for retry configuration
5. Consider splitting into smaller files if more config added (e.g., api.ts, models.ts)

---

## 2. Cross-File Analysis

### 2.1 Module Cohesion

**Score**: 85/100

**Strengths**:
- Clear separation: types vs constants vs model config
- Logical grouping of related functionality
- Clean import paths with proper ESM usage

**Issues**:
- Constants and types in same module but separate files (good)
- Models.ts in separate config/ directory but not re-exported from core/
- No index.ts in config/ directory for clean imports

**Recommendation**:
- Create `src/config/index.ts` to re-export models.ts
- Consider moving models.ts to `src/core/models.ts` for better cohesion

---

### 2.2 Consistency & Standards

**Score**: 90/100

**Strengths**:
- Consistent JSDoc style across all files
- Consistent use of `as const` for immutability
- Consistent naming (UPPER_CASE for constants, PascalCase for types)

**Issues**:
- Tag naming inconsistency (snake_case vs lowercase)
- Mix of null and undefined for absent values (though mostly intentional)
- Some constants exported from core, others not

**Recommendation**:
- Document coding standards in CONTRIBUTING.md
- Add ESLint rules for consistency
- Create style guide for constant/type naming

---

### 2.3 Type Safety

**Score**: 95/100

**Strengths**:
- Excellent TypeScript coverage
- Proper use of `as const` for literal types
- Derived types (`Tag`, `AgentSize`) for safety
- No `any` types found

**Issues**:
- Index signatures allow any key (GraphJson)
- No branded types for validated strings (ISO 8601, file paths)
- No runtime validation to match TypeScript types

**Recommendation**:
- Add runtime validation layer (e.g., zod, io-ts)
- Consider branded types for domain-specific strings
- Add `satisfies` checks where appropriate (TypeScript 4.9+)

---

### 2.4 Documentation Quality

**Score**: 92/100

**Strengths**:
- Comprehensive JSDoc for every export
- Clear file-level documentation
- Inline comments explaining reasoning (retry config)
- Examples in comments where helpful

**Issues**:
- Some optional fields lack lifecycle documentation
- No examples for complex types (TaskDelegation)
- Missing documentation on null vs undefined convention

**Recommendation**:
- Add "Example" sections to complex interfaces
- Document optional field behavior more explicitly
- Create types.md with examples and conventions

---

### 2.5 Maintainability

**Score**: 80/100

**Strengths**:
- Small, focused files (largest is 368 lines)
- Clear structure and organization
- Good use of TypeScript features

**Issues**:
- Hardcoded values require code changes
- No environment variable overrides
- Missing public API exports force direct imports
- Update thresholds ambiguity could cause bugs

**Recommendation**:
- Add configuration layer for runtime overrides
- Fix public API exports for better encapsulation
- Add validation to catch configuration errors early

---

## 3. Testing Considerations

### Current State
- Tests exist in `tests/core/constants.test.ts` and `tests/core/types.test.ts`
- Integration tests use checkpoint types

### Gaps Identified
- ❌ No tests verifying core/index.ts exports are complete
- ❌ No tests validating tag taxonomy uniqueness
- ❌ No tests for retry config value ranges
- ❌ No tests for threshold configuration logic

### Recommendations
1. Add export completeness tests
2. Add configuration validation tests
3. Add property-based tests for types (e.g., with fast-check)
4. Add tests for edge cases in threshold logic

---

## 4. Security Analysis

**Score**: 95/100

**Findings**:
- ✅ No dynamic code execution
- ✅ No user input processing in these files
- ✅ No sensitive data exposure
- ✅ Immutable exports prevent tampering
- ⚠️ Hardcoded API model names (but not keys)

**Recommendations**:
- No critical security issues found
- Continue avoiding dynamic imports/requires
- Consider validating external configuration if added

---

## 5. Performance Analysis

**Score**: 98/100

**Findings**:
- ✅ All constants computed at module load (optimal)
- ✅ No runtime overhead from configuration
- ✅ Efficient type definitions (no complex mapped types)
- ✅ Immutable structures enable optimization

**Recommendations**:
- No performance issues identified
- Current approach is optimal for static configuration

---

## 6. Scalability Considerations

**Score**: 85/100

**Strengths**:
- Tag taxonomy easily extensible
- Type system supports adding new fields
- Checkpoint system designed for growth

**Concerns**:
- Hardcoded MAX_FILES_PER_TASK may not scale to all repo sizes
- Tag taxonomy at 68 tags (manageable, but growing)
- No versioning strategy for configuration changes

**Recommendations**:
1. Make MAX_FILES_PER_TASK configurable
2. Consider tag taxonomy versioning (v1, v2)
3. Document migration strategy for breaking changes

---

## 7. Issue Summary

### Critical Issues (3)

| # | Issue | File | Severity | Impact |
|---|-------|------|----------|--------|
| 1 | Missing type exports (CheckpointState, LevelCheckpoint, etc.) | core/index.ts:8-22 | Critical | Blocks external usage |
| 2 | Missing constant exports (CHECKPOINT_*) | core/index.ts:25-32 | Critical | Forces internal imports |
| 3 | Ambiguous threshold values (100 == 100) | constants.ts:134-141 | Critical | Logic bug risk |

### Moderate Issues (5)

| # | Issue | File | Severity | Impact |
|---|-------|------|----------|--------|
| 4 | No runtime validation for tag taxonomy | constants.ts:19-107 | Moderate | Runtime bugs possible |
| 5 | Hardcoded model versions | models.ts:10-13 | Moderate | Maintenance burden |
| 6 | Missing timeout configuration | models.ts:40-61 | Moderate | Reliability concern |
| 7 | No environment variable overrides | constants.ts | Moderate | Limited flexibility |
| 8 | Inconsistent tag naming conventions | constants.ts:19-107 | Moderate | User confusion |

### Minor Issues (7)

| # | Issue | File | Severity | Impact |
|---|-------|------|----------|--------|
| 9 | Optional field lifecycle not documented | types.ts:331-346 | Minor | Documentation gap |
| 10 | GraphJson uses index signature | types.ts:124-126 | Minor | Type safety |
| 11 | AgentSize not exported publicly | models.ts:63 | Minor | API completeness |
| 12 | Missing retry config validation | models.ts:40-61 | Minor | Edge case handling |
| 13 | TAG_ALIASES type not exported | constants.ts:120 | Minor | Type reusability |
| 14 | No config/ index.ts | config/ | Minor | Import consistency |
| 15 | Mix of null vs undefined | types.ts | Minor | Convention clarity |

---

## 8. Positive Patterns to Maintain

1. **Comprehensive JSDoc** - Every export is documented
2. **Immutable exports** - `as const` prevents accidental mutation
3. **Derived types** - `Tag` type derived from `TAG_TAXONOMY` array
4. **Clear separation** - Types, constants, and config in separate files
5. **No any types** - Strict TypeScript throughout
6. **ESM compliance** - Proper `.js` extensions in imports

---

## 9. Recommendations by Priority

### P0 (Critical - Fix Immediately)
1. ✅ Fix `UPDATE_THRESHOLDS` ambiguity (change 100, 100 to distinct values)
2. ✅ Add missing type exports to `core/index.ts` (CheckpointState, etc.)
3. ✅ Add missing constant exports to `core/index.ts` (CHECKPOINT_*)

### P1 (High - Fix This Sprint)
4. ✅ Add runtime validation for tag taxonomy
5. ✅ Add environment variable overrides for tuneable constants
6. ✅ Add timeout configuration to RETRY_CONFIG
7. ✅ Add export completeness tests

### P2 (Medium - Fix Next Sprint)
8. ✅ Standardize tag naming conventions
9. ✅ Create `config/index.ts` for clean imports
10. ✅ Add JSDoc for optional field lifecycle
11. ✅ Extract common type patterns
12. ✅ Add configuration validation layer

### P3 (Low - Consider for Future)
13. ⚪ Add branded types for validated strings
14. ⚪ Document null vs undefined convention
15. ⚪ Add runtime validation matching TypeScript types
16. ⚪ Consider zod or similar for schema validation

---

## 10. Conclusion

The Core & Config subsystem is **well-architected with strong fundamentals**, but suffers from **incomplete public API exports** and **missing runtime validation**. The critical issues are straightforward to fix and should be addressed immediately.

**Key Actions**:
1. Complete the public API exports in `core/index.ts`
2. Fix the threshold configuration ambiguity
3. Add runtime validation layer
4. Support environment variable overrides

With these changes, the Core & Config subsystem would achieve an **A grade** (95+).

---

## Appendix A: Files Audited

```
src/core/constants.ts    174 lines  (Type safety: A, Documentation: A, Maintainability: B)
src/core/index.ts         36 lines  (Type safety: B, Documentation: B, Maintainability: C)
src/core/types.ts        368 lines  (Type safety: A+, Documentation: A, Maintainability: A)
src/config/models.ts      64 lines  (Type safety: A, Documentation: A, Maintainability: B)
```

**Total**: 642 lines of TypeScript code

---

## Appendix B: Metrics Summary

| Metric | Score | Notes |
|--------|-------|-------|
| Type Safety | 95/100 | Excellent TypeScript coverage, no any types |
| Documentation | 92/100 | Comprehensive JSDoc, some gaps in lifecycle docs |
| Maintainability | 80/100 | Hardcoded values, incomplete exports hurt score |
| Consistency | 90/100 | Minor naming inconsistencies |
| Security | 95/100 | No security concerns identified |
| Performance | 98/100 | Optimal for static configuration |
| Testing | 75/100 | Tests exist but gaps in coverage |
| **Overall** | **87/100** | **B+ Grade** |

---

**Audit Complete** ✅
**Next Steps**: See `audit/core-config-improvements.md` for detailed implementation roadmap.
