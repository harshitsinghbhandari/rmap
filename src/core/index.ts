/**
 * Core module exports
 *
 * Re-exports all types and constants from the core module
 */

// Export all types
export type {
  FileAnnotation,
  Module,
  MetaJson,
  GraphNode,
  GraphJson,
  TagsJson,
  StatsJson,
  ValidationSeverity,
  ValidationIssue,
  ValidationJson,
  DelegationTask,
  TaskDelegation,
  RawFileMetadata,
} from './types.js';

// Export all constants
export {
  SCHEMA_VERSION,
  TAG_TAXONOMY,
  TAG_ALIASES,
  UPDATE_THRESHOLDS,
  MAX_TAGS_PER_FILE,
  MAX_FILES_PER_TASK,
} from './constants.js';

// Export Tag type
export type { Tag } from './constants.js';

// Export git utilities
export {
  validateGitRef,
  safeGitExec,
  getGitDiffSafe,
  getCommitTimestampSafe,
  getCommitCountSafe,
  getCurrentCommitSafe,
} from './git-utils.js';
