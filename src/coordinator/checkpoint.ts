/**
 * Checkpoint Infrastructure
 *
 * Manages checkpoint state for pipeline resume functionality.
 * Saves intermediate results at each level so that interrupted pipelines
 * can resume from the last completed checkpoint instead of restarting.
 *
 * Directory structure:
 * .repo_map/.checkpoint/
 * ├── state.json           # CheckpointState
 * ├── level0.json          # Level 0 output
 * ├── level1.json          # Level 1 output
 * ├── level2.json          # Level 2 output (task delegation)
 * ├── level3_progress.json # Partial Level 3 annotations
 * └── level3_tasks.json    # Task queue with completion status
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CheckpointState, LevelCheckpoint } from '../core/types.js';
import { CHECKPOINT_DIR, CHECKPOINT_VERSION, CHECKPOINT_FILES } from '../core/constants.js';
import { CheckpointError, FileSystemError } from '../core/index.js';

/**
 * Get the checkpoint directory path for a repository
 *
 * @param repoPath - Absolute path to repository root
 * @returns Absolute path to checkpoint directory
 */
function getCheckpointDir(repoPath: string): string {
  return path.join(repoPath, '.repo_map', CHECKPOINT_DIR);
}

/**
 * Get the path to the checkpoint state file
 *
 * @param repoPath - Absolute path to repository root
 * @returns Absolute path to state.json
 */
function getCheckpointStatePath(repoPath: string): string {
  return path.join(getCheckpointDir(repoPath), CHECKPOINT_FILES.STATE);
}

/**
 * Get the path to a level output file
 *
 * @param repoPath - Absolute path to repository root
 * @param level - Level number (0-4)
 * @returns Absolute path to level output file
 */
function getLevelOutputPath(repoPath: string, level: number): string {
  const dir = getCheckpointDir(repoPath);
  const fileMap: Record<number, string> = {
    0: CHECKPOINT_FILES.LEVEL0,
    1: CHECKPOINT_FILES.LEVEL1,
    2: CHECKPOINT_FILES.LEVEL2,
    3: CHECKPOINT_FILES.LEVEL3_PROGRESS,
    4: 'level4.json', // Not in spec but included for completeness
  };
  return path.join(dir, fileMap[level] || `level${level}.json`);
}

/**
 * Ensure checkpoint directory exists
 *
 * @param repoPath - Absolute path to repository root
 * @throws {FileSystemError} If directory creation fails
 */
function ensureCheckpointDir(repoPath: string): void {
  const dir = getCheckpointDir(repoPath);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      throw new FileSystemError(
        'Failed to create checkpoint directory',
        dir,
        error instanceof Error ? error : undefined
      );
    }
  }
}

/**
 * Write JSON data to a file atomically
 *
 * Uses write-to-temp-then-rename pattern to ensure atomic writes.
 * This prevents corrupted checkpoints if the process is interrupted mid-write.
 *
 * @param filepath - Target file path
 * @param data - Data to write
 * @throws {FileSystemError} If write or rename operation fails
 */
function writeJsonAtomic(filepath: string, data: unknown): void {
  const dir = path.dirname(filepath);
  const tempPath = path.join(dir, `.${path.basename(filepath)}.tmp`);

  try {
    // Write to temporary file
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(tempPath, json + '\n', 'utf8');

    // Atomically rename to target file
    fs.renameSync(tempPath, filepath);
  } catch (error) {
    throw new FileSystemError(
      'Failed to write checkpoint file',
      filepath,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Read and parse JSON file safely
 *
 * @param filepath - File path to read
 * @returns Parsed JSON data or null if file doesn't exist
 * @throws {CheckpointError} If file exists but is corrupted
 */
function readJsonSafe<T>(filepath: string): T | null {
  if (!fs.existsSync(filepath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(content) as T;
  } catch (error) {
    throw new CheckpointError(
      `Corrupted checkpoint file: ${filepath}`,
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Initialize a new checkpoint state
 *
 * Creates a fresh checkpoint with all levels set to 'pending'.
 *
 * @param repoPath - Absolute path to repository root
 * @param gitCommit - Git commit hash when pipeline started
 * @returns New checkpoint state
 */
export function initCheckpoint(repoPath: string, gitCommit: string): CheckpointState {
  const now = new Date().toISOString();

  const state: CheckpointState = {
    version: CHECKPOINT_VERSION,
    started_at: now,
    git_commit: gitCommit,
    current_level: 0,
    levels: {
      0: { status: 'pending' },
      1: { status: 'pending' },
      2: { status: 'pending' },
      3: { status: 'pending' },
      4: { status: 'pending' },
    },
  };

  // Ensure directory exists and save initial state
  ensureCheckpointDir(repoPath);
  saveCheckpoint(repoPath, state);

  return state;
}

/**
 * Load existing checkpoint state
 *
 * @param repoPath - Absolute path to repository root
 * @returns Checkpoint state or null if none exists or is corrupted
 */
export function loadCheckpoint(repoPath: string): CheckpointState | null {
  const statePath = getCheckpointStatePath(repoPath);
  return readJsonSafe<CheckpointState>(statePath);
}

/**
 * Save checkpoint state atomically
 *
 * @param repoPath - Absolute path to repository root
 * @param state - Checkpoint state to save
 */
export function saveCheckpoint(repoPath: string, state: CheckpointState): void {
  ensureCheckpointDir(repoPath);
  const statePath = getCheckpointStatePath(repoPath);
  writeJsonAtomic(statePath, state);
}

/**
 * Save level output to checkpoint directory
 *
 * @param repoPath - Absolute path to repository root
 * @param level - Level number (0-4)
 * @param output - Level output data to save
 */
export function saveLevelOutput(repoPath: string, level: number, output: unknown): void {
  ensureCheckpointDir(repoPath);
  const outputPath = getLevelOutputPath(repoPath, level);
  writeJsonAtomic(outputPath, output);
}

/**
 * Load level output from checkpoint directory
 *
 * @param repoPath - Absolute path to repository root
 * @param level - Level number (0-4)
 * @returns Level output data or null if not found or corrupted
 */
export function loadLevelOutput<T>(repoPath: string, level: number): T | null {
  const outputPath = getLevelOutputPath(repoPath, level);
  return readJsonSafe<T>(outputPath);
}

/**
 * Remove checkpoint directory and all its contents
 *
 * @param repoPath - Absolute path to repository root
 */
export function clearCheckpoint(repoPath: string): void {
  const dir = getCheckpointDir(repoPath);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Validate checkpoint state against current repository state
 *
 * Checks if a checkpoint is still valid for resuming:
 * - Version must match current checkpoint version
 * - Git commit must match current HEAD (prevents resuming stale checkpoints)
 *
 * @param state - Checkpoint state to validate
 * @param currentCommit - Current git commit hash
 * @returns Object with validation result and optional error message
 */
export function validateCheckpoint(
  state: CheckpointState,
  currentCommit: string
): { valid: boolean; error?: string } {
  // Check version compatibility
  if (state.version !== CHECKPOINT_VERSION) {
    return {
      valid: false,
      error: `Checkpoint version mismatch: expected ${CHECKPOINT_VERSION}, got ${state.version}`,
    };
  }

  // Check git commit match
  if (state.git_commit !== currentCommit) {
    return {
      valid: false,
      error: `Git commit mismatch: checkpoint was created at ${state.git_commit}, current is ${currentCommit}`,
    };
  }

  return { valid: true };
}

/**
 * Update a level's checkpoint state
 *
 * Helper function to update a specific level's state and save the checkpoint.
 *
 * @param repoPath - Absolute path to repository root
 * @param state - Current checkpoint state
 * @param level - Level number (0-4)
 * @param update - Partial level checkpoint to merge
 */
export function updateLevelCheckpoint(
  repoPath: string,
  state: CheckpointState,
  level: number,
  update: Partial<LevelCheckpoint>
): void {
  state.levels[level] = { ...state.levels[level], ...update };
  state.current_level = level;
  saveCheckpoint(repoPath, state);
}

/**
 * Mark a level as started
 *
 * @param repoPath - Absolute path to repository root
 * @param state - Current checkpoint state
 * @param level - Level number (0-4)
 */
export function markLevelStarted(
  repoPath: string,
  state: CheckpointState,
  level: number
): void {
  updateLevelCheckpoint(repoPath, state, level, {
    status: 'in_progress',
    started_at: new Date().toISOString(),
  });
}

/**
 * Mark a level as completed
 *
 * @param repoPath - Absolute path to repository root
 * @param state - Current checkpoint state
 * @param level - Level number (0-4)
 * @param outputFile - Optional output file name (relative to checkpoint dir)
 */
export function markLevelCompleted(
  repoPath: string,
  state: CheckpointState,
  level: number,
  outputFile?: string
): void {
  updateLevelCheckpoint(repoPath, state, level, {
    status: 'completed',
    completed_at: new Date().toISOString(),
    output_file: outputFile,
  });
}

/**
 * Mark a level as interrupted
 *
 * @param repoPath - Absolute path to repository root
 * @param state - Current checkpoint state
 * @param level - Level number (0-4)
 */
export function markLevelInterrupted(
  repoPath: string,
  state: CheckpointState,
  level: number
): void {
  updateLevelCheckpoint(repoPath, state, level, {
    status: 'interrupted',
  });
}

/**
 * Get checkpoint status summary
 *
 * @param state - Checkpoint state
 * @returns Human-readable status summary
 */
export function getCheckpointSummary(state: CheckpointState): string {
  const completedLevels = Object.entries(state.levels)
    .filter(([_, level]) => level.status === 'completed')
    .map(([num]) => num);

  const currentLevel = state.current_level;
  const currentStatus = state.levels[currentLevel]?.status || 'unknown';

  return `Checkpoint at level ${currentLevel} (${currentStatus}). Completed: [${completedLevels.join(', ')}]`;
}
