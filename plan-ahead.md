# rmap Workflows — Request for Comments

> **Author:** Harshit Singh Bhandari
> **Date:** April 4, 2026
> **Status:** Draft v2
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

## 3. The Key Insight: Function-Level Import/Export Graph

### Why File-Level Imports Aren't Enough

rmap's Level 0 already captures which files import from which files. But file-level edges are vague:

```
lifecycle-manager.ts → session-manager.ts
```

That tells you they're connected. It doesn't tell you *what flows between them*.

### What We Already Have

Level 0's Babel AST parser already extracts **function-level imports and exports** for JS/TS:

```
session-manager.ts    EXPORTS: createSession, getSession, updateSession
lifecycle-manager.ts  IMPORTS:  createSession, getSession FROM session-manager
                      EXPORTS:  startPolling, stopPolling
agent-selector.ts     IMPORTS:  startPolling FROM lifecycle-manager
```

**This is a function-level directed graph.** And it's already 90% of the data we need — no new parsing, no new LLM calls, no call graph tracing.

### Why Function-Level Changes Everything

File-level graph: `lifecycle-manager.ts → session-manager.ts`
→ "These files are connected." **Vague. Useless for workflow detection.**

Function-level graph: `lifecycle-manager.ts` imports `createSession` from `session-manager.ts`
→ "Lifecycle manager *uses* session creation." **Actionable. This is a workflow edge.**

The function-level graph is:
- **Directed** — you know which way data/control flows (exporter → importer)
- **Symbol-specific** — you know *what* flows, not just that *something* flows
- **Already extracted** — Level 0 Babel parsing gives you this for free
- **Queryable** — "what files use `createSession`?" is a simple graph lookup

### Turning Function-Level Graphs Into Workflows

Build a graph where **nodes are `file:symbol`** and **edges are import relationships**. Then run path-finding:

```
entryPoint (main.ts)
  → imports delegate (agent-selector.ts)
    → imports startPolling (lifecycle-manager.ts)
      → imports createSession (session-manager.ts)
      → imports sendMessage (message-bus.ts)
```

That path **is** the orchestrator→worker workflow. No LLM needed for discovery. Just graph traversal from entry points.

**The workflow discovery problem reduces to: graph algorithms + LLM polish.**

---

## 4. Data Model

### 4.1 Function-Level Graph: `.repo_map/function-graph.json`

New intermediate output from the assembler. This is the raw graph that powers everything else.

```ts
export interface FunctionGraphNode {
  file: string;         // e.g. "src/session-manager.ts"
  symbol: string;       // e.g. "createSession"
  type: "import" | "export" | "re-export";
}

export interface FunctionGraphEdge {
  from: { file: string; symbol: string };  // exporter
  to: { file: string; symbol: string };    // importer
  type: "import" | "re-export" | "dynamic-import";
}

export interface FunctionGraphJson {
  schemaVersion: 1;
  nodes: FunctionGraphNode[];
  edges: FunctionGraphEdge[];
  // Pre-computed file-level adjacency for quick lookups
  fileAdjacency: Record<string, { imports: string[]; exports: string[]; importedBy: string[] }>;
}
```

**Example:**
```json
{
  "nodes": [
    { "file": "src/session-manager.ts", "symbol": "createSession", "type": "export" },
    { "file": "src/session-manager.ts", "symbol": "getSession", "type": "export" },
    { "file": "src/lifecycle-manager.ts", "symbol": "startPolling", "type": "export" },
    { "file": "src/lifecycle-manager.ts", "symbol": "createSession", "type": "import" }
  ],
  "edges": [
    {
      "from": { "file": "src/session-manager.ts", "symbol": "createSession" },
      "to": { "file": "src/lifecycle-manager.ts", "symbol": "createSession" },
      "type": "import"
    },
    {
      "from": { "file": "src/lifecycle-manager.ts", "symbol": "startPolling" },
      "to": { "file": "src/agent-selector.ts", "symbol": "startPolling" },
      "type": "import"
    }
  ],
  "fileAdjacency": {
    "src/session-manager.ts": {
      "exports": ["createSession", "getSession", "updateSession"],
      "imports": ["EventEmitter"],
      "importedBy": ["src/lifecycle-manager.ts", "src/agent-selector.ts"]
    }
  }
}
```

### 4.2 Output: `.repo_map/workflows.json`

```ts
export interface WorkflowFileEntry {
  path: string;
  reason: string;           // LLM-filled, 1-2 sentences, why THIS file in THIS workflow
  role?: string;            // optional e.g. "state-management", "message-passing"
  keySymbols?: string[];    // the specific functions this file contributes to the workflow
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
  source: "user" | "discovered" | "hybrid";  // how this workflow was created
  confidence?: number;     // 0-1, for discovered workflows
}

export interface WorkflowsJson {
  schemaVersion: 1;
  workflows: Record<string, WorkflowDefinition>; // keyed by id
}
```

### 4.3 Example Output

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
          "role": "state-management",
          "keySymbols": ["createSession", "getSession", "updateSession"]
        },
        {
          "path": "src/lifecycle-manager.ts",
          "reason": "Polling loop that triggers agent execution and monitors state transitions during the handoff",
          "role": "lifecycle-control",
          "keySymbols": ["startPolling", "stopPolling"]
        },
        {
          "path": "src/agent-selector.ts",
          "reason": "Determines which agent plugin handles the delegated task based on task metadata",
          "role": "agent-routing",
          "keySymbols": ["delegate", "selectAgent"]
        },
        {
          "path": "src/message-bus.ts",
          "reason": "Handles async message passing, retries, and failure recovery for agent-to-agent communication",
          "role": "message-passing",
          "keySymbols": ["sendMessage", "onMessage"]
        }
      ],
      "entryPoint": "src/orchestrator/main.ts",
      "tags": ["multi-agent", "communication", "handoff", "state-management"],
      "participants": ["orchestrator", "worker"],
      "lastUpdated": "2026-04-04T23:45:12Z",
      "version": 3,
      "source": "discovered",
      "confidence": 0.92
    }
  }
}
```

### 4.4 Index in `meta.json`

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

## 5. Workflow Discovery Algorithm

This is the core innovation. Instead of relying on LLM to guess workflows (expensive, unreliable), we use the function-level graph and graph algorithms to discover them deterministically.

### 5.1 Step 1: Build the Function-Level Graph

**Source:** Level 0 already captures function-level imports/exports via Babel AST parsing. Extend the Assembler to output `function-graph.json` (new file).

For each JS/TS file, Level 0 currently extracts:
- Named imports: `import { foo, bar } from './module'` → `foo`, `bar`
- Default imports: `import something from './module'` → `default`
- Re-exports: `export { foo } from './module'` → `foo`
- Dynamic imports: `import('./module')` → entire module
- CommonJS: `require('./module')` → entire module

All of this is already happening. We just need to wire it into a graph structure.

### 5.2 Step 2: Identify Entry Points

Entry points are files that:
- Have no importers (root of the dependency tree), OR
- Are explicitly listed as entry points by Level 1's structure detection, OR
- Are CLI bin targets, HTTP route handlers, or exported from `package.json` `main`/`bin`

Level 1 already identifies entry points. We reuse that.

### 5.3 Step 3: Trace Paths from Entry Points

For each entry point, perform a **symbol-aware breadth-first traversal** of the function-level graph:

```
function traceWorkflow(entryFile, functionGraph):
  visited = Set()
  queue = [entryFile]
  workflowFiles = []
  
  while queue is not empty:
    file = queue.shift()
    if file in visited: continue
    visited.add(file)
    workflowFiles.push(file)
    
    // Get all symbols this file imports
    imports = functionGraph.getImports(file)
    
    for each import:
      sourceFile = import.sourceFile
      sourceSymbol = import.symbol
      
      // Check if source symbol is exported by source file
      if functionGraph.isExported(sourceFile, sourceSymbol):
        // This is a real data flow edge
        queue.push(sourceFile)
  
  return workflowFiles
```

### 5.4 Step 4: Merge Overlapping Paths

Multiple entry points may trace into overlapping file sets. Merge paths that share >60% of files into a single workflow. The merge creates a "wider" workflow that captures the full system flow.

**Algorithm:**
1. Trace all entry points → set of candidate workflows
2. Compute Jaccard similarity between all pairs
3. Merge pairs with similarity > 0.6
4. Repeat until no more merges possible

### 5.5 Step 5: Filter Noise

Not all reachable paths are meaningful workflows. Filter out:
- **Utility files** — files imported by >80% of the codebase (e.g., `types.ts`, `utils.ts`, `config.ts`). These are "infrastructure," not workflow-specific.
- **Type-only imports** — files imported only for TypeScript types (`import type { Foo }`). These don't represent runtime data flow.
- **Shallow paths** — entry points that reach <3 files. Too small to be a useful workflow.
- **Circular clusters** — groups of files that all import each other with no clear direction. These are modules, not workflows.

### 5.6 Step 6: LLM Polish

Now use LLM (one Haiku call) to:
1. **Name** the workflow (human-readable)
2. **Describe** it (1-2 sentences)
3. **Fill `reason`** for each file (why it's part of this flow, not just what the file does)
4. **Assign `role`** and **`tags`** per file
5. **Prune** false positives — the LLM sees the full file list + function-level edges and can say "file X is a shared utility, not really part of this workflow"

This is where LLM adds value — not in discovery, but in **semantic annotation**.

### 5.7 Why This Is Better Than Pure LLM Discovery

| Aspect | LLM-Only Discovery | Function-Graph + LLM Polish |
|---|---|---|
| Accuracy | Depends on prompt quality | Deterministic graph traversal, LLM only annotates |
| Cost | Multiple expensive Sonnet calls | One cheap Haiku call per workflow |
| Reproducibility | Varies between runs | Same graph = same workflows |
| Scalability | Degrades on large repos | Graph algorithms scale linearly |
| False positives | High (LLM guesses) | Low (graph pruning + LLM validation) |
| Ordering | LLM guesses execution order | Determined by traversal order |

---

## 6. Implementation Plan

### Phase 1: Function-Level Graph + User Workflows (Foundation)

**Goal:** Extract function-level graph from existing Level 0 data. Support user-defined workflows with auto-generated reasons.

**Estimated effort:** ~350–450 LOC new code + 1 prompt template. ~2-3 days.

#### 6.1 Enhance Level 0 Output

Ensure Level 0 captures **symbol-level** imports/exports (it likely already does via Babel). If not, extend the Babel visitor:

```ts
// What we need per file:
interface FileImportData {
  path: string;
  namedImports: { symbol: string; source: string }[];  // { foo } from './bar'
  defaultImport?: { symbol: string; source: string };    // import X from './bar'
  reExports: { symbol: string; source: string }[];       // export { foo } from './bar'
  dynamicImports: string[];                               // import('./bar')
  namedExports: string[];                                 // export function foo
  defaultExport: boolean;
}
```

#### 6.2 Build `function-graph.json` in Assembler

After Level 3 completes, the Assembler already builds `graph.json` (file-level). Add a pass that builds the function-level graph:

```
For each file:
  For each named import { symbol, source }:
    Add edge: source:symbol → file:symbol
  For each named export:
    Add node: file:symbol (type: export)
  For each re-export { symbol, source }:
    Add edge: source:symbol → file:symbol (type: re-export)
```

Compute `fileAdjacency` index for fast lookups.

#### 6.3 User-Defined Workflows (Config File)

Create `.repo_map/workflows.config.json`:

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
rmap generates: **reason per file, role, tags, keySymbols, version.**

#### 6.4 Pipeline Integration

Insert a new lightweight level after Level 3:

```
Level 0 (Harvest)
  → Level 1 (Structure Detection)
    → Level 2 (Work Division)
      → Level 3 (Deep Annotation)
        → Assembler builds function-graph.json
        → [NEW] Level Workflow (Discovery + Reason Extraction)
          → Level 4 (Validation)
            → Final Assembler writes workflows.json
```

**Level Workflow has two modes:**

| Mode | Trigger | Behavior |
|---|---|---|
| **User mode** | `workflows.config.json` exists | Use user-defined file lists, LLM fills reasons |
| **Discovery mode** | No config or `--discover` flag | Run graph algorithm to find workflows, LLM polishes |
| **Hybrid mode** | Both config + `--discover` | User workflows take priority, discovered workflows fill gaps |

#### 6.5 Discovery Algorithm Implementation

New file: `src/core/workflow-discovery.ts`

```ts
export function discoverWorkflows(
  functionGraph: FunctionGraphJson,
  entryPoints: string[],
  options: DiscoveryOptions
): WorkflowCandidate[] {
  // 1. Trace paths from each entry point
  const paths = entryPoints.map(ep => tracePath(ep, functionGraph));
  
  // 2. Merge overlapping paths (Jaccard > 0.6)
  const merged = mergePaths(paths);
  
  // 3. Filter noise (utility files, type-only, shallow, circular)
  const filtered = filterNoise(merged, functionGraph);
  
  // 4. Sort files within each workflow by traversal order
  return filtered.map(w => sortWorkflow(w, functionGraph));
}
```

**Configuration options:**
```ts
interface DiscoveryOptions {
  minFiles: number;           // default: 3 — skip workflows smaller than this
  maxFiles: number;           // default: 15 — cap workflow size
  mergeThreshold: number;     // default: 0.6 — Jaccard similarity for merging
  utilityThreshold: number;   // default: 0.8 — files imported by >80% of codebase are utilities
  excludePatterns: string[];  // glob patterns for files to always exclude
}
```

#### 6.6 CLI Commands

New file: `src/cli/commands/workflow.ts`

```bash
rmap workflow list                        # Table of all workflows (id, name, source, confidence, file count)
rmap workflow <id>                        # Rich context: files + reasons + keySymbols + scoped blast radius
rmap workflow build                       # Re-generate reasons for all workflows
rmap workflow discover                    # Run discovery algorithm + LLM polish, write to workflows.json
rmap workflow discover --dry-run          # Show discovered workflows without writing
rmap workflow graph <id>                  # Show function-level graph for a specific workflow
rmap workflow edit <id>                   # Open config for manual editing (future)
rmap get-context --workflow <id>          # Query engine shortcut
```

#### 6.7 Query Engine Extension

Add `WorkflowQuery` handler to `src/query/`:

1. Load `workflows.json` + `function-graph.json`
2. Pull exact files + reasons + keySymbols for the requested workflow
3. Run blast-radius logic **scoped to workflow files only**
4. Show function-level connections: "session-manager.createSession → lifecycle-manager"

New query modes:
```bash
rmap get-context --symbol createSession         # "What workflow(s) use this symbol?"
rmap get-context --workflow orchestrator-worker  # Files + reasons + symbol flow
rmap get-context --blast-radius src/message-bus.ts --workflow orchestrator-worker  # Scoped blast
```

#### 6.8 Delta Strategy

The function-level graph makes delta updates more precise:

| Condition | Action |
|---|---|
| No workflow files changed, no function signatures changed | Skip workflow level entirely |
| File changed but exported symbols unchanged | Re-run LLM polish only (reasons might be stale) |
| File changed + exported symbols changed | Re-trace all workflows containing this file |
| File changed + is an entry point | Re-trace from this entry point |
| New file added with exports | Check if any existing workflows import from this file |
| File deleted | Remove from all workflows, re-trace affected workflows |
| >20 files changed | Re-run full discovery + re-polish all |

**Function-level deltas are more precise than file-level deltas.** Changing a function name in `session-manager.ts` means re-running only workflows that *import that specific symbol* — not all workflows that touch the file.

#### 6.9 Validation (Level 4 Extension)

Add workflow-specific checks:
- All files in a workflow still exist
- All `keySymbols` still exist in their respective files
- Function-level edges in the workflow still exist in `function-graph.json` (catches renames)
- No orphan workflows (workflows with 0 valid files)
- Entry point is reachable from at least one file in the workflow
- Warn: same file appears in >5 workflows (might be a utility, not workflow-specific)
- Warn: workflow has no function-level edges (dead workflow — files are listed but don't actually connect)

### Phase 1 Difficulty Assessment

| Piece | Difficulty | Notes |
|---|---|---|
| Function-level graph extraction | **Easy** | Level 0 Babel parsing likely already has this data |
| `function-graph.json` assembler pass | **Easy** | Map Level 0 output into graph structure |
| Types (`workflow.ts`) | **Trivial** | Interfaces defined above |
| Config loader | **Easy** | Follow existing config patterns |
| Discovery algorithm | **Medium** | BFS + merge + filter. Straightforward graph algorithms |
| Level Workflow (LLM polish) | **Easy-Medium** | One Haiku call per workflow for naming + reasons |
| Coordinator integration | **Medium** | Checkpoint keys + delta detection + two modes |
| Assembler | **Easy** | Two new JSON files in `.repo_map/` |
| CLI commands | **Easy** | Commander boilerplate, copy existing patterns |
| Query engine | **Easy-Medium** | Symbol-aware queries + scoped blast radius |
| Delta strategy | **Medium** | Symbol-level deltas are more precise but need careful implementation |
| Validation | **Easy-Medium** | Symbol existence checks + edge validation |

---

## 7. Enhancement Proposals (Beyond Phase 1)

Phase 1 ships a complete, useful workflow system. These enhancements make it progressively more powerful.

### 7.1 Event-Driven Flow Detection

**Problem:** The function-level import graph captures **static** dependencies. But many flows are **dynamic** — event emitters, pub/sub, callbacks. `session-manager` might call `eventBus.emit('session:created')`, and `lifecycle-manager` listens via `eventBus.on('session:created', handler)`. No import relationship exists between them.

**Proposal:** Extend Level 0's Babel parser to detect event patterns:

```
// Pattern 1: EventEmitter
eventBus.emit('session:created', data)
eventBus.on('session:created', handler)

// Pattern 2: Pub/sub
pubsub.publish('topic', message)
pubsub.subscribe('topic', callback)

// Pattern 3: Callback registration
app.use(middleware)
router.post('/path', handler)

// Pattern 4: Stream/observable
stream.pipe(destination)
observable.subscribe(observer)
```

These create **implicit edges** in the function graph: `emitter → listener` via shared event name.

**How:**
1. Detect emit/publish/subscribe patterns in AST
2. Match by string literal (event name)
3. Add implicit edges to `function-graph.json` with type `"event"`
4. Discovery algorithm treats event edges like import edges for path tracing

**Difficulty:** **Medium-Hard** (pattern detection is finite, but false positives are common — `emit` is a generic word)

### 7.2 Workflow Evolution Tracking

**Problem:** Workflows change over time. An agent reviewing a PR should know "what workflows does this change affect?"

**Proposal:** Store workflow definitions per git commit and diff them.

**How:**
1. Each `rmap map` writes `workflows.json` with version + git SHA
2. Store snapshots: `.repo_map/history/workflows.<short-sha>.json`
3. Diff new workflows against last snapshot
4. Output `workflow-changes.json`:

```json
{
  "baseSha": "abc1234",
  "headSha": "def5678",
  "changes": {
    "orchestrator-worker": {
      "type": "modified",
      "addedFiles": ["src/retry-handler.ts"],
      "addedSymbols": ["retry-handler.retry"],
      "removedFiles": [],
      "changedReasons": ["src/session-manager.ts"],
      "entryPointChanged": false
    },
    "auth-flow": {
      "type": "removed",
      "reason": "All function-level edges dissolved"
    },
    "config-reload": {
      "type": "added",
      "files": ["src/config-watcher.ts"],
      "source": "discovered",
      "confidence": 0.87
    }
  }
}
```

**Agent queries:**
```bash
rmap workflow diff orchestrator-worker      # what changed in this workflow?
rmap workflow diff --since "2 weeks ago"    # what workflows changed recently?
rmap workflow history orchestrator-worker   # full version history
```

**The function-level graph makes diffs more precise.** Instead of "file X changed in workflow Y," you can say "symbol `createSession` was removed from workflow Y's critical path."

**Difficulty:** **Medium** (git integration + JSON diffing + symbol-level comparison)

### 7.3 Cross-Language Symbol Resolution

**Problem:** Level 0 uses Babel for JS/TS and regex for other languages. The function-level graph is accurate for JS/TS but coarse for Python, Go, Rust, etc.

**Proposal:** Add per-language AST parsers for common languages:

| Language | Parser | What we get |
|---|---|---|
| Python | `tree-sitter-python` or `ast` module | Function defs, class methods, imports |
| Go | `go/ast` | Function signatures, interface implementations |
| Rust | `syn` crate or `tree-sitter-rust` | Public functions, trait implementations, use statements |
| Java/Kotlin | `tree-sitter-java` / `tree-sitter-kotlin` | Method signatures, interface implementations |

This makes the function-level graph — and therefore workflow discovery — work across languages.

**Difficulty:** **Medium** per language (parser integration, symbol resolution rules differ)

### 7.4 Runtime-Validated Workflows

**Problem:** Static function-level graphs capture declared dependencies but not actual execution paths. A function might be imported but never called, or called via a path the static analysis misses (reflection, dynamic dispatch).

**Proposal:** Collect runtime traces during test execution and validate workflows.

**How:**
1. Instrument the codebase to log function entry/exit at symbol level
2. Run the test suite with instrumentation enabled
3. Match runtime traces against `function-graph.json`
4. Report:
   - **Coverage:** "Workflow X is exercised by 12 tests, covers 8/10 files, 15/18 symbols"
   - **Dead edges:** "Symbol `startPolling` is in the graph but never called in tests"
   - **Hidden paths:** "Runtime shows `retry-handler.ts` is always called before `message-bus.ts`, but it's not in any workflow"
   - **Orphan workflows:** "Workflow Y has no runtime evidence — may be deprecated"

**Difficulty:** **Very Hard** (runtime instrumentation, trace collection, trace → workflow matching)

### 7.5 Workflow Hotspots & Complexity Metrics

**Problem:** Some workflows are more fragile than others. An agent should know which workflows are risky to modify.

**Proposal:** Compute per-workflow metrics:

| Metric | What it measures | How |
|---|---|---|
| **Blast radius** | How many other workflows would break if this workflow's files changed? | Count of workflows sharing files |
| **Symbol coupling** | How many symbols does this workflow share with other workflows? | Intersection of keySymbols sets |
| **Chain depth** | How long is the execution chain? | Max path length in function graph |
| **Fan-out** | How many files does a single file in this workflow connect to outside the workflow? | Edges crossing workflow boundary |
| **Change frequency** | How often do files in this workflow change? | Git log on workflow files |

Output as `workflow-risk.json`. Agents can query: "what's the riskiest workflow to modify?"

**Difficulty:** **Easy-Medium** (graph algorithms + git log, mostly computation)

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Verify Level 0 captures symbol-level imports/exports (extend if not)
- [ ] Add types to `src/core/workflow.ts`
- [ ] Build `function-graph.json` assembler pass
- [ ] Implement discovery algorithm (`src/core/workflow-discovery.ts`)
- [ ] Create `src/levels/level-workflow/` (LLM polish prompt)
- [ ] Update coordinator with two modes (user / discovery / hybrid)
- [ ] Update Assembler to write `workflows.json` + `function-graph.json` + meta.json index
- [ ] Add config loader for `workflows.config.json`
- [ ] Create `src/cli/commands/workflow.ts` + register in CLI
- [ ] Extend query engine (symbol-aware queries + `--workflow` flag)
- [ ] Update delta strategy (symbol-level invalidation)
- [ ] Update Level 4 validation (symbol existence + edge checks)
- [ ] Add tests
- [ ] Update README + ARCHITECTURE.md + CLI.md

**Deliverable:** Function-level graph. Automatic workflow discovery. User-defined override. LLM-polished reasons. Query support. Symbol-level deltas.

### Phase 2: Event-Driven Flows (Week 3)
- [ ] Extend Babel parser to detect event emitter patterns
- [ ] Add implicit edges to function-graph.json
- [ ] Update discovery algorithm to use event edges
- [ ] Validate on event-heavy codebases (Express, EventEmitter, RxJS)

**Deliverable:** Dynamic flow detection. More complete graph.

### Phase 3: Evolution Tracking (Week 4)
- [ ] Implement workflow versioning with git SHA tracking
- [ ] Build symbol-level workflow diff engine
- [ ] Add `rmap workflow diff` and `rmap workflow history` commands
- [ ] Store historical snapshots in `.repo_map/history/`

**Deliverable:** Workflow change tracking. PR-aware workflow diffs.

### Phase 4: Cross-Language Support (Week 5-6)
- [ ] Add tree-sitter-based parsers for Python, Go, Rust
- [ ] Unified symbol extraction interface
- [ ] Language-aware discovery (different import patterns per language)

**Deliverable:** Workflow discovery works across languages.

### Phase 5: Risk & Complexity Metrics (Week 6-7)
- [ ] Compute blast radius, coupling, depth per workflow
- [ ] Git-based change frequency analysis
- [ ] `rmap workflow risk` command
- [ ] Risk-aware query results ("this workflow is high-risk")

**Deliverable:** Risk metrics. Smarter agent context.

### Phase 6: Runtime Validation (Future)
- [ ] Instrumentation layer design
- [ ] Trace collection during test runs
- [ ] Trace → workflow matching algorithm
- [ ] Coverage and mismatch reporting

**Deliverable:** Runtime-validated workflows with coverage metrics.

---

## 9. Prompt Template (LLM Polish — Phase 1)

For the Level Workflow prompt that generates names, descriptions, reasons, and roles:

```
You are polishing a discovered workflow within a codebase. The workflow was identified
by tracing function-level import/export relationships through the code.

WORKFLOW ENTRY POINT: {entryPoint}
FILES IN WORKFLOW (ordered by traversal):
{for each file:}
  {file.path}
  Exports used by this workflow: {file.keySymbols}
  Existing annotation: {level3 annotation}

FUNCTION-LEVEL EDGES (how files connect):
{for each edge in the workflow:}
  {sourceFile}.{symbol} → {targetFile} (imported as {importedSymbol})

OPTIONAL — USER CONTEXT (if workflow was user-defined):
  Name: {workflow.name}
  Description: {workflow.description}

TAG TAXONOMY (pick from these):
{existing tag list}

TASK: Provide the following for this workflow:
1. "name": A short, descriptive name for this workflow (2-5 words)
2. "description": 1-2 sentences describing what this workflow accomplishes
3. "tags": 2-4 tags from the taxonomy
4. For EACH file in the workflow:
   - "reason": 1-2 sentences explaining why THIS file is part of THIS specific workflow.
     Focus on what role it plays in the flow, referencing the specific symbols it provides.
   - "role": A short slug (e.g. "state-management", "message-passing", "entry-point")
5. "prune": List any files that are utilities/shared infrastructure and don't truly
   belong in this workflow (they'll be removed from the file list)

Return ONLY valid JSON:
{
  "name": "...",
  "description": "...",
  "tags": ["...", "..."],
  "files": [
    { "path": "...", "reason": "...", "role": "..." }
  ],
  "prune": []
}
```

---

## 10. Open Questions

1. **Workflow ordering:** Should files in a workflow be ordered by graph traversal order, dependency depth, or alphabetical? Graph traversal order represents execution flow but may not always match runtime reality.

2. **Utility file detection threshold:** What percentage of files importing a given file makes it a "utility"? Current proposal: 80%. This needs tuning per codebase size.

3. **Merge threshold:** Jaccard similarity of 0.6 for merging overlapping paths — too aggressive? Too conservative? Needs empirical validation on real codebases.

4. **Type-only imports:** Should `import type { Foo }` edges be excluded from the function graph entirely? They don't represent runtime data flow, but they do represent conceptual coupling.

5. **Re-exports / barrel files:** Files that only re-export symbols (`export { foo } from './bar'`) create pass-through edges. Should these be collapsed in the graph?

6. **Cycle handling:** If the function graph has cycles (A imports B, B imports A), the BFS needs cycle detection. How should cyclic workflows be represented?

7. **Workflow size limits:** Min 3 files, max 15 files — are these the right bounds? Too small = noise. Too large = useless context.

8. **Non-JS/TS repos:** The function-level graph is most accurate for JS/TS (Babel). How much of the discovery algorithm works with coarser regex-based symbol extraction for Python/Go/Rust?

---

## 11. Summary

### The Core Idea

**rmap already has function-level import/export data.** This is the key. By building a directed function-level graph and running graph algorithms (BFS traversal, path merging, noise filtering), we can discover workflows **deterministically** — without expensive LLM calls for discovery. The LLM is used only for **polish** (naming, reasoning, pruning), which is what it's best at.

### Difficulty Comparison

| Approach | Discovery Method | Cost | Accuracy | Reproducibility | Difficulty |
|---|---|---|---|---|---|
| **File-level + LLM** | LLM guesses from file tree | High (many Sonnet calls) | Medium | Low | Hard |
| **Function-graph + LLM polish** | Graph algorithm discovers, LLM annotates | Low (one Haiku per workflow) | High | High | **Medium** |
| **Full call graph tracing** | AST-level control flow analysis | Very High | Very High | High | Very Hard |
| **Runtime validation** | Instrumented execution traces | Highest | Highest | Medium | Very Hard |

**The function-graph approach hits the sweet spot.** It's accurate, cheap, reproducible, and implementable in weeks — not months.

### Phase Roadmap

| Phase | What | Difficulty | Effort | Value |
|---|---|---|---|---|
| **1** | Function graph + discovery + LLM polish | Medium | 2-3 days | **Very High** — ships zero-config workflows |
| **2** | Event-driven flow detection | Medium-Hard | 1 week | High — captures dynamic flows |
| **3** | Evolution tracking | Medium | 1 week | High — PR review superpower |
| **4** | Cross-language support | Medium | 1-2 weeks | High — polyglot codebases |
| **5** | Risk & complexity metrics | Easy-Medium | 1 week | Medium — smarter agent context |
| **6** | Runtime validation | Very Hard | 4+ weeks | Transformative — verified workflows |

---

*"The function-level import/export graph is the skeleton. The LLM adds the flesh. Together, they make rmap the de-facto context engine for any codebase."*
