# Refactoring Improvements Roadmap

## Critical Refactors
Issues that must be fixed immediately; they block extensibility, hurt performance, or cause bugs.

### Refactor: Extract Pipeline Phases into Dedicated Strategies
- **Location**: `src/coordinator/pipeline.ts` (`runPipeline`)
- **Problem**: `runPipeline` is a massive god-function (~400 lines) that orchestrates 5 distinct pipeline levels, handles UI logging, manages checkpoint state, and controls graceful shutdowns. It is brittle and difficult to unit test.
- **Impact**: Any change to pipeline execution (e.g., adding a new level or modifying how tasks are divided) requires modifying this single enormous function, risking regressions in unrelated areas.
- **Suggested Approach**: Implement a Strategy or Command pattern for pipeline levels. Create separate classes or pure functions for `executeLevel0`, `executeLevel1`, etc. The `runPipeline` function should only instantiate the pipeline context and iterate through these steps.

```typescript
// Example target structure
const context = new PipelineContext(options, checkpointer, metrics);
await executeLevel0(context);
await executeLevel1(context);
await executeLevel2(context);
await executeLevel3(context);
await executeLevel4(context);
```

### Refactor: Decouple UI/Side-Effects from Core Logic
- **Location**: `src/coordinator/delta-update.ts` (`performDeltaUpdate`), `src/coordinator/graph-repair.ts` (`repairGraph`), `src/coordinator/pipeline.ts`.
- **Problem**: Pure business logic functions are hardcoded with `console.log` statements for progress reporting. This violates the established architectural principle of strictly separating pure logic from UI side-effects.
- **Impact**: Prevents reusing these core functions in different contexts (like a GUI tool or background service) and makes automated testing noisier and harder to assert.
- **Suggested Approach**: Remove all `console.log` calls from these functions. Instead, accept an optional `onProgress` callback or an `EventEmitter` interface. The CLI layer should subscribe to these events to render output.

## Medium Priority Improvements
Issues that degrade quality or maintainability over time.

### Refactor: Standardize Error Handling in Git Utilities
- **Location**: `src/coordinator/delta.ts` (`getCommitAge`, `getCommitCount`)
- **Problem**: These functions currently catch any error and silently return `0`.
- **Impact**: If git fails due to permission issues or a missing `.git` folder, the application silently proceeds with incorrect data instead of failing fast or logging a descriptive warning.
- **Suggested Approach**: Catch specifically `GitError` or check error codes. If it's a critical failure, bubble the error up. If falling back to 0 is intended, log a debug/warn message explaining why the fallback occurred.

### Refactor: Abstract File System Operations in Checkpoint
- **Location**: `src/coordinator/checkpoint.ts`, `src/coordinator/checkpoint-orchestrator.ts`
- **Problem**: These files use direct `node:fs` calls (e.g., `fs.writeFileSync`).
- **Impact**: Makes it difficult to mock the file system for unit tests, or to eventually swap the storage backend (e.g., storing checkpoints in a database or cloud bucket).
- **Suggested Approach**: Introduce an `IStorageProvider` interface that defines `read`, `writeAtomic`, `delete`, etc. Inject this provider into the CheckpointOrchestrator.

## Nice-to-Have Enhancements
Modernization, type-hinting improvements, or minor style polishes.

### Enhancement: Migrate Synchronous FS to Asynchronous
- **Location**: `src/coordinator/assembler.ts`, `src/coordinator/checkpoint.ts`
- **Description**: Replace synchronous file system operations (`fs.writeFileSync`, `fs.mkdirSync`) with their asynchronous counterparts from `node:fs/promises`.
- **Benefit**: Prevents blocking the Node.js event loop during heavy I/O operations, which is especially beneficial if the pipeline runs concurrently with other tasks.
- **Suggested Approach**: Update function signatures to `async` and use `await fs.promises.writeFile`, etc.

### Enhancement: Consolidate Progress Tracking Logic
- **Location**: `src/coordinator/progress.ts`
- **Description**: The `ProgressTracker` mixes raw time/token tracking with UI spinner rendering (`LevelSpinner`).
- **Benefit**: Further separation of concerns.
- **Suggested Approach**: Split into a pure `MetricsTracker` (that only records start/end times and tokens) and a `CliProgressRenderer` that consumes the metrics data to update the console.
