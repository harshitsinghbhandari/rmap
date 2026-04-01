# Checkpoint Integration - Task 4 Complete

## What I Built

Implemented graceful shutdown handling for the checkpoint system in `src/coordinator/pipeline.ts`. The pipeline now catches SIGINT (Ctrl+C) and SIGTERM signals, saves checkpoint state, and exits cleanly.

### Changes to `pipeline.ts`

**1. Hoisted annotations variable** (line 286):
- Moved `annotations` declaration to function scope so signal handlers can access it
- Initialized as empty array at the top level

**2. Added signal handlers** (lines 242-273):
- Created `handleShutdown(signal)` function that:
  - Guards against multiple signals with `isShuttingDown` flag
  - Logs the received signal
  - Marks current level as 'interrupted' using `markLevelInterrupted()`
  - Saves Level 3 partial progress if applicable
  - Exits with code 0
- Registered SIGINT and SIGTERM handlers with stored function references

**3. Level 3 progress saving** (lines 259-263):
- When interrupted during Level 3, saves all completed annotations
- Logs count of partial annotations saved
- Works for both sequential and parallel execution modes

**4. Handler cleanup** (lines 453-456):
- Removes signal handlers when pipeline completes normally
- Prevents memory leaks and interference between runs
- Uses stored handler references (`sigintHandler`, `sigtermHandler`)

## Design Decisions

### 1. Guard flag for multiple signals
**Why**: User might spam Ctrl+C or send multiple signals. The `isShuttingDown` flag ensures we only handle the first signal and ignore subsequent ones during shutdown.

### 2. Signal handler function references
**Why**: Node.js requires exact function reference to remove listeners. We store `sigintHandler` and `sigtermHandler` so we can properly clean them up.

### 3. Only save Level 3 progress when annotations exist
**Why**: If annotations array is empty, there's nothing to checkpoint. This handles edge cases where Level 3 hasn't started yet or has no work to do.

### 4. Exit with code 0 (success)
**Why**: Graceful shutdown after checkpoint save is not an error—it's intentional. Exit code 0 allows scripts to distinguish between crashes and intentional interruption.

### 5. Mark all levels as interrupted (not just Level 3)
**Why**: Consistent checkpoint state. If interrupted during Levels 0-2, we still mark them as interrupted so resume logic knows what happened.

## Gotchas

### 1. **Parallel mode doesn't checkpoint mid-Promise.all**
If interrupted during parallel execution of Level 3 tasks, only previously completed tasks are saved. Work-in-progress tasks are lost. This is documented limitation—trade-off for simplicity.

**Workaround for future**: Could refactor to use `Promise.allSettled` with manual tracking and periodic checkpointing, but adds complexity.

### 2. **Signal handlers are synchronous**
`markLevelInterrupted` and `saveLevel3Progress` are synchronous file I/O. This is fine because:
- Atomic writes use temp files (no corruption risk)
- Node.js flushes buffers before process.exit()
- Fast enough that user won't notice delay

### 3. **Handler cleanup happens on normal completion only**
If process crashes (segfault, unhandled exception), handlers aren't cleaned up. This is acceptable because the process is dying anyway.

### 4. **Checkpoint state mutates in place**
The `markLevelInterrupted` function mutates the `checkpoint` object directly. No need to reassign the result.

### 5. **Current level tracking**
Signal handler uses `checkpoint.current_level` which is updated as pipeline progresses. Always reflects the level being executed when interrupt occurs.

## Testing

Tested scenarios:
1. ✅ Ctrl+C during Level 0 - marks as interrupted, no partial progress
2. ✅ Ctrl+C during Level 3 sequential - saves completed tasks
3. ✅ Ctrl+C during Level 3 parallel - saves whatever completed before interrupt
4. ✅ Normal completion - handlers cleaned up, no interference
5. ✅ Multiple signals (spam Ctrl+C) - only first signal handled

## For the Next Agent (Task 5: CLI Integration)

### What's Left to Do

The checkpoint system now works end-to-end with graceful shutdown. The next step is to expose checkpoint functionality through CLI commands.

**Task 5** is to add CLI commands for checkpoint management:
1. `rmap map --resume` - Resume from checkpoint (default behavior)
2. `rmap map --no-resume` - Ignore checkpoint, start fresh
3. `rmap checkpoint status` - Show checkpoint state
4. `rmap checkpoint clear` - Delete checkpoint and start over

### Where to Hook In

You'll need to modify:

1. **`src/cli/commands/map.ts`** - Add flags:
```typescript
.option('--resume', 'Resume from checkpoint if available (default: true)')
.option('--no-resume', 'Ignore checkpoint and start fresh')
```

The pipeline already accepts `resume` option in `PipelineOptions`, so just wire it through:
```typescript
await runPipeline({
  repoRoot,
  forceFullRebuild: options.full,
  parallel: options.parallel,
  resume: options.resume, // ← add this
});
```

2. **Create `src/cli/commands/checkpoint.ts`** - New command:
```typescript
export const checkpointCommand = (program: Command) => {
  const checkpoint = program
    .command('checkpoint')
    .description('Manage pipeline checkpoints');

  checkpoint
    .command('status')
    .description('Show checkpoint state')
    .action(async () => {
      const checkpoint = loadCheckpoint(process.cwd());
      if (!checkpoint) {
        console.log('No checkpoint found.');
        return;
      }
      console.log(getCheckpointSummary(checkpoint));
    });

  checkpoint
    .command('clear')
    .description('Delete checkpoint and start fresh')
    .action(async () => {
      clearCheckpoint(process.cwd());
      console.log('✓ Checkpoint cleared.');
    });
};
```

3. **`src/cli/index.ts`** - Register new command:
```typescript
import { checkpointCommand } from './commands/checkpoint.js';

// ...
checkpointCommand(program);
```

### Files to Study

- `src/cli/commands/map.ts` - existing map command to extend
- `src/cli/index.ts` - CLI entry point
- `src/coordinator/checkpoint.ts` - checkpoint functions to expose
- Commander.js docs: https://github.com/tj/commander.js

### Expected Behavior

**Resume flow** (user runs `rmap map` after Ctrl+C):
```
🗺️  Starting rmap pipeline...
Repository: /Users/foo/myrepo
Mode: AUTO
📋 Found valid checkpoint, resuming from last completed level...
  ✓ Level 0 already completed
  ✓ Level 1 already completed
  ✓ Level 2 already completed
  ⏸️  Level 3 partially completed: 5 tasks done

⏩ Level 3: Deep File Annotator
Resuming Level 3: 3 tasks remaining (5 already completed)
Running 3 tasks sequentially...
...
```

**Status command**:
```bash
$ rmap checkpoint status
Checkpoint at level 3 (in_progress). Completed: [0, 1, 2]
Started: 2024-01-15T10:30:00.000Z
Git commit: a1b2c3d

Level 3: Deep File Annotator
  Status: interrupted
  Tasks completed: 5/8
  Started: 2024-01-15T10:32:15.000Z
```

**Clear command**:
```bash
$ rmap checkpoint clear
✓ Checkpoint cleared.

$ rmap checkpoint status
No checkpoint found.
```

### Things to Watch Out For

- **Default value for --resume**: Commander handles `--no-resume` automatically if you use `.option('--resume', ..., true)` with default value
- **Error handling**: `rmap checkpoint status` should gracefully handle missing .repo_map directory
- **Path resolution**: Use `process.cwd()` to get current directory, or accept `--path` flag
- **Validation**: `checkpoint status` should validate checkpoint and show why it's invalid if applicable
- **Colors**: Consider using chalk or similar for colored output (warnings in yellow, errors in red, success in green)

### Suggested Implementation Steps

1. **Add flags to map command**: Wire `--resume` and `--no-resume` through to `runPipeline`
2. **Test resume behavior**: Interrupt pipeline, verify resume works, verify `--no-resume` starts fresh
3. **Create checkpoint command**: Implement `status` and `clear` subcommands
4. **Add output formatting**: Make `status` output human-readable and informative
5. **Write CLI tests**: Test all new commands and flags
6. **Update README**: Document checkpoint commands in usage section

### Optional Enhancements

- Add `rmap checkpoint repair` to fix broken checkpoints
- Add `--checkpoint-path` flag to specify custom checkpoint location
- Show estimated time remaining based on checkpoint progress
- Add progress bars for long-running operations

Good luck! The checkpoint system is solid and ready for CLI integration.

---

# Checkpoint Integration - Task 3 Complete (Previous)

## What I Built

Implemented task-level checkpointing for Level 3 (Deep File Annotator) in `src/coordinator/pipeline.ts`. Level 3 is now fully resilient to interruption and can resume from any point of partial completion.

### Changes to `pipeline.ts`

**Added helper functions** (lines 100-164):
- `getTaskId(index, scope)`: Generates stable task IDs like `task_0_src_auth_`
- `getLevel3ProgressPath(repoPath)`: Returns path to level3_progress.json
- `loadLevel3Progress(repoPath)`: Loads saved annotations from checkpoint
- `saveLevel3Progress(repoPath, annotations)`: Atomically saves annotations

**Updated resume logic** (lines 188-228):
- Added `level3Annotations` and `completedTaskIds` variables
- Load Level 3 partial progress if status is 'in_progress'
- Load completed annotations and task IDs from checkpoint
- Log resume message with task count

**Level 3 execution with checkpointing** (lines 284-376):
- Skip entirely if Level 3 already completed (load from checkpoint)
- Initialize task tracking on first run or resume
- Filter out completed tasks using `completedTaskIds`
- Sequential mode: checkpoint after each task completes
- Parallel mode: checkpoint all tasks after Promise.all
- Save final annotations and mark level completed

## Design Decisions

### 1. Task ID generation from index + scope
**Why**: Tasks don't have built-in IDs, so we generate stable ones. Using both index and scope prevents collisions and makes IDs human-readable for debugging.

### 2. Atomic writes for progress file
**Why**: Uses temp file + rename pattern (same as checkpoint.ts) to prevent corruption if process dies mid-write.

### 3. Filter tasks rather than track indices
**Why**: More robust to task order changes. If delegation changes between runs (shouldn't happen but could), we still correctly identify completed work by scope.

### 4. Start with old annotations, append new ones
**Why**: Simple and correct. We don't need to deduplicate because completed tasks are filtered out before execution.

### 5. Parallel mode checkpoints at end, not incrementally
**Why**: `Promise.all` doesn't give per-task completion hooks. Could refactor to use `Promise.allSettled` with manual tracking, but current approach is simpler and still prevents data loss (all-or-nothing for remaining tasks).

### 6. Load full annotations on completed Level 3
**Why**: If Level 3 finished, we skip execution entirely and load final result. Consistent with how Levels 0-2 work.

## Gotchas

### 1. **Task ID stability matters**
The `getTaskId` function uses `index` and `scope`. If task order changes between runs, task IDs change. This shouldn't happen in practice (Level 2 is deterministic), but if it does, resume would fail gracefully (restart Level 3 from scratch).

### 2. **Checkpoint state updates are in-place**
The `updateLevelCheckpoint` function mutates the `checkpoint` object and saves it. No need to reassign the result.

### 3. **Sequential mode is fully incremental**
Each task completion triggers a checkpoint. If interrupted after task 5 of 10, resume skips tasks 1-5 and continues from task 6.

### 4. **Parallel mode is all-or-nothing for remaining tasks**
If 3 tasks were completed and 7 remain, and we interrupt during parallel execution of those 7, we lose progress on the partial work of those 7. They'll restart from scratch on resume. This is acceptable trade-off for simplicity.

### 5. **Annotations are saved to two files**
- `level3_progress.json`: Incremental progress during execution
- `level0.json`: Final output when level completes (via `saveLevelOutput`)
This redundancy is intentional - progress file is for resume, level output is for completed state.

### 6. **Empty annotations array is valid**
If no files match any task scope (unlikely but possible), Level 3 completes with empty array. This is handled correctly.

## For the Next Agent (Task 4: Graceful Shutdown Handler)

### What's Left to Do

The checkpoint system now works for Levels 0-3, but it only saves on successful completion. If the process is killed (Ctrl+C, OOM, crash), Level 3 loses progress on the current task.

**Task 4** is to add signal handlers that:
1. Catch SIGINT (Ctrl+C) and SIGTERM
2. Mark the current level as 'interrupted'
3. Save partial progress
4. Exit gracefully

### Where to Hook In

You'll need to modify `src/coordinator/pipeline.ts`:

1. **Add signal handlers at the start of `runPipeline`** (around line 172):
```typescript
// Set up graceful shutdown handlers
const shutdown = (signal: string) => {
  console.log(`\n⚠️  Received ${signal}, saving checkpoint...`);

  // Mark current level as interrupted
  if (checkpoint.current_level < 5) {
    markLevelInterrupted(repoRoot, checkpoint, checkpoint.current_level);
  }

  // For Level 3, save current progress
  if (checkpoint.current_level === 3 && annotations.length > 0) {
    saveLevel3Progress(repoRoot, annotations);
  }

  console.log('✓ Checkpoint saved. Run again to resume.');
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
```

2. **Problem**: The `annotations` variable is scoped inside the Level 3 block. You'll need to hoist it to the top of `runPipeline` so the signal handler can access it.

3. **Problem**: Signal handlers are asynchronous, but `markLevelInterrupted` and `saveLevel3Progress` are synchronous. This should be fine, but test thoroughly.

4. **Edge case**: What if SIGINT arrives during Level 0-2? Those levels don't have partial progress to save. Just mark as interrupted and exit.

5. **Edge case**: What if SIGINT arrives during `Promise.all` in parallel mode? Some tasks might be mid-flight. You can't checkpoint them individually. Just save whatever's in `annotations` so far (which is from previous completed tasks only).

### Suggested Implementation Steps

1. **Hoist variables**: Move `annotations` declaration to top-level in `runPipeline` so signal handlers can access it
2. **Add signal handlers**: Register SIGINT and SIGTERM handlers at start of `runPipeline`
3. **Implement graceful shutdown**:
   - Log the signal
   - Mark current level as interrupted
   - Save Level 3 progress if applicable
   - Exit cleanly
4. **Test scenarios**:
   - Ctrl+C during Level 0 (no partial progress)
   - Ctrl+C during Level 3 sequential (should save completed tasks)
   - Ctrl+C during Level 3 parallel (saves whatever's done)
   - Kill -15 (SIGTERM) during Level 3
5. **Remove handlers on completion**: Clean up handlers when pipeline completes normally

### Things to Watch Out For

- **Don't double-checkpoint**: If Level 3 completes normally, it already saves. Don't save again in cleanup.
- **Handler cleanup**: Remove signal handlers when pipeline finishes, or they'll leak between test runs
- **Process.exit timing**: Make sure all I/O is flushed before `process.exit(0)`. Node usually handles this, but test it.
- **Partial parallel tasks**: You can't checkpoint mid-Promise.all. Document this limitation.
- **Multiple signals**: If user spams Ctrl+C, handler might fire multiple times. Add a guard flag.

### Files to Study

- `src/coordinator/pipeline.ts` - where signal handlers go
- `src/coordinator/checkpoint.ts` - `markLevelInterrupted` is already implemented
- Node.js docs on process signals: https://nodejs.org/api/process.html#signal-events

### Testing Your Changes

After implementing:
1. Run pipeline and press Ctrl+C during Level 3 sequential
2. Verify checkpoint shows 'interrupted' status
3. Re-run pipeline and verify it resumes from the checkpoint
4. Run pipeline to completion and verify handlers don't interfere
5. Test SIGTERM as well (kill -15 <pid>)

### Expected Output

When interrupted:
```
⚠️  Received SIGINT, saving checkpoint...
✓ Checkpoint saved. Run again to resume.
```

When resumed:
```
📋 Found valid checkpoint, resuming from last completed level...
  ✓ Level 0 already completed
  ✓ Level 1 already completed
  ✓ Level 2 already completed
  ⏸️  Level 3 partially completed: 5 tasks done
```

Good luck! The checkpoint infrastructure is solid, you just need to wire up the signal handlers.
