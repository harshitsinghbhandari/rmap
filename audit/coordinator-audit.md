# Code Quality Audit Report - Coordinator Module

## Executive Summary
- **Overall Score**: 642/1000
- **Maintainability Verdict**: Requires Refactoring
- **Primary Strengths**:
  - Strong separation of concerns across modules
  - Comprehensive checkpoint/resume infrastructure
  - Good use of TypeScript typing
  - Atomic file operations with temp-then-rename pattern
  - Thorough JSDoc documentation
- **Critical Weaknesses**:
  - Pipeline orchestrator (pipeline.ts) is monolithic and overly complex (524 lines)
  - Inconsistent error handling patterns across modules
  - Magic numbers and hardcoded thresholds
  - Poor separation between orchestration and checkpoint logic
  - Missing input validation for external commands
  - Duplicate logic in graph operations

## File/Component Scores
| File/Path | Score /100 | Assessment |
|-----------|------------|------------|
| assembler.ts | 78 | Clean, focused utility with good structure |
| checkpoint.ts | 72 | Solid implementation but tight coupling to file system |
| delta-update.ts | 68 | Functional but error handling needs improvement |
| delta.ts | 65 | Complex logic with magic numbers; needs refactoring |
| graph-repair.ts | 70 | Good repair logic but counting functions overly complex |
| graph.ts | 82 | Cleanest file; well-structured graph operations |
| index.ts | 75 | Simple orchestrator; mostly re-exports |
| pipeline.ts | 38 | **CRITICAL**: Monolithic, overly complex, multiple responsibilities |
| progress.ts | 80 | Simple, focused tracker with clear API |
| versioning.ts | 74 | Good version logic but validation could be extracted |

**Calculation**: (78+72+68+65+70+82+75+38+80+74)/10 = 70.2 avg × 10 = 702 base score
- **Penalties**:
  - -200 for pipeline.ts monolith
  - -100 for inconsistent error handling
  - -60 for magic numbers
  - -50 for missing input validation
  - -50 for code duplication
- **Final Score**: 702 - 460 = **642/1000**

## Detailed Findings

### Complexity & Duplication

#### CRITICAL: pipeline.ts Monolith (Lines 1-524)
**Location**: `src/coordinator/pipeline.ts`
**Problem**: The `runPipeline` function spans 294 lines (173-467) and handles:
- Checkpoint management
- Signal handler setup/teardown
- All 5 pipeline levels
- Error recovery
- Progress tracking
- Metadata building

**Impact**: This violates Single Responsibility Principle. The function is untestable in isolation, difficult to reason about, and impossible to modify safely. Cognitive complexity is extreme.

**Evidence**:
```typescript
// Lines 243-274: Signal handler logic embedded in orchestrator
const handleShutdown = (signal: string) => {
  // 30 lines of shutdown logic inline
};
```

**Severity**: CRITICAL - Blocks extensibility and testing

#### High Complexity in detectChanges (delta.ts:45-117)
**Location**: `src/coordinator/delta.ts:45-117`
**Problem**: 72-line function with multiple decision branches and side effects
**Impact**: Difficult to test edge cases; logic flow is hard to follow

#### Duplicate Graph Logic
**Location**: Multiple files
- `graph.ts:buildGraph` (lines 20-56)
- `graph.ts:updateGraph` (lines 66-120)
- `graph-repair.ts:repairGraph` (lines 50-77)

**Problem**: Similar loop patterns for building reverse edges, sorting arrays
**Impact**: Changes must be synchronized across 3 locations

#### Long Helper Functions
**Location**: `delta.ts:145-199` (getGitDiff - 54 lines)
**Problem**: Complex parsing logic with multiple conditional branches
**Impact**: Hard to unit test; parsing logic should be extracted

### Style & Convention Adherence

#### Inconsistent Error Handling
**Problem**: Mixed strategies across modules:
- **Throws**: `delta.ts:133`, `delta-update.ts:111`
- **Returns null**: `checkpoint.ts:101-113`, `assembler.ts:224-236`
- **Logs warning**: `checkpoint.ts:110`, `delta-update.ts:181`

**Impact**: Callers cannot predict behavior; some errors are silently swallowed

**Evidence**:
```typescript
// checkpoint.ts:110 - Swallows errors
catch (error) {
  console.warn(`Warning: Failed to read checkpoint file ${filepath}: ${error}`);
  return null;
}

// delta.ts:133 - Throws errors
catch (error) {
  throw new Error('Failed to get git commit. Is this a git repository?');
}
```

#### Inconsistent Logging
**Problem**: Mixed use of:
- `console.log` (pipeline.ts, delta.ts)
- `tracker.logProgress` (pipeline.ts)
- `console.warn` (multiple files)

**Impact**: No centralized logging; difficult to control output verbosity

#### Magic Numbers
**Location**: `delta.ts:97-106`
```typescript
if (hasNewTopLevelDir) {
  updateStrategy = 'full-rebuild';
} else if (totalChanges > 100) {  // Magic number
  updateStrategy = 'full-rebuild';
} else if (totalChanges >= 20) {   // Magic number
  updateStrategy = 'delta-with-validation';
}
```
**Problem**: Hardcoded thresholds with no explanation or configuration
**Impact**: Cannot tune strategy without code changes; thresholds may not suit all repos

### Readability & Maintainability

#### Poor Separation of Concerns in pipeline.ts
**Problem**: Orchestration, checkpoint management, and signal handling are interleaved
**Lines affected**: 173-467

**Impact**: Cannot test orchestration without checkpoint system; cannot test checkpoint without orchestration

#### Unclear Function Names
**Location**: `versioning.ts:234-249`
```typescript
export function bumpVersion(currentVersion: number | null)
```
**Problem**: "Bump" is informal; doesn't indicate what happens (increment + set parent)
**Better**: `incrementVersionWithParent` or `createNextVersion`

#### Overloaded Responsibilities
**Location**: `checkpoint.ts`
**Problem**: Single file handles:
- Path resolution
- Directory creation
- Atomic writes
- JSON parsing
- Validation
- State updates (7 separate functions for marking states)

**Impact**: File has 335 lines doing too much

#### Missing Abstractions
**Location**: `pipeline.ts:83-98`
```typescript
function getGitCommit(repoRoot: string): string {
  try {
    const commit = execSync('git rev-parse HEAD', {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    return commit;
  } catch (error) {
    console.warn('Warning: Could not get git commit hash. Not a git repository?');
    return 'unknown';
  }
}
```
**Problem**: Git interaction logic scattered across pipeline.ts and delta.ts
**Impact**: Duplicate git command execution patterns

### Performance Anti-patterns

#### Inefficient Array Filtering (graph-repair.ts:161-216)
**Location**: `countUpdatedEdges` function
**Problem**: Nested loops over all graph nodes and their edges
```typescript
for (const filePath of allPaths) {
  const oldNode = oldGraph[filePath];
  const newNode = newGraph[filePath];

  // More nested loops over imports/imported_by
  for (const imp of newImports) { ... }
  for (const imp of oldImports) { ... }
  for (const imp of newImportedBy) { ... }
  for (const imp of oldImportedBy) { ... }
}
```
**Complexity**: O(N × M) where N = files, M = avg edges per file
**Impact**: Could be slow on large codebases (1000+ files)

**Better approach**: Use Set operations for difference calculation

#### Repeated File Existence Checks
**Location**: Multiple files
**Problem**: `fs.existsSync` called repeatedly in loops without caching
**Example**: `delta-update.ts:159`, `checkpoint.ts:102`, `assembler.ts:203`

#### Unnecessary Array Operations
**Location**: `graph.ts:94-97`
```typescript
graph[path] = {
  imports: [...annotation.imports],  // Unnecessary copy
  imported_by: [],
};
```
**Problem**: Spreads array that's already immutable from annotation
**Impact**: Minor memory overhead; unclear intent

### Security & Error Handling

#### CRITICAL: Unsafe Command Execution
**Location**: `delta.ts:127-130`, `delta.ts:152-155`
```typescript
const commit = execSync('git rev-parse HEAD', {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();

const output = execSync(`git diff --name-status ${fromCommit} ${toCommit}`, {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();
```
**Problem**: `fromCommit` and `toCommit` are not sanitized before shell interpolation
**Severity**: HIGH - Command injection risk if commit hashes are user-controlled
**Impact**: Potential RCE if attacker controls commit references

#### Swallowed Exceptions
**Location**: Multiple locations
```typescript
// checkpoint.ts:110
catch (error) {
  console.warn(`Warning: Failed to read checkpoint file ${filepath}: ${error}`);
  return null;  // Error is lost
}

// assembler.ts:230
catch (error) {
  console.warn(`Warning: Failed to read existing meta.json: ${error}`);
  return null;  // Error is lost
}
```
**Impact**: Silent failures make debugging difficult; system may operate on stale data

#### Missing Input Validation
**Location**: `checkpoint.ts:29-31`, `assembler.ts:65-67`
**Problem**: No validation that `repoPath` is:
- An absolute path
- Within expected bounds (no path traversal)
- A directory (not a file)

**Impact**: Could write checkpoints to arbitrary locations

#### Race Conditions in Atomic Writes
**Location**: `checkpoint.ts:83-93`
```typescript
function writeJsonAtomic(filepath: string, data: unknown): void {
  const dir = path.dirname(filepath);
  const tempPath = path.join(dir, `.${path.basename(filepath)}.tmp`);

  fs.writeFileSync(tempPath, json + '\n', 'utf8');
  fs.renameSync(tempPath, filepath);  // Not atomic on all filesystems
}
```
**Problem**: `fs.renameSync` is only atomic on POSIX systems, not Windows
**Impact**: Corruption risk on Windows

#### No Retry Logic
**Location**: All file I/O operations
**Problem**: No retry on transient failures (EAGAIN, EBUSY)
**Impact**: Pipeline may fail unnecessarily on busy systems

## Final Verdict

The coordinator module demonstrates solid architectural thinking with its checkpoint system and separation of concerns across files. However, **critical refactoring is needed**, particularly for:

1. **pipeline.ts** - This 524-line monolith is the primary blocker to maintainability. It must be decomposed into separate orchestrator, checkpoint manager, and signal handler classes.

2. **Error handling standardization** - The mix of throw/return-null/log-warning patterns creates unpredictable behavior and silent failures.

3. **Security hardening** - Command injection risks in git operations must be addressed before production use.

4. **Magic number extraction** - Hardcoded thresholds should be configurable.

The module is **functional but fragile**. With targeted refactoring (estimated 2-3 days of work), it could reach production quality. Without refactoring, it will become increasingly difficult to extend and debug.

**Recommended Action**: Begin refactoring immediately, starting with pipeline.ts decomposition and error handling standardization.
