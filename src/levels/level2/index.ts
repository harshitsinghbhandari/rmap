/**
 * Level 2 - Work Divider
 *
 * Exports work division functionality
 */

export { divideWork, DivisionValidationError } from './divider.js';
export {
  validateDivisionRules,
  applyDivisionHeuristics,
  DivisionRuleError,
} from './validation.js';
export { buildWorkDivisionPrompt, buildDirectoryGroups } from './prompt.js';

// Level 2.5 - LOC-based task builder (algorithmic, no LLM)
export {
  buildTaskAssignmentPlan,
  printTaskPlanSummary,
  getFilesForTask,
  validateTaskPlan,
} from './task-builder.js';
