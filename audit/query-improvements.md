# Refactoring Improvements Roadmap: Query Module

## Critical Refactors

### Refactor 1: Complete File Annotation Reconstruction
- **Location**: `src/query/engine.ts:80-122`
- **Problem**: File annotations are reconstructed with incomplete data (empty exports, empty purpose, zero sizes). The comment on line 82 admits "For now, we'll build a minimal file list" and mentions loading from `annotations.json`, but this is not implemented. This means query results lack critical information.
- **Impact**:
  - Query output shows empty exports and purposes, providing minimal value to users
  - Violates user expectations set by the README examples which show rich file metadata
  - Defeats the primary purpose of the tool: providing meaningful context
- **Suggested Approach**:
  ```typescript
  // Option 1: Load from annotations.json file
  async function loadRepoMap(repoMapPath: string): Promise<RepoMapData> {
    const [metaContent, graphContent, tagsContent, annotationsContent] = await Promise.all([
      readFile(join(repoMapPath, 'meta.json'), 'utf-8'),
      readFile(join(repoMapPath, 'graph.json'), 'utf-8'),
      readFile(join(repoMapPath, 'tags.json'), 'utf-8'),
      readFile(join(repoMapPath, 'annotations.json'), 'utf-8'), // NEW
    ]);

    const files: FileAnnotation[] = JSON.parse(annotationsContent);
    // Validate schema
    validateFileAnnotations(files);

    return { meta, graph, tags, files };
  }

  // Option 2: If annotations.json doesn't exist, enrich from graph/tags
  function enrichFileAnnotations(
    graphNode: GraphJson[string],
    tags: Tag[],
    filePath: string
  ): FileAnnotation {
    // Load actual file to extract exports, purpose, size
    // This would require filesystem access and parsing
  }
  ```
  - Create `annotations.json` as part of the map building process (Task 9 in TASKS.md)
  - Load complete annotations instead of reconstructing partial data
  - If annotations don't exist, fail fast with clear error message

### Refactor 2: Add JSON Schema Validation
- **Location**: `src/query/engine.ts:76-78`
- **Problem**: JSON.parse() is called on external files without any validation that the parsed objects match expected TypeScript interfaces. Malformed or tampered JSON will cause cryptic runtime errors or silent type mismatches.
- **Impact**:
  - Application crashes with unhelpful error messages
  - Type safety guarantees are violated at runtime
  - Security risk if malicious JSON is provided
- **Suggested Approach**:
  ```typescript
  import { z } from 'zod'; // or use ajv, io-ts, etc.

  // Define runtime schemas
  const MetaJsonSchema = z.object({
    schema_version: z.string(),
    repo_name: z.string(),
    purpose: z.string(),
    stack: z.string(),
    entrypoints: z.array(z.string()),
    modules: z.array(z.object({
      path: z.string(),
      description: z.string(),
    })),
    conventions: z.array(z.string()),
    // ... complete schema
  });

  async function loadRepoMap(repoMapPath: string): Promise<RepoMapData> {
    const [metaContent, graphContent, tagsContent] = await Promise.all([
      readFile(join(repoMapPath, 'meta.json'), 'utf-8'),
      readFile(join(repoMapPath, 'graph.json'), 'utf-8'),
      readFile(join(repoMapPath, 'tags.json'), 'utf-8'),
    ]);

    // Parse and validate
    const meta = MetaJsonSchema.parse(JSON.parse(metaContent));
    const graph = GraphJsonSchema.parse(JSON.parse(graphContent));
    const tags = TagsJsonSchema.parse(JSON.parse(tagsContent));

    return { meta, graph, tags, files: [] };
  }
  ```
  - Use Zod or similar runtime validation library
  - Provide helpful error messages when validation fails
  - Catch issues at the boundary before they propagate

### Refactor 3: Eliminate Type Safety Bypasses
- **Location**: `src/query/engine.ts:104, 113-120`
- **Problem**:
  - Line 104: `file.tags.push(tag as any)` bypasses TypeScript type checking
  - Lines 113-120: Multiple non-null assertions (`partial.path!`) and default values (`|| 'unknown'`) without proper type guards
- **Impact**:
  - Defeats the purpose of TypeScript
  - Runtime type errors possible when assumptions are violated
  - Masks underlying data quality problems
- **Suggested Approach**:
  ```typescript
  // Instead of line 104's `as any` cast:
  for (const [tag, filePaths] of Object.entries(tags.index)) {
    // Validate tag is in taxonomy
    if (!TAG_TAXONOMY.includes(tag as Tag)) {
      console.warn(`Unknown tag in index: ${tag}`);
      continue;
    }

    for (const filePath of filePaths) {
      const file = fileMap.get(filePath);
      if (file?.tags) {
        file.tags.push(tag as Tag); // Now safe because validated above
      }
    }
  }

  // Instead of lines 113-120's non-null assertions:
  const files: FileAnnotation[] = Array.from(fileMap.values())
    .filter((partial): partial is Required<typeof partial> => {
      // Type guard: ensure all required fields exist
      return Boolean(partial.path && partial.language);
    })
    .map((partial) => ({
      path: partial.path,
      language: partial.language,
      size_bytes: partial.size_bytes,
      line_count: partial.line_count,
      purpose: partial.purpose,
      tags: partial.tags,
      exports: partial.exports,
      imports: partial.imports,
    }));
  ```
  - Use proper type guards instead of `as any`
  - Validate assumptions explicitly
  - Log warnings for data quality issues

### Refactor 4: Extract and Test File Reconstruction Logic
- **Location**: `src/query/engine.ts:83-122`
- **Problem**: File annotation reconstruction is buried inside `loadRepoMap()`, a 66-line function that also handles I/O and error handling. This mixing of concerns makes the reconstruction logic untestable in isolation.
- **Impact**:
  - Cannot unit test reconstruction without mocking file system
  - Violates Single Responsibility Principle
  - Changes to reconstruction require understanding I/O and error handling
- **Suggested Approach**:
  ```typescript
  /**
   * Build file annotations from graph and tags
   * Pure function - testable without I/O
   */
  function buildFileAnnotationsFromGraph(
    graph: GraphJson,
    tags: TagsJson
  ): FileAnnotation[] {
    const fileMap = new Map<string, Partial<FileAnnotation>>();

    // Collect files from graph
    for (const [filePath, graphNode] of Object.entries(graph)) {
      fileMap.set(filePath, {
        path: filePath,
        imports: graphNode.imports,
        exports: [],
        tags: [],
        purpose: '',
        language: '',
        size_bytes: 0,
        line_count: 0,
      });
    }

    // Populate tags from tag index
    for (const [tag, filePaths] of Object.entries(tags.index)) {
      if (!TAG_TAXONOMY.includes(tag as Tag)) continue;

      for (const filePath of filePaths) {
        const file = fileMap.get(filePath);
        if (file?.tags) {
          file.tags.push(tag as Tag);
        }
      }
    }

    return Array.from(fileMap.values()) as FileAnnotation[];
  }

  async function loadRepoMap(repoMapPath: string): Promise<RepoMapData> {
    try {
      const [metaContent, graphContent, tagsContent] = await Promise.all([
        readFile(join(repoMapPath, 'meta.json'), 'utf-8'),
        readFile(join(repoMapPath, 'graph.json'), 'utf-8'),
        readFile(join(repoMapPath, 'tags.json'), 'utf-8'),
      ]);

      const meta: MetaJson = JSON.parse(metaContent);
      const graph: GraphJson = JSON.parse(graphContent);
      const tags: TagsJson = JSON.parse(tagsContent);

      // Delegate to pure function
      const files = buildFileAnnotationsFromGraph(graph, tags);

      return { meta, graph, tags, files };
    } catch (error) {
      // Error handling...
    }
  }
  ```
  - Extract pure function for reconstruction
  - Write unit tests for `buildFileAnnotationsFromGraph` with fixture data
  - Keep I/O concerns separate

### Refactor 5: Extract Magic Numbers to Constants
- **Location**: `src/query/ranking.ts:42-80`
- **Problem**: Scoring algorithm uses magic numbers (10, 5, 2, 3, -5) without explanation. This makes the algorithm opaque and difficult to tune.
- **Impact**:
  - Cannot understand why files are ranked the way they are
  - Difficult to experiment with different scoring weights
  - No way to A/B test ranking changes
- **Suggested Approach**:
  ```typescript
  /**
   * Scoring weights for file relevance ranking
   *
   * These constants control how different factors contribute to a file's score.
   * Adjust these to tune the ranking algorithm.
   */
  const SCORING_WEIGHTS = {
    /** Points per matching tag */
    TAG_MATCH: 10,

    /** Points per file that imports this file (centrality indicator) */
    IMPORTED_BY: 5,

    /** Points per file this file imports (entry point indicator) */
    IMPORTS: 2,

    /** Points per exported symbol (API surface area indicator) */
    EXPORT: 3,

    /** Penalty for very large files (>1000 lines) */
    LARGE_FILE_PENALTY: -5,
  } as const;

  function computeScore(
    file: FileAnnotation,
    graph: GraphJson,
    queryTags?: string[]
  ): number {
    let score = 0;

    if (queryTags && queryTags.length > 0) {
      const queryTagSet = new Set(queryTags.map((t) => t.toLowerCase()));
      const matchingTags = file.tags.filter((tag) =>
        queryTagSet.has(tag.toLowerCase())
      );
      score += matchingTags.length * SCORING_WEIGHTS.TAG_MATCH;
    }

    const graphNode = graph[file.path];
    if (graphNode) {
      score += graphNode.imported_by.length * SCORING_WEIGHTS.IMPORTED_BY;
      score += graphNode.imports.length * SCORING_WEIGHTS.IMPORTS;
    }

    score += file.exports.length * SCORING_WEIGHTS.EXPORT;

    if (file.line_count > 1000) {
      score += SCORING_WEIGHTS.LARGE_FILE_PENALTY;
    }

    return score;
  }
  ```
  - Create `SCORING_WEIGHTS` constant object
  - Document what each weight represents
  - Makes algorithm tunable and testable

## Medium Priority Improvements

### Refactor 6: DRY Up Formatter Pagination Logic
- **Location**: `src/query/formatter.ts:127-140, 166-182, 208-216, 290-299, 314-318, 363-371, 384-391`
- **Problem**: The pattern for slicing results and showing "... and X more" is duplicated 7 times across the formatter module. This violates DRY and makes changes error-prone.
- **Impact**:
  - Changes to pagination format require updating 7 locations
  - Inconsistency risk (some might show "files" vs "file")
  - Increased maintenance burden
- **Suggested Approach**:
  ```typescript
  /**
   * Format a paginated list with overflow message
   *
   * @param items - All items to potentially show
   * @param limit - Maximum items to show
   * @param itemName - Singular name for items (e.g., "file", "convention")
   * @returns Tuple of [items to show, overflow message or null]
   */
  function paginateItems<T>(
    items: T[],
    limit: number,
    itemName: string
  ): [T[], string | null] {
    const toShow = items.slice(0, limit);
    const remaining = items.length - toShow.length;

    if (remaining > 0) {
      const plural = remaining > 1 ? `${itemName}s` : itemName;
      return [toShow, `... and ${remaining} more ${plural}`];
    }

    return [toShow, null];
  }

  // Usage:
  function formatRelevantFiles(
    files: FileScore[],
    queryTags: string[],
    options: Required<FormatOptions>
  ): string {
    const lines = [`═══ RELEVANT FILES [${queryTags.join(', ')}] ═══`, ''];

    const [filesToShow, overflowMsg] = paginateItems(files, options.maxFiles, 'file');

    filesToShow.forEach((fileScore, index) => {
      if (index > 0) lines.push('');
      lines.push(formatFile(fileScore.file, options));
    });

    if (overflowMsg) {
      lines.push('', overflowMsg);
    }

    lines.push('');
    return lines.join('\n');
  }
  ```
  - Extract common pagination pattern into reusable helper
  - Ensures consistent formatting across all sections
  - Single source of truth for overflow messages

### Refactor 7: Tighten Tag Expansion Fallback Behavior
- **Location**: `src/query/filter.ts:39-48`
- **Problem**: The partial matching fallback (`tag.includes(normalizedTag) || normalizedTag.includes(tag)`) is too permissive. Searching for "test" will match "testing", "latest", "contest", etc.
- **Impact**:
  - Unpredictable query results
  - False positives dilute relevance
  - Users confused why certain files appear
- **Suggested Approach**:
  ```typescript
  export function expandTagAliases(queryTags: string[]): Tag[] {
    const expandedTags = new Set<Tag>();
    const warnings: string[] = [];

    for (const queryTag of queryTags) {
      const normalizedTag = queryTag.toLowerCase().trim();

      // Check if it's an alias
      if (normalizedTag in TAG_ALIASES) {
        const aliasedTags = TAG_ALIASES[normalizedTag];
        aliasedTags.forEach((tag) => expandedTags.add(tag));
        continue;
      }

      // Check if it's a valid tag in the taxonomy
      if (TAG_TAXONOMY.includes(normalizedTag as Tag)) {
        expandedTags.add(normalizedTag as Tag);
        continue;
      }

      // Fuzzy matching with stricter criteria
      const matches = TAG_TAXONOMY.filter((tag) => {
        // Only match if query is a prefix or tag is a prefix
        return tag.startsWith(normalizedTag) || normalizedTag.startsWith(tag);
      });

      if (matches.length > 0) {
        matches.forEach((tag) => expandedTags.add(tag));
        if (matches.length > 1) {
          warnings.push(`Tag "${queryTag}" matched multiple: ${matches.join(', ')}`);
        }
      } else {
        warnings.push(`Tag "${queryTag}" not found in taxonomy`);
      }
    }

    if (warnings.length > 0) {
      console.warn('Tag expansion warnings:', warnings);
    }

    return Array.from(expandedTags);
  }
  ```
  - Use prefix matching instead of substring matching
  - Warn users when tags don't match taxonomy
  - Reduce false positives

### Refactor 8: Rename `getBlastRadius` to `getDependents`
- **Location**: `src/query/ranking.ts:143-171`
- **Problem**: The function name `getBlastRadius` is misleading. "Blast radius" suggests spreading outward from a point, but the function returns files that import the given files (i.e., dependents/importers), not files affected by changes.
- **Impact**:
  - Cognitive overhead for developers reading the code
  - Confusing for contributors unfamiliar with the codebase
  - Terminology inconsistency with `getDependencies` which has a clearer name
- **Suggested Approach**:
  ```typescript
  /**
   * Get dependents for a set of files
   *
   * Returns all files that import any of the given files.
   * Also known as "reverse dependencies" or "importers".
   *
   * @param filePaths - Paths of files to get dependents for
   * @param graph - Dependency graph
   * @param allFiles - All file annotations (to get full file info)
   * @returns Files that import any of the input files
   */
  export function getDependents(
    filePaths: string[],
    graph: GraphJson,
    allFiles: FileAnnotation[]
  ): FileAnnotation[] {
    const dependentSet = new Set<string>();

    for (const filePath of filePaths) {
      const graphNode = graph[filePath];
      if (graphNode?.imported_by) {
        graphNode.imported_by.forEach((path) => dependentSet.add(path));
      }
    }

    const fileMap = new Map(allFiles.map((f) => [f.path, f]));
    const dependents: FileAnnotation[] = [];

    for (const path of dependentSet) {
      const file = fileMap.get(path);
      if (file) {
        dependents.push(file);
      }
    }

    return rankFilesByRelevance(dependents, graph).map((fs) => fs.file);
  }

  // Keep `getBlastRadius` as a deprecated alias for backward compatibility
  /** @deprecated Use getDependents instead */
  export const getBlastRadius = getDependents;
  ```
  - Rename to `getDependents` for clarity
  - Update all call sites (engine.ts uses it multiple times)
  - Keep old name as deprecated alias temporarily

### Refactor 9: Add In-Memory Caching for Frequent Queries
- **Location**: `src/query/engine.ts:67-133`
- **Problem**: Every query call re-reads all JSON files from disk. For tools making frequent queries, this is wasteful I/O.
- **Impact**:
  - Slower query response times
  - Unnecessary disk I/O
  - Doesn't scale for interactive use cases
- **Suggested Approach**:
  ```typescript
  interface CacheEntry {
    data: RepoMapData;
    timestamp: number;
    repoMapPath: string;
  }

  // Simple in-memory cache with TTL
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  let cache: CacheEntry | null = null;

  async function loadRepoMap(repoMapPath: string): Promise<RepoMapData> {
    const now = Date.now();

    // Check cache
    if (
      cache &&
      cache.repoMapPath === repoMapPath &&
      now - cache.timestamp < CACHE_TTL_MS
    ) {
      return cache.data;
    }

    // Load from disk (existing logic)
    try {
      const [metaContent, graphContent, tagsContent] = await Promise.all([
        readFile(join(repoMapPath, 'meta.json'), 'utf-8'),
        readFile(join(repoMapPath, 'graph.json'), 'utf-8'),
        readFile(join(repoMapPath, 'tags.json'), 'utf-8'),
      ]);

      const meta: MetaJson = JSON.parse(metaContent);
      const graph: GraphJson = JSON.parse(graphContent);
      const tags: TagsJson = JSON.parse(tagsContent);
      const files = buildFileAnnotationsFromGraph(graph, tags);

      const data = { meta, graph, tags, files };

      // Update cache
      cache = { data, timestamp: now, repoMapPath };

      return data;
    } catch (error) {
      // Error handling...
    }
  }

  // Export cache-busting function for testing or forced refresh
  export function clearRepoMapCache(): void {
    cache = null;
  }
  ```
  - Add simple TTL-based cache
  - Invalidate after 5 minutes (configurable)
  - Expose cache-clearing function

### Refactor 10: Remove Wasteful Re-Ranking in `getBlastRadius`
- **Location**: `src/query/ranking.ts:169-170`
- **Problem**: `getBlastRadius` calls `rankFilesByRelevance()` and immediately discards the scores by mapping to `.file`. The ranking involves score computation and array sorting (O(N log N)), which are wasted.
- **Impact**:
  - Unnecessary CPU cycles on every query
  - O(N log N) when O(N) would suffice
  - Performance degradation on large codebases
- **Suggested Approach**:
  ```typescript
  export function getBlastRadius(
    filePaths: string[],
    graph: GraphJson,
    allFiles: FileAnnotation[]
  ): FileAnnotation[] {
    const blastRadiusSet = new Set<string>();

    for (const filePath of filePaths) {
      const graphNode = graph[filePath];
      if (graphNode?.imported_by) {
        graphNode.imported_by.forEach((path) => blastRadiusSet.add(path));
      }
    }

    const fileMap = new Map(allFiles.map((f) => [f.path, f]));
    const blastRadiusFiles: FileAnnotation[] = [];

    for (const path of blastRadiusSet) {
      const file = fileMap.get(path);
      if (file) {
        blastRadiusFiles.push(file);
      }
    }

    // Simply return files, don't rank if scores aren't needed
    // If caller needs ranked files, they can call rankFilesByRelevance themselves
    return blastRadiusFiles;

    // OR, if ordering is desired, use a cheaper sort:
    // return blastRadiusFiles.sort((a, b) => a.path.localeCompare(b.path));
  }
  ```
  - Remove ranking if scores aren't used downstream
  - Let callers decide if they need ranking
  - Reduces complexity from O(N log N) to O(N)

## Nice-to-Have Enhancements

### Enhancement 1: Add Configurable Output Formats
- **Location**: `src/query/formatter.ts`
- **Problem**: Output format is hardcoded as text with box-drawing characters. Some users might prefer JSON, Markdown, or CSV for programmatic consumption.
- **Benefit**: Makes the query engine more versatile, enables integration with other tools, supports CI/CD pipelines
- **Suggested Approach**:
  ```typescript
  type OutputFormat = 'text' | 'json' | 'markdown';

  export interface FormatOptions {
    maxFiles?: number;
    maxExports?: number;
    fullPaths?: boolean;
    maxConventions?: number;
    format?: OutputFormat; // NEW
  }

  export function formatQueryOutput(
    params: { ... },
    options: Partial<FormatOptions> = {}
  ): string {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    switch (opts.format) {
      case 'json':
        return JSON.stringify(params, null, 2);
      case 'markdown':
        return formatAsMarkdown(params, opts);
      case 'text':
      default:
        return formatAsText(params, opts);
    }
  }
  ```

### Enhancement 2: Add Progress Indicators for Large Queries
- **Location**: `src/query/engine.ts`
- **Problem**: Large repositories might have slow queries, but users have no feedback that work is happening.
- **Benefit**: Better UX for interactive CLI usage, reduces perceived latency
- **Suggested Approach**:
  ```typescript
  import ora from 'ora'; // or similar spinner library

  export async function queryByTags(
    queryTags: string[],
    config: QueryConfig = {}
  ): Promise<string> {
    const spinner = ora('Loading repository map...').start();

    try {
      const repoMapPath = config.repoMapPath || join(process.cwd(), '.repo_map');
      const data = await loadRepoMap(repoMapPath);

      spinner.text = 'Expanding tag aliases...';
      const expandedTags = expandTagAliases(queryTags);

      spinner.text = 'Filtering files...';
      const matchingFilePaths = getFilesFromTagIndex(data.tags, queryTags);
      const matchingFiles = data.files.filter((file) =>
        matchingFilePaths.has(file.path)
      );

      spinner.text = 'Ranking results...';
      const rankedFiles = rankFilesByRelevance(matchingFiles, data.graph, expandedTags);

      spinner.succeed('Query complete');

      // Format and return...
    } catch (error) {
      spinner.fail('Query failed');
      throw error;
    }
  }
  ```

### Enhancement 3: Add Type-Safe Configuration Object
- **Location**: `src/query/engine.ts:38-47`
- **Problem**: `QueryConfig` uses optional fields that default to `process.cwd()`, making testing and reuse harder.
- **Benefit**: More predictable behavior, easier to test, clearer API
- **Suggested Approach**:
  ```typescript
  export interface QueryConfig {
    /** Path to .repo_map directory (required) */
    repoMapPath: string;

    /** Root directory of the repository (optional, for relative path resolution) */
    repoRoot?: string;

    /** Format options for output */
    formatOptions?: Partial<FormatOptions>;
  }

  export async function queryByTags(
    queryTags: string[],
    config: QueryConfig
  ): Promise<string> {
    // No defaulting - caller must provide repoMapPath
    const data = await loadRepoMap(config.repoMapPath);
    // ...
  }

  // For convenience, provide a helper that uses cwd
  export async function queryByTagsInCwd(
    queryTags: string[],
    formatOptions?: Partial<FormatOptions>
  ): Promise<string> {
    return queryByTags(queryTags, {
      repoMapPath: join(process.cwd(), '.repo_map'),
      formatOptions,
    });
  }
  ```

### Enhancement 4: Add TypeScript Strict Mode Compliance
- **Location**: All files
- **Problem**: Code may not be compiled with `strict: true` in tsconfig, which can hide type safety issues.
- **Benefit**: Catches more bugs at compile time, improves maintainability
- **Suggested Approach**:
  - Enable `strict: true` in tsconfig.json
  - Enable `noUncheckedIndexedAccess: true` to catch missing index checks
  - Fix all resulting type errors (especially around `graph[filePath]` which could be undefined)
  - Example fix:
    ```typescript
    // Before:
    const graphNode = graph[file.path];
    const importCount = graphNode.imports.length; // Unsafe

    // After:
    const graphNode = graph[file.path];
    const importCount = graphNode?.imports.length ?? 0; // Safe
    ```

### Enhancement 5: Add Unit Tests for Each Module
- **Location**: All files
- **Problem**: No test files found in the codebase (should be in `tests/query/`).
- **Benefit**: Regression prevention, enables confident refactoring, documents expected behavior
- **Suggested Approach**:
  ```typescript
  // tests/query/filter.test.ts
  import { describe, it, expect } from 'vitest';
  import { expandTagAliases, filterFilesByTags } from '../../src/query/filter';

  describe('expandTagAliases', () => {
    it('expands known aliases', () => {
      const result = expandTagAliases(['auth']);
      expect(result).toContain('authentication');
      expect(result).toContain('authorization');
      expect(result).toContain('jwt');
    });

    it('preserves taxonomy tags', () => {
      const result = expandTagAliases(['database']);
      expect(result).toContain('database');
    });

    it('handles unknown tags gracefully', () => {
      const result = expandTagAliases(['nonexistent']);
      expect(result).toHaveLength(0);
    });
  });
  ```
  - Create test files for each module
  - Use fixture data for graph/tags JSON
  - Aim for >80% coverage as stated in TASKS.md

## Implementation Priority

**Week 1: Critical fixes (blocks core functionality)**
1. Refactor 1: Complete file annotation reconstruction
2. Refactor 2: Add JSON schema validation
3. Refactor 3: Eliminate type safety bypasses

**Week 2: Maintainability improvements**
4. Refactor 4: Extract and test file reconstruction logic
5. Refactor 5: Extract magic numbers to constants
6. Refactor 6: DRY up formatter pagination logic

**Week 3: Polish and optimization**
7. Refactor 7: Tighten tag expansion behavior
8. Refactor 8: Rename getBlastRadius
9. Refactor 9: Add caching
10. Refactor 10: Remove wasteful re-ranking

**Future iterations:**
- Enhancements 1-5 as needed

## Testing Strategy

After each refactor:
1. **Unit tests**: Add tests for newly extracted functions
2. **Integration tests**: Run full query pipeline on test repository (from TASKS.md Task 12)
3. **Regression tests**: Ensure existing CLI examples still produce correct output
4. **Performance tests**: Measure query time before/after optimization refactors

## Success Metrics

- **Code quality score**: Target 800+/1000 on next audit
- **Test coverage**: >80% line coverage
- **Type safety**: Zero `as any` casts, zero non-null assertions outside type guards
- **Performance**: <100ms for queries on 500-file repos (from TASKS.md Task 6)
- **Maintainability**: All files score >70/100 individually
