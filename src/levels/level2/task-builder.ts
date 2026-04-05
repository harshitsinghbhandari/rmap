/**
 * Level 2.5 Task Builder
 *
 * Deterministic, algorithmic task division based on Lines of Code (LOC).
 * Creates explicit file-to-task mapping without LLM involvement.
 *
 * Algorithm:
 * 1. Sort files by directory path (to keep related files together)
 * 2. Group files into tasks targeting ~500 LOC per task
 * 3. Large files (>500 LOC) get their own task and are trimmed for LLM
 * 4. Small files are clubbed together until reaching the target LOC
 * 5. Each task = one LLM session
 */

import type {
  Level0Output,
  RawFileMetadata,
  FileTaskAssignment,
  ExplicitTask,
  TaskAssignmentPlan,
} from '../../core/types.js';
import { LOC } from '../../config/index.js';

/**
 * Internal type for building tasks
 */
interface TaskBuilder {
  taskId: string;
  files: FileTaskAssignment[];
  totalLoc: number;
  originalLoc: number;
}

/**
 * Calculate effective LOC for a file (trimmed if too large)
 *
 * @param loc - Original line count
 * @returns Effective LOC to send to LLM
 */
function calculateEffectiveLoc(loc: number): number {
  if (loc <= LOC.MAX_LOC_PER_FILE_FOR_LLM) {
    return loc;
  }
  return LOC.MAX_LOC_PER_FILE_FOR_LLM;
}

/**
 * Extract directory path from a file path
 *
 * @param filePath - Relative file path (e.g., "src/core/utils.ts")
 * @returns Directory path (e.g., "src/core")
 */
function getDirectory(filePath: string): string {
  const parts = filePath.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
}

/**
 * Determine agent size based on file characteristics
 *
 * @param files - Files in the task
 * @returns Recommended agent size
 */
function determineAgentSize(
  files: FileTaskAssignment[]
): 'small' | 'medium' | 'large' {
  // If any file is large (complex), use medium agent
  const hasLargeFile = files.some((f) => f.loc > LOC.LARGE_FILE_THRESHOLD);

  // Check for complex file types
  const hasComplexFile = files.some((f) => {
    const ext = f.path.split('.').pop()?.toLowerCase();
    // Complex files typically need more capable agents
    const complexExtensions = ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java'];
    return complexExtensions.includes(ext || '') && f.loc > 100;
  });

  // Check if mostly config/test files
  const configOrTestRatio =
    files.filter((f) => {
      const name = f.path.toLowerCase();
      return (
        name.includes('config') ||
        name.includes('test') ||
        name.includes('.json') ||
        name.includes('.yaml') ||
        name.includes('.yml') ||
        name.includes('.md') ||
        name.includes('.env')
      );
    }).length / files.length;

  if (hasLargeFile || hasComplexFile) {
    return 'medium';
  }

  if (configOrTestRatio > 0.7) {
    return 'small';
  }

  return 'small';
}

/**
 * Get the most common directory among files (primary directory for the task)
 *
 * @param files - Files in the task
 * @returns Most common directory path
 */
function getPrimaryDirectory(files: FileTaskAssignment[]): string {
  const dirCounts = new Map<string, number>();

  for (const file of files) {
    const dir = getDirectory(file.path);
    dirCounts.set(dir, (dirCounts.get(dir) || 0) + 1);
  }

  let maxCount = 0;
  let primaryDir = '.';

  for (const [dir, count] of dirCounts) {
    if (count > maxCount) {
      maxCount = count;
      primaryDir = dir;
    }
  }

  return primaryDir;
}

/**
 * Create an ExplicitTask from a TaskBuilder
 *
 * @param builder - Internal task builder state
 * @returns Finalized ExplicitTask
 */
function finalizeTask(builder: TaskBuilder): ExplicitTask {
  return {
    taskId: builder.taskId,
    files: builder.files,
    totalLoc: builder.totalLoc,
    originalLoc: builder.originalLoc,
    fileCount: builder.files.length,
    primaryDirectory: getPrimaryDirectory(builder.files),
    agentSize: determineAgentSize(builder.files),
  };
}

/**
 * Build task assignment plan from Level 0 metadata
 *
 * This is the main entry point for Level 2.5 task division.
 * It creates an explicit mapping of every file to a specific task.
 *
 * @param level0 - Level 0 output with file metadata
 * @returns TaskAssignmentPlan with explicit file-to-task mapping
 */
export function buildTaskAssignmentPlan(level0: Level0Output): TaskAssignmentPlan {
  const targetLoc = LOC.TARGET_LOC_PER_TASK;

  // Sort files by directory path, then by file path
  // This keeps related files together
  const sortedFiles = [...level0.files].sort((a, b) => {
    const dirA = getDirectory(a.path);
    const dirB = getDirectory(b.path);
    if (dirA !== dirB) {
      return dirA.localeCompare(dirB);
    }
    return a.path.localeCompare(b.path);
  });

  const tasks: ExplicitTask[] = [];
  const fileToTask: Record<string, string> = {};
  let trimmedFileCount = 0;
  let taskCounter = 0;

  // Current task being built
  let currentTask: TaskBuilder | null = null;

  /**
   * Start a new task
   */
  function startNewTask(): TaskBuilder {
    taskCounter++;
    return {
      taskId: `task_${taskCounter.toString().padStart(3, '0')}`,
      files: [],
      totalLoc: 0,
      originalLoc: 0,
    };
  }

  /**
   * Finalize current task and add to list
   */
  function finishCurrentTask(): void {
    if (currentTask && currentTask.files.length > 0) {
      tasks.push(finalizeTask(currentTask));
    }
    currentTask = null;
  }

  // Process each file
  for (const file of sortedFiles) {
    const loc = file.line_count;
    const effectiveLoc = calculateEffectiveLoc(loc);
    const trimmed = effectiveLoc < loc;

    if (trimmed) {
      trimmedFileCount++;
    }

    // Create file assignment
    const assignment: FileTaskAssignment = {
      path: file.path,
      taskId: '', // Will be set below
      loc,
      effectiveLoc,
      trimmed,
      language: file.language,
    };

    // Decision: Should this file go in its own task?
    const isLargeFile = loc > targetLoc;

    if (isLargeFile) {
      // Large files get their own task
      finishCurrentTask();

      const soloTask = startNewTask();
      assignment.taskId = soloTask.taskId;
      soloTask.files.push(assignment);
      soloTask.totalLoc = effectiveLoc;
      soloTask.originalLoc = loc;

      fileToTask[file.path] = soloTask.taskId;
      tasks.push(finalizeTask(soloTask));
    } else {
      // Check if we need to start a new task
      if (!currentTask) {
        currentTask = startNewTask();
      }

      // Check if adding this file would exceed target
      // Also check if we're switching directories (prefer keeping directories together)
      const currentDir = currentTask.files.length > 0
        ? getDirectory(currentTask.files[currentTask.files.length - 1].path)
        : null;
      const newDir = getDirectory(file.path);
      const dirChange = currentDir !== null && currentDir !== newDir;

      // If adding this file exceeds target AND we already have files,
      // OR if we're changing directories and current task is reasonably sized
      const wouldExceedTarget = currentTask.totalLoc + effectiveLoc > targetLoc;
      const shouldSplitForDir = dirChange && currentTask.totalLoc >= targetLoc * 0.5;

      if ((wouldExceedTarget && currentTask.files.length > 0) || shouldSplitForDir) {
        finishCurrentTask();
        currentTask = startNewTask();
      }

      // Add file to current task
      assignment.taskId = currentTask.taskId;
      currentTask.files.push(assignment);
      currentTask.totalLoc += effectiveLoc;
      currentTask.originalLoc += loc;
      fileToTask[file.path] = currentTask.taskId;
    }
  }

  // Finalize last task
  finishCurrentTask();

  // Calculate totals
  const totalLoc = level0.files.reduce((sum, f) => sum + f.line_count, 0);

  return {
    tasks,
    fileToTask,
    totalFiles: level0.files.length,
    totalLoc,
    targetLocPerTask: targetLoc,
    trimmedFileCount,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Print task assignment plan summary to console
 *
 * @param plan - Task assignment plan
 */
export function printTaskPlanSummary(plan: TaskAssignmentPlan): void {
  console.log('\n=== Level 2.5: Task Assignment Plan ===\n');
  console.log(`Total files: ${plan.totalFiles}`);
  console.log(`Total LOC: ${plan.totalLoc.toLocaleString()}`);
  console.log(`Target LOC per task: ${plan.targetLocPerTask}`);
  console.log(`Tasks created: ${plan.tasks.length}`);
  console.log(`Trimmed files: ${plan.trimmedFileCount}`);

  // Calculate stats
  const locs = plan.tasks.map((t) => t.totalLoc);
  const avgLoc = Math.round(locs.reduce((a, b) => a + b, 0) / locs.length);
  const minLoc = Math.min(...locs);
  const maxLoc = Math.max(...locs);

  console.log(`\nLOC distribution: min=${minLoc}, avg=${avgLoc}, max=${maxLoc}`);

  // Agent size distribution
  const small = plan.tasks.filter((t) => t.agentSize === 'small').length;
  const medium = plan.tasks.filter((t) => t.agentSize === 'medium').length;
  const large = plan.tasks.filter((t) => t.agentSize === 'large').length;
  console.log(`Agent sizes: ${small} small, ${medium} medium, ${large} large`);

  console.log('\n--- Task Details ---\n');

  for (const task of plan.tasks) {
    const trimmedNote = task.files.some((f) => f.trimmed) ? ' (has trimmed files)' : '';
    console.log(
      `${task.taskId}: ${task.fileCount} files, ${task.totalLoc} LOC [${task.agentSize}] - ${task.primaryDirectory}/${trimmedNote}`
    );

    // Show first few files
    for (const file of task.files.slice(0, 3)) {
      const trimMark = file.trimmed ? ` [trimmed: ${file.loc} → ${file.effectiveLoc}]` : '';
      console.log(`    - ${file.path} (${file.loc} LOC)${trimMark}`);
    }

    if (task.files.length > 3) {
      console.log(`    ... and ${task.files.length - 3} more files`);
    }
  }
}

/**
 * Get files for a specific task
 *
 * @param plan - Task assignment plan
 * @param taskId - Task ID to get files for
 * @returns Array of file metadata for the task
 */
export function getFilesForTask(
  plan: TaskAssignmentPlan,
  taskId: string,
  level0: Level0Output
): RawFileMetadata[] {
  const task = plan.tasks.find((t) => t.taskId === taskId);
  if (!task) {
    return [];
  }

  const filePaths = new Set(task.files.map((f) => f.path));
  return level0.files.filter((f) => filePaths.has(f.path));
}

/**
 * Validate that all files are assigned to exactly one task
 *
 * @param plan - Task assignment plan
 * @param level0 - Level 0 output
 * @returns Validation result with any issues found
 */
export function validateTaskPlan(
  plan: TaskAssignmentPlan,
  level0: Level0Output
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // Check all files are assigned
  const assignedFiles = new Set(Object.keys(plan.fileToTask));
  const allFiles = new Set(level0.files.map((f) => f.path));

  for (const filePath of allFiles) {
    if (!assignedFiles.has(filePath)) {
      issues.push(`File not assigned to any task: ${filePath}`);
    }
  }

  // Check no duplicate assignments
  const seenFiles = new Set<string>();
  for (const task of plan.tasks) {
    for (const file of task.files) {
      if (seenFiles.has(file.path)) {
        issues.push(`File assigned to multiple tasks: ${file.path}`);
      }
      seenFiles.add(file.path);
    }
  }

  // Check task IDs are unique
  const taskIds = new Set<string>();
  for (const task of plan.tasks) {
    if (taskIds.has(task.taskId)) {
      issues.push(`Duplicate task ID: ${task.taskId}`);
    }
    taskIds.add(task.taskId);
  }

  // Check file counts match
  if (plan.totalFiles !== level0.files.length) {
    issues.push(
      `File count mismatch: plan has ${plan.totalFiles}, level0 has ${level0.files.length}`
    );
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}
