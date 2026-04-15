# Refactoring Improvements Roadmap

## Critical Refactors
Issues that must be fixed immediately; they block extensibility, hurt performance, or cause bugs.

### Refactor: Eliminate Duplicate Environment Parsing Function
- **Location**: `src/config/models.ts` and `src/config/env.ts`
- **Problem**: The exact same `parseEnvInt` utility function is implemented separately in both files.
- **Impact**: Code duplication increases maintenance burden; bug fixes or behavior changes in parsing will likely miss one of the implementations.
- **Suggested Approach**: Move `parseEnvInt` (and `parseEnvFloat`) into a shared utility file (e.g., `src/config/utils.ts`) and import it where needed.

### Refactor: Consolidate CLI Command Logic for Checkpoints
- **Location**: `src/cli/commands/map.ts` (inside `computeFullMapBuild` and `computeBuildOrUpdate`)
- **Problem**: The logic to handle `--resume` options (loading checkpoints, validating, or clearing) is duplicated verbatim across two different command execution functions.
- **Impact**: Increased risk of bugs when modifying CLI checkpoint handling logic.
- **Suggested Approach**: Extract this duplicated logic into a helper function:
  ```typescript
  function resolveCheckpointOptions(repoRoot: string, options: { resume?: boolean }) {
      // Return { resumeOption, checkpointCleared } or throw Error
  }
  ```

## Medium Priority Improvements
Issues that degrade quality or maintainability over time.

### Refactor: Introduce Schema Validation for Configuration
- **Location**: `src/config/env.ts` and `src/config/yaml-config.ts`
- **Problem**: Environment variables are manually parsed block-by-block. YAML configuration uses raw type assertions (`as YamlConfig`).
- **Impact**: Adds immense boilerplate code. Invalid configurations might pass unchecked at runtime leading to cryptic downstream errors.
- **Suggested Approach**: Adopt a schema validation library like `Zod` or `TypeBox`. Define the configuration structure once and use `.parse()` to validate and generate the TypeScript types automatically. This replaces hundreds of lines of `parseEnvInt` calls with clean schema definitions.

### Refactor: Async Configuration Loading
- **Location**: `src/config/yaml-config.ts`
- **Problem**: Heavy use of `fs.existsSync` and `fs.readFileSync`.
- **Impact**: While acceptable for CLI initialization, synchronous I/O blocks the Node event loop. If this configuration is accessed frequently, it could lead to performance bottlenecks.
- **Suggested Approach**: Migrate to `fs.promises.readFile` and `fs.promises.stat`. Introduce an async `init()` phase for the application that caches the configuration.

## Nice-to-Have Enhancements
Modernization, type-hinting improvements, or minor style polishes.

### Enhancement: Decouple Progress UI from Side-Effects
- **Location**: `src/cli/progress-ui.ts`
- **Description**: The UI classes (`PercentageProgressBar`, `RollingLogViewport`) mix state tracking directly with `console.log` or `logUpdate`.
- **Benefit**: Decoupling the UI rendering logic from the state logic would allow for isolated unit testing of progress tracking without mocking `console.log`.
- **Suggested Approach**: Refactor these classes to return formatted strings or commands to an injected rendering interface, rather than calling the terminal commands directly.

### Enhancement: Rethink Module-Level Caching
- **Location**: `src/config/yaml-config.ts`
- **Description**: The file uses module-scoped `let cachedConfig` variables.
- **Benefit**: Avoiding module-level state prevents potential test pollution and enables easier configuration of multiple instances in a theoretical monorepo setup.
- **Suggested Approach**: Wrap configuration loading into a `ConfigManager` class or a dependency injection container.