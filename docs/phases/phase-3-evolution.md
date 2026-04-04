# Phase 3: Evolution Tracking

> **Status:** Pending Phase 1 completion
> **Effort:** ~1 week
> **Difficulty:** Medium
> **Prerequisites:** Phase 1 complete

---

## Overview

Track workflow changes over time by storing workflow definitions per git commit and providing symbol-level diffs. This enables PR-aware context: "what workflows does this change affect?"

---

## Problem Statement

Workflows change as codebases evolve. An agent reviewing a PR needs to know:
- Which workflows are affected by this change?
- What specifically changed in each workflow?
- Is a workflow being created, modified, or deprecated?

Without evolution tracking, agents must re-discover workflows from scratch and can't provide historical context.

---

## Goals

1. Store workflow snapshots per git commit
2. Compute symbol-level diffs between workflow versions
3. Detect workflow creation, modification, and removal
4. Provide CLI commands for workflow history and diffs
5. Enable PR-aware workflow context

---

## Key Deliverables

| Deliverable | Description |
|-------------|-------------|
| Historical snapshots | `.repo_map/history/workflows.<short-sha>.json` |
| Workflow diff engine | Symbol-level comparison between versions |
| Change output | `workflow-changes.json` |
| CLI commands | `rmap workflow diff`, `rmap workflow history` |
| PR integration | Affected workflows in PR context |

---

## Implementation Steps

### 1. Snapshot Storage

Each `rmap map` stores a versioned snapshot:

```
.repo_map/
  workflows.json              # Current version
  history/
    workflows.abc1234.json    # Snapshot at commit abc1234
    workflows.def5678.json    # Snapshot at commit def5678
```

**Retention policy options:**
- Keep last N snapshots (default: 10)
- Keep snapshots from last N days
- Keep all snapshots (for small repos)

### 2. Workflow Diff Engine (`src/core/workflow-diff.ts`)

```ts
export interface WorkflowChange {
  type: 'added' | 'modified' | 'removed';
  workflowId: string;

  // For 'modified':
  addedFiles?: string[];
  removedFiles?: string[];
  addedSymbols?: string[];       // NEW: symbol-level precision
  removedSymbols?: string[];
  changedReasons?: string[];     // Files with updated reasons
  entryPointChanged?: boolean;

  // For 'removed':
  removalReason?: string;        // e.g., "All function-level edges dissolved"

  // For 'added':
  source?: 'user' | 'discovered';
  confidence?: number;
}

export interface WorkflowChanges {
  baseSha: string;
  headSha: string;
  changes: Record<string, WorkflowChange>;
}

export function diffWorkflows(
  base: WorkflowsJson,
  head: WorkflowsJson
): WorkflowChanges;
```

### 3. Symbol-Level Comparison

The function-level graph enables precise diffs:

**File-level (Phase 1):**
> "file X changed in workflow Y"

**Symbol-level (Phase 3):**
> "symbol `createSession` was removed from workflow Y's critical path"

Track changes to:
- `keySymbols` per file
- Function-level edges within the workflow
- Re-exports that affect symbol availability

### 4. Change Detection Logic

| Condition | Change Type |
|-----------|-------------|
| Workflow ID in head but not base | `added` |
| Workflow ID in base but not head | `removed` |
| Same ID, different files | `modified` (addedFiles/removedFiles) |
| Same ID, different keySymbols | `modified` (addedSymbols/removedSymbols) |
| Same ID, different reasons | `modified` (changedReasons) |
| Same ID, different entryPoint | `modified` (entryPointChanged) |

### 5. CLI Commands

```bash
# Compare current workflows to specific commit
rmap workflow diff abc1234

# Compare two specific commits
rmap workflow diff abc1234..def5678

# Compare to parent commit (PR review mode)
rmap workflow diff HEAD~1

# Show changes since time period
rmap workflow diff --since "2 weeks ago"

# Full version history for a workflow
rmap workflow history orchestrator-worker

# Show when a workflow was created/modified
rmap workflow history orchestrator-worker --format timeline
```

**Output format:**

```
Workflow Changes: abc1234 → def5678

orchestrator-worker (modified)
  + src/retry-handler.ts
  + retry-handler.retry (symbol)
  ~ src/session-manager.ts (reason updated)

auth-flow (removed)
  Reason: All function-level edges dissolved

config-reload (added)
  Source: discovered
  Confidence: 0.87
  Files: src/config-watcher.ts, src/config-loader.ts
```

### 6. PR Integration

When running in a PR context:

```bash
# Auto-detect PR context
rmap workflow diff --pr

# Or explicit base branch
rmap workflow diff origin/main
```

Output for PR description:

```markdown
## Affected Workflows

| Workflow | Change | Details |
|----------|--------|---------|
| orchestrator-worker | Modified | +1 file, +2 symbols |
| auth-flow | Removed | No edges remaining |
| config-reload | Added | Discovered with 87% confidence |
```

### 7. Integration with Query Engine

```bash
# What workflows does this file affect (historically)?
rmap get-context --file src/session-manager.ts --history

# What workflows changed in the last N commits?
rmap get-context --workflow-changes --since HEAD~5
```

---

## Data Model

### workflow-changes.json

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
      "removedSymbols": [],
      "changedReasons": ["src/session-manager.ts"],
      "entryPointChanged": false
    },
    "auth-flow": {
      "type": "removed",
      "removalReason": "All function-level edges dissolved"
    },
    "config-reload": {
      "type": "added",
      "source": "discovered",
      "confidence": 0.87
    }
  }
}
```

---

## Difficulty Assessment

| Component | Difficulty |
|-----------|------------|
| Snapshot storage | Easy |
| Workflow diff engine | Medium |
| Symbol-level comparison | Medium |
| CLI commands | Easy |
| PR integration | Easy |
| History query engine | Medium |
| **Overall** | **Medium** |

---

## Success Criteria

- [ ] Snapshots stored per `rmap map` run
- [ ] `rmap workflow diff HEAD~1` shows accurate changes
- [ ] Symbol-level additions/removals detected
- [ ] Workflow creation/removal detected
- [ ] History CLI shows workflow timeline
- [ ] PR context generates affected workflows table
- [ ] Existing tests pass

---

## Edge Cases

1. **Renamed workflows** — same files, different ID → treated as remove + add
2. **Merged workflows** — two workflows become one → one removed, one modified
3. **Split workflows** — one workflow becomes two → one modified, one added
4. **Rebased history** — commit SHAs change → match by timestamp or best-effort
5. **Missing snapshots** — old commits without snapshots → compare to oldest available

---

## Key Design Decisions

1. **Store full snapshots** (not deltas) — simpler, enables any-to-any comparison
2. **10 snapshot retention** — balance storage vs history depth
3. **Symbol-level precision** — leverage function-graph for detailed diffs
4. **Workflow ID as key** — renames are treated as remove + add

---

## References

- RFC Section 7.2: Workflow Evolution Tracking
- RFC Section 6.8: Delta Strategy
