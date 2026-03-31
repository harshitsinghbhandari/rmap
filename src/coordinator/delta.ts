/**
 * Delta Update Change Detection
 *
 * Detects file changes via git diff and decides whether to do:
 * - Delta update (< 20 files)
 * - Delta + validation (20-100 files)
 * - Full rebuild (>100 files or structural changes)
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MetaJson } from '../core/types.js';

/**
 * Result of change detection analysis
 */
export interface ChangeDetectionResult {
  /** Decision on what type of update to perform */
  updateStrategy: 'delta' | 'delta-with-validation' | 'full-rebuild';
  /** Files that were added or modified */
  changedFiles: string[];
  /** Files that were deleted */
  deletedFiles: string[];
  /** Total number of changed files */
  totalChanges: number;
  /** Whether a new top-level directory was added */
  hasNewTopLevelDir: boolean;
  /** Git commit hash of current HEAD */
  currentCommit: string;
  /** Reason for the chosen strategy */
  reason: string;
}

/**
 * Detect changes between last map build and current HEAD
 *
 * Compares the git commit in meta.json with current HEAD and determines
 * the appropriate update strategy based on the number and type of changes.
 *
 * @param repoRoot - Repository root path
 * @param existingMeta - Existing meta.json (null if no map exists)
 * @returns Change detection result with update strategy
 */
export function detectChanges(
  repoRoot: string,
  existingMeta: MetaJson | null
): ChangeDetectionResult {
  // Get current git commit
  const currentCommit = getCurrentCommit(repoRoot);

  // If no existing map, do full rebuild
  if (!existingMeta) {
    return {
      updateStrategy: 'full-rebuild',
      changedFiles: [],
      deletedFiles: [],
      totalChanges: 0,
      hasNewTopLevelDir: false,
      currentCommit,
      reason: 'No existing map found',
    };
  }

  const lastCommit = existingMeta.git_commit;

  // If commits are the same, no changes needed
  if (lastCommit === currentCommit) {
    return {
      updateStrategy: 'delta',
      changedFiles: [],
      deletedFiles: [],
      totalChanges: 0,
      hasNewTopLevelDir: false,
      currentCommit,
      reason: 'Map is up to date',
    };
  }

  // Get changed files from git
  const { added, modified, deleted } = getGitDiff(repoRoot, lastCommit, currentCommit);

  const changedFiles = [...added, ...modified];
  const deletedFiles = deleted;
  const totalChanges = changedFiles.length + deletedFiles.length;

  // Check for new top-level directories
  const hasNewTopLevelDir = checkForNewTopLevelDir(repoRoot, added);

  // Apply decision logic
  let updateStrategy: 'delta' | 'delta-with-validation' | 'full-rebuild';
  let reason: string;

  if (hasNewTopLevelDir) {
    updateStrategy = 'full-rebuild';
    reason = 'New top-level directory detected';
  } else if (totalChanges > 100) {
    updateStrategy = 'full-rebuild';
    reason = `${totalChanges} files changed (>100)`;
  } else if (totalChanges >= 20) {
    updateStrategy = 'delta-with-validation';
    reason = `${totalChanges} files changed (20-100)`;
  } else {
    updateStrategy = 'delta';
    reason = `${totalChanges} files changed (<20)`;
  }

  return {
    updateStrategy,
    changedFiles,
    deletedFiles,
    totalChanges,
    hasNewTopLevelDir,
    currentCommit,
    reason,
  };
}

/**
 * Get current git commit hash
 *
 * @param repoRoot - Repository root path
 * @returns Current HEAD commit hash
 */
export function getCurrentCommit(repoRoot: string): string {
  try {
    const commit = execSync('git rev-parse HEAD', {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();
    return commit;
  } catch (error) {
    throw new Error('Failed to get git commit. Is this a git repository?');
  }
}

/**
 * Get git diff between two commits
 *
 * @param repoRoot - Repository root path
 * @param fromCommit - Start commit hash
 * @param toCommit - End commit hash (defaults to HEAD)
 * @returns Object with added, modified, and deleted files
 */
export function getGitDiff(
  repoRoot: string,
  fromCommit: string,
  toCommit: string = 'HEAD'
): { added: string[]; modified: string[]; deleted: string[] } {
  try {
    // Use git diff with name-status to get file changes
    const output = execSync(`git diff --name-status ${fromCommit} ${toCommit}`, {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();

    if (!output) {
      return { added: [], modified: [], deleted: [] };
    }

    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];

    const lines = output.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;

      const [status, ...pathParts] = line.split('\t');
      const filePath = pathParts.join('\t'); // Handle paths with tabs

      // Filter out non-source files
      if (shouldSkipFile(filePath)) {
        continue;
      }

      // Status codes: A=added, M=modified, D=deleted, R=renamed, C=copied
      if (status.startsWith('A')) {
        added.push(filePath);
      } else if (status.startsWith('M')) {
        modified.push(filePath);
      } else if (status.startsWith('D')) {
        deleted.push(filePath);
      } else if (status.startsWith('R')) {
        // For renames, treat as both deleted (old) and added (new)
        const [oldPath, newPath] = filePath.split('\t');
        if (newPath) {
          deleted.push(oldPath);
          added.push(newPath);
        }
      }
    }

    return { added, modified, deleted };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get git diff: ${message}`);
  }
}

/**
 * Check if any of the added files introduces a new top-level directory
 *
 * @param repoRoot - Repository root path
 * @param addedFiles - List of added file paths
 * @returns True if a new top-level directory was added
 */
function checkForNewTopLevelDir(repoRoot: string, addedFiles: string[]): boolean {
  if (addedFiles.length === 0) return false;

  // Get existing top-level directories
  const existingDirs = new Set<string>();
  try {
    const entries = fs.readdirSync(repoRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        existingDirs.add(entry.name);
      }
    }
  } catch (error) {
    // If we can't read the directory, assume no new dirs
    return false;
  }

  // Check if any added file is in a new top-level directory
  for (const filePath of addedFiles) {
    const parts = filePath.split('/');
    if (parts.length > 1) {
      const topLevelDir = parts[0];
      if (!existingDirs.has(topLevelDir)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if a file should be skipped (binary, config, etc.)
 *
 * @param filePath - File path to check
 * @returns True if file should be skipped
 */
function shouldSkipFile(filePath: string): boolean {
  // Skip files in certain directories
  const skipDirs = ['node_modules', '.git', '.repo_map', 'dist', 'build', 'coverage'];
  for (const dir of skipDirs) {
    if (filePath.startsWith(`${dir}/`) || filePath.includes(`/${dir}/`)) {
      return true;
    }
  }

  // Skip binary and lock files
  const ext = path.extname(filePath).toLowerCase();
  const binaryExts = [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.ico',
    '.svg',
    '.pdf',
    '.zip',
    '.tar',
    '.gz',
    '.lock',
    '.woff',
    '.woff2',
    '.ttf',
    '.eot',
  ];

  return binaryExts.includes(ext);
}

/**
 * Get commit age in days
 *
 * @param repoRoot - Repository root path
 * @param commitHash - Commit hash to check
 * @returns Age in days
 */
export function getCommitAge(repoRoot: string, commitHash: string): number {
  try {
    const timestamp = execSync(`git show -s --format=%ct ${commitHash}`, {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();

    const commitDate = new Date(parseInt(timestamp) * 1000);
    const now = new Date();
    const ageMs = now.getTime() - commitDate.getTime();
    const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

    return ageDays;
  } catch (error) {
    return 0;
  }
}

/**
 * Get number of commits between two commits
 *
 * @param repoRoot - Repository root path
 * @param fromCommit - Start commit hash
 * @param toCommit - End commit hash (defaults to HEAD)
 * @returns Number of commits
 */
export function getCommitCount(
  repoRoot: string,
  fromCommit: string,
  toCommit: string = 'HEAD'
): number {
  try {
    const output = execSync(`git rev-list --count ${fromCommit}..${toCommit}`, {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim();

    return parseInt(output) || 0;
  } catch (error) {
    return 0;
  }
}
