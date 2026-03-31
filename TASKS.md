# rmap Implementation Tasks

This document outlines the 12-task breakdown for implementing rmap as an npm package.

---

## Task 1: Project Setup & Scaffolding

**Goal**: Initialize npm package with TypeScript setup

**What we'll create**:
- `package.json` with proper metadata, dependencies, and bin entry
- `tsconfig.json` for Node 20+ with ES modules
- Folder structure:
  ```
  src/
    cli/          # CLI commands
    levels/       # Level 0-4 implementations
    core/         # Types, constants, config
    query/        # Query engine for get-context
    coordinator/  # Pipeline orchestration
  tests/
  examples/
  ```
- `.gitignore`, `README.md` skeleton, `LICENSE`
- Build tooling (tsx/tsup for building and CLI execution)
- Basic npm scripts (build, dev, test, lint)

**Dependencies to add**:
- TypeScript, tsx, tsup
- Commander.js (CLI)
- Anthropic SDK or similar (for LLM calls)
- tree-sitter (optional, for import extraction)

**Success criteria**: Can run `pnpm install`, `pnpm build`, and `pnpm link` successfully

---

## Task 2: Define Core Types & Constants

**Goal**: Create TypeScript interfaces and constants that define the map structure

**What we'll create**:
- `src/core/constants.ts`:
  - `TAG_TAXONOMY` array (all predefined tags from idea.md)
  - `SCHEMA_VERSION = "1.0"`
  - Tag aliases mapping (auth → [authentication, authorization, jwt, ...])
  - Update thresholds (20, 100 files)

- `src/core/types.ts`:
  - `FileAnnotation` interface (path, language, size, purpose, tags, exports, imports)
  - `MetaJson` interface (schema_version, map_version, git_commit, repo_name, purpose, stack, entrypoints, modules, conventions)
  - `GraphJson` interface (file path → {imports, imported_by})
  - `TagsJson` interface (taxonomy_version, aliases, index)
  - `StatsJson` interface (files_annotated, build_time_minutes, agents_used, validation_issues)
  - `ValidationJson` interface (issues array with severity levels)
  - `TaskDelegation` interface (for Level 2 work division)

**Success criteria**: All types are well-documented with JSDoc, compile cleanly, match the examples in idea.md

---

## Task 3: Implement Level 0 - Metadata Harvester

**Goal**: Build pure script metadata extraction (no LLM, fast)

**What we'll create**:
- `src/levels/level0/harvester.ts`:
  - Recursive file tree walker (respect .gitignore, .git, node_modules)
  - Extract metadata: name, path, extension, size_bytes, line_count
  - Use tree-sitter or regex to extract raw import/require/from statements
  - Detect languages via file extensions or github-linguist integration
  - Get current git commit hash
  - Progress indicator for large repos

**Input**: Repo root path
**Output**: Raw metadata array (not yet the final map structure)

**Edge cases to handle**:
- Binary files (skip)
- Symlinks (follow or skip based on config)
- Very large files (warn if >10k lines?)
- Permission errors (warn and skip)

**Success criteria**: Run on a 500-file repo in <10 seconds, produces accurate file list with metadata

---

## Task 4: Build CLI Foundation with Commander

**Goal**: Set up CLI structure and basic commands

**What we'll create**:
- `src/cli/index.ts` - bin entry point
- `src/cli/commands/map.ts` - `rmap map` command with flags
- `src/cli/commands/get-context.ts` - `rmap get-context` command
- Help text and usage examples

**Commands to implement**:
```bash
rmap map                    # delta update (or full if no map exists)
rmap map --full             # force full rebuild
rmap map --status           # show map age, staleness verdict
rmap map --update           # update map based on git changes

rmap get-context auth middleware  # query by tags
rmap get-context --file src/db/users.py  # query by file
rmap get-context --path src/auth/        # query by directory
```

**Success criteria**:
- CLI can be invoked after `pnpm link`
- Help text displays correctly
- Commands parse arguments and flags properly
- Error handling works (friendly error messages, proper exit codes)

---

## Task 5: Implement Level 1 - Entry Point & Structure Detector

**Goal**: Use small LLM to identify repo structure and conventions

**What we'll create**:
- `src/levels/level1/detector.ts`:
  - Takes Level 0 metadata as input
  - Calls small/fast LLM (Claude Haiku recommended) with structured prompt
  - Identifies: entry points, module boundaries, config files, conventions
  - Outputs additions to `meta.json` structure

**LLM Prompt Strategy**:
- Give file tree with sizes and types
- Ask for structured JSON output
- Include examples of good convention descriptions

**Input**: Level 0 metadata + repo root
**Output**: Partial MetaJson with entrypoints, modules, config_files, conventions

**Edge cases**:
- Handle LLM API errors gracefully
- Retry logic for rate limits
- Cache results to avoid re-running on unchanged repos
- Validate LLM output structure before accepting

**Success criteria**: Correctly identifies main entry points and project conventions for common project types (Node.js, Python, Go)

---

## Task 6: Implement Query Engine - get-context Command

**Goal**: Build the core agent interface (most critical UX)

**What we'll create**:
- `src/query/index.ts` - main query orchestrator
- `src/query/filter.ts` - tag filtering with alias expansion
- `src/query/formatter.ts` - output formatting
- `src/query/ranking.ts` - relevance ranking algorithm

**Features**:
1. **Tag query**: Expand aliases (auth → authentication, authorization, jwt, etc.), find matching files
2. **File query**: Given file path, show what it depends on and what depends on it
3. **Path query**: Given directory, aggregate all files within
4. **Ranking**: Sort by graph connectivity, import/export count
5. **Output capping**: Top 10 files, show "... and 20 more" message
6. **Token budget tracking**: Aim for 450-800 tokens total

**Output format** (exactly as in idea.md):
```
═══ REPO CONTEXT ═══
[repo name, purpose, stack, entry points, structure overview]

═══ RELEVANT FILES [tags] ═══
[file path, purpose, exports listed]

═══ BLAST RADIUS ═══
[files that import the relevant files]

═══ CONVENTIONS ═══
[project conventions from meta.json]
```

**Success criteria**:
- Query returns results in <100ms (pure file I/O, no LLM)
- Output is well-formatted, under 800 tokens
- Correctly handles no results, too many results, narrow suggestions

---

## Task 7: Implement Level 2 - Work Divider

**Goal**: Use large LLM to intelligently divide annotation work

**What we'll create**:
- `src/levels/level2/divider.ts`:
  - Takes Level 0 + Level 1 output
  - Uses large LLM (Claude Sonnet) to create task delegation plan
  - Outputs task delegation JSON

**Task Delegation Structure**:
```json
{
  "tasks": [
    { "scope": "src/auth/", "agent_size": "medium", "estimated_files": 12 },
    { "scope": "src/utils/", "agent_size": "small", "estimated_files": 8 }
  ],
  "execution": "parallel",
  "estimated_total_minutes": 15
}
```

**Division Rules**:
- Max 50 files per task
- Group related files (same directory or tightly coupled)
- Choose agent_size based on complexity (small = Haiku, medium = Sonnet)
- Prefer parallel execution for speed

**Success criteria**: Divides a 500-file repo into 8-12 balanced tasks

---

## Task 8: Build Map Coordinator

**Goal**: Orchestrate the full Level 0 → Level 4 pipeline

**What we'll create**:
- `src/coordinator/index.ts`:
  - Runs Level 0 (metadata harvester)
  - Runs Level 1 (structure detector)
  - Runs Level 2 (work divider)
  - Spawns Level 3 agents based on delegation plan (parallel or sequential)
  - Collects all Level 3 outputs
  - Builds `imported_by` reverse graph
  - Assembles final `.repo_map/` files
  - Runs Level 4 (validation)
  - Writes all output files atomically

**Responsibilities**:
- Progress reporting (show current level, time elapsed)
- Error handling (retry failed agents, collect partial results)
- Conflict resolution (if two agents annotate the same file differently)
- Cost tracking (count LLM calls, tokens used)
- Stats collection (build time, agent count, etc.)

**Success criteria**:
- Full pipeline runs end-to-end
- Handles failures gracefully
- Produces valid .repo_map/ structure

---

## Task 9: Implement Level 3 - Deep File Annotator

**Goal**: The core annotation engine that reads files and produces purpose, tags, exports, imports

**What we'll create**:
- `src/levels/level3/annotator.ts`:
  - Takes a list of file paths from Level 2
  - Reads each file
  - Uses LLM to extract: purpose (1 line), tags (max 5 from taxonomy), exports, imports (internal only)
  - Returns annotations in FileAnnotation format

**LLM Prompt Strategy**:
- Give file content (truncate if >10k lines?)
- Give TAG_TAXONOMY list
- Request JSON output with purpose, tags, exports, imports
- Provide examples of good annotations

**Edge cases**:
- Malformed LLM output → retry with stricter prompt
- Tags not in taxonomy → auto-correct or drop
- Relative imports → normalize to repo-root-relative paths
- Parse export syntax for multiple languages (JS, TS, Python, Go, etc.)

**Success criteria**:
- Produces consistent, accurate annotations
- Handles 50 files in 2-5 minutes depending on agent_size
- Validates all output against schema

---

## Task 10: Implement Level 4 - Consistency Validator

**Goal**: Verify the map is internally consistent and correct

**What we'll create**:
- `src/levels/level4/validator.ts`:
  - Script-based checks (no LLM needed for most):
    - Every file in `imports` exists in the map
    - Every `imports` entry has matching `imported_by` in target file
    - No map entries point to deleted files
    - All files on disk are in the map (or .gitignored)
  - Optional LLM check:
    - Do tags make sense given the file purpose?
  - Identify orphan files (nothing imports them, not entry points)

**Output**: `validation.json` with categorized issues:
```json
{
  "issues": [
    { "severity": "error", "type": "missing_file", "file": "src/deleted.ts", "message": "..." },
    { "severity": "warning", "type": "orphan_file", "file": "src/unused.ts", "message": "..." }
  ],
  "auto_fixed": 3,
  "requires_attention": 1
}
```

**Auto-fix capability**:
- Remove map entries for deleted files
- Fix broken `imported_by` references

**Success criteria**:
- Catches all broken references
- Auto-fixes simple issues
- Flags complex issues for review

---

## Task 11: Implement Delta Update Logic

**Goal**: Make updates fast by only re-processing changed files

**What we'll create**:
- `src/coordinator/delta.ts`:
  - Git diff detection (compare `last_commit` in meta.json to HEAD)
  - Changed/added/deleted file detection
  - Decision logic: < 20 files = delta, 20-100 = delta + validation, >100 = full rebuild
  - Delta update: re-run Level 3 only on changed files
  - Graph repair: update `imported_by` for affected files
  - Regenerate `tags.json` index
  - Bump `map_version`, set `parent_version`

**Update Rules** (from idea.md):
| Condition | Action |
|-----------|--------|
| Deleted files | Remove from map (script, no LLM) |
| < 20 files changed | Delta update |
| 20-100 files changed | Delta + re-validate graph |
| > 100 files changed | Full rebuild |
| New top-level directory | Full rebuild |

**`rmap map --status` Output**:
```
Map version: 14 (delta)
Schema: 1.0
Built from: a1b2c3d (3 days ago)
Current HEAD: f5e6d7c (47 commits ahead)
Files changed since map: 23
Verdict: UPDATE RECOMMENDED
```

**Success criteria**:
- Delta update <20 files runs in ~30 seconds
- Status command accurately reports staleness
- Graph repairs maintain consistency

---

## Task 12: Testing, Documentation & Publishing Prep

**Goal**: Polish for npm publication

**What we'll create**:
- Unit tests:
  - Query engine (tag filtering, ranking, output formatting)
  - Graph building (imports → imported_by)
  - Delta update logic
- Integration tests:
  - Full pipeline on small test repo (50-100 files)
  - Delta update after simulated changes
  - All CLI commands
- Documentation:
  - Comprehensive README (installation, usage, examples)
  - CLI command reference
  - Example .repo_map/ output
  - CONTRIBUTING.md
  - GitHub Action example for auto-update
- CI/CD:
  - GitHub Actions for testing
  - Automated npm publish workflow
- Changelog:
  - v1.0.0 initial release notes

**Pre-publish checklist**:
- [ ] package.json complete (name, description, keywords, bin, files)
- [ ] README has installation instructions
- [ ] CLI works after global install
- [ ] All tests passing
- [ ] No security vulnerabilities
- [ ] License file present
- [ ] Version number set

**Success criteria**:
- Package can be installed via `npm install -g rmap`
- All examples in README work
- Tests have >80% coverage
- Ready to publish to npm

---

## Recommended Execution Order

1. **Task 1** (setup) → **Task 2** (types) — foundation
2. **Task 4** (CLI) → **Task 3** (Level 0) — early feedback loop
3. **Task 6** (query engine) with mock data — nail the UX
4. **Task 9** (Level 3) single file — core annotation
5. **Task 5** (Level 1) → **Task 7** (Level 2) — structure and division
6. **Task 8** (coordinator) — connect everything
7. **Task 10** (validation) — ensure quality
8. **Task 11** (delta updates) — make it sustainable
9. **Task 12** (testing & docs) — ship it

---

## Open Questions for Review

1. **Package name**: Should it be `rmap`, `@your-scope/rmap`, or something else?
2. **License**: MIT? (like the reference codebase)
3. **LLM provider**: Start with Anthropic SDK only, or support OpenAI/others from the start?
4. **Tree-sitter**: Use it for import extraction in Level 0, or stick with regex for v1?
5. **Monorepo vs single package**: v1 as single package, or start with monorepo structure?
6. **Testing approach**: Jest, Vitest, or Node's built-in test runner?

Please review and let me know:
- Which tasks need more detail?
- Any tasks that should be split or merged?
- Any missing considerations?
- Ready to proceed with Task 1, or want to adjust the plan first?
