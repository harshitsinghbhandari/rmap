/**
 * Result type interfaces for CLI commands
 *
 * These types represent the pure data returned by business logic functions,
 * separated from display/formatting concerns.
 */

/**
 * Result from map building operations
 */
export interface MapBuildResult {
  success: boolean;
  outputPath: string;
  stats: {
    filesAnnotated: number;
    buildTimeMinutes: number;
    agentsUsed: number;
    validationIssues: number;
  };
  /** Information about the build context for display purposes */
  context?: {
    operation: 'full-build' | 'build-or-update';
    checkpointCleared?: boolean;
    existingMapVersion?: string;
    changes?: ChangeDetectionSummary;
    wasAlreadyUpToDate?: boolean;
  };
}

/**
 * Checkpoint information
 */
export interface CheckpointInfo {
  currentLevel: number;
  currentLevelStatus: string;
  completedLevels: string[];
  startedAt: Date;
  gitCommit: string;
  level3Progress?: {
    status: string;
    completedTasks: number;
    startedAt?: Date;
  };
  validation: {
    valid: boolean;
    error?: string;
  };
}

/**
 * Map metadata information
 */
export interface MapMetadata {
  version: string;
  schema: string;
  buildCommit: string;
  buildCommitShort: string;
  commitAge: number;
  currentCommit: string;
  currentCommitShort: string;
  commitsAhead: number;
}

/**
 * Change detection summary (CLI-facing)
 *
 * Note: This is distinct from coordinator/delta.ts's ChangeDetectionResult
 * which has a different shape (deletedFiles is string[] there vs number here).
 */
export interface ChangeDetectionSummary {
  totalChanges: number;
  changedFiles: string[];
  deletedFiles: number;
  updateStrategy: 'delta' | 'delta-with-validation' | 'full-rebuild';
  reason: string;
}

/**
 * Map status verdict
 */
export type MapVerdict = 'up-to-date' | 'update-recommended' | 'full-rebuild-recommended';

/**
 * Complete map status result
 */
export interface MapStatusResult {
  hasMap: boolean;
  hasCheckpoint: boolean;
  checkpoint?: CheckpointInfo;
  metadata?: MapMetadata;
  changes?: ChangeDetectionSummary;
  verdict?: MapVerdict;
}

/**
 * Result from map update operation
 */
export interface MapUpdateResult {
  success: boolean;
  changes: ChangeDetectionSummary;
  action: 'no-changes' | 'delta-update' | 'full-rebuild';
  buildResult?: MapBuildResult;
}

/**
 * Get-context query result
 */
export interface GetContextResult {
  success: boolean;
  queryType: 'tags' | 'file' | 'path';
  query: string | string[];
  output: string;
  limit: number;
}

/**
 * Common error result
 */
export interface ErrorResult {
  success: false;
  error: string;
  details?: string;
}
