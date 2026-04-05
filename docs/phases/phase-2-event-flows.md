# Phase 2: Event-Driven Flows

> **Status:** Pending Phase 1 completion
> **Effort:** ~1 week
> **Difficulty:** Medium-Hard
> **Prerequisites:** Phase 1 complete, validation on event-heavy codebases

---

## Overview

Extend the function-level graph to capture **dynamic** dependencies that don't appear in import statements: event emitters, pub/sub patterns, callback registration, and stream/observable subscriptions. This makes workflow discovery work for event-driven architectures.

---

## Problem Statement

The Phase 1 function-level graph captures **static** dependencies (import statements). But many real workflows are **dynamic**:

```ts
// session-manager.ts
eventBus.emit('session:created', data);

// lifecycle-manager.ts
eventBus.on('session:created', handler);
```

These files have no import relationship, but they're clearly part of the same workflow. Phase 1 would miss this connection entirely.

---

## Goals

1. Detect common event patterns in JS/TS via AST
2. Add implicit edges to `function-graph.json` with type `"event"`
3. Match emitters to listeners by event name
4. Update discovery algorithm to use event edges
5. Validate on real event-heavy codebases (Express, RxJS)

---

## Key Deliverables

| Deliverable | Description |
|-------------|-------------|
| Event pattern detection | Babel AST visitor extensions |
| Implicit event edges | New edge type in `function-graph.json` |
| Event-aware discovery | Updated BFS to traverse event edges |
| Validation results | Tested on 2-3 event-heavy repos |

---

## Implementation Steps

### 1. Event Pattern Detection (`src/levels/level0/parsers/javascript.ts`)

Extend Babel visitor to detect:

**Pattern 1: EventEmitter**
```ts
eventBus.emit('session:created', data)
eventBus.on('session:created', handler)
eventBus.once('session:created', handler)
eventBus.addListener('session:created', handler)
```

**Pattern 2: Pub/Sub**
```ts
pubsub.publish('topic', message)
pubsub.subscribe('topic', callback)
```

**Pattern 3: Express/HTTP**
```ts
app.use(middleware)
app.get('/path', handler)
router.post('/path', handler)
```

**Pattern 4: Streams/Observables**
```ts
stream.pipe(destination)
observable.subscribe(observer)
subject.next(value)
```

### 2. Event Data Model

Add to Level 0 output:

```ts
interface EventEmission {
  eventName: string;      // 'session:created'
  type: 'emit' | 'on' | 'subscribe' | 'publish';
  line: number;
}

interface FileImportData {
  // ... existing fields
  events?: EventEmission[];  // NEW
}
```

### 3. Implicit Edge Generation

In the assembler, create edges between emitters and listeners:

```ts
// Match by event name
if (file1.events.find(e => e.type === 'emit' && e.eventName === 'session:created') &&
    file2.events.find(e => e.type === 'on' && e.eventName === 'session:created')) {
  addEdge({
    from: { file: file1.path, symbol: 'session:created' },
    to: { file: file2.path, symbol: 'session:created' },
    type: 'event'
  });
}
```

### 4. Discovery Algorithm Update

Modify BFS to traverse event edges:

```ts
function traceWorkflow(entryFile, functionGraph) {
  // ... existing code

  // Also follow event edges
  const eventEdges = functionGraph.edges.filter(
    e => e.type === 'event' && e.from.file === file
  );
  for (const edge of eventEdges) {
    queue.push(edge.to.file);
  }
}
```

### 5. Graph Visualization

Update `rmap workflow graph <id>` to show event edges distinctly:

```
session-manager.ts ─[emit:session:created]─> lifecycle-manager.ts
                   ─[import:createSession]─> ...
```

---

## Challenges & Mitigations

### Challenge 1: High False Positive Rate

`emit`, `on`, `subscribe` are common method names. Not all calls are event patterns.

**Mitigation:**
- Require specific patterns (`.emit(stringLiteral, ...)`)
- Use type info if available (check if receiver extends EventEmitter)
- Allow config to exclude specific files/patterns

### Challenge 2: Dynamic Event Names

```ts
const eventName = 'session:' + action;
eventBus.emit(eventName, data);
```

Can't statically match these.

**Mitigation:**
- Only match string literal event names
- Log warning for dynamic event names
- Consider template literal partial matching (`session:*`)

### Challenge 3: Cross-File EventEmitter Instances

```ts
// events.ts
export const eventBus = new EventEmitter();

// file1.ts
import { eventBus } from './events';
eventBus.emit('foo', data);

// file2.ts
import { eventBus } from './events';
eventBus.on('foo', handler);
```

Need to track that both files use the same `eventBus` instance.

**Mitigation:**
- Track which EventEmitter instance is used (by import source)
- Only match events on the same instance
- For global/ambient eventBus, assume all events could match

---

## Difficulty Assessment

| Component | Difficulty |
|-----------|------------|
| AST pattern detection | Medium |
| Event data model | Easy |
| Implicit edge generation | Medium |
| Discovery algorithm update | Easy |
| False positive handling | Hard |
| Cross-file instance tracking | Medium-Hard |
| **Overall** | **Medium-Hard** |

---

## Success Criteria

- [ ] Detects EventEmitter emit/on patterns
- [ ] Detects Express route registration
- [ ] Adds event edges to `function-graph.json`
- [ ] Discovery follows event edges
- [ ] False positive rate <20% on test repos
- [ ] Validated on 2-3 event-heavy codebases
- [ ] Existing Phase 1 tests still pass

---

## Validation Plan

Test on:
1. **Express.js app** — route handlers, middleware chains
2. **EventEmitter-heavy repo** — internal event bus patterns
3. **RxJS/Observable repo** — stream subscriptions

Measure:
- Event edges discovered
- False positive rate
- Workflows that now include event-connected files

---

## Key Design Decisions

1. **String literal only** — no dynamic event name matching
2. **Instance tracking** — match events on same EventEmitter import
3. **Separate edge type** — `type: 'event'` distinguishes from imports
4. **Opt-in validation** — `--validate-events` flag for debugging

---

## References

- RFC Section 7.1: Event-Driven Flow Detection
- RFC Section 5.3: Trace Paths from Entry Points
