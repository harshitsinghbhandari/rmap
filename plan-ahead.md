# rmap Workflows — Request for Comments

> **Author:** Harshit Singh Bhandari
> **Date:** April 4, 2026
> **Status:** Draft
> **Repository:** github.com/harshitsinghbhandari/rmap

---

## 1. Problem Statement

rmap currently produces a **file-level** semantic map — each file gets tags, imports, exports, and a one-line purpose. This is useful, but it doesn't capture **how files work together** to accomplish a task.

For multi-agent systems (like `ComposioHQ/agent-orchestrator`), an agent needs to understand **flows**: "when the orchestrator delegates a task to a worker, what files are involved, in what order, and why?" File-level tags can't answer this. You'd need to stitch together context from 5-10 individual file annotations and manually reason about the dependency graph.

**This RFC proposes adding workflow-level semantic mapping to rmap** — turning it from a file-level map into a **flow-level** map that captures cross-cutting execution paths as first-class objects.

### Target Output

An agent should be able to run:

```bash
rmap get-context --workflow orchestrator-worker
```

And get a tiny, perfectly relevant **400–600 token** context with **why each file matters in that flow** — not just what the file does, but why it's part of this specific workflow.

---

## 2. Core Concept: What is a Workflow?

A **workflow** is a named, ordered sequence of files that participate in a cross-cutting execution path through the codebase. Unlike a module (files grouped by directory/feature), a workflow spans modules and represents a **causal chain** — data or control flows from one file to the next.

### Example: Orchestrator → Worker Handoff

In `ComposioHQ/agent-orchestrator`, one workflow is:

```
CLI dispatches → session-manager creates session → lifecycle-manager starts polling →
agent plugin sends message → message bus routes → worker receives →
worker updates session state → orchestrator reads result
```

**Files involved:**

| File | Role | Why it's here |
|---|---|---|
| `src/session-manager.ts` | State management | Maintains shared session state, message queue, and correlation IDs between orchestrator and worker |
| `src/lifecycle-manager.ts` | Lifecycle control | Polling loop that triggers agent execution and monitors state transitions |
| `src/message-bus.ts` | Message passing | Handles async message passing, retries, and failure recovery for agent-to-agent communication |
| `src/agent-selector.ts` | Agent routing | Determines which agent plugin handles the delegated task |

---

## 3. Data Model

### 3.1 Output: `.repo_map/workflows.json`

```ts
export interface WorkflowFileEntry {
  path: string;
  reason: string;           // LLM-filled, 1-2 sentences, why THIS file in THIS workflow
  role?: string;            // optional e.g. "state-management", "message-passing"
}

export interface WorkflowDefinition {
  id: string;               // slug, e.g. "orchestrator-worker"
  name: string;
  description: string;
  files: WorkflowFileEntry[];
  entryPoint?: string;
  tags: string[];           // reuses existing tag taxonomy + new ones like "multi-agent"
  participants?: string[];  // e.g. ["orchestrator", "worker-agent"]
  lastUpdated: string;
  version: number;
}

export interface WorkflowsJson {
  schemaVersion: 1;
  workflows: Record<string, WorkflowDefinition>; // keyed by id
}
```

### 3.2 Example Output

```json
{
  "schemaVersion": 1,
  "workflows": {
    "orchestrator-worker": {
      "id": "orchestrator-worker",
      "name": "Orchestrator talking to worker agent",
      "description": "Core handoff flow when the orchestrator delegates a task to a parallel worker agent",
      "files": [
        {
          "path": "src/session-manager.ts",
          "reason": "Maintains shared session state, message queue, and correlation IDs between orchestrator and worker",
          "role": "state-management"
        },
        {
          "path": "src/message-bus.ts",
          "reason": "Handles async message passing, retries, and failure recovery for agent-to-agent communication",
          "role": "message-passing"
        },
        {
          "path": "src/agent-selector.ts",
          "reason": "Determines which agent plugin handles the delegated task based on task metadata",
          "role": "agent-routing"
        },
        {
          "path": "src/lifecycle-manager.ts",
          "reason": "Polling loop that triggers agent execution and monitors state transitions during the handoff",
          "role": "lifecycle-control"
        }
      ],
      "entryPoint": "src/orchestrator/main.ts",
      "tags": ["multi-agent", "communication", "handoff", "state-management"],
      "participants": ["orchestrator", "worker"],
      "lastUpdated": "2026-04-04T23:45:12Z",
      "version": 3
    }
  }
}
```

### 3.3 Index in `meta.json`

Add lightweight index fields for fast listing without loading the full workflows file:

```json
{
  "workflowIds": ["orchestrator-worker", "auth-flow", "config-reload"],
  "workflowNames": {
    "orchestrator-worker": "Orchestrator talking to worker agent",
    "auth-flow": "Authentication and authorization flow",
    "config-reload": "Configuration hot-reload path"
  }
}
```

---

## 4. Implementation Plan

### Phase 1: User-Defined Workflows (Foundation)

**Goal:** Users define workflow skeletons in a config file; rmap fills in the semantic `reason` fields automatically.

**Estimated effort:** 250–350 LOC new code + 1 prompt template. ~2-3 days.

#### 4.1 Config File: `.repo_map/workflows.config.json`

```json
{
  "workflows": [
    {
      "id": "orchestrator-worker",
      "name": "Orchestrator talking to worker agent",
      "description": "Core handoff flow when the orchestrator delegates a task to a parallel worker agent",
      "files": [
        "src/session-manager.ts",
        "src/message-bus.ts",
        "src/agent-selector.ts",
        "src/lifecycle-manager.ts"
      ],
      "entryPoint": "src/orchestrator/main.ts"
    }
  ]
}
```

The user provides: **id, name, description, file list, entry point.**
rmap generates: **reason per file, role, tags, version.**

#### 4.2 Pipeline Integration

Insert a new lightweight level after Level 3 (Deep Annotator):

```
Level 0 (Harvest)
  → Level 1 (Structure Detection)
    → Level 2 (Work Division)
      → Level 3 (Deep Annotation)
        → [NEW] Level Workflow (Reason Extraction)
          → Level 4 (Validation)
            → Assembler
```

**New level details:**
- **Location:** `src/levels/level-workflow/`
- **Pattern:** Same as `level1/` and `level3/` (prompt template + LLM call + typed output)
- **Model:** Claude Haiku (cheap, fast — 1 call per workflow)
- **Input:** Workflow file list + existing Level 3 annotations + graph context
- **Output:** `WorkflowDefinition` with `reason` and `role` fields filled in

**Coordinator changes** (`src/coordinator/index.ts`):
- Insert the new level call (one-line change in the pipeline sequence)
- Add checkpoint key for workflow level
- Wire up to Assembler

**Assembler changes:**
- Write `workflows.json` to `.repo_map/`
- Update `meta.json` with `workflowIds` and `workflowNames` index

#### 4.3 CLI Commands

New file: `src/cli/commands/workflow.ts`

```bash
rmap workflow list                  # Table of all workflows (id, name, file count, version)
rmap workflow <id>                  # Rich context: files + reasons + scoped blast radius
rmap workflow build                 # Re-generate reasons for all workflows
rmap workflow edit <id>             # Open config for manual editing (future)
rmap workflow discover              # Auto-discover workflows from code (Phase 2)
```

Shortcut integration:
```bash
rmap get-context --workflow orchestrator-worker
```

#### 4.4 Query Engine Extension

Add `WorkflowQuery` handler to `src/query/`:

1. Load `workflows.json`
2. Pull exact files + reasons for the requested workflow
3. Run blast-radius logic **scoped to workflow files only** (not full graph)
4. Output format identical to existing `get-context` output (agents need zero new parsing logic)

#### 4.5 Delta Strategy

Extend existing git-diff-based delta logic:

| Condition | Action |
|---|---|
| No workflow files changed | Skip workflow level entirely |
| <3 workflow files changed | Re-run only affected workflows |
| Any entry point changed | Re-run all workflows touching that entry point |
| >10 workflow files changed | Re-run all workflows |

**Edge cases to handle:**
- Renamed files (git detects renames — update workflow file paths)
- Deleted files that were in a workflow (remove from workflow, flag in validation)
- New files in a directory that's part of a workflow (suggest adding to workflow, don't auto-add)

#### 4.6 Validation (Level 4 Extension)

Add workflow-specific checks:
- All files in a workflow still exist
- No duplicate files across workflows (warn, don't error)
- Entry point exists and is reachable from at least one workflow file
- No orphan workflows (workflows with 0 valid files)

### Phase 1 Difficulty Assessment

| Piece | Difficulty | Notes |
|---|---|---|
| Types (`workflow.ts`) | **Trivial** | Copy interfaces as-is |
| Config loader | **Easy** | Follow existing config patterns |
| Level Workflow (prompt + Haiku) | **Easy-Medium** | One prompt, one LLM call per workflow. Prompt design is the value prop. |
| Coordinator integration | **Medium** | Pipeline insertion is one line, but checkpoint keys + delta detection + graceful shutdown need care |
| Assembler | **Easy** | Another JSON file in `.repo_map/` |
| CLI commands | **Easy** | Commander boilerplate, copy existing patterns |
| Query engine | **Easy-Medium** | Scoped blast radius is the interesting bit |
| Delta strategy | **Medium-Hard** | Git diff → workflow file matching → selective re-run. Edge cases: renames, deletes |
| Validation | **Easy** | Existence checks + reachability |

---

## 5. Enhancement Proposals (10x Vision)

The Phase 1 plan is solid, shippable, and provides immediate value. But it has a limitation: **the user must manually define which files form a workflow.** This section proposes four enhancements that progressively make rmap more autonomous and more powerful.

### 5.1 Automatic Workflow Discovery

**Problem:** Requiring `workflows.config.json` means the user must already understand the codebase well enough to identify cross-cutting flows. For large or unfamiliar codebases, this is a significant burden.

**Proposal:** Extend Level 2 (Work Division) to also identify workflows. Level 2 already receives the full file list + import graph. Add a secondary Sonnet call that says:

> *"Given this file tree and import graph, identify 3-7 cross-cutting workflows — sequences of files where data or control flows across module boundaries. For each workflow, provide the ordered file list and a description of the flow."*

**Output:** Same `WorkflowDefinition` structure, written to `workflows.json` automatically.

**How it works:**
1. Level 2 groups files by module (existing behavior)
2. New secondary prompt analyzes **cross-module edges** in the import graph
3. Clusters cross-module edges into coherent flows
4. Returns ordered file lists with descriptions
5. User can override via `workflows.config.json` (manual definitions take priority)

**Why this is hard:**
- Distinguishing "files in the same module" from "files forming a causal chain" requires understanding intent, not just structure
- Getting reliable ordering (which file executes first?) from static analysis is non-trivial
- The LLM might conflate "these files are often imported together" with "these files form a flow"
- Prompt engineering is critical — need to constrain the LLM to produce flows, not just clusters

**Difficulty:** **Hard** (prompt engineering + quality validation)

### 5.2 Dynamic Call Graph Tracing

**Problem:** Static imports tell you *what connects to what*, not *how data flows at runtime*. The import graph is undirected (A imports B, B imports A) and doesn't capture:
- Event-driven communication (emit/on/subscribe)
- Runtime polymorphism (interface → multiple implementations)
- Conditional paths (if/else branching to different modules)
- Async chains (Promise.then, async/await, callback nesting)

**Proposal:** Build an AST-level control flow analyzer for JS/TS that produces a **directed dataflow graph** — not just "A depends on B" but "A calls B.foo(), which emits 'done', which triggers C.handler()".

**How it works:**

Using Babel (already in the project for Level 0 import extraction):

1. **Function call tracking:** Visitor that records `importedSymbol.method()` calls, resolving through re-exports
2. **Event pattern detection:** Regex + AST matching for `.emit()`, `.on()`, `.subscribe()`, `.addEventListener()`, event emitter constructors
3. **Promise chain tracing:** Follow `.then()`, `.catch()`, `await` chains across file boundaries
4. **Return value propagation:** Track what a function returns and where that return value is used as an argument

**Output:** A directed graph where edges represent actual runtime control/data flow, not just static dependencies.

**Then:** Cluster this directed graph into workflows automatically using graph analysis algorithms (strongly connected components → entry/exit point detection → path extraction).

**Why this is genuinely hard:**
- This is essentially a subset of the program analysis problem that compiler researchers have worked on for decades
- Dynamic dispatch (polymorphism) means you can't always statically determine which function gets called
- Event-driven architectures create implicit control flow that doesn't appear in the AST
- Cyclic dependencies create infinite loops in naive graph traversal
- Accuracy degrades significantly for highly dynamic patterns (proxy objects, reflect APIs, eval)

**Difficulty:** **Very Hard** (this is a real program analysis problem, not just prompt engineering)

### 5.3 Workflow Evolution Tracking

**Problem:** Workflows change over time as the codebase evolves. Currently, rmap generates a snapshot. There's no way to see *how* a workflow changed between versions.

**Proposal:** Store workflow definitions alongside each map build and diff them across git commits.

**How it works:**

1. Each `rmap map` run writes `workflows.json` with a `version` field (already in the data model)
2. Additionally, store a git-tagged snapshot: `.repo_map/history/workflows.<short-sha>.json`
3. On subsequent runs, diff the new workflows against the last stored snapshot
4. Output `workflow-changes.json`:

```json
{
  "baseSha": "abc1234",
  "headSha": "def5678",
  "changes": {
    "orchestrator-worker": {
      "type": "modified",
      "addedFiles": ["src/retry-handler.ts"],
      "removedFiles": [],
      "changedReasons": ["src/session-manager.ts"],
      "entryPointChanged": false
    },
    "auth-flow": {
      "type": "removed",
      "reason": "All files in this workflow were deleted or merged into session-manager.ts"
    },
    "config-reload": {
      "type": "added",
      "files": ["src/config-watcher.ts", "src/config-loader.ts"]
    }
  }
}
```

**Agent query support:**
```bash
rmap workflow diff orchestrator-worker     # what changed in this workflow?
rmap workflow diff --since 2 weeks ago     # what workflows changed recently?
rmap workflow history orchestrator-worker  # full version history
```

**Why this matters:** An agent reviewing a PR can ask "what workflows does this PR touch?" and get an immediate, accurate answer. This is especially powerful for multi-agent systems where a change to the message bus might affect 3 different workflows.

**Difficulty:** **Medium** (git integration + JSON diffing, straightforward engineering)

### 5.4 Runtime-Validated Workflows

**Problem:** All of the above is static analysis. The discovered workflows are theoretical — they represent what *should* happen based on code structure, not what *actually* happens at runtime. For complex systems, these can diverge significantly.

**Proposal:** Integrate with runtime tracing to validate that discovered workflows match actual execution paths.

**How it works:**

1. **Instrument the codebase:** Lightweight monkey-patching of key patterns (function calls, event emissions, promise resolutions) that records caller → callee relationships at runtime
2. **Run the test suite (or production traffic sample):** Collect actual call sequences
3. **Compare:** Match runtime traces against rmap's predicted workflows
4. **Report:**
   - **Coverage:** "Workflow X is exercised by 12 tests, covers 8/10 files"
   - **Mismatches:** "Predicted flow: A → B → C. Actual flow: A → D → C (file B is never reached in this workflow)"
   - **Dead flows:** "Workflow Y has no runtime evidence — may be theoretical or deprecated"
   - **Hidden flows:** "Runtime shows frequent A → E → F path not captured in any workflow"

**Implementation options:**

| Approach | Pros | Cons |
|---|---|---|
| Node.js `--inspect` + CDP | No code changes, rich data | Complex setup, heavy for CI |
| Lightweight `console.log` wrapping | Simple, fast | Requires code modification |
| Custom V8 coverage + AST mapping | No runtime overhead | Limited to function-level granularity |
| Test coverage mapping | Uses existing data | Only captures tested paths |

**Difficulty:** **Very Hard** (runtime instrumentation, data collection at scale, trace → workflow matching)

---

## 6. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Add types to `src/core/workflow.ts`
- [ ] Create `src/levels/level-workflow/` (prompt template + LLM call)
- [ ] Update coordinator to call the new level
- [ ] Update Assembler to write `workflows.json` + meta.json index
- [ ] Add config loader for `workflows.config.json`
- [ ] Create `src/cli/commands/workflow.ts` + register in CLI
- [ ] Extend query engine (`--workflow` flag)
- [ ] Update delta strategy (workflow-aware invalidation)
- [ ] Update Level 4 validation (workflow-specific checks)
- [ ] Add tests
- [ ] Update README + ARCHITECTURE.md + CLI.md

**Deliverable:** User-defined workflows with auto-generated semantic reasons. Query support. Delta updates.

### Phase 2: Discovery (Week 3-4)
- [ ] Design and iterate on workflow discovery prompt
- [ ] Extend Level 2 with secondary Sonnet call for cross-module flow detection
- [ ] Add `rmap workflow discover` command
- [ ] Implement user-override priority (manual config > auto-discovered)
- [ ] Quality validation (compare discovered vs. expected workflows on known codebases)

**Deliverable:** Automatic workflow discovery. Zero-config for new codebases.

### Phase 3: Evolution (Week 5)
- [ ] Implement workflow versioning with git SHA tracking
- [ ] Build workflow diff engine
- [ ] Add `rmap workflow diff` and `rmap workflow history` commands
- [ ] Store historical snapshots in `.repo_map/history/`

**Deliverable:** Workflow change tracking across commits.

### Phase 4: Deep Analysis (Week 6+)
- [ ] Build AST-level call graph tracer for JS/TS
- [ ] Event pattern detection (emit/on/subscribe)
- [ ] Promise chain tracing across file boundaries
- [ ] Graph clustering → automatic workflow extraction
- [ ] Compare static workflows against call graph workflows

**Deliverable:** Directed dataflow graph. More accurate workflow discovery.

### Phase 5: Runtime Validation (Future)
- [ ] Instrumentation layer design
- [ ] Trace collection during test runs
- [ ] Trace → workflow matching algorithm
- [ ] Coverage and mismatch reporting
- [ ] CI integration

**Deliverable:** Runtime-validated workflows with coverage metrics.

---

## 7. Prompt Template (Phase 1 — Reason Extraction)

For the Level Workflow prompt that generates the `reason` and `role` fields:

```
You are analyzing files that participate in a specific workflow within a codebase.

WORKFLOW: {workflow.name}
DESCRIPTION: {workflow.description}

FILES IN THIS WORKFLOW:
{for each file:}
- {file.path}
  Purpose: {existing level-3 annotation}
  Exports: {exports from level-3}
  Imports from other workflow files: {filtered from graph.json}

DEPENDENCY CONTEXT (how these files connect):
{extract from graph.json: edges between workflow files}

TAG TAXONOMY (pick from these):
{existing tag list}

TASK: For each file, provide:
1. "reason": 1-2 sentences explaining why THIS file is part of THIS specific workflow.
   Focus on what role it plays in the flow, not just what the file does generally.
2. "role": A short slug describing its function in this workflow (e.g. "state-management",
   "message-passing", "entry-point", "validation", "routing").
3. "tags": 1-3 tags from the taxonomy that describe this file's role in the workflow.

Return ONLY valid JSON matching this exact schema:
{
  "files": [
    {
      "path": "...",
      "reason": "...",
      "role": "...",
      "tags": ["...", "..."]
    }
  ]
}
```

---

## 8. Open Questions

1. **Workflow ordering:** Should files in a workflow be ordered by execution sequence, dependency order, or alphabetical? Execution sequence is most useful but hardest to determine statically.

2. **Workflow overlap:** Should the same file appear in multiple workflows? Yes, but should we warn about heavy overlap (same file in >5 workflows)?

3. **Workflow granularity:** What's the right size for a workflow? 3 files? 10 files? 30 files? Too small = noise. Too large = useless context. Suggestion: 3-15 files per workflow.

4. **Tag taxonomy extension:** Do we need new tags beyond the existing ~60? Candidates: `multi-agent`, `handoff`, `dataflow`, `event-driven`, `lifecycle`, `configuration`.

5. **Breaking changes:** Does `workflows.json` need schema versioning from day one? Yes — set `schemaVersion: 1` and plan for migration paths.

6. **Non-JS/TS repos:** How much of this works for Python, Go, Rust codebases? The config-driven approach (Phase 1) works universally. Discovery (Phase 2) depends on import extraction quality per language. Call graph tracing (Phase 4) needs per-language AST support.

---

## 9. Summary

| Phase | What | Hard | Effort | Value |
|---|---|---|---|---|
| **1** | User-defined workflows + auto reasons | Medium | 2-3 days | High — immediately useful |
| **2** | Auto-discovery from code | Hard | 1-2 weeks | Very High — zero-config |
| **3** | Evolution tracking | Medium | 1 week | High — PR review superpower |
| **4** | Call graph tracing | Very Hard | 2-4 weeks | Transformative — accurate flows |
| **5** | Runtime validation | Very Hard | 4+ weeks | Ultimate — verified workflows |

**The path:** Phase 1 ships fast and provides immediate value. Phase 2 makes it zero-config. Phases 3-5 progressively make workflows more accurate and more powerful. Each phase is independently valuable — no single phase is a blocker for the others.

---

*"This makes rmap the de-facto context engine for any agent-orchestrator codebase."*
