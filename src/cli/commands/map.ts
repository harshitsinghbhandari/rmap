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
  getCheckpointSummary,
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
  ChangeDetectionResult,
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
        const result = await computeFullMapBuild(options);
        displayMapBuildResult(result);
      } else if (options.update) {
        const result = await computeMapUpdate();
        displayMapUpdateResult(result);
      } else {
        // Default: delta update if map exists, otherwise full build
        const result = await computeBuildOrUpdate(options);
        // Only display build result if files were actually processed
        if (result.stats.filesAnnotated > 0) {
          displayMapBuildResult(result);
        } else {
          console.log(`${UI.EMOJI.CHECK} Map is already up to date!`);
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
async function computeMapStatus(): Promise<MapStatusResult> {
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
  const commitsBehind = getCommitCount(repoRoot, existingMeta.git_commit, currentCommit);

  const metadata: MapMetadata = {
    version: formatVersionString(existingMeta),
    schema: existingMeta.schema_version,
    buildCommit: existingMeta.git_commit,
    buildCommitShort: existingMeta.git_commit.substring(0, 7),
    commitAge,
    currentCommit,
    currentCommitShort: currentCommit.substring(0, 7),
    commitsBehind,
  };

  const changeInfo: ChangeDetectionResult = {
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
async function computeFullMapBuild(options: { resume?: boolean }): Promise<MapBuildResult> {
  displayOperationHeader('Building Repository Map');

  const repoRoot = process.cwd();

  // Handle resume flag logic
  let resumeOption = true; // default

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
    displayCheckpointClearing();
    clearCheckpoint(repoRoot);
    resumeOption = false;
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
  };
}

/**
 * Compute map update (pure business logic)
 */
async function computeMapUpdate(): Promise<MapUpdateResult> {
  const repoRoot = process.cwd();

  // Check if map exists
  const existingMeta = readExistingMeta(repoRoot);

  if (!existingMeta) {
    throw new Error('No existing map found. Use `rmap map` to create one.');
  }

  // Detect changes
  const changes = detectChanges(repoRoot, existingMeta);

  const changeInfo: ChangeDetectionResult = {
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
async function computeBuildOrUpdate(options: { resume?: boolean }): Promise<MapBuildResult> {
  displayOperationHeader('Repository Map Builder');

  const repoRoot = process.cwd();

  // Handle resume flag logic
  let resumeOption = true; // default

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
    displayCheckpointClearing();
    clearCheckpoint(repoRoot);
    resumeOption = false;
  }

  // Check if map exists
  const existingMeta = readExistingMeta(repoRoot);

  if (existingMeta) {
    displayExistingMapFound(formatVersionString(existingMeta));

    // Detect changes
    const changes = detectChanges(repoRoot, existingMeta);

    if (changes.totalChanges === 0) {
      // Map is up to date, return early (no build needed)
      // We need to get the existing map info to return
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
      };
    }

    const changeInfo: ChangeDetectionResult = {
      totalChanges: changes.totalChanges,
      changedFiles: changes.changedFiles,
      deletedFiles: changes.deletedFiles.length,
      updateStrategy: changes.updateStrategy as 'delta' | 'delta-with-validation' | 'full-rebuild',
      reason: changes.reason,
    };

    displayChangesDetected(changeInfo);

    if (changes.updateStrategy !== 'full-rebuild') {
      displayDeltaUpdateNote();
    }
  } else {
    displayNoMapFound();
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
  };
}
