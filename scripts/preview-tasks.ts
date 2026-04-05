#!/usr/bin/env tsx
/**
 * Task Preview Script
 *
 * Previews the Level 3 task breakdown using the new LOC-based task builder (Level 2.5).
 * Shows exact files in each task with LOC statistics.
 *
 * Usage:
 *   tsx scripts/preview-tasks.ts [repo-path]
 *
 * If no repo-path is provided, uses current directory.
 *
 * The script will:
 * 1. Try to load existing checkpoint data (Level 0)
 * 2. If no checkpoint exists, run Level 0 harvester (no LLM needed)
 * 3. Run LOC-based task builder (Level 2.5) to create task plan
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// Configuration
const LARGE_FILE_LOC_THRESHOLD = 500;
const CHECKPOINT_DIR = '.checkpoint';

// Color helpers for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function bold(text: string): string {
  return `${colors.bold}${text}${colors.reset}`;
}

function dim(text: string): string {
  return `${colors.dim}${text}${colors.reset}`;
}

function yellow(text: string): string {
  return `${colors.yellow}${text}${colors.reset}`;
}

function cyan(text: string): string {
  return `${colors.cyan}${text}${colors.reset}`;
}

function green(text: string): string {
  return `${colors.green}${text}${colors.reset}`;
}

function red(text: string): string {
  return `${colors.red}${text}${colors.reset}`;
}

/**
 * Format LOC with color for large files
 */
function formatLOC(loc: number, effectiveLoc?: number): string {
  const trimmed = effectiveLoc !== undefined && effectiveLoc < loc;
  const displayLoc = effectiveLoc ?? loc;

  if (trimmed) {
    return `${yellow(displayLoc.toLocaleString())} LOC ${dim(`(trimmed from ${loc})`)}`;
  }

  if (loc >= LARGE_FILE_LOC_THRESHOLD) {
    return `${yellow(loc.toLocaleString())} LOC  ${yellow('\u26a0\ufe0f Large file')}`;
  }
  return `${loc.toLocaleString()} LOC`;
}

/**
 * Load Level 0 from checkpoint if it exists
 */
async function loadLevel0FromCheckpoint(repoPath: string): Promise<any | null> {
  const level0Path = path.join(repoPath, '.repo_map', CHECKPOINT_DIR, 'level0.json');
  if (fs.existsSync(level0Path)) {
    try {
      return JSON.parse(fs.readFileSync(level0Path, 'utf8'));
    } catch (e) {
      console.warn(yellow('Warning: Could not parse level0.json'));
    }
  }
  return null;
}

/**
 * Run Level 0 harvester
 */
async function runLevel0Harvester(repoPath: string): Promise<any | null> {
  console.log(dim('Running Level 0 harvester...'));

  try {
    const { harvest } = await import('../src/levels/level0/harvester.js');
    return await harvest(repoPath);
  } catch (error) {
    console.log(dim('Could not import harvester directly. Run `pnpm build` first.'));
    return null;
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const repoPath = args[0] ? path.resolve(args[0]) : process.cwd();

  console.log(bold('Task Preview Script (Level 2.5)'));
  console.log(dim(`Repository: ${repoPath}\n`));

  // Check if repo path exists
  if (!fs.existsSync(repoPath)) {
    console.error(red(`Error: Path does not exist: ${repoPath}`));
    process.exit(1);
  }

  // Load or generate Level 0
  let level0 = await loadLevel0FromCheckpoint(repoPath);

  if (!level0) {
    console.log(dim('No Level 0 checkpoint found. Running harvester...'));
    level0 = await runLevel0Harvester(repoPath);

    if (!level0) {
      console.error(red('\nError: Could not load or generate Level 0 data.'));
      console.log(dim('Please run `rmap build` first to generate checkpoint data.'));
      process.exit(1);
    }
  } else {
    console.log(green('\u2713 Loaded Level 0 from checkpoint'));
  }

  // Import and run the task builder
  console.log(dim('Running LOC-based task builder (Level 2.5)...\n'));

  try {
    const { buildTaskAssignmentPlan } = await import('../src/levels/level2/task-builder.js');
    const taskPlan = buildTaskAssignmentPlan(level0);

    // Print task plan
    printTaskPlan(taskPlan, level0);
  } catch (error) {
    console.error(red(`\nError running task builder: ${(error as Error).message}`));
    console.log(dim('Make sure the code is compiled. Run `pnpm build` first.'));
    process.exit(1);
  }
}

/**
 * Print the task plan with detailed statistics
 */
function printTaskPlan(taskPlan: any, level0: any): void {
  console.log('\n' + bold('\u2550\u2550\u2550 LEVEL 2.5 TASK ASSIGNMENT PLAN \u2550\u2550\u2550') + '\n');

  console.log(`Total files: ${cyan(taskPlan.totalFiles.toString())}`);
  console.log(`Total LOC: ${cyan(taskPlan.totalLoc.toLocaleString())}`);
  console.log(`Target LOC per task: ${cyan(taskPlan.targetLocPerTask.toString())}`);
  console.log(`Tasks created: ${cyan(taskPlan.tasks.length.toString())}`);
  console.log(`Trimmed files: ${taskPlan.trimmedFileCount > 0 ? yellow(taskPlan.trimmedFileCount.toString()) : '0'}`);

  // Calculate LOC distribution stats
  const locs = taskPlan.tasks.map((t: any) => t.totalLoc);
  const avgLoc = Math.round(locs.reduce((a: number, b: number) => a + b, 0) / locs.length);
  const minLoc = Math.min(...locs);
  const maxLoc = Math.max(...locs);
  const imbalanceRatio = minLoc > 0 ? (maxLoc / minLoc).toFixed(1) : 'N/A';

  console.log(`\nLOC distribution: min=${minLoc}, avg=${avgLoc}, max=${maxLoc}`);
  console.log(`Imbalance ratio: ${cyan(imbalanceRatio + 'x')} (max/min)`);

  // Agent size distribution
  const small = taskPlan.tasks.filter((t: any) => t.agentSize === 'small').length;
  const medium = taskPlan.tasks.filter((t: any) => t.agentSize === 'medium').length;
  const large = taskPlan.tasks.filter((t: any) => t.agentSize === 'large').length;
  console.log(`Agent sizes: ${small} small, ${medium} medium, ${large} large`);

  console.log('\n' + bold('\u2500\u2500\u2500 TASK DETAILS \u2500\u2500\u2500') + '\n');

  for (const task of taskPlan.tasks) {
    // Task header
    const trimmedNote = task.files.some((f: any) => f.trimmed) ? yellow(' (has trimmed files)') : '';
    const locWarning = task.totalLoc > 2000 ? yellow('  \u26a0\ufe0f High LOC') : '';

    console.log(
      bold(`${task.taskId}:`) +
        ` ${task.fileCount} files, ${task.totalLoc} LOC ` +
        dim(`[${task.agentSize}]`) +
        ` - ${task.primaryDirectory}/` +
        trimmedNote +
        locWarning
    );

    // Print files (sorted by LOC descending)
    const sortedFiles = [...task.files].sort((a: any, b: any) => b.loc - a.loc);

    for (const file of sortedFiles.slice(0, 5)) {
      const locStr = formatLOC(file.loc, file.trimmed ? file.effectiveLoc : undefined);
      const langStr = file.language ? dim(` [${file.language}]`) : '';
      console.log(`    - ${cyan(file.path)}${langStr} (${locStr})`);
    }

    if (sortedFiles.length > 5) {
      console.log(dim(`    ... and ${sortedFiles.length - 5} more files`));
    }

    console.log('');
  }

  // Print summary and warnings
  console.log(bold('\u2550\u2550\u2550 SUMMARY \u2550\u2550\u2550') + '\n');

  const warnings: string[] = [];

  // High imbalance warning
  if (parseFloat(imbalanceRatio) > 5) {
    warnings.push(`High imbalance ratio (${imbalanceRatio}x) detected`);
  }

  // Large tasks warning
  const largeTasks = taskPlan.tasks.filter((t: any) => t.totalLoc > 2000);
  if (largeTasks.length > 0) {
    warnings.push(`${largeTasks.length} task(s) exceed 2000 LOC soft limit`);
  }

  // Trimmed files warning
  if (taskPlan.trimmedFileCount > 0) {
    warnings.push(`${taskPlan.trimmedFileCount} file(s) will be trimmed for LLM context`);
  }

  // Large files count
  const largeFiles = level0.files.filter((f: any) => f.line_count >= LARGE_FILE_LOC_THRESHOLD);
  if (largeFiles.length > 0) {
    warnings.push(`${largeFiles.length} large file(s) detected (>${LARGE_FILE_LOC_THRESHOLD} LOC)`);
  }

  if (warnings.length > 0) {
    console.log(yellow('\u26a0\ufe0f Warnings:'));
    for (const warning of warnings) {
      console.log(yellow(`  - ${warning}`));
    }
  } else {
    console.log(green('\u2713 No warnings - task distribution looks balanced'));
  }

  // Comparison with potential file-based division
  console.log('\n' + bold('\u2550\u2550\u2550 LOC vs FILE-COUNT COMPARISON \u2550\u2550\u2550') + '\n');

  const avgFilesPerTask = Math.round(taskPlan.totalFiles / taskPlan.tasks.length * 10) / 10;
  const recommendedTasksByFiles = Math.ceil(taskPlan.totalFiles / 50);  // Old MAX_FILES_PER_TASK

  console.log(`LOC-based tasks: ${cyan(taskPlan.tasks.length.toString())} (avg ${avgLoc} LOC, ${avgFilesPerTask} files per task)`);
  console.log(`File-count tasks would be: ${cyan(recommendedTasksByFiles.toString())} (at 50 files/task max)`);

  if (taskPlan.tasks.length > recommendedTasksByFiles) {
    console.log(green(`\n\u2713 LOC-based division creates ${taskPlan.tasks.length - recommendedTasksByFiles} more tasks for better balance`));
  } else if (taskPlan.tasks.length < recommendedTasksByFiles) {
    console.log(dim(`LOC-based division consolidates ${recommendedTasksByFiles - taskPlan.tasks.length} tasks (files are small)`));
  } else {
    console.log(dim('Both approaches yield similar task counts'));
  }
}

// Run main
main().catch((error) => {
  console.error(red(`\nFatal error: ${error.message}`));
  process.exit(1);
});
