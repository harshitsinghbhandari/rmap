/**
 * Level 4 - Consistency Validator
 *
 * Validates map consistency, detects orphans, and applies auto-fixes
 * Produces validation.json with categorized issues
 */

// Main validator
export {
  validateMap,
  getValidationSummary,
  groupIssuesByType,
  groupIssuesByFile,
  type ValidatorOptions,
  type ValidatorResult,
} from './validator.js';

// Consistency checks
export {
  runConsistencyChecks,
  checkImportsExist,
  checkGraphSymmetry,
  checkFilesExist,
  checkGraphMatchesAnnotations,
} from './checks.js';

// Orphan detection
export {
  runOrphanChecks,
  findOrphanFiles,
  findCircularDependencies,
  findFilesWithNoExports,
} from './orphans.js';

// Auto-fix capabilities
export {
  runAutofix,
  removeDeletedFiles,
  fixBrokenImportedBy,
  fixBrokenImports,
  type AutofixResult,
} from './autofix.js';
