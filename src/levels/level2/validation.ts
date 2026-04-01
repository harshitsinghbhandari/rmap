/**
 * Level 2 Task Delegation Validation
 *
 * Validates work division rules and constraints
 */

import type { Level0Output, TaskDelegation } from '../../core/types.js';
import { FILE, VALIDATION } from '../../config/index.js';

/**
 * Validation error for division rules
 */
export class DivisionRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DivisionRuleError';
  }
}

/**
 * Validate that task delegation follows division rules
 *
 * Rules:
 * 1. Max 50 files per task
 * 2. Total estimated files should roughly match actual files
 * 3. Task scopes should be reasonable (not empty strings)
 * 4. Agent sizes should match complexity heuristics
 */
export function validateDivisionRules(
  delegation: TaskDelegation,
  level0: Level0Output
): void {
  const { tasks, execution, estimated_total_minutes } = delegation;

  // Rule 1: Check max files per task
  for (const task of tasks) {
    if (task.estimated_files > FILE.MAX_FILES_PER_TASK) {
      throw new DivisionRuleError(
        `Task "${task.scope}" exceeds max files per task (${task.estimated_files} > ${FILE.MAX_FILES_PER_TASK})`
      );
    }

    if (task.estimated_files < 1) {
      throw new DivisionRuleError(
        `Task "${task.scope}" has invalid estimated_files: ${task.estimated_files}`
      );
    }
  }

  // Rule 2: Check total files estimation
  const totalEstimated = tasks.reduce((sum, task) => sum + task.estimated_files, 0);
  const actualFiles = level0.total_files;
  const deviation = Math.abs(totalEstimated - actualFiles);
  const deviationPercent = (deviation / actualFiles) * 100;

  if (deviationPercent > VALIDATION.MAX_DEVIATION_PERCENT) {
    throw new DivisionRuleError(
      `Total estimated files (${totalEstimated}) deviates too much from actual (${actualFiles}): ${deviationPercent.toFixed(1)}%`
    );
  }

  // Rule 3: Check for duplicate or overlapping scopes
  const scopes = new Set<string>();
  for (const task of tasks) {
    if (scopes.has(task.scope)) {
      throw new DivisionRuleError(`Duplicate task scope: "${task.scope}"`);
    }
    scopes.add(task.scope);
  }

  // Rule 4: Validate execution strategy makes sense
  if (execution !== 'parallel' && execution !== 'sequential') {
    throw new DivisionRuleError(
      `Invalid execution strategy: ${execution}. Must be "parallel" or "sequential"`
    );
  }

  // Rule 5: Sanity check on estimated time
  if (estimated_total_minutes < 1) {
    throw new DivisionRuleError(
      `Estimated total minutes must be at least 1, got: ${estimated_total_minutes}`
    );
  }

  // Warn if time estimate seems unrealistic
  const avgMinutesPerFile = estimated_total_minutes / actualFiles;
  if (avgMinutesPerFile > VALIDATION.MAX_MINUTES_PER_FILE_WARNING) {
    console.warn(
      `Warning: Estimated time seems high (${avgMinutesPerFile.toFixed(2)} minutes per file)`
    );
  }
}

/**
 * Apply division heuristics to suggest improvements
 *
 * This provides recommendations but doesn't enforce them
 */
export function applyDivisionHeuristics(
  delegation: TaskDelegation,
  level0: Level0Output
): {
  warnings: string[];
  suggestions: string[];
} {
  const warnings: string[] = [];
  const suggestions: string[] = [];

  const { tasks, execution } = delegation;
  const totalFiles = level0.total_files;

  // Heuristic 1: Check task balance
  const avgFilesPerTask = totalFiles / tasks.length;
  const imbalancedTasks = tasks.filter(
    (t) =>
      t.estimated_files > avgFilesPerTask * VALIDATION.TASK_IMBALANCE_HIGH_MULTIPLIER ||
      t.estimated_files < avgFilesPerTask * VALIDATION.TASK_IMBALANCE_LOW_MULTIPLIER
  );

  if (imbalancedTasks.length > tasks.length / 2) {
    warnings.push(
      `Many tasks (${imbalancedTasks.length}/${tasks.length}) are significantly imbalanced`
    );
    suggestions.push('Consider redistributing files more evenly across tasks');
  }

  // Heuristic 2: Check if parallel execution is preferred
  if (execution === 'sequential' && tasks.length > 3) {
    warnings.push('Sequential execution with many tasks may be slow');
    suggestions.push('Consider using parallel execution for independent modules');
  }

  // Heuristic 3: Check task granularity
  if (
    tasks.length < VALIDATION.MIN_TASK_COUNT_THRESHOLD &&
    totalFiles > VALIDATION.LARGE_REPO_FILE_THRESHOLD
  ) {
    suggestions.push(
      `Only ${tasks.length} tasks for ${totalFiles} files. Consider more granular division for better parallelism`
    );
  }

  if (tasks.length > 20) {
    suggestions.push(
      `Many tasks (${tasks.length}) may have coordination overhead. Consider grouping related scopes`
    );
  }

  // Heuristic 4: Agent size distribution
  const smallCount = tasks.filter((t) => t.agent_size === 'small').length;
  const mediumCount = tasks.filter((t) => t.agent_size === 'medium').length;
  const largeCount = tasks.filter((t) => t.agent_size === 'large').length;

  if (smallCount === 0 && totalFiles > VALIDATION.SMALL_TASK_SUGGESTION_THRESHOLD) {
    suggestions.push(
      'All tasks use medium/large agents. Consider using small agents for simpler files to reduce cost'
    );
  }

  if (largeCount > mediumCount + smallCount) {
    warnings.push('Most tasks use large agents, which may be expensive');
    suggestions.push('Review if all tasks truly need large agent complexity');
  }

  return { warnings, suggestions };
}
