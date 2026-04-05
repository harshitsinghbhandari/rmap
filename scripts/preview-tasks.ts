#!/usr/bin/env tsx
/**
 * Task Preview Script
 *
 * Previews the Level 3 task breakdown based on Level 0 metadata and Level 2 division.
 * Shows exact files in each task with LOC statistics.
 *
 * Usage:
 *   tsx scripts/preview-tasks.ts [repo-path]
 *
 * If no repo-path is provided, uses current directory.
 *
 * The script will:
 * 1. Try to load existing checkpoint data (Level 0 + Level 2)
 * 2. If no checkpoint exists, run Level 0 harvester (no LLM needed)
 * 3. If Level 2 is missing, show directory groups instead of tasks
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// Type definitions (matching src/core/types.ts)
interface RawFileMetadata {
  name: string;
  path: string;
  extension: string;
  size_bytes: number;
  line_count: number;
  language?: string;
  raw_imports: string[];
}

interface Level0Output {
  files: RawFileMetadata[];
  git_commit: string;
  timestamp: string;
  total_files: number;
  total_size_bytes: number;
}

interface DelegationTask {
  scope: string;
  agent_size: 'small' | 'medium' | 'large';
  estimated_files: number;
}

interface TaskDelegation {
  tasks: DelegationTask[];
  execution: 'parallel' | 'sequential';
  estimated_total_minutes: number;
}

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
 * Load checkpoint data if it exists
 */
function loadCheckpointData(repoPath: string): {
  level0: Level0Output | null;
  level2: TaskDelegation | null;
} {
  const checkpointDir = path.join(repoPath, '.repo_map', CHECKPOINT_DIR);

  let level0: Level0Output | null = null;
  let level2: TaskDelegation | null = null;

  // Try to load Level 0
  const level0Path = path.join(checkpointDir, 'level0.json');
  if (fs.existsSync(level0Path)) {
    try {
      level0 = JSON.parse(fs.readFileSync(level0Path, 'utf8'));
    } catch (e) {
      console.warn(yellow('Warning: Could not parse level0.json'));
    }
  }

  // Try to load Level 2
  const level2Path = path.join(checkpointDir, 'level2.json');
  if (fs.existsSync(level2Path)) {
    try {
      level2 = JSON.parse(fs.readFileSync(level2Path, 'utf8'));
    } catch (e) {
      console.warn(yellow('Warning: Could not parse level2.json'));
    }
  }

  return { level0, level2 };
}

/**
 * Get files matching a task scope
 */
function getFilesForScope(
  files: RawFileMetadata[],
  scope: string
): RawFileMetadata[] {
  return files.filter((file) => {
    if (scope.endsWith('/')) {
      return file.path.startsWith(scope);
    }
    return file.path.includes(scope);
  });
}

/**
 * Group files by directory for preview (when Level 2 not available)
 */
function groupFilesByDirectory(
  files: RawFileMetadata[]
): Map<string, RawFileMetadata[]> {
  const groups = new Map<string, RawFileMetadata[]>();

  for (const file of files) {
    const pathParts = file.path.split('/');
    const dirPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '.';

    if (!groups.has(dirPath)) {
      groups.set(dirPath, []);
    }
    groups.get(dirPath)!.push(file);
  }

  return groups;
}

/**
 * Format LOC with color for large files
 */
function formatLOC(loc: number): string {
  if (loc >= LARGE_FILE_LOC_THRESHOLD) {
    return `${yellow(loc.toLocaleString())} LOC  ${yellow('\u26a0\ufe0f Large file')}`;
  }
  return `${loc.toLocaleString()} LOC`;
}

/**
 * Calculate statistics for a set of files
 */
function calculateStats(files: RawFileMetadata[]): {
  totalFiles: number;
  totalLOC: number;
  avgLOC: number;
  minLOC: number;
  maxLOC: number;
  largeFiles: number;
} {
  const totalFiles = files.length;
  const totalLOC = files.reduce((sum, f) => sum + f.line_count, 0);
  const avgLOC = totalFiles > 0 ? Math.round(totalLOC / totalFiles) : 0;
  const minLOC = totalFiles > 0 ? Math.min(...files.map((f) => f.line_count)) : 0;
  const maxLOC = totalFiles > 0 ? Math.max(...files.map((f) => f.line_count)) : 0;
  const largeFiles = files.filter((f) => f.line_count >= LARGE_FILE_LOC_THRESHOLD).length;

  return { totalFiles, totalLOC, avgLOC, minLOC, maxLOC, largeFiles };
}

/**
 * Print task preview with Level 2 delegation
 */
function printTaskPreview(level0: Level0Output, level2: TaskDelegation): void {
  console.log('\n' + bold('\u2550\u2550\u2550 LEVEL 3 TASK PREVIEW \u2550\u2550\u2550') + '\n');

  const allTaskStats: Array<{
    scope: string;
    fileCount: number;
    loc: number;
    agentSize: string;
  }> = [];

  let taskIndex = 0;
  for (const task of level2.tasks) {
    taskIndex++;
    const scopeFiles = getFilesForScope(level0.files, task.scope);
    const stats = calculateStats(scopeFiles);

    allTaskStats.push({
      scope: task.scope,
      fileCount: stats.totalFiles,
      loc: stats.totalLOC,
      agentSize: task.agent_size,
    });

    // Print task header
    console.log(
      bold(`Task ${taskIndex}: ${task.scope}`) +
        dim(` (${task.agent_size} agent)`)
    );

    // Print files (sorted by LOC descending for visibility)
    const sortedFiles = [...scopeFiles].sort(
      (a, b) => b.line_count - a.line_count
    );

    for (const file of sortedFiles.slice(0, 15)) {
      const locStr = formatLOC(file.line_count);
      const langStr = file.language ? dim(` [${file.language}]`) : '';
      console.log(`  - ${cyan(file.path)}${langStr} (${locStr})`);
    }

    if (sortedFiles.length > 15) {
      console.log(dim(`  ... and ${sortedFiles.length - 15} more files`));
    }

    // Print task summary
    const locWarning =
      stats.totalLOC > 2000 ? yellow('  \u26a0\ufe0f High LOC') : '';
    const fileWarning =
      stats.totalFiles > 50 ? yellow('  \u26a0\ufe0f Many files') : '';
    console.log(
      `  ${bold('Total:')} ${stats.totalFiles} files, ${stats.totalLOC.toLocaleString()} LOC${locWarning}${fileWarning}`
    );
    console.log('');
  }

  // Print summary
  printSummary(allTaskStats, level0.files, level2);
}

/**
 * Print directory-based preview (when Level 2 not available)
 */
function printDirectoryPreview(level0: Level0Output): void {
  console.log(
    '\n' + bold('\u2550\u2550\u2550 DIRECTORY PREVIEW (No Level 2 Data) \u2550\u2550\u2550') + '\n'
  );
  console.log(
    dim('Run `rmap build` to generate task delegation, or showing directory groups...\n')
  );

  const groups = groupFilesByDirectory(level0.files);
  const sortedDirs = Array.from(groups.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  const allDirStats: Array<{
    scope: string;
    fileCount: number;
    loc: number;
    agentSize: string;
  }> = [];

  for (const [dirPath, files] of sortedDirs) {
    const stats = calculateStats(files);

    allDirStats.push({
      scope: dirPath + '/',
      fileCount: stats.totalFiles,
      loc: stats.totalLOC,
      agentSize: 'unknown',
    });

    // Print directory header
    console.log(
      bold(`${dirPath}/`) +
        dim(` (${stats.totalFiles} files, ${stats.totalLOC.toLocaleString()} LOC)`)
    );

    // Print top files by LOC
    const sortedFiles = [...files].sort(
      (a, b) => b.line_count - a.line_count
    );

    for (const file of sortedFiles.slice(0, 5)) {
      const locStr = formatLOC(file.line_count);
      const langStr = file.language ? dim(` [${file.language}]`) : '';
      console.log(`  - ${file.name}${langStr} (${locStr})`);
    }

    if (sortedFiles.length > 5) {
      console.log(dim(`  ... and ${sortedFiles.length - 5} more files`));
    }
    console.log('');
  }

  // Print summary without Level 2 specific info
  const totalStats = calculateStats(level0.files);
  console.log(bold('\u2550\u2550\u2550 SUMMARY \u2550\u2550\u2550') + '\n');
  console.log(`Total directories: ${cyan(sortedDirs.length.toString())}`);
  console.log(`Total files: ${cyan(totalStats.totalFiles.toString())}`);
  console.log(`Total LOC: ${cyan(totalStats.totalLOC.toLocaleString())}`);
  console.log(
    `LOC per directory: avg ${totalStats.avgLOC}, min ${totalStats.minLOC}, max ${totalStats.maxLOC}`
  );

  if (totalStats.largeFiles > 0) {
    console.log(
      yellow(
        `\n\u26a0\ufe0f ${totalStats.largeFiles} large file(s) detected (>${LARGE_FILE_LOC_THRESHOLD} LOC)`
      )
    );
  }
}

/**
 * Print summary statistics
 */
function printSummary(
  taskStats: Array<{
    scope: string;
    fileCount: number;
    loc: number;
    agentSize: string;
  }>,
  allFiles: RawFileMetadata[],
  level2: TaskDelegation
): void {
  console.log(bold('\u2550\u2550\u2550 SUMMARY \u2550\u2550\u2550') + '\n');

  const totalFiles = taskStats.reduce((sum, t) => sum + t.fileCount, 0);
  const totalLOC = taskStats.reduce((sum, t) => sum + t.loc, 0);

  const avgFiles = Math.round(totalFiles / taskStats.length);
  const minFiles = Math.min(...taskStats.map((t) => t.fileCount));
  const maxFiles = Math.max(...taskStats.map((t) => t.fileCount));

  const avgLOC = Math.round(totalLOC / taskStats.length);
  const minLOC = Math.min(...taskStats.map((t) => t.loc));
  const maxLOC = Math.max(...taskStats.map((t) => t.loc));

  const imbalanceRatio = minLOC > 0 ? (maxLOC / minLOC).toFixed(1) : 'N/A';

  console.log(`Total tasks: ${cyan(taskStats.length.toString())}`);
  console.log(`Execution: ${cyan(level2.execution)}`);
  console.log(
    `Files per task: avg ${avgFiles}, min ${minFiles}, max ${maxFiles}`
  );
  console.log(
    `LOC per task: avg ${avgLOC}, min ${minLOC}, max ${maxLOC}`
  );
  console.log(`Imbalance ratio: ${cyan(imbalanceRatio + 'x')} (max/min LOC)`);

  // Agent size distribution
  const smallCount = taskStats.filter((t) => t.agentSize === 'small').length;
  const mediumCount = taskStats.filter((t) => t.agentSize === 'medium').length;
  const largeCount = taskStats.filter((t) => t.agentSize === 'large').length;
  console.log(
    `Agent sizes: ${smallCount} small, ${mediumCount} medium, ${largeCount} large`
  );

  // Warnings
  const warnings: string[] = [];

  // High imbalance warning
  if (parseFloat(imbalanceRatio) > 5) {
    warnings.push(
      `High imbalance ratio (${imbalanceRatio}x) - consider LOC-based division`
    );
  }

  // Large tasks warning
  const largeTasks = taskStats.filter((t) => t.loc > 2000);
  if (largeTasks.length > 0) {
    warnings.push(
      `${largeTasks.length} task(s) exceed 2000 LOC soft limit`
    );
  }

  // Small tasks warning
  const smallTasks = taskStats.filter((t) => t.loc < 50 && t.fileCount > 0);
  if (smallTasks.length > 0) {
    warnings.push(
      `${smallTasks.length} task(s) have <50 LOC (coordination overhead)`
    );
  }

  // Large files warning
  const largeFiles = allFiles.filter(
    (f) => f.line_count >= LARGE_FILE_LOC_THRESHOLD
  );
  if (largeFiles.length > 0) {
    warnings.push(
      `${largeFiles.length} large file(s) detected (>${LARGE_FILE_LOC_THRESHOLD} LOC)`
    );
  }

  // Unassigned files warning
  let assignedFiles = 0;
  for (const task of level2.tasks) {
    assignedFiles += getFilesForScope(allFiles, task.scope).length;
  }
  if (assignedFiles < allFiles.length) {
    const unassigned = allFiles.length - assignedFiles;
    warnings.push(`${unassigned} file(s) may not be covered by any task scope`);
  }

  if (warnings.length > 0) {
    console.log(yellow('\n\u26a0\ufe0f Warnings:'));
    for (const warning of warnings) {
      console.log(yellow(`  - ${warning}`));
    }
  } else {
    console.log(green('\n\u2713 No warnings - task distribution looks balanced'));
  }
}

/**
 * Run Level 0 harvester directly (simplified version)
 */
async function runLevel0Harvester(repoPath: string): Promise<Level0Output | null> {
  console.log(dim('Running Level 0 harvester (no checkpoint found)...\n'));

  try {
    // Dynamic import to handle the case where the built module might not exist
    const { harvest } = await import('../src/levels/level0/harvester.js');
    const level0 = await harvest(repoPath);
    return level0;
  } catch (error) {
    // If import fails (not built), try running via tsx
    console.log(
      dim('Could not import harvester directly. Run `pnpm build` first or use checkpoint data.')
    );
    return null;
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const repoPath = args[0] ? path.resolve(args[0]) : process.cwd();

  console.log(bold('Task Preview Script'));
  console.log(dim(`Repository: ${repoPath}\n`));

  // Check if repo path exists
  if (!fs.existsSync(repoPath)) {
    console.error(red(`Error: Path does not exist: ${repoPath}`));
    process.exit(1);
  }

  // Try to load checkpoint data
  let { level0, level2 } = loadCheckpointData(repoPath);

  // If no Level 0, try to run harvester
  if (!level0) {
    console.log(dim('No Level 0 checkpoint found. Attempting to run harvester...'));
    level0 = await runLevel0Harvester(repoPath);

    if (!level0) {
      console.error(
        red('\nError: Could not load or generate Level 0 data.')
      );
      console.log(dim('Please run `rmap build` first to generate checkpoint data.'));
      process.exit(1);
    }
  } else {
    console.log(green('\u2713 Loaded Level 0 from checkpoint'));
  }

  // Print appropriate preview
  if (level2) {
    console.log(green('\u2713 Loaded Level 2 from checkpoint'));
    printTaskPreview(level0, level2);
  } else {
    console.log(yellow('\u26a0\ufe0f No Level 2 checkpoint found'));
    printDirectoryPreview(level0);
  }

  // Print LOC-based recommendation
  console.log('\n' + bold('\u2550\u2550\u2550 LOC-BASED DIVISION ANALYSIS \u2550\u2550\u2550') + '\n');

  const totalLOC = level0.files.reduce((sum, f) => sum + f.line_count, 0);
  const recommendedTasks = Math.max(1, Math.round(totalLOC / 500));

  console.log(`Total repository LOC: ${cyan(totalLOC.toLocaleString())}`);
  console.log(`Target LOC per task: ${cyan('500')}`);
  console.log(`Recommended task count: ${cyan(recommendedTasks.toString())}`);

  if (level2) {
    const currentAvgLOC = Math.round(totalLOC / level2.tasks.length);
    console.log(`Current tasks: ${level2.tasks.length} (avg ${currentAvgLOC} LOC/task)`);

    if (Math.abs(level2.tasks.length - recommendedTasks) > 2) {
      console.log(
        yellow(
          `\n\u26a0\ufe0f Consider adjusting task count from ${level2.tasks.length} to ~${recommendedTasks} for better balance`
        )
      );
    }
  }
}

// Run main
main().catch((error) => {
  console.error(red(`\nFatal error: ${error.message}`));
  process.exit(1);
});
