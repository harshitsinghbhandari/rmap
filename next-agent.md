# Checkpoint Integration - Task 2 Complete

## What I Built

Integrated the checkpoint system (from Task 1) into `src/coordinator/pipeline.ts` for Levels 0, 1, and 2:

### Changes to `pipeline.ts`
- **Added imports**: Imported checkpoint functions (`initCheckpoint`, `loadCheckpoint`, `validateCheckpoint`, `saveLevelOutput`, `loadLevelOutput`, `markLevelStarted`, `markLevelCompleted`) and `CheckpointState` type
- **Added `resume` option**: Added optional `resume?: boolean` to `PipelineOptions` (defaults to `true`)
- **Added `getGitCommit()` helper**: Utility function to get current git commit hash (extracted from level0 harvester pattern)
- **Checkpoint initialization**: At pipeline start, loads existing checkpoint or creates new one with `initCheckpoint(repoPath, gitCommit)`
- **Resume logic**: Validates checkpoint against current git commit, loads completed level outputs, skips completed work
- **Level 0-2 checkpointing**: Each level now:
  1. Checks if output already loaded from checkpoint
  2. Calls `markLevelStarted()` before execution
  3. Executes the level
  4. Calls `saveLevelOutput()` to save results
  5. Calls `markLevelCompleted()` to mark as done

## Design Decisions

### 1. Resume defaults to `true`
**Why**: Makes checkpointing automatic without requiring user intervention. Pipeline auto-resumes if interrupted and re-run.

### 2. Variables declared as nullable at top level
```typescript
let level0: Level0Output | null = null;
let level1: Level1Output | null = null;
let delegation: TaskDelegation | null = null;
```
**Why**: Allows resume logic to populate them from checkpoint, then each level checks `if (!level0)` before running. Clean conditional execution pattern.

### 3. Git commit validation
**Why**: Prevents resuming from stale checkpoint if code changed. If git commit differs, checkpoint is invalid and pipeline starts fresh.

### 4. Checkpoint created even if resume is disabled
**Why**: Even without resume, we still want to save checkpoints for potential future resume. The `resume` option only controls whether we *load* checkpoints, not whether we *create* them.

### 5. Used existing `getGitCommit()` pattern from level0
**Why**: Consistency with existing codebase. Same error handling and fallback to 'unknown' if not a git repo.

## Gotchas

### 1. **Level ordering matters**
The resume logic loads levels 0, 1, 2 in order. If you add checkpointing to Level 3, make sure to maintain this sequential check pattern.

### 2. **Checkpoint state is passed by reference**
The `checkpoint` state object is passed to all `markLevel*()` functions and mutated in place. This means you don't need to reassign it after each call - the state is automatically updated.

### 3. **LLM tracking still works**
Even when skipping completed levels via resume, the `tracker.trackLLMCall()` calls are inside the conditional blocks, so we correctly don't track LLM usage for skipped work.

### 4. **Level 3 is not checkpointed yet**
Level 3 has parallel task execution and needs task-level checkpointing (partial completion tracking). That's Task 3's job. Don't try to wrap it the same way as levels 0-2.

### 5. **Validation happens silently**
If checkpoint validation fails (wrong version or git commit mismatch), we log a warning but continue with fresh checkpoint. No error thrown. This is intentional - failed resume should not block pipeline execution.

## For the Next Agent (Task 3: Level 3 Task-Level Checkpointing)

### Where to Hook In

Level 3 execution starts at line ~199 in `pipeline.ts`:

```typescript
// ===== LEVEL 3: Deep File Annotator =====
tracker.startLevel('Level 3: Deep File Annotator');

let annotations: FileAnnotation[];

if (parallel && delegation.execution === 'parallel') {
  // Run tasks in parallel
  // ... Promise.all logic ...
} else {
  // Run tasks sequentially
  // ... loop logic ...
}

tracker.completeLevel('Level 3: Deep File Annotator');
```

### What You Need to Do

1. **Add task-level checkpoint tracking**:
   - Use `checkpoint.levels[3].tasks_total`, `tasks_completed`, and `completed_task_ids` fields (already defined in `LevelCheckpoint` type in types.ts)
   - Save partial results after each task completes (use `saveLevelOutput` for progress, or create new function for task outputs)

2. **Resume partial Level 3 work**:
   - Check if Level 3 was interrupted (`status === 'in_progress'`)
   - Load `completed_task_ids` from checkpoint
   - Filter out completed tasks from `delegation.tasks`
   - Only process remaining tasks

3. **Checkpoint files**:
   - Checkpoint infrastructure supports `CHECKPOINT_FILES.LEVEL3_PROGRESS` and `CHECKPOINT_FILES.LEVEL3_TASKS` (see constants.ts)
   - Use these for tracking partial completion

4. **Parallel vs Sequential**:
   - Sequential is easier - checkpoint after each task completes
   - Parallel is harder - need to checkpoint as tasks complete (Promise.all doesn't give you per-task completion hooks)
   - Consider using `Promise.allSettled()` or tracking completion with callbacks

### Things to Watch Out For

- **Don't break the existing resume flow**: Levels 0-2 resume is already working. Make sure your Level 3 changes integrate smoothly.
- **Test both parallel and sequential modes**: The `parallel` option affects Level 3 execution.
- **Annotations array**: Level 3 produces `FileAnnotation[]` by flattening task results. When resuming, you need to combine old annotations with new ones.
- **Duplicate annotations**: Make sure you don't re-annotate files that were already completed. Track by task ID, not file path.
- **checkpoint state updates**: Call `markLevelStarted(repoPath, checkpoint, 3)` before Level 3 starts, and update task counts as you go.

### Suggested Approach

1. Start by handling the **sequential case** first (simpler)
2. Add checkpoint after each task in the loop
3. Save task ID to `completed_task_ids` after each completion
4. Update `tasks_completed` counter
5. Then tackle **parallel case** (harder, needs concurrent checkpoint updates)

### Testing Your Changes

After implementing, test these scenarios:
1. Fresh run (no checkpoint) - should work normally
2. Interrupt during Level 3 sequential - resume should skip completed tasks
3. Interrupt during Level 3 parallel - resume should skip completed tasks
4. Complete Level 3, interrupt Level 4 - resume should skip Level 3 entirely

Good luck! The infrastructure is all there in checkpoint.ts, you just need to wire it up for Level 3's task-based execution model.
