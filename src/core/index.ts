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
  CheckpointState,
  LevelCheckpoint,
  LevelStatus,
  Level0Output,
  Level1Output,
} from './types.js';

// Export all constants
export {
  SCHEMA_VERSION,
  TAG_TAXONOMY,
  TAG_ALIASES,
  UPDATE_THRESHOLDS,
  MAX_TAGS_PER_FILE,
  MAX_FILES_PER_TASK,
  CHECKPOINT_DIR,
  CHECKPOINT_VERSION,
  CHECKPOINT_FILES,
} from './constants.js';

// Export Tag type
export type { Tag } from './constants.js';

// Export model configuration types
export type { AgentSize } from '../config/models.js';
