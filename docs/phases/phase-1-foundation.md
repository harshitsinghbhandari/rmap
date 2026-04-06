# Phase 1: Foundation

> **Status:** Ready to implement
> **Effort:** ~350-450 LOC, 2-3 days
> **Difficulty:** Medium
> **Prerequisites:** Level 0 symbol extraction (PR #88 - merged)

---

## Overview

Build the core workflow infrastructure: function-level graph extraction, automatic workflow discovery, user-defined workflows, and LLM-polished annotations. This phase delivers a complete, usable workflow system.

---

## Goals

1. Extract function-level import/export graph from existing Level 0 data
2. Implement automatic workflow discovery via graph algorithms
3. Support user-defined workflows with auto-generated reasons
4. Integrate into the existing Level 0-4 pipeline
5. Add CLI commands and query engine support

---

## Key Deliverables

| Deliverable | Output |
|-------------|--------|
| Function-level graph | `.repo_map/function-graph.json` |
| Workflow definitions | `.repo_map/workflows.json` |
| User config support | `.repo_map/workflows.config.json` |
| Meta index | `workflowIds` and `workflowNames` in `meta.json` |
| CLI commands | `rmap workflow list/discover/<id>/graph` |
| Query support | `rmap get-context --workflow <id>` |

---

## Implementation Steps

### 1. Data Model Types (`src/core/workflow.ts`)

```ts
// FunctionGraphNode, FunctionGraphEdge, FunctionGraphJson
// WorkflowFileEntry, WorkflowDefinition, WorkflowsJson
```

Trivial - interfaces already defined in RFC.

### 2. Function Graph Builder (`src/coordinator/assembler.ts`)

Add assembler pass to build `function-graph.json` from Level 0's `import_data`:

```
For each file:
  For each named import { symbol, source }:
    Add edge: source:symbol → file:symbol
  For each named export:
    Add node: file:symbol (type: export)
  For each re-export { symbol, source }:
    Add edge: source:symbol → file:symbol (type: re-export)
```

Compute `fileAdjacency` index for fast lookups. ~100-150 LOC.

### 3. Discovery Algorithm (`src/core/workflow-discovery.ts`)

```ts
export function discoverWorkflows(
  functionGraph: FunctionGraphJson,
  entryPoints: string[],
  options: DiscoveryOptions
): WorkflowCandidate[]
```

**Algorithm:**
1. BFS trace from each entry point (with `visited` set for cycles)
2. Merge overlapping paths (Jaccard > 0.6)
3. Filter noise (utilities >70% imports, type-only, shallow <3 files, circular)
4. Sort files by traversal order

**Options:**
- `minFiles: 3` — skip tiny workflows
- `maxFiles: 12` — cap for context window fit
- `mergeThreshold: 0.6` — Jaccard similarity
- `utilityThreshold: 0.7` — utility file detection
- `excludePatterns: string[]` — globs to exclude

~150 LOC.

### 4. Config Loader (`src/coordinator/workflow-config.ts`)

Load and validate `.repo_map/workflows.config.json`:

```json
{
  "workflows": [{
    "id": "orchestrator-worker",
    "name": "Orchestrator talking to worker",
    "files": ["src/session-manager.ts", ...],
    "entryPoint": "src/main.ts"
  }]
}
```

User provides: id, name, description, files, entryPoint.
rmap generates: reason, role, keySymbols, version.

### 5. Level Workflow (`src/levels/level-workflow/`)

New lightweight level after Level 3:

```
Level 3 → Assembler builds function-graph.json → Level Workflow → Level 4
```

**Three modes:**
| Mode | Trigger | Behavior |
|------|---------|----------|
| User | `workflows.config.json` exists | Use user file lists, LLM fills reasons |
| Discovery | No config or `--discover` flag | Graph algorithm finds workflows, LLM polishes |
| Hybrid | Both config + `--discover` | User workflows priority, discovered fill gaps |

**LLM Polish (one Haiku call per workflow):**
- Name the workflow (2-5 words)
- Describe it (1-2 sentences)
- Fill `reason` per file (why it's in this flow)
- Assign `role`
- Prune false positives

~100 LOC.

### 6. CLI Commands (`src/cli/commands/workflow.ts`)

```bash
rmap workflow list                     # Table of all workflows
rmap workflow <id>                     # Rich context with reasons
rmap workflow discover                 # Run discovery + polish
rmap workflow discover --dry-run       # Preview without writing
rmap workflow graph <id>               # Function-level graph for workflow
rmap get-context --workflow <id>       # Query shortcut
```

~100 LOC.

### 7. Query Engine Extension (`src/query/workflow-query.ts`)

```bash
rmap get-context --symbol createSession              # Which workflows use this symbol?
rmap get-context --workflow orchestrator-worker       # Files + reasons + symbol flow
rmap get-context --blast-radius src/x.ts --workflow Y # Scoped blast radius
```

~100 LOC.

### 8. Delta Strategy

**Simple v1 approach (recommended):**
- Re-run all workflows if any workflow file changes
- Skip entirely if no workflow files changed

**Future precision (deferred):**
- Track which symbols changed per commit
- Re-trace only affected workflows

### 9. Validation (Level 4 Extension)

Add workflow-specific checks:
- All files in workflow still exist
- All `keySymbols` still exist in their files
- Function-level edges still exist in graph
- No orphan workflows (0 valid files)
- Entry point is reachable
- Warn: file in >5 workflows (likely utility)
- Warn: workflow has no function-level edges

---

## Difficulty Assessment

| Component | Difficulty | LOC |
|-----------|------------|-----|
| Types | Trivial | 50 |
| Function graph assembler | Easy | 100-150 |
| Discovery algorithm | Medium | 150 |
| Config loader | Easy | 50 |
| Level Workflow (LLM) | Easy-Medium | 100 |
| Coordinator integration | Medium | 100 |
| CLI commands | Easy | 100 |
| Query engine | Easy-Medium | 100 |
| Delta strategy (simple) | Easy | 30 |
| Validation | Easy-Medium | 70 |
| **Total** | **Medium** | **~400** |

---

## Success Criteria

- [ ] `function-graph.json` generated with nodes and edges
- [ ] `rmap workflow discover` finds workflows from entry points
- [ ] User-defined workflows in config get LLM-polished reasons
- [ ] `rmap workflow list` shows all workflows
- [ ] `rmap get-context --workflow <id>` returns <600 tokens
- [ ] All existing tests pass
- [ ] New tests for discovery algorithm and config loader

---

## Key Design Decisions

1. **Graph traversal order** for file ordering (represents import chain)
2. **70% threshold** for utility file detection (configurable)
3. **0.6 Jaccard threshold** for merging overlapping paths (configurable)
4. **Exclude type-only imports** from graph (store separately for conceptual analysis)
5. **Collapse barrel files** (index.ts with only re-exports)
6. **Max 12 files** per workflow (fits context window target)
7. **Simple delta strategy** for v1 (re-run all on change)

---

## References

- RFC Section 3: The Key Insight (Function-Level Graph)
- RFC Section 4: Data Model
- RFC Section 5: Workflow Discovery Algorithm
- RFC Section 6: Implementation Plan
- RFC Section 9: Prompt Template
