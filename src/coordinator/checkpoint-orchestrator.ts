/**
 * Checkpoint Orchestrator
 *
 * Manages checkpoint state, progress tracking, and resumption for pipeline execution.
 * Handles both level-wide checkpoints and Level 3 task-specific progress.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  CheckpointState,
  Level0Output,
  Level1Output,
  TaskDelegation,
  DelegationTask,
  FileAnnotation,
} from '../core/types.js';
import { CHECKPOINT_FILES } from '../core/constants.js';
import {
  initCheckpoint,
  loadCheckpoint,
  validateCheckpoint,
  saveLevelOutput,
  loadLevelOutput,
  markLevelStarted,
  markLevelCompleted,
  markLevelInterrupted,
  updateLevelCheckpoint,
} from './checkpoint.js';
import {
  appendAnnotationsToFile,
  loadIncrementalAnnotations,
  clearIncrementalAnnotations,
  finalizeAnnotations,
} from './incremental-annotations.js';

/**
 * Level outputs union type for type-safe checkpoint loading
 */
type LevelOutput = Level0Output | Level1Output | TaskDelegation | FileAnnotation[];

/**
 * Checkpoint validation result
 */
interface CheckpointValidation {
  valid: boolean;
  error?: string;
}

/**
 * Orchestrates checkpoint operations for pipeline execution
 */
export class CheckpointOrchestrator {
  private checkpoint: CheckpointState;
  private readonly repoRoot: string;

  constructor(repoRoot: string, currentCommit: string) {
    this.repoRoot = repoRoot;
    this.checkpoint = initCheckpoint(repoRoot, currentCommit);
  }

  /**
   * Try to load and validate existing checkpoint
   *
   * @param currentCommit - Current git commit hash for validation
   * @param enableResume - Whether to attempt loading existing checkpoint
   * @returns Validation result with details
   */
  tryLoadCheckpoint(currentCommit: string, enableResume: boolean): CheckpointValidation {
    if (!enableResume) {
      return { valid: false, error: 'Resume disabled' };
    }

    const existing = loadCheckpoint(this.repoRoot);
    if (!existing) {
      return { valid: false, error: 'No checkpoint found' };
    }

    const validation = validateCheckpoint(existing, currentCommit);
    if (!validation.valid) {
      return { valid: false, error: validation.error };
    }

    // Use the loaded checkpoint
    this.checkpoint = existing;
    return { valid: true };
  }

  /**
   * Load completed level output if available
   *
   * @param level - Level number (0-4)
   * @returns Level output or null if not completed
   */
  loadCompletedLevel<T extends LevelOutput>(level: number): T | null {
    const levelState = this.checkpoint.levels[level];
    if (levelState?.status !== 'completed') {
      return null;
    }

    return loadLevelOutput<T>(this.repoRoot, level);
  }

  /**
   * Mark a level as started in checkpoint
   *
   * @param level - Level number (0-4)
   */
  startLevel(level: number): void {
    markLevelStarted(this.repoRoot, this.checkpoint, level);
  }

  /**
   * Save level output and mark as completed in checkpoint
   *
   * @param level - Level number (0-4)
   * @param output - Level output data
   * @param outputFile - Optional output filename
   */
  completeLevel(level: number, output: unknown, outputFile?: string): void {
    saveLevelOutput(this.repoRoot, level, output);
    markLevelCompleted(this.repoRoot, this.checkpoint, level, outputFile);
  }

  /**
   * Mark a level as interrupted in checkpoint
   *
   * @param level - Level number (0-4)
   */
  interruptLevel(level: number): void {
    markLevelInterrupted(this.repoRoot, this.checkpoint, level);
  }

  /**
   * Update checkpoint state for a specific level
   *
   * @param level - Level number (0-4)
   * @param data - Partial checkpoint data to merge
   */
  updateCheckpoint(level: number, data: Record<string, unknown>): void {
    updateLevelCheckpoint(this.repoRoot, this.checkpoint, level, data);
  }

  /**
   * Get current checkpoint state
   *
   * @returns Current checkpoint state
   */
  getCheckpoint(): CheckpointState {
    return this.checkpoint;
  }

  /**
   * Get current level number
   *
   * @returns Current level (0-4)
   */
  getCurrentLevel(): number {
    return this.checkpoint.current_level;
  }

  /**
   * Generate a stable task ID from task index and scope
   *
   * @param index - Task index in delegation.tasks array
   * @param scope - Task scope (e.g., "src/auth/")
   * @returns Stable task ID
   */
  private getTaskId(index: number, scope: string): string {
    const sanitizedScope = scope.replace(/[^a-zA-Z0-9]/g, '_');
    return `task_${index}_${sanitizedScope}`;
  }

  /**
   * Get path to Level 3 progress file
   *
   * @returns Absolute path to level3_progress.json
   */
  private getLevel3ProgressPath(): string {
    return path.join(this.repoRoot, '.repo_map', '.checkpoint', CHECKPOINT_FILES.LEVEL3_PROGRESS);
  }

  /**
   * Load saved Level 3 annotations from checkpoint
   *
   * @returns Array of previously completed annotations or empty array
   */
  loadLevel3Progress(): FileAnnotation[] {
    const progressPath = this.getLevel3ProgressPath();
    if (!fs.existsSync(progressPath)) {
      return [];
    }

    try {
      const content = fs.readFileSync(progressPath, 'utf8');
      return JSON.parse(content) as FileAnnotation[];
    } catch (error) {
      console.warn(`Warning: Failed to load Level 3 progress: ${error}`);
      return [];
    }
  }

  /**
   * Save Level 3 annotations to checkpoint
   *
   * @param annotations - Annotations to save
   */
  saveLevel3Progress(annotations: FileAnnotation[]): void {
    const progressPath = this.getLevel3ProgressPath();
    const dir = path.dirname(progressPath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write atomically using temp file
    const tempPath = path.join(dir, `.${path.basename(progressPath)}.tmp`);
    const json = JSON.stringify(annotations, null, 2);
    fs.writeFileSync(tempPath, json + '\n', 'utf8');
    fs.renameSync(tempPath, progressPath);
  }

  /**
   * Initialize Level 3 checkpoint state
   *
   * @param totalTasks - Total number of tasks
   */
  initializeLevel3(totalTasks: number): void {
    markLevelStarted(this.repoRoot, this.checkpoint, 3);
    updateLevelCheckpoint(this.repoRoot, this.checkpoint, 3, {
      tasks_total: totalTasks,
      tasks_completed: 0,
      completed_task_ids: [],
    });
  }

  /**
   * Get completed task IDs from Level 3 checkpoint
   *
   * @returns Set of completed task IDs
   */
  getCompletedTaskIds(): Set<string> {
    const level3State = this.checkpoint.levels[3];
    if (!level3State?.completed_task_ids) {
      return new Set();
    }
    return new Set(level3State.completed_task_ids as string[]);
  }

  /**
   * Filter tasks to only include incomplete ones (for resume)
   *
   * @param tasks - All tasks from delegation
   * @param delegation - Full task delegation
   * @returns Remaining incomplete tasks
   */
  filterRemainingTasks(
    tasks: DelegationTask[],
    delegation: TaskDelegation
  ): DelegationTask[] {
    const completedIds = this.getCompletedTaskIds();
    if (completedIds.size === 0) {
      return tasks;
    }

    return tasks.filter((task, index) => {
      const taskId = this.getTaskId(index, task.scope);
      return !completedIds.has(taskId);
    });
  }

  /**
   * Mark a task as completed in Level 3 checkpoint
   *
   * @param task - Task that was completed
   * @param delegation - Full task delegation
   * @param completedIds - Current set of completed IDs
   */
  markTaskCompleted(
    task: DelegationTask,
    delegation: TaskDelegation,
    completedIds: Set<string>
  ): void {
    const originalIndex = delegation.tasks.findIndex((t) => t.scope === task.scope);
    const taskId = this.getTaskId(originalIndex, task.scope);
    completedIds.add(taskId);

    updateLevelCheckpoint(this.repoRoot, this.checkpoint, 3, {
      tasks_completed: completedIds.size,
      completed_task_ids: Array.from(completedIds),
    });
  }

  /**
   * Mark multiple tasks as completed in Level 3 checkpoint
   *
   * @param tasks - Tasks that were completed
   * @param delegation - Full task delegation
   * @param existingCompletedIds - Existing completed IDs
   */
  markTasksCompleted(
    tasks: DelegationTask[],
    delegation: TaskDelegation,
    existingCompletedIds: Set<string>
  ): void {
    const allCompletedIds = new Set(existingCompletedIds);

    tasks.forEach((task) => {
      const originalIndex = delegation.tasks.findIndex((t) => t.scope === task.scope);
      const taskId = this.getTaskId(originalIndex, task.scope);
      allCompletedIds.add(taskId);
    });

    updateLevelCheckpoint(this.repoRoot, this.checkpoint, 3, {
      tasks_completed: allCompletedIds.size,
      completed_task_ids: Array.from(allCompletedIds),
    });
  }

  /**
   * Save annotations incrementally to JSONL file
   *
   * Appends annotations to the incremental file and updates checkpoint metadata.
   * Tracks count in memory to avoid O(n²) I/O from re-reading the file on every save.
   *
   * @param annotations - Annotations to save
   */
  async saveAnnotationsIncremental(annotations: FileAnnotation[]): Promise<void> {
    if (annotations.length === 0) {
      return;
    }

    // Append to JSONL file
    await appendAnnotationsToFile(this.repoRoot, annotations);

    // Track count in memory by incrementing from current checkpoint value
    const currentCount = this.checkpoint.levels[3]?.annotations_saved ?? 0;
    const newCount = currentCount + annotations.length;

    updateLevelCheckpoint(this.repoRoot, this.checkpoint, 3, {
      annotations_saved: newCount,
      last_saved_at: new Date().toISOString(),
    });
  }

  /**
   * Load incremental annotations from JSONL file
   *
   * @returns Array of previously saved annotations
   */
  async loadIncrementalProgress(): Promise<FileAnnotation[]> {
    return await loadIncrementalAnnotations(this.repoRoot);
  }

  /**
   * Clear incremental annotations file
   *
   * Called when starting fresh Level 3 run.
   */
  async clearIncrementalProgress(): Promise<void> {
    await clearIncrementalAnnotations(this.repoRoot);
  }

  /**
   * Finalize annotations by consolidating JSONL into annotations.json
   */
  async finalizeLevel3Annotations(): Promise<void> {
    await finalizeAnnotations(this.repoRoot);
  }
}
