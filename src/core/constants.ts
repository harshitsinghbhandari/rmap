/**
 * Core constants for rmap
 *
 * Defines the schema version and update thresholds
 */

/**
 * Schema version for the map JSON format
 * Bump this when the structure of the map files changes
 */
export const SCHEMA_VERSION = '1.0';

/**
 * Update strategy thresholds
 *
 * Determines whether to do a delta update or full rebuild based on
 * the number of files changed since the last map.
 *
 * Strategy selection:
 * - files < MIN_DELTA_WITH_VALIDATION: delta update only
 * - files >= MIN_DELTA_WITH_VALIDATION and <= MAX_DELTA_UPDATE: delta update with validation
 * - files > MAX_DELTA_UPDATE: force full rebuild
 */
export const UPDATE_THRESHOLDS = {
  /** Minimum files to trigger validation (delta-only if below this) */
  MIN_DELTA_WITH_VALIDATION: 20,
  /** Maximum files for delta update (full rebuild if above this) */
  MAX_DELTA_UPDATE: 100,

  /**
   * @deprecated Use MIN_DELTA_WITH_VALIDATION instead.
   * Kept for backward compatibility with earlier UPDATE_THRESHOLDS API.
   */
  DELTA_WITH_VALIDATION: 20,
  /**
   * @deprecated Use MAX_DELTA_UPDATE instead.
   * Kept for backward compatibility with earlier UPDATE_THRESHOLDS API.
   */
  FULL_REBUILD: 100,
  /**
   * @deprecated No direct equivalent; use MIN_DELTA_WITH_VALIDATION to
   * calculate delta-only thresholds. Kept for backward compatibility
   * with earlier UPDATE_THRESHOLDS API.
   */
  DELTA_ONLY: 0,
} as const;

/**
 * Maximum number of files per Level 3 annotation task
 */
export const MAX_FILES_PER_TASK = 50;

/**
 * Checkpoint directory name (within .repo_map)
 */
export const CHECKPOINT_DIR = '.checkpoint';

/**
 * Checkpoint format version
 */
export const CHECKPOINT_VERSION = '1.0';

/**
 * Checkpoint file names
 */
export const CHECKPOINT_FILES = {
  STATE: 'state.json',
  LEVEL0: 'level0.json',
  LEVEL1: 'level1.json',
  LEVEL2: 'level2.json',
  LEVEL2_5: 'level2_5_task_plan.json',
  LEVEL3_PROGRESS: 'level3_progress.json',
  LEVEL3_TASKS: 'level3_tasks.json',
  LEVEL3_INCREMENTAL: 'level3_annotations.jsonl',
} as const;
