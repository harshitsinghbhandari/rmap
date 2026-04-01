# Code Quality Audit Report: Query Module

## Executive Summary
- **Overall Score**: 652/1000
- **Maintainability Verdict**: Requires Refactoring
- **Primary Strengths**:
  - Clear separation of concerns across modules (engine, filter, formatter, ranking)
  - Good use of TypeScript types and interfaces
  - Consistent error handling patterns
  - Performance-conscious design (using Sets, tag index)
- **Critical Weaknesses**:
  - Incomplete implementation with TODOs and workarounds
  - Type safety compromised by `as any` casts and non-null assertions
  - Magic numbers scattered throughout scoring logic
  - Repetitive code in formatter module
  - Missing validation of external data (JSON parsing)

## File/Component Scores
| File/Path | Score /100 | Assessment |
|-----------|------------|------------|
| src/query/index.ts | 95 | Clean barrel export, no issues |
| src/query/engine.ts | 58 | Core functionality solid but incomplete implementation, type safety issues |
| src/query/filter.ts | 72 | Good logic but overly permissive fallback behavior |
| src/query/formatter.ts | 68 | Functional but highly repetitive, needs DRY refactoring |
| src/query/ranking.ts | 61 | Sound algorithm but magic numbers and naming issues |

## Detailed Findings

### Complexity & Duplication

**Critical Issues:**

1. **engine.ts:67-133** - `loadRepoMap()` function violates Single Responsibility Principle
   - Handles file I/O, JSON parsing, data reconstruction, and error handling in one 66-line function
   - Cognitive complexity: HIGH
   - Contains nested loops and Map operations that obscure business logic
   - **Impact**: Difficult to test individual concerns, hard to maintain

2. **formatter.ts** - Severe DRY violations across formatting functions
   - `formatRelevantFiles` (lines 111-145), `formatBlastRadius` (lines 154-187), and multiple other functions share identical patterns:
     ```typescript
     const filesToShow = items.slice(0, opts.maxFiles);
     const remaining = items.length - filesToShow.length;
     if (remaining > 0) {
       lines.push(`... and ${remaining} more file${remaining > 1 ? 's' : ''}`);
     }
     ```
   - This pattern appears **6 times** across the file
   - **Impact**: Changes to pagination logic require updating 6 locations, violates DRY

3. **engine.ts:111-122** - Complex file annotation reconstruction with brittle assumptions
   - Non-null assertions (`partial.path!`) without proper type guards
   - Fallback values (`|| 'unknown'`, `|| 0`) mask data quality issues
   - **Impact**: Runtime errors possible if assumptions break

**Moderate Issues:**

4. **filter.ts:39-48** - Partial tag matching fallback is overly broad
   - `tag.includes(normalizedTag) || normalizedTag.includes(tag)` will match "test" to "testing", "latest", "fastest", etc.
   - No fuzzy matching threshold or similarity scoring
   - **Impact**: Unpredictable query results, false positives

### Style & Convention Adherence

**Good Practices:**
- Consistent JSDoc documentation on exported functions
- Proper use of TypeScript interfaces and type exports
- File naming conventions are clear and consistent

**Issues:**

5. **ranking.ts:42-80** - Magic numbers without explanation
   - `matchingTags.length * 10` (line 55)
   - `importedByCount * 5` (line 65)
   - `importCount * 2` (line 68)
   - `file.exports.length * 3` (line 72)
   - `score -= 5` for large files (line 76)
   - **Impact**: Scoring algorithm is opaque and difficult to tune

6. **Naming inconsistency**: `getBlastRadius` is misleading
   - Function name suggests it returns a "radius" but actually returns dependent files
   - Similar confusion in `formatBlastRadius` and across the codebase
   - Better name: `getDependents` or `getImporters`
   - **Impact**: Cognitive overhead for new developers

### Readability & Maintainability

**Strengths:**
- Functions are generally well-documented with clear parameter descriptions
- Module boundaries are logical and promote reusability

**Issues:**

7. **engine.ts:82-97** - Incomplete implementation with misleading comments
   ```typescript
   // Reconstruct file annotations from graph and tags
   // For now, we'll build a minimal file list from the graph
   // In the full implementation, this would load from a separate annotations.json
   ```
   - Code is in production but marked as temporary
   - Missing critical data (exports, purpose, language, sizes) populated with empty/zero values
   - **Impact**: Query results will be incomplete or misleading

8. **formatter.ts:77-101** - `formatFile` function obscures structure with inline conditionals
   - Lines pushed conditionally makes it hard to visualize final output structure
   - Could benefit from template literal or builder pattern
   - **Impact**: Difficult to modify output format without breaking tests

9. **engine.ts:148** - Hardcoded default path using `process.cwd()`
   - Makes testing difficult without filesystem mocks
   - Better to require explicit configuration or use dependency injection
   - **Impact**: Tight coupling to filesystem

### Performance Anti-patterns

**Moderate Issues:**

10. **ranking.ts:169-170** - Unnecessary re-ranking in `getBlastRadius`
    ```typescript
    return rankFilesByRelevance(blastRadiusFiles, graph).map((fs) => fs.file);
    ```
    - Files are ranked only to extract the `.file` property, scores are discarded
    - Ranking involves scoring computation, array sorting - wasted CPU cycles
    - **Impact**: O(N log N) operation when O(N) would suffice

11. **engine.ts:70-74** - Multiple file reads with `Promise.all` is good, but no caching
    - Every query re-reads all JSON files from disk
    - No in-memory cache or TTL-based invalidation
    - **Impact**: Unnecessary I/O on every query, slow for frequent queries

12. **formatter.ts** - Extensive string concatenation via array joins
    - Acceptable for small outputs, but no size guards
    - Could hit memory limits with very large result sets
    - **Impact**: Potential memory pressure on large repositories

### Security & Error Handling

**Critical Issues:**

13. **engine.ts:76-78** - Unsafe JSON parsing without validation
    ```typescript
    const meta: MetaJson = JSON.parse(metaContent);
    const graph: GraphJson = JSON.parse(graphContent);
    const tags: TagsJson = JSON.parse(tagsContent);
    ```
    - No schema validation after parsing
    - Malformed or malicious JSON could crash the application or cause type errors downstream
    - **Impact**: Type assertions violated at runtime, potential crashes

**Good Practices:**
- Error handling in `loadRepoMap` with specific ENOENT check (lines 126-132)
- Proper error messages guide users to run `rmap map`

**Moderate Issues:**

14. **engine.ts:104** - Type assertion `as any` bypasses type checking
    ```typescript
    file.tags.push(tag as any);
    ```
    - Indicates type mismatch that's being forced
    - Could push invalid tag types into the array
    - **Impact**: Type safety compromised

15. **filter.ts:24-51** - `expandTagAliases` swallows invalid tags silently
    - If a tag is not in taxonomy and has no partial matches, it's simply ignored
    - No warning to user that their query was modified
    - **Impact**: Silent failures, confusing empty results

### Architecture & Design

**Strengths:**
- Clean module separation (engine orchestrates, filter handles filtering, formatter handles output, ranking handles scoring)
- Good use of TypeScript for type safety at boundaries
- Consistent function signatures

**Issues:**

16. **Missing abstraction**: File map reconstruction logic (engine.ts:83-122) should be extracted
    - Currently embedded in `loadRepoMap` making it untestable
    - Should be a separate `buildFileAnnotations(graph, tags)` function
    - **Impact**: Cannot unit test reconstruction logic in isolation

17. **formatter.ts** - No formatting strategy pattern
    - Three separate format functions (`formatQueryOutput`, `formatFileQueryOutput`, `formatPathQueryOutput`) with significant overlap
    - Could use a formatter interface with different implementations
    - **Impact**: Adding new output formats requires modifying existing code

18. **Tight coupling to filesystem**: All functions assume `.repo_map` structure exists
    - No abstraction for data source (could be database, API, in-memory)
    - **Impact**: Cannot use query engine without filesystem

## Final Verdict

The Query module demonstrates **solid architectural thinking** with clear separation of concerns and good TypeScript usage. However, it suffers from **incomplete implementation**, **type safety compromises**, and **significant code duplication**.

**Critical blockers:**
- Incomplete data reconstruction (engine.ts) produces hollow results
- Type safety bypassed with `as any` casts and non-null assertions
- No validation of external JSON data

**Maintainability concerns:**
- Repetitive pagination logic across formatter
- Magic numbers in scoring algorithm
- 66-line function doing too much (loadRepoMap)

**Recommendation**: Refactor before adding new features. Focus on:
1. Complete the file annotation reconstruction or load from proper source
2. Extract repeated patterns in formatter into helper functions
3. Add JSON schema validation
4. Extract constants for magic numbers
5. Break down `loadRepoMap` into smaller, testable functions

**Overall assessment**: The code is **functional but fragile**. It will work for the happy path but has sharp edges that will cut during edge cases or future maintenance. A focused refactoring effort (2-3 days) would elevate this from "requires refactoring" to "maintainable."

**Score breakdown:**
- Base score: 75/100 (functional with clear structure)
- Penalty for incomplete implementation: -100
- Penalty for type safety issues: -80
- Penalty for DRY violations: -60
- Penalty for magic numbers: -40
- Penalty for missing validation: -50
- Bonus for good error handling: +50
- Bonus for clear documentation: +50
- Bonus for performance awareness (Sets, tag index): +57

**Total: 652/1000**
