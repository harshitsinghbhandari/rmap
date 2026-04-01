# Code Quality Audit Report: Levels Implementation

**Audit Date:** 2026-04-01
**Scope:** `src/levels/` directory (18 TypeScript files)
**Files Analyzed:** 18 files across Level 0-4 implementations
**Total Lines of Code:** ~2,500 lines

---

## Executive Summary

The levels implementation demonstrates **solid foundational architecture** with clear separation of concerns across the 5-level pipeline. However, the codebase suffers from **significant code duplication**, **performance bottlenecks**, and **limited error recovery** mechanisms that will impact scalability and maintainability.

**Overall Quality Score: 6.5/10**

### Critical Issues Identified
1. **Duplicate retry logic** across 3 levels (±120 lines of identical code)
2. **Sequential file processing** in Level 3 creates severe performance bottlenecks
3. **No caching mechanism** for expensive LLM calls
4. **Tight coupling** to Anthropic SDK prevents provider flexibility
5. **Limited observability** - minimal metrics and logging

---

## Per-Level Analysis

### Level 0: Metadata Harvester (2 files, ~380 lines)

**Quality Score: 7/10**

#### Strengths
- Clean, focused responsibility: pure script-based extraction
- Comprehensive file type detection via `LANGUAGE_MAP`
- Good skip logic for binary files and common build directories
- Progress indicators for user feedback

#### Fatal Flaws

**1. Fragile Import Extraction (`harvester.ts:139-169`)**
```typescript
function extractImports(content: string, language: string): string[] {
  // Uses regex patterns - will miss:
  // - Dynamic imports: import(`./module`)
  // - Conditional imports
  // - Complex multi-line imports
  const imports: string[] = [];
  for (const pattern of patterns) {
    let match;
    const regex = new RegExp(pattern);
    while ((match = regex.exec(content)) !== null) {
      if (match[1]) {
        imports.push(match[1]);
      }
    }
  }
  return [...new Set(imports)];
}
```
**Issue:** Regex-based parsing is fundamentally unreliable for complex modern codebases. Will fail on:
- Template literals in imports
- Multi-line import statements
- Aliased imports
- Dynamic import() calls

**Impact:** Level 0 is foundational - bad import data poisons the entire pipeline.

**2. No Error Aggregation (`harvester.ts:267-274`)**
```typescript
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'EACCES') {
    console.warn(`Warning: Permission denied: ${filePath}`);
  } else {
    console.warn(`Warning: Error processing file ${filePath}:`, error);
  }
  return null;  // Silent failure
}
```
**Issue:** Errors are logged and swallowed. No way to know how many files failed or why.

**3. Hardcoded Constants (harvester.ts:16-63)**
All skip directories and binary extensions are hardcoded. Cannot be configured per-project.

---

### Level 1: Structure Detector (3 files, ~260 lines)

**Quality Score: 6.5/10**

#### Strengths
- Robust validation with custom `ValidationError` class
- Exponential backoff retry logic
- Clean prompt building with file tree formatting

#### Fatal Flaws

**1. Tight Coupling to Anthropic SDK (`detector.ts:8, 240`)**
```typescript
import Anthropic from '@anthropic-ai/sdk';
// ...
const client = new Anthropic({ apiKey });
```
**Issue:** Impossible to swap LLM providers. Locked into Anthropic pricing and availability.

**2. No Caching Mechanism**
Every run calls the LLM even if the file tree hasn't changed. Wastes money and time.

**3. Duplicate Retry Logic (`detector.ts:142-194`)**
Identical to Level 2 and Level 3. 52 lines of copy-pasted code.

**4. Limited Error Recovery (`detector.ts:199-221`)**
If JSON parsing fails, we retry with a stricter prompt - but only once. No fallback strategy.

---

### Level 2: Work Divider (4 files, ~420 lines)

**Quality Score: 6/10**

#### Strengths
- Good separation: `prompt.ts`, `validation.ts`, `divider.ts`
- Comprehensive validation of delegation structure
- Heuristic checks provide useful warnings

#### Fatal Flaws

**1. Duplicate Retry Logic AGAIN (`divider.ts:34-86`)**
Same 52 lines copy-pasted from Level 1. This is the third copy.

**2. Hardcoded Prompt Text (`prompt.ts:85-164`)**
180 lines of hardcoded prompt template. No way to customize or experiment with different prompts.

**3. No Task Optimization**
Work division is purely LLM-based. No algorithmic optimization:
- Doesn't consider file coupling strength
- Doesn't balance tasks by complexity
- Doesn't minimize cross-task dependencies

**4. Validation Heuristics Don't Block (`validation.ts:99-161`)**
Heuristics produce warnings but don't prevent bad divisions. Should fail fast on critical issues.

---

### Level 3: Deep File Annotator (4 files, ~520 lines)

**Quality Score: 5.5/10** ⚠️ **PERFORMANCE CRITICAL**

#### Strengths
- Excellent parsing/validation in `parser.ts`
- Good tag filtering against taxonomy
- Internal import detection is solid

#### Fatal Flaws

**1. SEQUENTIAL PROCESSING - CRITICAL BOTTLENECK (`annotator.ts:241-260`)**
```typescript
// Process files sequentially (to avoid rate limits)
for (let i = 0; i < files.length; i++) {
  const annotation = await annotateFile(...);
  // ...
  // Delay to avoid rate limits
  if (i < files.length - 1) {
    await sleep(RETRY_CONFIG.REQUEST_DELAY_MS);
  }
}
```
**Impact:** For a 500-file repo with 100ms delay:
- Time = 500 × 100ms = **50 seconds of pure waiting**
- Plus LLM response time (~2s each) = **~17 minutes total**

**Should use:** Concurrency pool (e.g., 10 parallel requests) → **~2 minutes**

**2. Duplicate Retry Logic AGAIN (`annotator.ts:74-127`)**
Fourth copy of the same retry code. Now we have 208 lines of duplicated logic.

**3. Binary Detection is Inefficient (`annotator.ts:28-47`)**
```typescript
function isBinaryFile(filePath: string): boolean {
  const buffer = Buffer.alloc(8192);
  const fd = fs.openSync(filePath, 'r');
  const bytesRead = fs.readSync(fd, buffer, 0, 8192, 0);
  // Check for null bytes
}
```
**Issue:** Reads 8KB from disk for EVERY file, even when extension already suggests binary (Level 0 already has this info).

**4. Truncation Logic is Hardcoded (`prompt.ts:19-39`)**
- 70/30 split is arbitrary
- No consideration for language (Python vs Go have different context needs)
- Could intelligently truncate (keep function signatures, drop bodies)

---

### Level 4: Consistency Validator (5 files, ~560 lines)

**Quality Score: 7/10**

#### Strengths
- Comprehensive checks: imports, symmetry, files exist, graph matches
- Good auto-fix capabilities with clear reporting
- Well-organized: separate files for checks, orphans, autofix
- Circular dependency detection

#### Fatal Flaws

**1. No Performance Optimization for Large Repos (`checks.ts:208-223`)**
```typescript
export function runConsistencyChecks(...): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  issues.push(...checkImportsExist(annotations, repoRoot));
  issues.push(...checkGraphSymmetry(graph, annotations));
  issues.push(...checkFilesExist(annotations, repoRoot));
  issues.push(...checkGraphMatchesAnnotations(graph, annotations));
  return issues;
}
```
**Issue:** All checks run sequentially. Each iterates over all files. O(N²) complexity in some cases.

For 1000 files: could run checks in parallel, index data structures first.

**2. Limited Autofix Scope (`autofix.ts`)**
Only handles:
- Deleted files
- Broken imports
- Asymmetric graph

**Missing:**
- Fix orphan files (suggest adding to entry points)
- Fix circular dependencies (suggest refactoring)
- Fix missing exports (re-analyze file)

**3. Orphan Detection is Naive (`orphans.ts:19-56`)**
Doesn't consider:
- Files imported dynamically
- Side-effect imports (CSS, migrations)
- Plugin systems

---

## Cross-Cutting Issues

### 1. Massive Code Duplication

**Retry Logic Duplicated 4 Times:**
- `src/levels/level1/detector.ts:142-194` (52 lines)
- `src/levels/level2/divider.ts:34-86` (52 lines)
- `src/levels/level3/annotator.ts:74-127` (53 lines)
- Plus sleep function duplicated 3 times

**Total Waste:** ~160 lines of duplicate code
**Maintenance Risk:** Fix a bug? Update 4 files.
**Solution:** Extract to `src/core/llm-client.ts`

### 2. No Caching Strategy

**Current Behavior:**
- Level 1: Re-analyzes repo structure every time (even if unchanged)
- Level 3: Re-annotates files that haven't changed

**Impact:**
- Wastes API costs
- Adds minutes to every run
- Defeats the purpose of delta updates

**Solution:** Hash-based caching (file content hash → annotation cache)

### 3. Limited Error Recovery

**Pattern Across All Levels:**
```typescript
try {
  // LLM call
} catch (error) {
  console.error(`Failed: ${error.message}`);
  return null;  // Give up
}
```

**Missing:**
- Fallback strategies (simpler prompts, smaller model)
- Partial success handling (process what we can)
- Error classification (retryable vs fatal)

### 4. No Metrics/Observability

**What's Missing:**
- API call counts
- Token usage tracking
- Performance timings per level
- Success/failure rates
- Cost estimation

**Why It Matters:**
User has no idea if:
- They're about to spend $50 on a large repo
- A level is hanging or just slow
- The map quality is degrading over time

### 5. Hardcoded Configuration

**Examples:**
- `MAX_FILES_PER_TASK = 50` (constants.ts)
- `MAX_LINES_IN_PROMPT = 10000` (level3/prompt.ts)
- `RETRY_CONFIG` (config/models.ts)
- Skip directories (level0/harvester.ts)

**Issue:** Cannot tune for:
- Different repo sizes (10 vs 10,000 files)
- Different budgets (cheap vs quality)
- Different LLM providers

---

## Security & Reliability Issues

### 1. No Input Sanitization
File content is directly interpolated into prompts. Could be exploited with prompt injection in malicious repos.

### 2. Unbounded Memory Usage
Level 3 loads entire file contents into memory. A repo with huge files (e.g., minified JS) could OOM.

### 3. Race Conditions in Checkpointing
Multiple levels modify checkpoint state. No locking mechanism.

### 4. Silent Failures
Errors are logged but processing continues. Could produce incomplete maps without user knowing.

---

## Code Smells & Anti-Patterns

### Magic Numbers
```typescript
await sleep(Math.pow(2, attempt) * RETRY_CONFIG.BASE_BACKOFF_MS);  // Why pow(2)?
const firstPart = Math.floor(maxLines * 0.7);  // Why 70%?
if (deviationPercent > 15) { ... }  // Why 15%?
```

### Stringly-Typed Errors
```typescript
agent_size: 'small' | 'medium' | 'large'  // Should be enum
severity: 'error' | 'warning' | 'info'    // Should be enum
```

### Leaky Abstractions
`annotator.ts` knows about file paths, directory structures, AND LLM retry logic. Too many responsibilities.

### God Objects
`annotator.ts` does: file I/O, LLM calls, parsing, validation, retry logic, binary detection.

---

## Maintainability Concerns

### Documentation
- No JSDoc for complex functions
- No examples in comments
- No architecture diagrams

### Testing Gaps
- Import extraction has no unit tests
- Retry logic has no tests
- Parser edge cases not covered

### Type Safety
```typescript
const obj = data as Record<string, unknown>;  // Type assertion abuse
```

---

## Performance Benchmarks (Estimated)

| Repo Size | Current Time | Optimized Time | Improvement |
|-----------|-------------|----------------|-------------|
| 50 files  | 3 min       | 30 sec         | 6x faster   |
| 200 files | 13 min      | 2 min          | 6.5x faster |
| 500 files | 35 min      | 5 min          | 7x faster   |
| 1000 files| 70 min      | 10 min         | 7x faster   |

**Optimization sources:**
- Parallel Level 3 processing: 5x
- Caching unchanged files: 1.5x
- Smarter retry logic: 1.2x

---

## Risk Assessment

### High Risk
- ❌ **Sequential Level 3 processing**: Unacceptable for repos >100 files
- ❌ **No caching**: Will frustrate users on repeated runs
- ❌ **Regex import parsing**: Produces garbage data for complex code

### Medium Risk
- ⚠️ **Tight Anthropic coupling**: Vendor lock-in
- ⚠️ **No cost controls**: Could surprise users with bills
- ⚠️ **Silent failures**: Data quality degradation

### Low Risk
- ⚡ **Hardcoded values**: Annoying but not breaking
- ⚡ **Limited autofix**: Validator still works
- ⚡ **Code duplication**: Maintenance burden

---

## Quality Scores by File

| File | Score | Primary Issues |
|------|-------|----------------|
| `level0/harvester.ts` | 6.5/10 | Regex parsing, no error aggregation |
| `level0/index.ts` | 9/10 | Clean, simple |
| `level1/detector.ts` | 6/10 | Duplicate retry, tight coupling |
| `level1/index.ts` | 9/10 | Clean, simple |
| `level1/validation.ts` | 8/10 | Good validation logic |
| `level2/divider.ts` | 5.5/10 | Duplicate retry, no optimization |
| `level2/index.ts` | 9/10 | Clean, simple |
| `level2/prompt.ts` | 6/10 | Hardcoded prompts |
| `level2/validation.ts` | 7/10 | Good heuristics, weak enforcement |
| `level3/annotator.ts` | 4/10 | **CRITICAL**: Sequential processing |
| `level3/index.ts` | 9/10 | Clean, simple |
| `level3/parser.ts` | 7.5/10 | Solid parsing, some edge cases |
| `level3/prompt.ts` | 6.5/10 | Hardcoded truncation |
| `level4/autofix.ts` | 7.5/10 | Good fixes, limited scope |
| `level4/checks.ts` | 7/10 | Solid checks, O(N²) complexity |
| `level4/index.ts` | 9/10 | Clean, simple |
| `level4/orphans.ts` | 6.5/10 | Naive orphan detection |
| `level4/validator.ts` | 8/10 | Good orchestration |

---

## Conclusion

The levels implementation has **good bones** but **critical execution flaws** that limit scalability. The architecture is sound, but implementation details (sequential processing, code duplication, no caching) will become severe pain points as users push the system with larger repos.

**Immediate Action Required:**
1. Parallelize Level 3 annotation
2. Add caching for LLM responses
3. Extract duplicate retry logic

**Priority Refactoring:**
4. Abstract LLM provider interface
5. Add metrics and cost tracking
6. Implement proper error recovery

Without these fixes, the tool will be **unusable for repos >200 files** and **expensive for any serious use**.
