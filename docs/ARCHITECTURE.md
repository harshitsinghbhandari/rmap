# Architecture

Deep dive into how `rmap` works internally.

## Table of Contents

- [Overview](#overview)
- [Pipeline Levels](#pipeline-levels)
- [File Formats](#file-formats)
- [Query Engine](#query-engine)
- [Delta Update Logic](#delta-update-logic)
- [Tag Taxonomy](#tag-taxonomy)
- [Design Decisions](#design-decisions)

## Overview

`rmap` uses a multi-level pipeline architecture to transform a raw codebase into a structured, queryable semantic map. The pipeline is designed to be:

- **Incremental**: Only re-process what changed
- **Efficient**: Minimize LLM calls for speed and cost
- **Accurate**: Validate and auto-fix consistency issues
- **Scalable**: Handle repos from 50 to 5000+ files

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      rmap map                               │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
         ┌─────────────────────────────────────┐
         │  Level 0: Metadata Harvester        │
         │  (No LLM - Pure script)             │
         │  Output: File list + imports        │
         └─────────────────────────────────────┘
                           │
                           ▼
         ┌─────────────────────────────────────┐
         │  Level 1: Structure Detector        │
         │  (LLM: Haiku)                       │
         │  Output: Entry points, modules      │
         └─────────────────────────────────────┘
                           │
                           ▼
         ┌─────────────────────────────────────┐
         │  Level 2: Work Divider              │
         │  (LLM: Sonnet)                      │
         │  Output: Task delegation plan       │
         └─────────────────────────────────────┘
                           │
                           ▼
         ┌─────────────────────────────────────┐
         │  Level 3: Deep Annotator            │
         │  (LLM: Haiku/Sonnet, Parallel)      │
         │  Output: Purpose, tags, exports     │
         └─────────────────────────────────────┘
                           │
                           ▼
         ┌─────────────────────────────────────┐
         │  Level 4: Validator                 │
         │  (Mostly script, optional LLM)      │
         │  Output: Validation report          │
         └─────────────────────────────────────┘
                           │
                           ▼
         ┌─────────────────────────────────────┐
         │  Assembler                          │
         │  Output: .repo_map/ files           │
         └─────────────────────────────────────┘
```

---

## Pipeline Levels

### Level 0: Metadata Harvester

**Purpose**: Fast, script-based extraction of file metadata.

**Inputs**:
- Repository root path
- `.gitignore` rules

**Process**:
1. Recursively walk file tree
2. Skip ignored/binary files
3. For each file:
   - Extract metadata (name, path, size, line count)
   - Detect language from extension
   - Parse raw imports using regex
   - Get git commit hash

**Outputs**:
```typescript
interface Level0Output {
  files: RawFileMetadata[]  // All files with basic metadata
  git_commit: string         // Current commit
  timestamp: string          // ISO 8601
  total_files: number
  total_size_bytes: number
}
```

**Performance**: Processes 500 files in ~5-10 seconds

**Implementation**: [`src/levels/level0/`](../src/levels/level0/)

---

### Level 1: Structure Detector

**Purpose**: Use small LLM to understand high-level repository structure.

**Inputs**:
- Level 0 output (file tree)
- Repository root path

**Process**:
1. Build compact file tree representation
2. Send to LLM (Claude Haiku) with structured prompt
3. LLM identifies:
   - Repository purpose (1 line)
   - Technology stack
   - Entry points (main files that start the app)
   - Module structure (top-level directories and their roles)
   - Configuration files
   - Project conventions

**Outputs**:
```typescript
interface Level1Output {
  repo_name: string
  purpose: string
  stack: string
  languages: string[]
  entrypoints: string[]
  modules: Module[]
  config_files: string[]
  conventions: string[]
}
```

**Example Prompt**:
```
Analyze this repository structure:

Files (523 total):
  src/
    server.ts (entry point, 245 lines)
    auth/
      jwt.ts (128 lines)
      middleware.ts (89 lines)
    db/
      models/ (12 files)
      migrations/ (23 files)
    api/
      users.ts (156 lines)
      ...
  package.json
  tsconfig.json

Identify:
1. Repository purpose (1 line)
2. Technology stack
3. Entry points
4. Module structure
5. Conventions

Return JSON in this format:
{ "purpose": "...", "stack": "...", ... }
```

**Performance**: 1 LLM call, ~10 seconds

**Implementation**: [`src/levels/level1/`](../src/levels/level1/)

---

### Level 2: Work Divider

**Purpose**: Intelligently divide annotation work into parallelizable tasks.

**Inputs**:
- Level 0 output (files to annotate)
- Level 1 output (structure)

**Process**:
1. Send file list + structure to LLM (Claude Sonnet)
2. LLM creates task delegation plan:
   - Groups related files (by module, coupling)
   - Chooses agent size (small/medium) based on complexity
   - Balances task sizes (max 50 files per task)
   - Decides parallel vs sequential execution

**Outputs**:
```typescript
interface TaskDelegation {
  tasks: DelegationTask[]
  execution: 'parallel' | 'sequential'
  estimated_total_minutes: number
}

interface DelegationTask {
  scope: string              // e.g., "src/auth/"
  agent_size: 'small' | 'medium' | 'large'
  estimated_files: number
}
```

**Example Output**:
```json
{
  "tasks": [
    { "scope": "src/auth/", "agent_size": "medium", "estimated_files": 12 },
    { "scope": "src/db/models/", "agent_size": "small", "estimated_files": 15 },
    { "scope": "src/api/", "agent_size": "medium", "estimated_files": 23 },
    { "scope": "src/utils/", "agent_size": "small", "estimated_files": 8 }
  ],
  "execution": "parallel",
  "estimated_total_minutes": 5
}
```

**Performance**: 1 LLM call, ~15 seconds

**Implementation**: [`src/levels/level2/`](../src/levels/level2/)

---

### Level 3: Deep Annotator

**Purpose**: The core annotation engine - analyzes each file semantically.

**Inputs**:
- Files in task scope (from Level 2)
- Level 1 structure (for context)
- Tag taxonomy

**Process** (per file):
1. Read file content
2. Send to LLM with structured prompt:
   - File content
   - Available tags
   - Project context
3. LLM extracts:
   - **Purpose**: 1-line description of what this file does
   - **Tags**: 1-3 tags from taxonomy (reduced for precision)
   - **Exports**: Functions, classes, types exported
   - **Imports**: Internal imports (repo-relative paths)

**Outputs**:
```typescript
interface FileAnnotation {
  path: string
  language: string
  size_bytes: number
  line_count: number
  purpose: string
  tags: Tag[]
  exports: string[]
  imports: string[]
}
```

**Example Prompt**:
```
Analyze this file:

File: src/auth/jwt.ts
Language: TypeScript
Content:
```typescript
import { sign, verify } from 'jsonwebtoken';
import { User } from '../db/models/user';

export interface TokenPayload {
  userId: string;
  role: string;
}

export function generateToken(user: User): string {
  return sign({ userId: user.id, role: user.role }, SECRET);
}

export function verifyToken(token: string): TokenPayload {
  return verify(token, SECRET) as TokenPayload;
}
```

Available tags:
- authentication, authorization, jwt, oauth, session
- database, orm, query, ...
[full taxonomy]

Extract:
1. Purpose (1 line)
2. Tags (1-5 from taxonomy)
3. Exports (function/class/type names)
4. Imports (internal only, repo-relative paths)

Return JSON:
{
  "purpose": "...",
  "tags": [...],
  "exports": [...],
  "imports": [...]
}
```

**Example Output**:
```json
{
  "path": "src/auth/jwt.ts",
  "language": "TypeScript",
  "size_bytes": 1024,
  "line_count": 32,
  "purpose": "JWT token generation and validation",
  "tags": ["authentication", "jwt"],
  "exports": ["TokenPayload", "generateToken", "verifyToken"],
  "imports": ["src/db/models/user.ts"]
}
```

**Performance**:
- **Parallel execution**: Multiple tasks run simultaneously
- **Agent size**: Haiku (fast, cheap) for simple files, Sonnet for complex
- **Throughput**: ~50 files in 2-5 minutes (depending on agent size)

**Implementation**: [`src/levels/level3/`](../src/levels/level3/)

---

### Level 4: Validator

**Purpose**: Ensure map consistency and correctness.

**Checks** (script-based, no LLM):

1. **Missing files**: Every import points to a file that exists in the map
2. **Broken references**: Every `imports` entry has matching `imported_by` in target
3. **Orphan files**: Files with no imports and not entry points (warnings)
4. **Deleted files**: Map entries for files that no longer exist on disk

**Auto-fixes**:
- Remove map entries for deleted files
- Repair broken `imported_by` references
- Normalize import paths

**Outputs**:
```typescript
interface ValidationJson {
  issues: ValidationIssue[]
  auto_fixed: number
  requires_attention: number
}

interface ValidationIssue {
  severity: 'error' | 'warning' | 'info'
  type: string
  file: string
  message: string
}
```

**Example Output**:
```json
{
  "issues": [
    {
      "severity": "error",
      "type": "missing_file",
      "file": "src/utils/deleted.ts",
      "message": "File imported by 3 others but not in map"
    },
    {
      "severity": "warning",
      "type": "orphan_file",
      "file": "src/legacy/unused.ts",
      "message": "File has no imports and is not an entry point"
    }
  ],
  "auto_fixed": 3,
  "requires_attention": 1
}
```

**Performance**: ~1-2 seconds for 500 files

**Implementation**: [`src/levels/level4/`](../src/levels/level4/)

---

## File Formats

All output files are in the `.repo_map/` directory.

### meta.json

Repository metadata and conventions.

```typescript
{
  schema_version: "1.0",
  map_version: 14,
  git_commit: "a1b2c3d",
  created_at: "2024-01-15T10:30:00Z",
  last_updated: "2024-01-18T14:22:00Z",
  parent_version: 13,
  update_type: "delta",
  files_changed: 8,

  repo_name: "my-app",
  purpose: "E-commerce API with user authentication",
  stack: "TypeScript, Node.js, Express, PostgreSQL",
  languages: ["TypeScript", "JavaScript"],

  entrypoints: [
    "src/server.ts",
    "src/cli.ts"
  ],

  modules: [
    { path: "src/auth/", description: "Authentication and authorization" },
    { path: "src/db/", description: "Database models and migrations" },
    { path: "src/api/", description: "REST API endpoints" }
  ],

  config_files: [
    "package.json",
    "tsconfig.json",
    ".env.example"
  ],

  conventions: [
    "All API routes use async/await with error boundaries",
    "Database queries use transaction wrappers",
    "Tests colocated with source files (*.test.ts)"
  ]
}
```

---

### graph.json

Bidirectional dependency graph.

```typescript
{
  "src/auth/jwt.ts": {
    imports: ["src/db/models/user.ts"],
    imported_by: [
      "src/api/users.ts",
      "src/api/admin.ts",
      "src/middleware/auth.ts"
    ]
  },
  "src/db/models/user.ts": {
    imports: ["src/db/connection.ts"],
    imported_by: [
      "src/auth/jwt.ts",
      "src/api/users.ts"
    ]
  },
  // ... all files
}
```

**Usage**: Blast radius analysis, dependency tracking

---

### tags.json

Tag index for fast lookups.

```typescript
{
  taxonomy_version: "1.0",

  aliases: {
    auth: ["authentication", "authorization", "jwt", "oauth", "session"],
    db: ["database", "orm", "query", "sql", "nosql"],
    api: ["api_endpoint", "rest", "graphql", "grpc"]
  },

  index: {
    authentication: [
      "src/auth/jwt.ts",
      "src/auth/middleware.ts",
      "src/auth/session.ts"
    ],
    jwt: [
      "src/auth/jwt.ts"
    ],
    database: [
      "src/db/connection.ts",
      "src/db/models/user.ts",
      "src/db/migrations/001_initial.ts"
    ],
    // ... all tags
  }
}
```

**Usage**: Fast tag queries in `get-context`

---

### stats.json

Build statistics.

```typescript
{
  files_annotated: 523,
  build_time_minutes: 4.2,
  levels_completed: [0, 1, 2, 3, 4],
  agents_used: 12,
  validation_issues: 3,
  last_delta_files: 8
}
```

---

### validation.json

Consistency check results.

```typescript
{
  issues: [
    {
      severity: "warning",
      type: "orphan_file",
      file: "src/legacy/old.ts",
      message: "File has no imports and is not an entry point"
    }
  ],
  auto_fixed: 3,
  requires_attention: 1
}
```

---

## Query Engine

The `get-context` command uses a multi-stage query engine:

### Stage 1: Tag Resolution

```typescript
// Input: ["auth", "middleware"]
// Step 1: Expand aliases
const expandedTags = expandAliases(["auth", "middleware"]);
// Result: ["authentication", "authorization", "jwt", "oauth", "session", "middleware"]

// Step 2: Look up files in tag index
const matchingFiles = tags.index
  .filter(tag => expandedTags.includes(tag))
  .flatMap(tag => tags.index[tag]);
// Result: ["src/auth/jwt.ts", "src/auth/middleware.ts", ...]
```

### Stage 2: File Loading

```typescript
// Load full annotations for matching files
const annotations = matchingFiles.map(path => loadAnnotation(path));
```

### Stage 3: Ranking

Rank files by relevance:

```typescript
function rank(file: FileAnnotation, queryTags: Tag[]): number {
  let score = 0;

  // 1. Tag match count (primary)
  score += file.tags.filter(t => queryTags.includes(t)).length * 10;

  // 2. Centrality (files with more imports/imported_by)
  const graph = loadGraph();
  score += graph[file.path].imports.length * 0.5;
  score += graph[file.path].imported_by.length * 1;

  // 3. File size (prefer smaller for equal scores)
  score -= file.size_bytes / 10000;

  return score;
}
```

### Stage 4: Blast Radius

```typescript
// For each matching file, collect what imports it
const blastRadius = new Set();
for (const file of matchingFiles) {
  const node = graph[file.path];
  node.imported_by.forEach(path => blastRadius.add(path));
}
```

### Stage 5: Formatting

```typescript
// Format output (human-readable or JSON)
const output = formatOutput({
  repo: meta,
  files: rankedFiles.slice(0, limit),
  blast_radius: Array.from(blastRadius),
  conventions: meta.conventions
});
```

**Performance**: <100ms for most queries (pure file I/O, no LLM)

**Implementation**: [`src/query/`](../src/query/)

---

## Delta Update Logic

Smart updates minimize rebuild time.

### Change Detection

```typescript
// Get current HEAD
const currentCommit = execSync('git rev-parse HEAD').toString().trim();

// Get commit from last map
const lastCommit = meta.git_commit;

// Get changed files
const changedFiles = execSync(
  `git diff --name-only ${lastCommit} ${currentCommit}`
).toString().split('\n');
```

### Update Decision

```typescript
function decideUpdateStrategy(changedFiles: string[]): UpdateStrategy {
  const count = changedFiles.length;

  if (count === 0) return 'none';
  if (count < 20) return 'delta';
  if (count < 100) return 'delta_with_validation';
  return 'full_rebuild';

  // Also check for structural changes
  const hasNewTopLevelDir = changedFiles.some(f =>
    f.split('/').length === 1 && fs.statSync(f).isDirectory()
  );

  if (hasNewTopLevelDir) return 'full_rebuild';
}
```

### Delta Update Process

```typescript
// 1. Run Level 0 on changed files only
const level0 = await harvestMetadata(changedFiles);

// 2. Skip Level 1 and Level 2 (structure unchanged)

// 3. Run Level 3 on changed files
const level3 = await annotateFiles(changedFiles);

// 4. Update graph (repair imported_by references)
await repairGraph(changedFiles);

// 5. Regenerate tags.json index
await rebuildTagIndex();

// 6. Run Level 4 validation
const level4 = await validate();

// 7. Bump version
meta.map_version++;
meta.parent_version = meta.map_version - 1;
meta.update_type = 'delta';
meta.files_changed = changedFiles.length;
```

**Performance**: ~30 seconds for <20 files

**Implementation**: [`src/coordinator/delta.ts`](../src/coordinator/)

---

## Tag Taxonomy

Predefined set of semantic tags used for file annotation.

### Categories

**Auth & Identity**:
- authentication, authorization, jwt, oauth, session

**Data**:
- database, orm, query, migration, sql, nosql, cache

**API & Communication**:
- api_endpoint, graphql, rest, grpc, websocket, webhook

**Architecture Patterns**:
- model, entity, dto, schema, controller, service, repository, handler, middleware, factory, adapter, interface

**Infrastructure**:
- utility, helper, config, env, constants, logging, monitoring, metrics, tracing, error_handling, validation

**Testing**:
- testing, mock, fixture, e2e_test, unit_test

**Frontend**:
- frontend, ui, component, state, routing, styling

**Backend**:
- backend, server, cli, daemon, worker, queue

**DevOps**:
- build, ci, docker, deployment, infra

**Docs & Meta**:
- documentation, types, generated, vendor, dependency_manifest

### Design Principles

1. **Closed taxonomy**: No freeform tags (ensures consistency)
2. **1-3 tags per file**: Prevents over-tagging and improves precision
3. **Semantic, not syntactic**: Tags describe purpose, not syntax
4. **Language-agnostic**: Same tags work for all languages
5. **Aliases for UX**: Shortcuts like `auth` expand to multiple tags

**Implementation**: [`src/core/constants.ts`](../src/core/constants.ts)

---

## Design Decisions

### Why 5 levels?

- **Level 0**: Fast baseline (no LLM cost)
- **Level 1**: Structure understanding (enables smart division)
- **Level 2**: Work division (enables parallelization)
- **Level 3**: Core value (semantic annotations)
- **Level 4**: Quality assurance (catch errors)

**Alternative considered**: Single-pass annotation (slower, no parallelization)

### Why Haiku vs Sonnet?

- **Haiku**: Fast, cheap, good for simple files (80% of codebases)
- **Sonnet**: Slower, more expensive, better for complex files

Level 2 chooses agent size dynamically.

### Why script-based validation?

- **Fast**: ~1 second vs. minutes with LLM
- **Deterministic**: Same inputs = same outputs
- **Cheap**: No API costs
- **Sufficient**: Most issues are structural (missing files, broken refs)

LLM validation (tag quality) can be added optionally in future.

### Why bidirectional graph?

Both `imports` and `imported_by` are stored to enable:
- **Forward queries**: What does X depend on?
- **Reverse queries**: What depends on X? (blast radius)
- **Fast lookups**: No graph traversal needed

**Alternative considered**: Store only `imports`, compute `imported_by` on demand (slower queries)

### Why 800-token output cap?

Balance between:
- **Context completeness**: Include enough for agents to work
- **Token efficiency**: Stay within typical agent context budgets
- **Relevance**: More files != better context (top 10 usually sufficient)

Empirical testing showed 450-800 tokens is optimal for most queries.

---

## Performance Characteristics

### Build Times (500-file repo)

| Build Type | Time | LLM Calls | Cost (est.) |
|------------|------|-----------|-------------|
| Full build | 4-5 min | ~60 | $0.30-0.50 |
| Delta (<20) | 30 sec | ~5 | $0.05 |
| Delta (20-100) | 2 min | ~20 | $0.15 |

### Query Times

| Query Type | Time | LLM Calls |
|------------|------|-----------|
| Tag query | <100ms | 0 |
| File query | <50ms | 0 |
| Path query | <150ms | 0 |

### Memory Usage

| Repo Size | Memory |
|-----------|--------|
| 500 files | ~50 MB |
| 2000 files | ~150 MB |
| 5000 files | ~300 MB |

### Disk Usage (.repo_map/)

| Repo Size | Disk |
|-----------|------|
| 500 files | ~2 MB |
| 2000 files | ~8 MB |
| 5000 files | ~20 MB |

---

## Future Improvements

### Potential Optimizations

1. **Incremental graph updates**: Only recompute affected subgraphs
2. **Caching**: Cache Level 1 results for unchanged structure
3. **Streaming**: Process Level 3 results as they arrive
4. **Batching**: Group small files into single LLM calls
5. **Custom taxonomies**: Allow users to define project-specific tags

### Potential Features

1. **Multi-repo maps**: Support monorepos with multiple sub-projects
2. **Historical maps**: Track map evolution over time
3. **Diff mode**: Compare maps across commits
4. **Web UI**: Visual graph explorer
5. **VS Code extension**: Inline context in editor

---

## Contributing

To contribute to the architecture:
1. Understand the pipeline flow
2. Maintain backward compatibility for file formats
3. Add tests for new levels or validators
4. Update this document with changes

See [CONTRIBUTING.md](../CONTRIBUTING.md) for details.

---

**Next**: [CLI.md](CLI.md) - Command-line reference
