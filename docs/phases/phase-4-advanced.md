# Phase 4: Advanced Features

> **Status:** Pending Phases 1-3 completion
> **Effort:** 4-6 weeks total
> **Difficulty:** Medium to Very Hard
> **Prerequisites:** Phases 1-3 complete

---

## Overview

This phase covers three advanced capabilities that make rmap's workflow system production-ready for diverse environments:

1. **Cross-Language Support** — Extend function-level graphs beyond JS/TS
2. **Risk & Complexity Metrics** — Help agents assess workflow fragility
3. **Runtime Validation** — Verify workflows against actual execution traces

These can be implemented in parallel or sequentially based on priority.

---

# Part A: Cross-Language Support

> **Effort:** 1-2 weeks
> **Difficulty:** Medium (per language)

## Problem

Level 0 uses Babel for JS/TS and regex for other languages. The function-level graph is accurate for JS/TS but coarse for Python, Go, Rust, etc. This limits workflow discovery in polyglot codebases.

## Goals

1. Add AST-based parsers for Python, Go, Rust
2. Create unified symbol extraction interface
3. Enable language-aware workflow discovery

## Implementation

### Language Parsers

| Language | Parser | Extracts |
|----------|--------|----------|
| Python | `tree-sitter-python` | Function defs, class methods, imports |
| Go | `go/ast` or tree-sitter | Function signatures, interface impls |
| Rust | `syn` or `tree-sitter-rust` | Public functions, traits, use statements |
| Java/Kotlin | tree-sitter | Method signatures, interfaces |

### Unified Interface

```ts
interface LanguageParser {
  supportedExtensions: string[];

  extractSymbols(content: string, filePath: string): {
    namedExports: string[];
    namedImports: { symbol: string; source: string }[];
    defaultExport?: string;
    reExports: { symbol: string; source: string }[];
  };
}
```

### Language-Specific Considerations

**Python:**
- `from module import func` → named import
- `import module` → namespace import
- `__all__ = ['func']` → explicit exports
- No default exports concept

**Go:**
- Capital letter = exported
- `import "package"` is namespace import
- Interface implementations are implicit

**Rust:**
- `pub fn` = exported
- `use crate::module::func` = named import
- `pub use` = re-export

### Discovery Algorithm Updates

- Handle language-specific import patterns
- Support mixed-language workflows (JS calls Python via subprocess/IPC)
- Language tags in workflow metadata

## Success Criteria

- [ ] Python symbol extraction via tree-sitter
- [ ] Go symbol extraction
- [ ] Rust symbol extraction
- [ ] Mixed-language workflows detected
- [ ] Accuracy within 90% of JS/TS on test repos

---

# Part B: Risk & Complexity Metrics

> **Effort:** 1 week
> **Difficulty:** Easy-Medium

## Problem

Some workflows are more fragile than others. Agents should know which workflows are risky to modify.

## Goals

1. Compute per-workflow risk metrics
2. Identify hotspots and coupling points
3. Enable risk-aware query results

## Metrics

| Metric | Description | Computation |
|--------|-------------|-------------|
| **Blast radius** | Workflows that break if this one changes | Count of workflows sharing files |
| **Symbol coupling** | Shared symbols with other workflows | Intersection of keySymbols sets |
| **Chain depth** | Execution chain length | Max path length in function graph |
| **Fan-out** | Cross-workflow connections | Edges crossing workflow boundary |
| **Change frequency** | How often files change | `git log` on workflow files |
| **Centrality** | How "central" the workflow is | Graph betweenness centrality |

## Implementation

### workflow-risk.json

```json
{
  "orchestrator-worker": {
    "blastRadius": 3,
    "symbolCoupling": 12,
    "chainDepth": 7,
    "fanOut": 5,
    "changeFrequency": {
      "last30Days": 15,
      "last90Days": 42
    },
    "centralityScore": 0.78,
    "overallRisk": "high"
  }
}
```

### Risk Scoring

Combine metrics into overall risk:

```ts
function computeRisk(metrics: WorkflowMetrics): 'low' | 'medium' | 'high' {
  let score = 0;
  if (metrics.blastRadius > 5) score += 2;
  if (metrics.symbolCoupling > 10) score += 1;
  if (metrics.chainDepth > 8) score += 1;
  if (metrics.changeFrequency.last30Days > 20) score += 2;

  if (score >= 4) return 'high';
  if (score >= 2) return 'medium';
  return 'low';
}
```

### CLI Commands

```bash
rmap workflow risk                     # Risk summary for all workflows
rmap workflow risk orchestrator-worker # Detailed metrics for one workflow
rmap workflow risk --sort coupling     # Sort by specific metric
rmap get-context --risky               # Show high-risk workflows first
```

## Success Criteria

- [ ] All metrics computed correctly
- [ ] `rmap workflow risk` shows risk summary
- [ ] High-risk workflows flagged in query results
- [ ] Git-based change frequency working

---

# Part C: Runtime Validation

> **Effort:** 4+ weeks
> **Difficulty:** Very Hard

## Problem

Static function-level graphs capture declared dependencies but not actual execution paths. A function might be imported but never called, or called via dynamic dispatch.

## Goals

1. Collect runtime traces during test execution
2. Validate static workflows against actual execution
3. Report coverage, dead edges, and hidden paths

## Implementation

### Instrumentation Layer

```ts
// Injected at function entry/exit
function __rmap_trace(file: string, symbol: string, type: 'enter' | 'exit') {
  process.send?.({ rmap: { file, symbol, type, timestamp: Date.now() } });
}
```

### Trace Collection

```bash
# Run tests with instrumentation
rmap workflow validate --instrument

# Collects traces to .repo_map/traces/
```

### Trace Format

```json
{
  "testFile": "tests/auth.test.ts",
  "traces": [
    { "file": "src/auth/login.ts", "symbol": "authenticate", "type": "enter", "ts": 1234567890 },
    { "file": "src/auth/session.ts", "symbol": "createSession", "type": "enter", "ts": 1234567891 },
    { "file": "src/auth/session.ts", "symbol": "createSession", "type": "exit", "ts": 1234567892 }
  ]
}
```

### Validation Output

```json
{
  "orchestrator-worker": {
    "coverage": {
      "files": "8/10",
      "symbols": "15/18",
      "tests": ["orchestrator.test.ts", "worker.test.ts"]
    },
    "deadEdges": [
      { "from": "session-manager.ts:cleanup", "to": "lifecycle-manager.ts", "reason": "Never called in tests" }
    ],
    "hiddenPaths": [
      { "path": ["retry-handler.ts", "message-bus.ts"], "reason": "Runtime shows connection not in static graph" }
    ],
    "orphanWorkflows": false
  }
}
```

### CLI Commands

```bash
rmap workflow validate                     # Full validation
rmap workflow validate --workflow <id>     # Validate specific workflow
rmap workflow validate --coverage          # Coverage report only
rmap workflow validate --dead-edges        # Dead edge detection only
```

## Challenges

1. **Instrumentation overhead** — affects test performance
2. **Dynamic dispatch** — callbacks, reflection, eval
3. **Async traces** — ordering of concurrent calls
4. **Framework integration** — Jest, Mocha, pytest, etc.

## Success Criteria

- [ ] Instrumentation works with Jest/Mocha
- [ ] Traces collected during test runs
- [ ] Coverage report generated
- [ ] Dead edges identified
- [ ] Hidden paths discovered
- [ ] <20% test performance overhead

---

## Phase 4 Summary

| Part | Focus | Effort | Difficulty | Value |
|------|-------|--------|------------|-------|
| A | Cross-Language | 1-2 weeks | Medium | High — polyglot repos |
| B | Risk Metrics | 1 week | Easy-Medium | Medium — smarter context |
| C | Runtime Validation | 4+ weeks | Very Hard | Transformative — verified workflows |

**Recommended order:** B → A → C (risk metrics are quick wins, runtime validation is a major investment)

---

## References

- RFC Section 7.3: Cross-Language Symbol Resolution
- RFC Section 7.4: Runtime-Validated Workflows
- RFC Section 7.5: Workflow Hotspots & Complexity Metrics
- RFC Section 8: Implementation Roadmap (Phases 4-6)
