/**
 * Display functions for CLI output
 *
 * Pure display logic separated from business logic.
 * These functions take result types and format them for console output.
 */

import { getUI } from './ui-constants.js';
import type {
  MapStatusResult,
  MapBuildResult,
  MapUpdateResult,
  GetContextResult,
  ErrorResult,
  CheckpointInfo,
  MapMetadata,
  ChangeDetectionResult,
} from './types.js';

const UI = getUI();

/**
 * Display a box header with title
 */
function displayBoxHeader(title: string, width: number = 39): void {
  console.log(`${UI.BOX.TOP_LEFT}${'═'.repeat(width)}${UI.BOX.TOP_RIGHT}`);
  const padding = Math.floor((width - title.length) / 2);
  const paddedTitle = ' '.repeat(padding) + title + ' '.repeat(width - padding - title.length);
  console.log(`${UI.BOX.VERTICAL}${paddedTitle}${UI.BOX.VERTICAL}`);
  console.log(`${UI.BOX.BOTTOM_LEFT}${'═'.repeat(width)}${UI.BOX.BOTTOM_RIGHT}`);
  console.log();
}

/**
 * Display checkpoint information
 */
function displayCheckpoint(checkpoint: CheckpointInfo): void {
  console.log(`${UI.EMOJI.CLIPBOARD} Checkpoint Information:`);
  console.log('─'.repeat(41));

  console.log(`Current level: ${checkpoint.currentLevel} (${checkpoint.currentLevelStatus})`);
  console.log(`Completed levels: [${checkpoint.completedLevels.join(', ')}]`);
  console.log(`Started: ${checkpoint.startedAt.toLocaleString()}`);
  console.log(`Git commit: ${checkpoint.gitCommit.substring(0, 7)}`);

  // Show Level 3 progress if applicable
  if (checkpoint.level3Progress) {
    const { status, completedTasks, startedAt } = checkpoint.level3Progress;
    console.log();
    console.log('Level 3: Deep File Annotator');
    console.log(`  Status: ${status}`);
    console.log(`  Tasks completed: ${completedTasks}`);
    if (startedAt) {
      console.log(`  Started: ${startedAt.toLocaleString()}`);
    }
  }

  // Show validation warning if invalid
  if (!checkpoint.validation.valid) {
    console.log();
    console.log(`${UI.EMOJI.WARNING}  Warning: ${checkpoint.validation.error}`);
    console.log('   Run with --no-resume to start fresh.');
  }

  console.log();
  console.log('─'.repeat(41));
  console.log();
}

/**
 * Display map metadata and changes
 */
function displayMapInfo(metadata: MapMetadata, changes: ChangeDetectionResult): void {
  console.log(`Map version: ${metadata.version}`);
  console.log(`Schema: ${metadata.schema}`);
  console.log(`Built from: ${metadata.buildCommitShort} (${metadata.commitAge} days ago)`);
  console.log(`Current HEAD: ${metadata.currentCommitShort} (${metadata.commitsBehind} commits ahead)`);
  console.log(`Files changed since map: ${changes.totalChanges}`);

  if (changes.totalChanges > 0) {
    console.log(`  • Added/Modified: ${changes.changedFiles.length}`);
    console.log(`  • Deleted: ${changes.deletedFiles}`);
  }
}

/**
 * Display map verdict
 */
function displayVerdict(
  verdict: 'up-to-date' | 'update-recommended' | 'full-rebuild-recommended',
  changes?: ChangeDetectionResult
): void {
  console.log();

  switch (verdict) {
    case 'up-to-date':
      console.log(`Verdict: ${UI.EMOJI.CHECK} MAP IS UP TO DATE`);
      break;
    case 'full-rebuild-recommended':
      console.log(`Verdict: ${UI.EMOJI.RED_CIRCLE} FULL REBUILD RECOMMENDED`);
      if (changes?.reason) {
        console.log(`Reason: ${changes.reason}`);
      }
      break;
    case 'update-recommended':
      if (changes?.updateStrategy === 'delta-with-validation') {
        console.log(`Verdict: ${UI.EMOJI.YELLOW_CIRCLE} UPDATE RECOMMENDED (with validation)`);
      } else {
        console.log(`Verdict: ${UI.EMOJI.GREEN_CIRCLE} UPDATE RECOMMENDED`);
      }
      if (changes?.reason) {
        console.log(`Reason: ${changes.reason}`);
      }
      break;
  }

  console.log();
  if (verdict !== 'up-to-date') {
    console.log('Run `rmap map` to update the map.');
  }
}

/**
 * Display map status result
 */
export function displayMapStatus(result: MapStatusResult): void {
  displayBoxHeader('Repository Map Status');

  // Display checkpoint if present
  if (result.hasCheckpoint && result.checkpoint) {
    displayCheckpoint(result.checkpoint);
  }

  // Display map info if present
  if (!result.hasMap) {
    console.log(`${UI.EMOJI.CROSS} No map found`);
    console.log();
    if (result.hasCheckpoint) {
      console.log('Run `rmap map` to resume building the map.');
    } else {
      console.log('Run `rmap map` to create a new map.');
    }
    return;
  }

  if (result.metadata && result.changes) {
    displayMapInfo(result.metadata, result.changes);
  }

  // Display verdict
  if (result.verdict) {
    displayVerdict(result.verdict, result.changes);
  }
}

/**
 * Display map build result
 */
export function displayMapBuildResult(result: MapBuildResult): void {
  console.log(`\n${UI.EMOJI.SPARKLES} Map build complete!`);
  console.log(`${UI.EMOJI.FOLDER} Output: ${result.outputPath}`);
  console.log(`${UI.EMOJI.CHART} Stats:`);
  console.log(`   - Files: ${result.stats.filesAnnotated}`);
  console.log(`   - Time: ${result.stats.buildTimeMinutes.toFixed(1)} minutes`);
  console.log(`   - Agents: ${result.stats.agentsUsed}`);
  console.log(`   - Issues: ${result.stats.validationIssues}`);
}

/**
 * Display map update result
 */
export function displayMapUpdateResult(result: MapUpdateResult): void {
  displayBoxHeader('Updating Repository Map');

  if (result.action === 'no-changes') {
    console.log(`${UI.EMOJI.CHECK} Map is already up to date!`);
    return;
  }

  console.log(`${UI.EMOJI.CHART} Detected ${result.changes.totalChanges} changed files`);
  console.log(`Strategy: ${result.changes.updateStrategy}`);
  console.log(`Reason: ${result.changes.reason}`);
  console.log();

  if (result.action === 'full-rebuild') {
    console.log(`${UI.EMOJI.WARNING}  Large changes detected, performing full rebuild...`);
    console.log();
  } else if (result.action === 'delta-update') {
    console.log(`${UI.EMOJI.ARROWS} Performing delta update...`);
    console.log('   This feature requires integration with the pipeline.');
    console.log('   For now, use `rmap map --full` for a full rebuild.');
    console.log();
    console.log('Delta update will:');
    console.log(`  • Re-annotate ${result.changes.changedFiles.length} changed files`);
    console.log(`  • Remove ${result.changes.deletedFiles} deleted files`);
    console.log('  • Repair dependency graph');
    console.log('  • Update map version');
  }

  // Display build result if a build was performed
  if (result.buildResult) {
    displayMapBuildResult(result.buildResult);
  }
}

/**
 * Display get-context result
 */
export function displayGetContextResult(
  result: GetContextResult,
  options: { json?: boolean } = {}
): void {
  if (options.json) {
    // For JSON mode, the output is already formatted by the query engine
    console.log(result.output);
  } else {
    // For text mode, just print the output
    console.log(result.output);
  }
}

/**
 * Display error result
 */
export function displayError(error: ErrorResult | Error | string): void {
  if (typeof error === 'string') {
    console.error(`Error: ${error}`);
  } else if (error instanceof Error) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error(`Error: ${error.error}`);
    if (error.details) {
      console.error(error.details);
    }
  }
}

/**
 * Display operation header
 */
export function displayOperationHeader(title: string): void {
  displayBoxHeader(title);
}

/**
 * Display checkpoint clearing message
 */
export function displayCheckpointClearing(): void {
  console.log(`${UI.EMOJI.TRASH}  Clearing existing checkpoint...`);
}

/**
 * Display existing map found message
 */
export function displayExistingMapFound(version: string): void {
  console.log(`Found existing map (${version})`);
}

/**
 * Display changes detected message
 */
export function displayChangesDetected(changes: ChangeDetectionResult): void {
  console.log(`Detected ${changes.totalChanges} changed files`);
  console.log(`Strategy: ${changes.updateStrategy}`);
  console.log();
}

/**
 * Display delta update note
 */
export function displayDeltaUpdateNote(): void {
  console.log('Note: Delta update logic ready but requires pipeline integration');
  console.log('Performing full rebuild for now...');
  console.log();
}

/**
 * Display no map found message
 */
export function displayNoMapFound(): void {
  console.log('No existing map found, building from scratch...');
  console.log();
}
