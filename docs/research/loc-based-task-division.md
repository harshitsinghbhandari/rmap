# Research: LOC-Based Task Division for Level 2

**Author:** AI Research Agent
**Date:** 2025-04-05
**Status:** Research Complete

## Executive Summary

This document analyzes how Level 2 task division currently works and proposes improvements using Lines of Code (LOC) as the primary balancing metric instead of file count. The key finding is that **Level 0 already collects `line_count` for every file**, making LOC-based division straightforward to implement.

---

## 1. Current Task Division Approach

### 1.1 How Level 2 Works Today

The task division flow is:

```
Level 0 (Metadata) → Level 1 (Structure) → Level 2 (Division) → Level 3 (Annotation)
```

**Key Files:**
- `src/levels/level2/divider.ts` - Main division logic
- `src/levels/level2/prompt.ts` - Builds LLM prompt with directory groups
- `src/levels/level2/validation.ts` - Validates division rules

### 1.2 Current Grouping Logic

In `prompt.ts`, the `buildDirectoryGroups()` function groups files by directory:

```typescript
interface DirectoryGroup {
  path: string;
  files: Array<{ name: string; size: number; language?: string }>;
  totalFiles: number;
  totalSizeKb: number;  // Uses bytes, not LOC!
}
```

**What gets passed to the LLM prompt:**
- Directory path with file count and KB size
- First N files as examples (configurable via `OUTPUT.MAX_FILES_IN_PROMPT`)
- Total files and total size in MB

**What the LLM is asked to produce:**
```json
{
  "tasks": [
    { "scope": "src/auth/", "agent_size": "medium", "estimated_files": 12 }
  ],
  "execution": "parallel",
  "estimated_total_minutes": 15
}
```

### 1.3 Current Validation Rules

From `defaults.ts` and `validation.ts`:

| Rule | Value | Purpose |
|------|-------|---------|
| `MAX_FILES_PER_TASK` | 50 | Hard limit per task |
| `MAX_DEVIATION_PERCENT` | 15% | Estimated vs actual files |
| `TASK_IMBALANCE_HIGH_MULTIPLIER` | 1.5x | Flag large tasks |
| `TASK_IMBALANCE_LOW_MULTIPLIER` | 0.5x | Flag small tasks |

### 1.4 Limitations of File-Count Division

**Problem: Unbalanced Workloads**

Consider this scenario:
```
Task 1: src/config/     (10 files)
  - .env.example          (5 LOC)
  - tsconfig.json         (20 LOC)
  - ... 8 more small files
  Total: 10 files, ~150 LOC

Task 2: src/core/       (3 files)
  - llm-client.ts         (450 LOC)
  - rate-limiter.ts       (380 LOC)
  - pipeline.ts           (520 LOC)
  Total: 3 files, ~1350 LOC
```

By file count, Task 1 looks 3x larger. By LOC (actual work), Task 2 is **9x larger**.

**Real-world impact:**
- Task 1 finishes quickly, agents sit idle
- Task 2 becomes a bottleneck
- Total processing time limited by slowest task
- LLM context usage is wasteful (many tiny files vs few large ones)

---

## 2. Level 0 Metadata Analysis

### 2.1 What Level 0 Already Provides

**Great news: Level 0 already collects `line_count`!**

From `src/core/types.ts`:
```typescript
interface RawFileMetadata {
  name: string;
  path: string;
  extension: string;
  size_bytes: number;
  line_count: number;      // ← Already available!
  language?: string;
  raw_imports: string[];
  import_data?: FileImportData;
}
```

From `src/levels/level0/harvester.ts`:
```typescript
// Lines are counted during harvesting
const content = await readFile(filePath, 'utf-8');
const lineCount = content.split('\n').length;
```

### 2.2 How Lines Are Currently Counted

The current implementation counts all lines:
```typescript
function countLines(content: string): number {
  return content.split('\n').length;
}
```

**Includes:**
- Code lines
- Comment lines
- Blank lines
- Documentation strings

### 2.3 Should We Exclude Comments/Blanks?

**Option A: Count All Lines (Current)**
- Pros: Simple, fast, consistent
- Cons: May overestimate "work" for heavily commented files

**Option B: Count Only Code Lines**
- Pros: More accurate representation of actual code
- Cons: Requires language-aware parsing, slower, edge cases

**Recommendation: Keep counting all lines**

Rationale:
1. Comments still require LLM attention during annotation
2. Complexity not worth the marginal improvement
3. Consistency across all languages
4. Speed - no need for language-specific parsing

---

## 3. Proposed LOC-Based Division

### 3.1 Core Changes

#### 3.1.1 Update DirectoryGroup Interface

**File:** `src/levels/level2/prompt.ts`

```typescript
interface DirectoryGroup {
  path: string;
  files: Array<{
    name: string;
    size: number;
    language?: string;
    lineCount: number;      // ← Add this
  }>;
  totalFiles: number;
  totalSizeKb: number;
  totalLOC: number;          // ← Add this
}
```

#### 3.1.2 Update buildDirectoryGroups()

```typescript
export function buildDirectoryGroups(level0: Level0Output): DirectoryGroup[] {
  const dirMap = new Map<string, DirectoryGroup>();

  for (const file of level0.files) {
    const pathParts = file.path.split('/');
    const dirPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '.';

    if (!dirMap.has(dirPath)) {
      dirMap.set(dirPath, {
        path: dirPath,
        files: [],
        totalFiles: 0,
        totalSizeKb: 0,
        totalLOC: 0,           // ← Initialize
      });
    }

    const group = dirMap.get(dirPath)!;
    group.files.push({
      name: file.name,
      size: file.size_bytes,
      language: file.language,
      lineCount: file.line_count,  // ← Include
    });
    group.totalFiles++;
    group.totalSizeKb += file.size_bytes / 1024;
    group.totalLOC += file.line_count;  // ← Accumulate
  }

  return Array.from(dirMap.values()).sort((a, b) => a.path.localeCompare(b.path));
}
```

#### 3.1.3 Update LLM Prompt

**Current prompt shows:**
```
src/auth/ (12 files, 45.2 KB)
  - jwt.ts [TypeScript]
  - login.ts [TypeScript]
```

**Proposed prompt shows:**
```
src/auth/ (12 files, 1,245 LOC, 45.2 KB)
  - jwt.ts [TypeScript] (156 LOC)
  - login.ts [TypeScript] (234 LOC)
```

**Updated Division Rules in Prompt:**
```
Division Rules:
1. **Target ~500 LOC per task** - Aim for balanced workloads
2. **Max 50 files per task** - Hard limit for manageable context
3. **Max 2000 LOC per task** - Soft limit, warn if exceeded
4. Group related files - Keep files in the same directory together
...
```

#### 3.1.4 Update DelegationTask Interface

**File:** `src/core/types.ts`

```typescript
interface DelegationTask {
  scope: string;
  agent_size: 'small' | 'medium' | 'large';
  estimated_files: number;
  estimated_loc: number;       // ← Add this
}
```

#### 3.1.5 Update Validation Rules

**File:** `src/levels/level2/validation.ts`

Add LOC-based validation:

```typescript
export const LOC_CONFIG = {
  TARGET_LOC_PER_TASK: 500,      // Sweet spot for balanced tasks
  MAX_LOC_PER_TASK: 2000,        // Soft warning threshold
  MIN_LOC_PER_TASK: 50,          // Avoid tiny tasks
  LOC_IMBALANCE_THRESHOLD: 3.0,  // Flag if task is 3x average
};
```

New validation function:
```typescript
function validateLOCDistribution(
  delegation: TaskDelegation,
  level0: Level0Output
): { warnings: string[]; suggestions: string[] } {
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const totalLOC = level0.files.reduce((sum, f) => sum + f.line_count, 0);
  const avgLOCPerTask = totalLOC / delegation.tasks.length;

  for (const task of delegation.tasks) {
    if (task.estimated_loc > LOC_CONFIG.MAX_LOC_PER_TASK) {
      warnings.push(
        `Task "${task.scope}" has ${task.estimated_loc} LOC (>${LOC_CONFIG.MAX_LOC_PER_TASK})`
      );
    }

    if (task.estimated_loc > avgLOCPerTask * LOC_CONFIG.LOC_IMBALANCE_THRESHOLD) {
      suggestions.push(
        `Task "${task.scope}" is ${(task.estimated_loc / avgLOCPerTask).toFixed(1)}x average LOC`
      );
    }
  }

  return { warnings, suggestions };
}
```

### 3.2 Configuration Recommendations

**Proposed Defaults (add to `src/config/defaults.ts`):**

```typescript
export const LOC_CONFIG = {
  /**
   * Target LOC per task for balanced workloads
   * Based on typical annotation complexity and context limits
   * @default 500
   */
  TARGET_LOC_PER_TASK: 500,

  /**
   * Maximum LOC per task (soft limit, generates warning)
   * Large tasks may hit context limits or timeout
   * @default 2000
   */
  MAX_LOC_PER_TASK: 2000,

  /**
   * Minimum LOC per task (to avoid tiny tasks)
   * Very small tasks have coordination overhead
   * @default 50
   */
  MIN_LOC_PER_TASK: 50,

  /**
   * LOC imbalance threshold
   * Tasks with LOC > average * this value are flagged
   * @default 3.0
   */
  LOC_IMBALANCE_THRESHOLD: 3.0,

  /**
   * Large file threshold for individual file warnings
   * Files exceeding this are flagged in preview
   * @default 500
   */
  LARGE_FILE_LOC_THRESHOLD: 500,
} as const;
```

---

## 4. Edge Cases and Considerations

### 4.1 Empty Files

**Handling:** Already filtered by Level 0 (binary detection skips empty files)

**Recommendation:** Count as 0 LOC, warn if a task would have only empty files

### 4.2 Generated/Vendored Files

**Examples:**
- `package-lock.json` (thousands of lines)
- `dist/bundle.js` (minified code)
- `vendor/` directories

**Current handling:** Respects `.rmapignore` patterns

**Recommendation:** Add default patterns for common generated files:
```
# Suggested .rmapignore additions
*.min.js
*.bundle.js
*-lock.json
dist/
vendor/
node_modules/
```

### 4.3 Very Large Files

**Problem:** A single 5000 LOC file could dominate a task

**Recommendation:**
1. Flag files > 500 LOC as "large" in preview
2. Consider splitting large-file tasks to dedicated agents
3. Add warning in validation if single file > 50% of task LOC

### 4.4 Binary/Non-Text Files

**Current handling:** Already filtered by `isBinaryFile()` in Level 3

**Recommendation:** Keep current behavior, binary files have 0 LOC contribution

### 4.5 Mixed-Language Directories

**Example:** `src/` with `.ts`, `.json`, `.md` files

**Consideration:** Should config files count the same as code?

**Recommendation:** Yes, for simplicity. The agent_size differentiation already handles complexity (small agent for configs, medium for code).

---

## 5. Implementation Roadmap

### Phase 1: Data Collection (Low Risk)
1. Update `DirectoryGroup` interface to include `totalLOC`
2. Update `buildDirectoryGroups()` to calculate LOC
3. Update prompt to show LOC information
4. **No behavioral change** - just more data in prompt

### Phase 2: LLM Guidance (Medium Risk)
1. Update prompt to suggest LOC-based targets
2. Add `estimated_loc` to `DelegationTask` interface
3. Update validation to check LOC distribution
4. **Gradual change** - LLM still makes final decisions

### Phase 3: Strict Enforcement (Higher Risk)
1. Add hard LOC limits (with override flag)
2. Implement automatic task splitting for large-LOC tasks
3. Add LOC-based agent_size suggestions
4. **Full LOC-based division**

---

## 6. Files That Would Need Changes

| File | Change Type | Complexity |
|------|-------------|------------|
| `src/levels/level2/prompt.ts` | Add LOC to DirectoryGroup | Low |
| `src/levels/level2/prompt.ts` | Update prompt text | Low |
| `src/core/types.ts` | Add `estimated_loc` to DelegationTask | Low |
| `src/levels/level2/divider.ts` | Parse new `estimated_loc` field | Low |
| `src/levels/level2/validation.ts` | Add LOC validation rules | Medium |
| `src/config/defaults.ts` | Add LOC_CONFIG constants | Low |
| `src/config/index.ts` | Export new config | Low |

**Total estimated changes:** ~150-200 lines across 7 files

---

## 7. Metrics to Track

After implementing LOC-based division, track:

1. **Task Duration Variance**
   - Before: High variance (some tasks 10x longer)
   - Target: <2x variance between fastest/slowest

2. **Agent Idle Time**
   - Before: Agents finish at different times
   - Target: All agents finish within 20% of each other

3. **Total Pipeline Duration**
   - Should decrease as bottlenecks are reduced

4. **LOC Distribution**
   - Average LOC per task
   - Max/Min LOC ratio

---

## 8. Conclusion

LOC-based task division is a straightforward improvement because:

1. **Data already exists** - Level 0 collects `line_count` for every file
2. **Minimal code changes** - ~150-200 lines across 7 files
3. **Backward compatible** - Can be implemented incrementally
4. **Clear benefits** - More balanced workloads, better parallelism
5. **Low risk** - LLM still makes final decisions, we just provide better data

**Recommended next steps:**
1. Implement the preview script (see companion deliverable)
2. Run preview on real repos to validate LOC distribution assumptions
3. Implement Phase 1 (data collection) as a low-risk first step
4. Measure improvement before proceeding to Phase 2

---

## Appendix A: Sample Preview Output

```
═══ LEVEL 3 TASK PREVIEW ═══

Task 1: src/core/
  - src/core/llm-client.ts (245 LOC)
  - src/core/rate-limiter.ts (189 LOC)
  - src/core/retry.ts (78 LOC)
  Total: 3 files, 512 LOC

Task 2: src/query/
  - src/query/engine.ts (312 LOC)
  - src/query/formatter.ts (156 LOC)
  Total: 2 files, 468 LOC

Task 3: src/levels/level3/
  - src/levels/level3/annotator.ts (890 LOC)  ⚠️ Large file
  Total: 1 file, 890 LOC  ⚠️ Imbalanced

═══ SUMMARY ═══
Total tasks: 12
Files per task: avg 4.2, min 1, max 8
LOC per task: avg 520, min 89, max 890
Imbalance ratio: 10.0x (max/min LOC)

⚠️ Warnings:
- Task 3 has 890 LOC (71% above average)
- 1 large file detected (>500 LOC)
```

## Appendix B: References

- Level 0 Harvester: `src/levels/level0/harvester.ts`
- Level 2 Divider: `src/levels/level2/divider.ts`
- Level 2 Prompt: `src/levels/level2/prompt.ts`
- Level 2 Validation: `src/levels/level2/validation.ts`
- Core Types: `src/core/types.ts`
- Config Defaults: `src/config/defaults.ts`
