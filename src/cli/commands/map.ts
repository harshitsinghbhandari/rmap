/**
 * rmap map command
 *
 * Builds or updates the repository map
 */

import { Command } from 'commander';
import * as path from 'node:path';
import { buildMap } from '../../coordinator/index.js';
import { readExistingMeta } from '../../coordinator/assembler.js';
import {
  detectChanges,
  getCurrentCommit,
  getCommitAge,
  getCommitCount,
} from '../../coordinator/delta.js';
import { formatVersionString } from '../../coordinator/versioning.js';
import {
  loadCheckpoint,
  clearCheckpoint,
  validateCheckpoint,
} from '../../coordinator/checkpoint.js';
import { getUI } from '../ui-constants.js';
import {
  displayMapStatus,
  displayMapBuildResult,
  displayMapUpdateResult,
  displayOperationHeader,
  displayCheckpointClearing,
  displayExistingMapFound,
  displayChangesDetected,
  displayDeltaUpdateNote,
  displayNoMapFound,
  displayError,
} from '../display.js';
import type {
  MapStatusResult,
  MapBuildResult,
  MapUpdateResult,
  CheckpointInfo,
  MapMetadata,
  ChangeDetectionSummary,
  MapVerdict,
} from '../types.js';

const UI = getUI();

interface MapOptions {
  full?: boolean;
  status?: boolean;
  update?: boolean;
  resume?: boolean;
}

export const mapCommand = new Command('map')
  .description('Build or update repository map')
  .option('--full', 'Force full rebuild of the entire map')
  .option('--status', 'Show current map status and staleness')
  .option('--update', 'Update map based on git changes (delta update)')
  .option('--resume', 'Explicitly resume from checkpoint (error if none exists)')
  .option('--no-resume', 'Ignore checkpoint and start fresh')
  .action(async (options: MapOptions) => {
    try {
      // Determine which operation to perform
      if (options.status) {
        const result = await computeMapStatus();
        displayMapStatus(result);
      } else if (options.full) {
        displayOperationHeader('Building Repository Map');
        const result = await computeFullMapBuild(options);
        if (result.context?.checkpointCleared) {
          displayCheckpointClearing();
        }
        displayMapBuildResult(result);
      } else if (options.update) {
        const result = await computeMapUpdate();
        displayMapUpdateResult(result);
      } else {
        // Default: delta update if map exists, otherwise full build
        displayOperationHeader('Repository Map Builder');
        const result = await computeBuildOrUpdate(options);

        // Display context-specific messages
        if (result.context?.checkpointCleared) {
          displayCheckpointClearing();
        }

        if (result.context?.existingMapVersion) {
          displayExistingMapFound(result.context.existingMapVersion);
        } else if (!result.context?.wasAlreadyUpToDate) {
          displayNoMapFound();
        }

        if (result.context?.changes) {
          displayChangesDetected(result.context.changes);
          if (result.context.changes.updateStrategy !== 'full-rebuild') {
            displayDeltaUpdateNote();
          }
        }

        // Display final result
        if (result.context?.wasAlreadyUpToDate) {
          console.log(`${UI.EMOJI.CHECK} Map is already up to date!`);
        } else {
          displayMapBuildResult(result);
        }
      }
    } catch (error) {
      displayError(error instanceof Error ? error : String(error));
      process.exit(1);
    }
  });

/**
 * Compute map status (pure business logic)
 */
export async function computeMapStatus(): Promise<MapStatusResult> {
  const repoRoot = process.cwd();

  // Check for checkpoint first
  const checkpoint = loadCheckpoint(repoRoot);
  let checkpointInfo: CheckpointInfo | undefined;

  if (checkpoint) {
    // Get current commit for validation
    let currentCommit: string;
    try {
      currentCommit = getCurrentCommit(repoRoot);
    } catch (error) {
      currentCommit = 'unknown';
    }

    // Prepare checkpoint info
    const completedLevels = Object.entries(checkpoint.levels)
      .filter(([_, level]) => level.status === 'completed')
      .map(([num]) => num);

    const level3 = checkpoint.levels[3];
    const level3Progress =
      level3?.status === 'in_progress' || level3?.status === 'interrupted'
        ? {
            status: level3.status,
            completedTasks: level3.completed_task_ids?.length || 0,
            startedAt: level3.started_at ? new Date(level3.started_at) : undefined,
          }
        : undefined;

    const validation = validateCheckpoint(checkpoint, currentCommit);

    checkpointInfo = {
      currentLevel: checkpoint.current_level,
      currentLevelStatus: checkpoint.levels[checkpoint.current_level]?.status || 'unknown',
      completedLevels,
      startedAt: new Date(checkpoint.started_at),
      gitCommit: checkpoint.git_commit,
      level3Progress,
      validation: {
        valid: validation.valid,
        error: validation.error,
      },
    };
  }

  // Read existing map
  const existingMeta = readExistingMeta(repoRoot);

  if (!existingMeta) {
    return {
      hasMap: false,
      hasCheckpoint: !!checkpoint,
      checkpoint: checkpointInfo,
    };
  }

  // Get current commit
  let currentCommit: string;
  try {
    currentCommit = getCurrentCommit(repoRoot);
  } catch (error) {
    throw new Error('Not a git repository');
  }

  // Detect changes
  const changes = detectChanges(repoRoot, existingMeta);

  // Prepare metadata
  const commitAge = getCommitAge(repoRoot, existingMeta.git_commit);
  const commitsAhead = getCommitCount(repoRoot, existingMeta.git_commit, currentCommit);

  const metadata: MapMetadata = {
    version: formatVersionString(existingMeta),
    schema: existingMeta.schema_version,
    buildCommit: existingMeta.git_commit,
    buildCommitShort: existingMeta.git_commit.substring(0, 7),
    commitAge,
    currentCommit,
    currentCommitShort: currentCommit.substring(0, 7),
    commitsAhead,
  };

  const changeInfo: ChangeDetectionSummary = {
    totalChanges: changes.totalChanges,
    changedFiles: changes.changedFiles,
    deletedFiles: changes.deletedFiles.length,
    updateStrategy: changes.updateStrategy as 'delta' | 'delta-with-validation' | 'full-rebuild',
    reason: changes.reason,
  };

  // Determine verdict
  let verdict: MapVerdict;
  if (changes.totalChanges === 0) {
    verdict = 'up-to-date';
  } else if (changes.updateStrategy === 'full-rebuild') {
    verdict = 'full-rebuild-recommended';
  } else {
    verdict = 'update-recommended';
  }

  return {
    hasMap: true,
    hasCheckpoint: !!checkpoint,
    checkpoint: checkpointInfo,
    metadata,
    changes: changeInfo,
    verdict,
  };
}

/**
 * Compute full map build (pure business logic)
 */
export async function computeFullMapBuild(options: { resume?: boolean }): Promise<MapBuildResult> {
  const repoRoot = process.cwd();

  // Handle resume flag logic
  let resumeOption = true; // default
  let checkpointCleared = false;

  if (options.resume === true) {
    // Explicit --resume: error if no checkpoint exists
    const checkpoint = loadCheckpoint(repoRoot);
    if (!checkpoint) {
      throw new Error(
        'No checkpoint found. Cannot resume.\n   Remove --resume flag to start fresh.'
      );
    }

    const currentCommit = getCurrentCommit(repoRoot);
    const validation = validateCheckpoint(checkpoint, currentCommit);
    if (!validation.valid) {
      throw new Error(
        `Checkpoint is invalid: ${validation.error}\n   Remove --resume flag to start fresh.`
      );
    }
    resumeOption = true;
  } else if (options.resume === false) {
    // --no-resume: clear checkpoint and start fresh
    clearCheckpoint(repoRoot);
    resumeOption = false;
    checkpointCleared = true;
  }

  const result = await buildMap({
    repoRoot,
    forceFullRebuild: true,
    autofix: true,
    parallel: true,
    resume: resumeOption,
  });

  return {
    success: true,
    outputPath: result.outputPath,
    stats: {
      filesAnnotated: result.stats.filesAnnotated,
      buildTimeMinutes: result.stats.buildTimeMinutes,
      agentsUsed: result.stats.agentsUsed,
      validationIssues: result.stats.validationIssues,
    },
    context: {
      operation: 'full-build',
      checkpointCleared,
    },
  };
}

/**
 * Compute map update (pure business logic)
 */
export async function computeMapUpdate(): Promise<MapUpdateResult> {
  const repoRoot = process.cwd();

  // Check if map exists
  const existingMeta = readExistingMeta(repoRoot);

  if (!existingMeta) {
    throw new Error('No existing map found. Use `rmap map` to create one.');
  }

  // Detect changes
  const changes = detectChanges(repoRoot, existingMeta);

  const changeInfo: ChangeDetectionSummary = {
    totalChanges: changes.totalChanges,
    changedFiles: changes.changedFiles,
    deletedFiles: changes.deletedFiles.length,
    updateStrategy: changes.updateStrategy as 'delta' | 'delta-with-validation' | 'full-rebuild',
    reason: changes.reason,
  };

  if (changes.totalChanges === 0) {
    return {
      success: true,
      changes: changeInfo,
      action: 'no-changes',
    };
  }

  // Perform the appropriate update
  if (changes.updateStrategy === 'full-rebuild') {
    const buildResult = await computeFullMapBuild({});
    return {
      success: true,
      changes: changeInfo,
      action: 'full-rebuild',
      buildResult,
    };
  } else {
    // Delta update not yet implemented
    return {
      success: true,
      changes: changeInfo,
      action: 'delta-update',
    };
  }
}

/**
 * Compute build or update (default behavior)
 */
export async function computeBuildOrUpdate(options: { resume?: boolean }): Promise<MapBuildResult> {
  const repoRoot = process.cwd();

  // Handle resume flag logic
  let resumeOption = true; // default
  let checkpointCleared = false;

  if (options.resume === true) {
    // Explicit --resume: error if no checkpoint exists
    const checkpoint = loadCheckpoint(repoRoot);
    if (!checkpoint) {
      throw new Error(
        'No checkpoint found. Cannot resume.\n   Remove --resume flag to start fresh.'
      );
    }

    const currentCommit = getCurrentCommit(repoRoot);
    const validation = validateCheckpoint(checkpoint, currentCommit);
    if (!validation.valid) {
      throw new Error(
        `Checkpoint is invalid: ${validation.error}\n   Remove --resume flag to start fresh.`
      );
    }
    resumeOption = true;
  } else if (options.resume === false) {
    // --no-resume: clear checkpoint and start fresh
    clearCheckpoint(repoRoot);
    resumeOption = false;
    checkpointCleared = true;
  }

  // Check if map exists
  const existingMeta = readExistingMeta(repoRoot);
  let existingMapVersion: string | undefined;
  let changeInfo: ChangeDetectionSummary | undefined;
  let wasAlreadyUpToDate = false;

  if (existingMeta) {
    existingMapVersion = formatVersionString(existingMeta);

    // Detect changes
    const changes = detectChanges(repoRoot, existingMeta);

    if (changes.totalChanges === 0) {
      // Map is up to date, return early (no build needed)
      const repoMapPath = path.join(repoRoot, '.rmap', 'meta.json');
      return {
        success: true,
        outputPath: repoMapPath,
        stats: {
          filesAnnotated: 0,
          buildTimeMinutes: 0,
          agentsUsed: 0,
          validationIssues: 0,
        },
        context: {
          operation: 'build-or-update',
          checkpointCleared,
          existingMapVersion,
          wasAlreadyUpToDate: true,
        },
      };
    }

    changeInfo = {
      totalChanges: changes.totalChanges,
      changedFiles: changes.changedFiles,
      deletedFiles: changes.deletedFiles.length,
      updateStrategy: changes.updateStrategy as 'delta' | 'delta-with-validation' | 'full-rebuild',
      reason: changes.reason,
    };
  }

  const result = await buildMap({
    repoRoot,
    forceFullRebuild: false, // Will do delta if possible (when implemented)
    autofix: true,
    parallel: true,
    resume: resumeOption,
  });

  return {
    success: true,
    outputPath: result.outputPath,
    stats: {
      filesAnnotated: result.stats.filesAnnotated,
      buildTimeMinutes: result.stats.buildTimeMinutes,
      agentsUsed: result.stats.agentsUsed,
      validationIssues: result.stats.validationIssues,
    },
    context: {
      operation: 'build-or-update',
      checkpointCleared,
      existingMapVersion,
      changes: changeInfo,
      wasAlreadyUpToDate,
    },
  };
}
