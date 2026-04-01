# Refactoring Improvements Roadmap

## Critical Refactors

### Refactor: Extract Resume Logic to Shared Function
- **Location**: src/cli/commands/map.ts lines 196-218 and 301-323
- **Problem**: Identical resume option handling logic duplicated in `buildFullMap()` and `buildOrUpdateMap()`
- **Impact**: Bug fixes must be applied in multiple places; high risk of divergence; violates DRY principle
- **Suggested Approach**:
  ```typescript
  // Create new utility function in map.ts or separate util file
  function handleResumeOption(
    options: { resume?: boolean },
    repoRoot: string
  ): boolean {
    // Explicit --resume: error if no checkpoint exists
    if (options.resume === true) {
      const checkpoint = loadCheckpoint(repoRoot);
      if (!checkpoint) {
        console.error('❌ Error: No checkpoint found. Cannot resume.');
        console.error('   Remove --resume flag to start fresh.');
        process.exit(1);
      }

      const currentCommit = getCurrentCommit(repoRoot);
      const validation = validateCheckpoint(checkpoint, currentCommit);
      if (!validation.valid) {
        console.error(`❌ Error: Checkpoint is invalid: ${validation.error}`);
        console.error('   Remove --resume flag to start fresh.');
        process.exit(1);
      }
      return true;
    } else if (options.resume === false) {
      // --no-resume: clear checkpoint and start fresh
      console.log('🗑️  Clearing existing checkpoint...');
      clearCheckpoint(repoRoot);
      return false;
    }

    // Default: auto-resume if checkpoint exists
    return true;
  }

  // Then use in both functions:
  const resumeOption = handleResumeOption(options, repoRoot);
  ```

### Refactor: Separate Display Logic from Business Logic
- **Location**: src/cli/commands/map.ts (all functions)
- **Problem**: Console output statements mixed with business logic throughout; impossible to test logic or create alternative outputs (JSON, machine-readable)
- **Impact**: Cannot unit test; cannot support --json flag; cannot capture output for programmatic use
- **Suggested Approach**:
  1. Create a `MapStatusResult` interface for `showMapStatus()`:
  ```typescript
  interface MapStatusResult {
    hasMap: boolean;
    hasCheckpoint: boolean;
    checkpoint?: CheckpointSummary;
    map?: {
      version: string;
      schema: string;
      buildCommit: string;
      buildAge: number;
      currentCommit: string;
      commitsBehind: number;
      changes: ChangeDetectionResult;
    };
    verdict: 'up-to-date' | 'update-recommended' | 'full-rebuild-recommended';
    reason?: string;
  }
  ```

  2. Split `showMapStatus()` into two functions:
  ```typescript
  // Pure logic, returns data
  function getMapStatus(repoRoot: string): MapStatusResult { ... }

  // Display logic, consumes data
  function displayMapStatus(status: MapStatusResult): void { ... }

  // Command action becomes:
  const status = getMapStatus(repoRoot);
  displayMapStatus(status);
  ```

  3. Apply same pattern to `buildFullMap()`, `updateMap()`, `buildOrUpdateMap()`

### Refactor: Break Down showMapStatus() Function
- **Location**: src/cli/commands/map.ts lines 55-180
- **Problem**: 125-line function with 4-5 distinct responsibilities (checkpoint display, map loading, change detection, verdict determination); high cyclomatic complexity
- **Impact**: Hard to test individual parts; difficult to modify without breaking other parts; cognitive overload
- **Suggested Approach**:
  ```typescript
  // Split into smaller, focused functions:

  function displayCheckpointInfo(checkpoint: Checkpoint, currentCommit: string): void {
    // Lines 64-111: Display checkpoint summary
  }

  function displayMapInfo(meta: MetaJson, repoRoot: string): void {
    // Lines 140-154: Display map version and commit info
  }

  function displayChangeSummary(changes: ChangeDetectionResult): void {
    // Lines 154-159: Display file changes
  }

  function displayVerdict(changes: ChangeDetectionResult): void {
    // Lines 162-179: Display update verdict
  }

  // Main function orchestrates:
  async function showMapStatus(): Promise<void> {
    console.log(HEADER_BOX); // Use constant
    const repoRoot = process.cwd();

    const checkpoint = loadCheckpoint(repoRoot);
    if (checkpoint) {
      const currentCommit = getCurrentCommit(repoRoot);
      displayCheckpointInfo(checkpoint, currentCommit);
    }

    const existingMeta = readExistingMeta(repoRoot);
    if (!existingMeta) {
      console.log('❌ No map found');
      // ... early return logic
      return;
    }

    displayMapInfo(existingMeta, repoRoot);

    const changes = detectChanges(repoRoot, existingMeta);
    displayChangeSummary(changes);
    displayVerdict(changes);
  }
  ```

### Refactor: Extract Display Constants
- **Location**: src/cli/commands/map.ts (throughout)
- **Problem**: Magic strings for box drawing, emojis, and formatting scattered everywhere; no way to disable for CI/testing
- **Impact**: Inconsistent formatting; hard to maintain; no support for plain text output in CI environments
- **Suggested Approach**:
  ```typescript
  // Create constants file: src/cli/ui-constants.ts
  export const UI = {
    BOX: {
      MAP_STATUS: [
        '╔═══════════════════════════════════════╗',
        '║       Repository Map Status           ║',
        '╚═══════════════════════════════════════╝',
      ].join('\n'),
      BUILDING: [
        '╔═══════════════════════════════════════╗',
        '║       Building Repository Map         ║',
        '╚═══════════════════════════════════════╝',
      ].join('\n'),
      // ... more boxes
    },
    EMOJI: {
      ERROR: '❌',
      SUCCESS: '✅',
      WARNING: '⚠️',
      INFO: '📋',
      STATS: '📊',
      OUTPUT: '📁',
      // ... more emojis
    },
    DIVIDER: '─────────────────────────────────────────',
  } as const;

  // Optionally support NO_COLOR environment variable:
  export function getUI() {
    if (process.env.NO_COLOR || process.env.CI) {
      return {
        BOX: {
          MAP_STATUS: '=== Repository Map Status ===',
          // ... plain text versions
        },
        EMOJI: {
          ERROR: '[ERROR]',
          SUCCESS: '[OK]',
          // ... plain text versions
        },
        DIVIDER: '=========================================',
      };
    }
    return UI;
  }
  ```

## Medium Priority Improvements

### Refactor: Implement Missing CLI Features
- **Location**: src/cli/commands/get-context.ts
- **Problem**: Documentation (docs/CLI.md) specifies `--limit <n>` and `--json` options, but they're not implemented
- **Impact**: Documentation-code mismatch; users trying documented features will fail; unprofessional
- **Suggested Approach**:
  ```typescript
  export const getContextCommand = new Command('get-context')
    .description('Query repository context by tags, file, or path')
    .argument('[tags...]', 'Tags to search for (e.g., auth middleware)')
    .option('--file <path>', 'Query context for a specific file')
    .option('--path <dir>', 'Query context for a directory')
    .option('--limit <n>', 'Maximum number of files to return', '10')  // ADD
    .option('--json', 'Output in JSON format')  // ADD
    .action(async (tags: string[], options) => {
      // ... existing validation ...

      // Parse limit
      const limit = parseInt(options.limit, 10);
      if (isNaN(limit) || limit < 1) {
        console.error('Error: --limit must be a positive number');
        process.exit(1);
      }

      // Execute query with limit
      let output: string | object;
      if (options.file) {
        output = await queryByFileEngine(options.file, { limit });
      } else if (options.path) {
        output = await queryByPathEngine(options.path, { limit });
      } else {
        output = await queryByTagsEngine(tags, { limit });
      }

      // Handle JSON output
      if (options.json) {
        console.log(JSON.stringify(output, null, 2));
      } else {
        console.log(typeof output === 'string' ? output : formatOutput(output));
      }
    });
  ```

  Note: This requires updating query engine functions to accept options parameter.

### Refactor: Add Type Safety for Command Options
- **Location**: src/cli/commands/get-context.ts line 20, src/cli/commands/map.ts line 32
- **Problem**: `options` parameters are untyped, losing TypeScript benefits
- **Impact**: No IDE autocomplete; easier to make mistakes with option names
- **Suggested Approach**:
  ```typescript
  // For get-context.ts:
  interface GetContextOptions {
    file?: string;
    path?: string;
    limit?: string;  // Commander passes as string
    json?: boolean;
  }

  .action(async (tags: string[], options: GetContextOptions) => {
    // Now you get autocomplete and type checking
  });

  // For map.ts:
  interface MapOptions {
    full?: boolean;
    status?: boolean;
    update?: boolean;
    resume?: boolean;
  }

  .action(async (options: MapOptions) => {
    // Type-safe option access
  });
  ```

### Refactor: Improve Error Handling Consistency
- **Location**: src/cli/commands/map.ts (all functions)
- **Problem**: Inconsistent error handling - some functions throw, others call process.exit(1) directly
- **Impact**: Global error handler in index.ts sometimes bypassed; inconsistent error formatting
- **Suggested Approach**:
  ```typescript
  // Create custom error classes:
  class CLIError extends Error {
    constructor(message: string, public exitCode: number = 1) {
      super(message);
      this.name = 'CLIError';
    }
  }

  class CheckpointError extends CLIError {
    constructor(message: string) {
      super(message, 1);
      this.name = 'CheckpointError';
    }
  }

  // Then throw instead of process.exit:
  if (!checkpoint) {
    throw new CheckpointError('No checkpoint found. Cannot resume.\nRemove --resume flag to start fresh.');
  }

  // Update index.ts global handler to format CLIError nicely:
  process.on('uncaughtException', (error: Error) => {
    if (error instanceof CLIError) {
      console.error(`Error: ${error.message}`);
      process.exit(error.exitCode);
    }
    // ... existing logic for other errors
  });
  ```

### Refactor: Add Input Validation
- **Location**: src/cli/commands/map.ts (all functions)
- **Problem**: `process.cwd()` used without validating it's a valid directory or that user has write permissions
- **Impact**: Cryptic errors if run in invalid locations or without permissions
- **Suggested Approach**:
  ```typescript
  import * as fs from 'node:fs';

  function validateRepoRoot(repoRoot: string): void {
    // Check if directory exists
    if (!fs.existsSync(repoRoot)) {
      throw new CLIError(`Directory does not exist: ${repoRoot}`);
    }

    // Check if it's a directory
    const stats = fs.statSync(repoRoot);
    if (!stats.isDirectory()) {
      throw new CLIError(`Not a directory: ${repoRoot}`);
    }

    // Check if it's a git repo
    const gitDir = path.join(repoRoot, '.git');
    if (!fs.existsSync(gitDir)) {
      throw new CLIError('Not a git repository. rmap requires git for change detection.');
    }

    // Check write permissions (try to create .repo_map directory)
    const mapDir = path.join(repoRoot, '.repo_map');
    try {
      if (!fs.existsSync(mapDir)) {
        fs.mkdirSync(mapDir, { recursive: true });
      }
    } catch (error) {
      throw new CLIError(`Cannot write to directory: ${repoRoot}\nCheck file permissions.`);
    }
  }

  // Use at start of each command:
  const repoRoot = process.cwd();
  validateRepoRoot(repoRoot);
  ```

### Refactor: Extract Checkpoint Display Logic to Separate Function
- **Location**: src/cli/commands/map.ts lines 61-111
- **Problem**: Checkpoint display logic embedded in `showMapStatus()`, making both functions harder to understand
- **Impact**: Cannot reuse checkpoint display in other commands; testing difficult
- **Suggested Approach**:
  ```typescript
  interface CheckpointDisplayInfo {
    currentLevel: number;
    completedLevels: string[];
    status: string;
    startedAt: string;
    gitCommit: string;
    level3Progress?: {
      status: string;
      completedTasks: number;
      startedAt?: string;
    };
    validation?: {
      valid: boolean;
      error?: string;
    };
  }

  function prepareCheckpointDisplay(
    checkpoint: Checkpoint,
    currentCommit: string
  ): CheckpointDisplayInfo {
    const completedLevels = Object.entries(checkpoint.levels)
      .filter(([_, level]) => level.status === 'completed')
      .map(([levelNum]) => levelNum);

    const level3 = checkpoint.levels[3];
    const level3Progress = (level3?.status === 'in_progress' || level3?.status === 'interrupted')
      ? {
          status: level3.status,
          completedTasks: level3.completed_task_ids?.length || 0,
          startedAt: level3.started_at,
        }
      : undefined;

    const validation = validateCheckpoint(checkpoint, currentCommit);

    return {
      currentLevel: checkpoint.current_level,
      completedLevels,
      status: checkpoint.levels[checkpoint.current_level]?.status || 'unknown',
      startedAt: new Date(checkpoint.started_at).toLocaleString(),
      gitCommit: checkpoint.git_commit.substring(0, 7),
      level3Progress,
      validation: validation.valid ? undefined : validation,
    };
  }

  function displayCheckpointInfo(info: CheckpointDisplayInfo): void {
    console.log('📋 Checkpoint Information:');
    console.log(UI.DIVIDER);
    console.log(`Current level: ${info.currentLevel} (${info.status})`);
    console.log(`Completed levels: [${info.completedLevels.join(', ')}]`);
    // ... rest of display logic
  }
  ```

## Nice-to-Have Enhancements

### Enhancement: Support NO_COLOR Environment Variable
- **Location**: src/cli/commands/map.ts (all console output)
- **Description**: Respect standard NO_COLOR and CI environment variables to disable colored/emoji output
- **Benefit**: Better CI/CD integration; accessibility for users who prefer plain text; testing friendliness
- **Suggested Approach**: Use the `getUI()` function suggested in "Extract Display Constants" refactor above

### Enhancement: Add Progress Indicators for Long Operations
- **Location**: src/cli/commands/map.ts (buildFullMap, buildOrUpdateMap)
- **Description**: Show progress spinner or bar during long-running operations (map building)
- **Benefit**: Better user experience; users know the command is still running
- **Suggested Approach**:
  ```typescript
  // Use a library like 'ora' or 'cli-progress'
  import ora from 'ora';

  const spinner = ora('Building repository map...').start();
  try {
    const result = await buildMap({ ... });
    spinner.succeed('Map build complete!');
  } catch (error) {
    spinner.fail('Map build failed');
    throw error;
  }
  ```

### Enhancement: Add --quiet Flag for Scripting
- **Location**: All commands
- **Description**: Add global --quiet flag to suppress all non-essential output
- **Benefit**: Better for use in scripts and CI/CD pipelines
- **Suggested Approach**:
  ```typescript
  // In src/cli/index.ts:
  program
    .name('rmap')
    .description('A semantic repository map builder for coding agents')
    .version(version)
    .option('-q, --quiet', 'Suppress non-essential output');

  // Create logging utility:
  export const logger = {
    info: (message: string) => {
      if (!program.opts().quiet) console.log(message);
    },
    error: (message: string) => console.error(message), // Always show errors
    // ... etc
  };
  ```

### Enhancement: Add Command Aliases
- **Location**: src/cli/commands/map.ts, get-context.ts
- **Description**: Add shorter aliases for common commands (e.g., `rmap m` for `rmap map`, `rmap gc` for `rmap get-context`)
- **Benefit**: Faster typing for power users
- **Suggested Approach**:
  ```typescript
  export const mapCommand = new Command('map')
    .alias('m')  // ADD
    .description('Build or update repository map')
    // ... rest

  export const getContextCommand = new Command('get-context')
    .alias('gc')  // ADD
    .alias('ctx')  // ADD
    .description('Query repository context by tags, file, or path')
    // ... rest
  ```

### Enhancement: Add Verbose Mode for Debugging
- **Location**: src/cli/index.ts
- **Description**: Add --verbose flag to show detailed execution information (currently using undocumented DEBUG env var)
- **Benefit**: Easier debugging; better than undocumented environment variable
- **Suggested Approach**:
  ```typescript
  program
    .name('rmap')
    .description('A semantic repository map builder for coding agents')
    .version(version)
    .option('-v, --verbose', 'Show detailed execution information');

  // Replace DEBUG checks with:
  if (program.opts().verbose) {
    console.error(error.stack);
  }
  ```

### Enhancement: Improve Error Messages with Suggestions
- **Location**: src/cli/commands/get-context.ts lines 24-28, 32-38
- **Description**: Current error messages are functional but could provide more helpful suggestions
- **Benefit**: Better user experience, especially for new users
- **Suggested Approach**:
  ```typescript
  // Before:
  console.error('Error: Repository map not found.');
  console.error('Please run "rmap map" to build the repository map first.');

  // After:
  console.error('Error: Repository map not found at .repo_map/');
  console.error('');
  console.error('To fix this:');
  console.error('  1. Make sure you\'re in the repository root directory');
  console.error('  2. Run "rmap map" to build the repository map');
  console.error('');
  console.error('For more help, visit: https://github.com/yourusername/rmap#readme');
  ```
