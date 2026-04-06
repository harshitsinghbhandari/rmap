# Architecture

Deep dive into how `rmap` works internally.

## Table of Contents

- [Overview](#overview)
- [Pipeline Levels](#pipeline-levels)
- [File Formats](#file-formats)
- [Query Engine](#query-engine)
- [Delta Update Logic](#delta-update-logic)
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
         │  Level 2.5: LOC Balancer           │
         │  (Script - LOC based grouping)      │
         │  Output: Refined task list          │
         └─────────────────────────────────────┘
                           │
                           ▼
         ┌─────────────────────────────────────┐
         │  Level 3: Deep Annotator            │
         │  (LLM: Haiku/Sonnet, Parallel)      │
         │  Output: Purpose, exports           │
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

**Performance**: 1 LLM call, ~15 seconds

**Implementation**: [`src/levels/level2/`](../src/levels/level2/)

---

### Level 3: Deep Annotator

**Purpose**: The core annotation engine - analyzes each file semantically.

**Inputs**:
- Files in task scope (from Level 2)
- Level 1 structure (for context)

**Process** (per file):
1. Read file content
2. Send to LLM with structured prompt:
   - File content
   - Project context
3. LLM extracts:
   - **Purpose**: 1-line description of what this file does
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

Extract:
1. Purpose (1 line)
2. Exports (function/class/type names)
3. Imports (internal only, repo-relative paths)

Return JSON:
{
  "purpose": "...",
  "exports": [...],
  "imports": [...]
}
```

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

### Stage 1: Path Resolution

Queries are matched against file paths and directory structures.

### Stage 2: File Loading

```typescript
// Load full annotations for matching files
const annotations = matchingFiles.map(path => loadAnnotation(path));
```

### Stage 3: Ranking

Rank files by relevance using centrality and structural information:

```typescript
function rank(file: FileAnnotation, graph: GraphJson): number {
  let score = 0;

  // 1. Centrality (files with more imports/imported_by)
  score += graph[file.path].imports.length * 0.5;
  score += graph[file.path].imported_by.length * 1;

  // 2. File size (prefer smaller for equal scores)
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

// 5. Run Level 4 validation
const level4 = await validate();

// 6. Bump version
meta.map_version++;
meta.parent_version = meta.map_version - 1;
meta.update_type = 'delta';
meta.files_changed = changedFiles.length;
```

**Implementation**: [`src/coordinator/delta.ts`](../src/coordinator/)

---

## Design Decisions

### Why 5 levels?
- **Level 0**: Fast baseline (no LLM cost)
- **Level 1**: Structure understanding (enables smart division)
- **Level 2**: Work division (enables parallelization)
- **Level 2.5**: LOC balancing (optimizes token usage and task size)
- **Level 3**: Core value (semantic annotations)
- **Level 4**: Quality assurance (catch errors)

### Why Haiku vs Sonnet?

- **Haiku**: Fast, cheap, good for simple files (80% of codebases)
- **Sonnet**: Slower, more expensive, better for complex files

### Why script-based validation?

- **Fast**: ~1 second vs. minutes with LLM
- **Deterministic**: Same inputs = same outputs
- **Cheap**: No API costs
- **Sufficient**: Most issues are structural (missing files, broken refs)

### Why bidirectional graph?

Both `imports` and `imported_by` are stored to enable:
- **Forward queries**: What does X depend on?
- **Reverse queries**: What depends on X? (blast radius)
- **Fast lookups**: No graph traversal needed

### Why 800-token output cap?

Balance between:
- **Context completeness**: Include enough for agents to work
- **Token efficiency**: Stay within typical agent context budgets
- **Relevance**: More files != better context (top 10 usually sufficient)

Empirical testing showed 450-800 tokens is optimal for most queries.
