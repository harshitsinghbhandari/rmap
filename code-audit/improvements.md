# Refactoring Improvements Roadmap

## Critical Refactors

### Refactor: Decompose Coordinator Pipeline
- **Location**: `src/coordinator/pipeline.ts` (Lines 100-500)
- **Problem**: The `runPipeline` function handles checkpointing, signal handling, sequential/parallel execution, and level orchestration.
- **Impact**: Makes testing almost impossible and increases the risk of regressions when modifying pipeline flow.
- **Suggested Approach**: Implement the State or Strategy pattern. Create a `PipelineRunner` class that delegates to `LevelRunner` objects. Move checkpointing to a dedicated `CheckpointManager`.

### Refactor: Stream File Processing in Harvester
- **Location**: `src/levels/level0/harvester.ts`
- **Problem**: Full file contents are loaded into memory to execute regex for import extraction.
- **Impact**: OOM crashes on large codebases.
- **Suggested Approach**: Use `fs.createReadStream` combined with `readline` to scan for imports line-by-line, or use a streaming worker pool.

## Medium Priority Improvements

### Refactor: Centralize Validation Utility
- **Location**: `src/levels/*/validation.ts`, `src/levels/level4/validator.ts`
- **Problem**: Duplicated JSON schema validation and error formatting.
- **Impact**: Inconsistent error messages and higher maintenance burden.
- **Suggested Approach**: Create a shared `Validator` class in `src/core/validation.ts` using a library like Zod or AJV for declarative validation.

### Refactor: Decouple Query Ranking Algorithm
- **Location**: `src/query/engine.ts`, `src/query/ranking.ts`
- **Problem**: Query execution and result ranking are tightly coupled.
- **Impact**: Hard to test ranking algorithms in isolation or swap them.
- **Suggested Approach**: Introduce an `IRanker` interface. Inject the ranker into `QueryEngine` upon initialization.

## Nice-to-Have Enhancements

### Enhancement: Introduce Custom Error Types
- **Location**: Throughout the codebase
- **Description**: Replace `throw new Error("...")` with domain-specific errors like `PipelineExecutionError`, `HarvesterError`, and `ValidationError`.
- **Benefit**: Allows precise `catch` blocks and improves observability in logs.
- **Suggested Approach**: Create `src/core/errors.ts`, define classes extending `Error`, and refactor `throw` statements.
