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
        await showMapStatus();
      } else if (options.full) {
        await buildFullMap(options);
      } else if (options.update) {
        await updateMap();
      } else {
        // Default: delta update if map exists, otherwise full build
        await buildOrUpdateMap(options);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

/**
 * Show map status and staleness information
 */
async function showMapStatus(): Promise<void> {
  console.log(`${UI.BOX.TOP_LEFT}${'═'.repeat(39)}${UI.BOX.TOP_RIGHT}`);
  console.log(`${UI.BOX.VERTICAL}       Repository Map Status           ${UI.BOX.VERTICAL}`);
  console.log(`${UI.BOX.BOTTOM_LEFT}${'═'.repeat(39)}${UI.BOX.BOTTOM_RIGHT}`);
  console.log();

  const repoRoot = process.cwd();

  // Check for checkpoint first
  const checkpoint = loadCheckpoint(repoRoot);
  if (checkpoint) {
    console.log(`${UI.EMOJI.CLIPBOARD} Checkpoint Information:`);
    console.log('─'.repeat(41));

    // Get current commit for validation
    let currentCommit: string;
    try {
      currentCommit = getCurrentCommit(repoRoot);
    } catch (error) {
      currentCommit = 'unknown';
    }

    // Display checkpoint summary
    const completedLevels = Object.entries(checkpoint.levels)
      .filter(([_, level]) => level.status === 'completed')
      .map(([num]) => num);

    console.log(`Current level: ${checkpoint.current_level} (${checkpoint.levels[checkpoint.current_level]?.status || 'unknown'})`);
    console.log(`Completed levels: [${completedLevels.join(', ')}]`);
    console.log(`Started: ${new Date(checkpoint.started_at).toLocaleString()}`);
    console.log(`Git commit: ${checkpoint.git_commit.substring(0, 7)}`);

    // Show Level 3 progress if applicable
    const level3 = checkpoint.levels[3];
    if (level3?.status === 'in_progress' || level3?.status === 'interrupted') {
      const completedTasks = level3.completed_task_ids?.length || 0;
      console.log();
      console.log('Level 3: Deep File Annotator');
      console.log(`  Status: ${level3.status}`);
      console.log(`  Tasks completed: ${completedTasks}`);
      if (level3.started_at) {
        console.log(`  Started: ${new Date(level3.started_at).toLocaleString()}`);
      }
    }

    // Validate checkpoint against current commit
    const validation = validateCheckpoint(checkpoint, currentCommit);
    if (!validation.valid) {
      console.log();
      console.log(`${UI.EMOJI.WARNING}  Warning: ${validation.error}`);
      console.log('   Run with --no-resume to start fresh.');
    }

    console.log();
    console.log('─'.repeat(41));
    console.log();
  }

  // Read existing map
  const existingMeta = readExistingMeta(repoRoot);

  if (!existingMeta) {
    console.log(`${UI.EMOJI.CROSS} No map found`);
    console.log();
    if (checkpoint) {
      console.log('Run `rmap map` to resume building the map.');
    } else {
      console.log('Run `rmap map` to create a new map.');
    }
    return;
  }

  // Get current commit
  let currentCommit: string;
  try {
    currentCommit = getCurrentCommit(repoRoot);
  } catch (error) {
    console.log(`${UI.EMOJI.CROSS} Error: Not a git repository`);
    return;
  }

  // Detect changes
  const changes = detectChanges(repoRoot, existingMeta);

  // Display status
  console.log(`Map version: ${formatVersionString(existingMeta)}`);
  console.log(`Schema: ${existingMeta.schema_version}`);

  // Show build commit info
  const commitAge = getCommitAge(repoRoot, existingMeta.git_commit);
  const commitShort = existingMeta.git_commit.substring(0, 7);
  console.log(`Built from: ${commitShort} (${commitAge} days ago)`);

  // Show current HEAD info
  const currentShort = currentCommit.substring(0, 7);
  const commitsBehind = getCommitCount(repoRoot, existingMeta.git_commit, currentCommit);
  console.log(`Current HEAD: ${currentShort} (${commitsBehind} commits ahead)`);

  // Show changes
  console.log(`Files changed since map: ${changes.totalChanges}`);

  if (changes.totalChanges > 0) {
    console.log(`  • Added/Modified: ${changes.changedFiles.length}`);
    console.log(`  • Deleted: ${changes.deletedFiles.length}`);
  }

  // Determine verdict
  console.log();
  if (changes.totalChanges === 0) {
    console.log(`Verdict: ${UI.EMOJI.CHECK} MAP IS UP TO DATE`);
  } else if (changes.updateStrategy === 'full-rebuild') {
    console.log(`Verdict: ${UI.EMOJI.RED_CIRCLE} FULL REBUILD RECOMMENDED`);
    console.log(`Reason: ${changes.reason}`);
  } else if (changes.updateStrategy === 'delta-with-validation') {
    console.log(`Verdict: ${UI.EMOJI.YELLOW_CIRCLE} UPDATE RECOMMENDED (with validation)`);
    console.log(`Reason: ${changes.reason}`);
  } else {
    console.log(`Verdict: ${UI.EMOJI.GREEN_CIRCLE} UPDATE RECOMMENDED`);
    console.log(`Reason: ${changes.reason}`);
  }

  console.log();
  if (changes.totalChanges > 0) {
    console.log('Run `rmap map` to update the map.');
  }
}

/**
 * Force a full rebuild of the map
 */
async function buildFullMap(options: { resume?: boolean }): Promise<void> {
  console.log(`${UI.BOX.TOP_LEFT}${'═'.repeat(39)}${UI.BOX.TOP_RIGHT}`);
  console.log(`${UI.BOX.VERTICAL}       Building Repository Map         ${UI.BOX.VERTICAL}`);
  console.log(`${UI.BOX.BOTTOM_LEFT}${'═'.repeat(39)}${UI.BOX.BOTTOM_RIGHT}`);
  console.log();

  const repoRoot = process.cwd();

  // Handle resume flag logic
  let resumeOption = true; // default

  if (options.resume === true) {
    // Explicit --resume: error if no checkpoint exists
    const checkpoint = loadCheckpoint(repoRoot);
    if (!checkpoint) {
      console.error(`${UI.EMOJI.CROSS} Error: No checkpoint found. Cannot resume.`);
      console.error('   Remove --resume flag to start fresh.');
      process.exit(1);
    }

    const currentCommit = getCurrentCommit(repoRoot);
    const validation = validateCheckpoint(checkpoint, currentCommit);
    if (!validation.valid) {
      console.error(`${UI.EMOJI.CROSS} Error: Checkpoint is invalid: ${validation.error}`);
      console.error('   Remove --resume flag to start fresh.');
      process.exit(1);
    }
    resumeOption = true;
  } else if (options.resume === false) {
    // --no-resume: clear checkpoint and start fresh
    console.log(`${UI.EMOJI.TRASH}  Clearing existing checkpoint...`);
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

  console.log(`\n${UI.EMOJI.SPARKLES} Map build complete!`);
  console.log(`${UI.EMOJI.FOLDER} Output: ${result.outputPath}`);
  console.log(`${UI.EMOJI.CHART} Stats:`);
  console.log(`   - Files: ${result.stats.filesAnnotated}`);
  console.log(`   - Time: ${result.stats.buildTimeMinutes.toFixed(1)} minutes`);
  console.log(`   - Agents: ${result.stats.agentsUsed}`);
  console.log(`   - Issues: ${result.stats.validationIssues}`);
}

/**
 * Update existing map based on git changes
 */
async function updateMap(): Promise<void> {
  console.log(`${UI.BOX.TOP_LEFT}${'═'.repeat(39)}${UI.BOX.TOP_RIGHT}`);
  console.log(`${UI.BOX.VERTICAL}       Updating Repository Map         ${UI.BOX.VERTICAL}`);
  console.log(`${UI.BOX.BOTTOM_LEFT}${'═'.repeat(39)}${UI.BOX.BOTTOM_RIGHT}`);
  console.log();

  const repoRoot = process.cwd();

  // Check if map exists
  const existingMeta = readExistingMeta(repoRoot);

  if (!existingMeta) {
    console.log(`${UI.EMOJI.CROSS} No existing map found. Use \`rmap map\` to create one.`);
    process.exit(1);
  }

  // Detect changes
  const changes = detectChanges(repoRoot, existingMeta);

  if (changes.totalChanges === 0) {
    console.log(`${UI.EMOJI.CHECK} Map is already up to date!`);
    return;
  }

  console.log(`${UI.EMOJI.CHART} Detected ${changes.totalChanges} changed files`);
  console.log(`Strategy: ${changes.updateStrategy}`);
  console.log(`Reason: ${changes.reason}`);
  console.log();

  // Perform the appropriate update
  if (changes.updateStrategy === 'full-rebuild') {
    console.log(`${UI.EMOJI.WARNING}  Large changes detected, performing full rebuild...`);
    console.log();
    await buildFullMap({});
  } else {
    console.log(`${UI.EMOJI.ARROWS} Performing delta update...`);
    console.log('   This feature requires integration with the pipeline.');
    console.log('   For now, use `rmap map --full` for a full rebuild.');
    console.log();
    console.log('Delta update will:');
    console.log(`  • Re-annotate ${changes.changedFiles.length} changed files`);
    console.log(`  • Remove ${changes.deletedFiles.length} deleted files`);
    console.log('  • Repair dependency graph');
    console.log('  • Update map version');
  }
}

/**
 * Default behavior: delta update if map exists, otherwise full build
 */
async function buildOrUpdateMap(options: { resume?: boolean }): Promise<void> {
  console.log(`${UI.BOX.TOP_LEFT}${'═'.repeat(39)}${UI.BOX.TOP_RIGHT}`);
  console.log(`${UI.BOX.VERTICAL}       Repository Map Builder          ${UI.BOX.VERTICAL}`);
  console.log(`${UI.BOX.BOTTOM_LEFT}${'═'.repeat(39)}${UI.BOX.BOTTOM_RIGHT}`);
  console.log();

  const repoRoot = process.cwd();

  // Handle resume flag logic
  let resumeOption = true; // default

  if (options.resume === true) {
    // Explicit --resume: error if no checkpoint exists
    const checkpoint = loadCheckpoint(repoRoot);
    if (!checkpoint) {
      console.error(`${UI.EMOJI.CROSS} Error: No checkpoint found. Cannot resume.`);
      console.error('   Remove --resume flag to start fresh.');
      process.exit(1);
    }

    const currentCommit = getCurrentCommit(repoRoot);
    const validation = validateCheckpoint(checkpoint, currentCommit);
    if (!validation.valid) {
      console.error(`${UI.EMOJI.CROSS} Error: Checkpoint is invalid: ${validation.error}`);
      console.error('   Remove --resume flag to start fresh.');
      process.exit(1);
    }
    resumeOption = true;
  } else if (options.resume === false) {
    // --no-resume: clear checkpoint and start fresh
    console.log(`${UI.EMOJI.TRASH}  Clearing existing checkpoint...`);
    clearCheckpoint(repoRoot);
    resumeOption = false;
  }

  // Check if map exists
  const existingMeta = readExistingMeta(repoRoot);

  if (existingMeta) {
    console.log(`Found existing map (${formatVersionString(existingMeta)})`);

    // Detect changes
    const changes = detectChanges(repoRoot, existingMeta);

    if (changes.totalChanges === 0) {
      console.log(`${UI.EMOJI.CHECK} Map is already up to date!`);
      return;
    }

    console.log(`Detected ${changes.totalChanges} changed files`);
    console.log(`Strategy: ${changes.updateStrategy}`);
    console.log();

    if (changes.updateStrategy !== 'full-rebuild') {
      console.log('Note: Delta update logic ready but requires pipeline integration');
      console.log('Performing full rebuild for now...');
      console.log();
    }
  } else {
    console.log('No existing map found, building from scratch...');
    console.log();
  }

  const result = await buildMap({
    repoRoot,
    forceFullRebuild: false, // Will do delta if possible (when implemented)
    autofix: true,
    parallel: true,
    resume: resumeOption,
  });

  console.log(`\n${UI.EMOJI.SPARKLES} Map build complete!`);
  console.log(`${UI.EMOJI.FOLDER} Output: ${result.outputPath}`);
  console.log(`${UI.EMOJI.CHART} Stats:`);
  console.log(`   - Files: ${result.stats.filesAnnotated}`);
  console.log(`   - Time: ${result.stats.buildTimeMinutes.toFixed(1)} minutes`);
  console.log(`   - Agents: ${result.stats.agentsUsed}`);
  console.log(`   - Issues: ${result.stats.validationIssues}`);
}
