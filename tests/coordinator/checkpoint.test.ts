/**
 * Unit tests for Checkpoint Manager
 *
 * Tests checkpoint infrastructure for saving/loading pipeline state,
 * enabling resume functionality after interruption.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  initCheckpoint,
  loadCheckpoint,
  saveCheckpoint,
  saveLevelOutput,
  loadLevelOutput,
  clearCheckpoint,
  validateCheckpoint,
  markLevelStarted,
  markLevelCompleted,
  markLevelInterrupted,
  updateLevelCheckpoint,
  getCheckpointSummary,
} from '../../src/coordinator/checkpoint.js';
import type { CheckpointState } from '../../src/core/types.js';
import { CHECKPOINT_VERSION } from '../../src/core/constants.js';

/**
 * Helper to create a temporary test directory
 */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rmap-checkpoint-test-'));
}

/**
 * Helper to clean up temp directory
 */
function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Test: initCheckpoint creates valid initial state
test('initCheckpoint: creates valid initial state', () => {
  const tempDir = createTempDir();

  try {
    const gitCommit = 'abc123def456';
    const state = initCheckpoint(tempDir, gitCommit);

    // Verify structure
    assert.strictEqual(state.version, CHECKPOINT_VERSION);
    assert.strictEqual(state.git_commit, gitCommit);
    assert.strictEqual(state.current_level, 0);
    assert.ok(state.started_at);
    assert.ok(new Date(state.started_at).getTime() > 0);

    // Verify all levels initialized to pending
    assert.strictEqual(state.levels[0].status, 'pending');
    assert.strictEqual(state.levels[1].status, 'pending');
    assert.strictEqual(state.levels[2].status, 'pending');
    assert.strictEqual(state.levels[3].status, 'pending');
    assert.strictEqual(state.levels[4].status, 'pending');

    // Verify checkpoint directory and state file created
    const checkpointDir = path.join(tempDir, '.repo_map', '.checkpoint');
    assert.ok(fs.existsSync(checkpointDir));
    assert.ok(fs.existsSync(path.join(checkpointDir, 'state.json')));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: saveCheckpoint and loadCheckpoint round-trip
test('saveCheckpoint/loadCheckpoint: round-trip works', () => {
  const tempDir = createTempDir();

  try {
    const gitCommit = 'abc123';
    const state = initCheckpoint(tempDir, gitCommit);

    // Modify state
    state.current_level = 2;
    state.levels[0].status = 'completed';
    state.levels[1].status = 'completed';
    state.levels[2].status = 'in_progress';

    // Save
    saveCheckpoint(tempDir, state);

    // Load and verify
    const loaded = loadCheckpoint(tempDir);
    assert.ok(loaded);
    assert.strictEqual(loaded.version, state.version);
    assert.strictEqual(loaded.git_commit, state.git_commit);
    assert.strictEqual(loaded.current_level, 2);
    assert.strictEqual(loaded.levels[0].status, 'completed');
    assert.strictEqual(loaded.levels[1].status, 'completed');
    assert.strictEqual(loaded.levels[2].status, 'in_progress');
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: loadCheckpoint returns null when no checkpoint exists
test('loadCheckpoint: returns null when no checkpoint exists', () => {
  const tempDir = createTempDir();

  try {
    const loaded = loadCheckpoint(tempDir);
    assert.strictEqual(loaded, null);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: loadCheckpoint returns null for corrupted checkpoint
test('loadCheckpoint: returns null for corrupted checkpoint file', () => {
  const tempDir = createTempDir();

  try {
    // Create checkpoint directory
    const checkpointDir = path.join(tempDir, '.repo_map', '.checkpoint');
    fs.mkdirSync(checkpointDir, { recursive: true });

    // Write corrupted JSON
    const statePath = path.join(checkpointDir, 'state.json');
    fs.writeFileSync(statePath, '{ invalid json }', 'utf8');

    const loaded = loadCheckpoint(tempDir);
    assert.strictEqual(loaded, null);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: saveLevelOutput and loadLevelOutput
test('saveLevelOutput/loadLevelOutput: saves and loads level data', () => {
  const tempDir = createTempDir();

  try {
    const level0Output = {
      files: [
        {
          name: 'test.ts',
          path: 'src/test.ts',
          extension: '.ts',
          size_bytes: 1024,
          line_count: 50,
          language: 'TypeScript',
          raw_imports: ['./utils'],
        },
      ],
      git_commit: 'abc123',
      timestamp: '2024-01-01T00:00:00Z',
      total_files: 1,
      total_size_bytes: 1024,
    };

    // Save Level 0 output
    saveLevelOutput(tempDir, 0, level0Output);

    // Load and verify
    const loaded = loadLevelOutput(tempDir, 0);
    assert.ok(loaded);
    assert.deepStrictEqual(loaded, level0Output);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: loadLevelOutput returns null when file doesn't exist
test('loadLevelOutput: returns null when file does not exist', () => {
  const tempDir = createTempDir();

  try {
    const loaded = loadLevelOutput(tempDir, 0);
    assert.strictEqual(loaded, null);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: clearCheckpoint removes checkpoint directory
test('clearCheckpoint: removes checkpoint directory and all contents', () => {
  const tempDir = createTempDir();

  try {
    // Create checkpoint
    initCheckpoint(tempDir, 'abc123');
    saveLevelOutput(tempDir, 0, { test: 'data' });

    const checkpointDir = path.join(tempDir, '.repo_map', '.checkpoint');
    assert.ok(fs.existsSync(checkpointDir));

    // Clear checkpoint
    clearCheckpoint(tempDir);

    // Verify removed
    assert.ok(!fs.existsSync(checkpointDir));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: clearCheckpoint handles non-existent directory gracefully
test('clearCheckpoint: handles non-existent directory gracefully', () => {
  const tempDir = createTempDir();

  try {
    // Should not throw
    clearCheckpoint(tempDir);

    const checkpointDir = path.join(tempDir, '.repo_map', '.checkpoint');
    assert.ok(!fs.existsSync(checkpointDir));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: validateCheckpoint accepts valid checkpoint
test('validateCheckpoint: accepts valid checkpoint', () => {
  const state: CheckpointState = {
    version: CHECKPOINT_VERSION,
    started_at: '2024-01-01T00:00:00Z',
    git_commit: 'abc123',
    current_level: 0,
    levels: {
      0: { status: 'pending' },
      1: { status: 'pending' },
      2: { status: 'pending' },
      3: { status: 'pending' },
      4: { status: 'pending' },
    },
  };

  const result = validateCheckpoint(state, 'abc123');
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.error, undefined);
});

// Test: validateCheckpoint rejects version mismatch
test('validateCheckpoint: rejects checkpoint with version mismatch', () => {
  const state: CheckpointState = {
    version: '0.9', // Old version
    started_at: '2024-01-01T00:00:00Z',
    git_commit: 'abc123',
    current_level: 0,
    levels: {
      0: { status: 'pending' },
      1: { status: 'pending' },
      2: { status: 'pending' },
      3: { status: 'pending' },
      4: { status: 'pending' },
    },
  };

  const result = validateCheckpoint(state, 'abc123');
  assert.strictEqual(result.valid, false);
  assert.ok(result.error);
  assert.ok(result.error.includes('version mismatch'));
});

// Test: validateCheckpoint rejects git commit mismatch
test('validateCheckpoint: rejects checkpoint with git commit mismatch', () => {
  const state: CheckpointState = {
    version: CHECKPOINT_VERSION,
    started_at: '2024-01-01T00:00:00Z',
    git_commit: 'abc123',
    current_level: 0,
    levels: {
      0: { status: 'pending' },
      1: { status: 'pending' },
      2: { status: 'pending' },
      3: { status: 'pending' },
      4: { status: 'pending' },
    },
  };

  const result = validateCheckpoint(state, 'def456'); // Different commit
  assert.strictEqual(result.valid, false);
  assert.ok(result.error);
  assert.ok(result.error.includes('Git commit mismatch'));
});

// Test: markLevelStarted updates state correctly
test('markLevelStarted: updates level to in_progress with timestamp', () => {
  const tempDir = createTempDir();

  try {
    const state = initCheckpoint(tempDir, 'abc123');

    // Mark Level 1 started
    markLevelStarted(tempDir, state, 1);

    // Verify in memory
    assert.strictEqual(state.levels[1].status, 'in_progress');
    assert.ok(state.levels[1].started_at);
    assert.strictEqual(state.current_level, 1);

    // Verify persisted
    const loaded = loadCheckpoint(tempDir);
    assert.ok(loaded);
    assert.strictEqual(loaded.levels[1].status, 'in_progress');
    assert.ok(loaded.levels[1].started_at);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: markLevelCompleted updates state correctly
test('markLevelCompleted: updates level to completed with timestamp', () => {
  const tempDir = createTempDir();

  try {
    const state = initCheckpoint(tempDir, 'abc123');

    // Mark Level 0 completed
    markLevelCompleted(tempDir, state, 0, 'level0.json');

    // Verify in memory
    assert.strictEqual(state.levels[0].status, 'completed');
    assert.ok(state.levels[0].completed_at);
    assert.strictEqual(state.levels[0].output_file, 'level0.json');
    assert.strictEqual(state.current_level, 0);

    // Verify persisted
    const loaded = loadCheckpoint(tempDir);
    assert.ok(loaded);
    assert.strictEqual(loaded.levels[0].status, 'completed');
    assert.ok(loaded.levels[0].completed_at);
    assert.strictEqual(loaded.levels[0].output_file, 'level0.json');
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: markLevelInterrupted updates state correctly
test('markLevelInterrupted: updates level to interrupted', () => {
  const tempDir = createTempDir();

  try {
    const state = initCheckpoint(tempDir, 'abc123');
    state.levels[2].status = 'in_progress';

    // Mark Level 2 interrupted
    markLevelInterrupted(tempDir, state, 2);

    // Verify in memory
    assert.strictEqual(state.levels[2].status, 'interrupted');
    assert.strictEqual(state.current_level, 2);

    // Verify persisted
    const loaded = loadCheckpoint(tempDir);
    assert.ok(loaded);
    assert.strictEqual(loaded.levels[2].status, 'interrupted');
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: updateLevelCheckpoint merges partial updates
test('updateLevelCheckpoint: merges partial updates into existing state', () => {
  const tempDir = createTempDir();

  try {
    const state = initCheckpoint(tempDir, 'abc123');

    // Update Level 3 with task progress
    updateLevelCheckpoint(tempDir, state, 3, {
      status: 'in_progress',
      tasks_total: 10,
      tasks_completed: 5,
    });

    // Verify merged
    assert.strictEqual(state.levels[3].status, 'in_progress');
    assert.strictEqual(state.levels[3].tasks_total, 10);
    assert.strictEqual(state.levels[3].tasks_completed, 5);

    // Update again with more progress
    updateLevelCheckpoint(tempDir, state, 3, {
      tasks_completed: 8,
    });

    // Verify previous fields preserved
    assert.strictEqual(state.levels[3].status, 'in_progress');
    assert.strictEqual(state.levels[3].tasks_total, 10);
    assert.strictEqual(state.levels[3].tasks_completed, 8);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: getCheckpointSummary generates human-readable summary
test('getCheckpointSummary: generates human-readable summary', () => {
  const state: CheckpointState = {
    version: CHECKPOINT_VERSION,
    started_at: '2024-01-01T00:00:00Z',
    git_commit: 'abc123',
    current_level: 3,
    levels: {
      0: { status: 'completed' },
      1: { status: 'completed' },
      2: { status: 'completed' },
      3: { status: 'in_progress' },
      4: { status: 'pending' },
    },
  };

  const summary = getCheckpointSummary(state);

  assert.ok(summary.includes('level 3'));
  assert.ok(summary.includes('in_progress'));
  assert.ok(summary.includes('0, 1, 2'));
});

// Test: Atomic writes prevent corruption
test('saveCheckpoint: uses atomic writes to prevent corruption', () => {
  const tempDir = createTempDir();

  try {
    const state = initCheckpoint(tempDir, 'abc123');
    const checkpointDir = path.join(tempDir, '.repo_map', '.checkpoint');
    const statePath = path.join(checkpointDir, 'state.json');
    const tempPath = path.join(checkpointDir, '.state.json.tmp');

    // Save checkpoint
    saveCheckpoint(tempDir, state);

    // Temp file should not exist after successful save
    assert.ok(!fs.existsSync(tempPath));

    // Final file should exist and be valid
    assert.ok(fs.existsSync(statePath));
    const loaded = loadCheckpoint(tempDir);
    assert.ok(loaded);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: Multiple levels can be marked sequentially
test('checkpoint workflow: can mark levels sequentially through pipeline', () => {
  const tempDir = createTempDir();

  try {
    const state = initCheckpoint(tempDir, 'abc123');

    // Simulate pipeline progression
    markLevelStarted(tempDir, state, 0);
    markLevelCompleted(tempDir, state, 0, 'level0.json');

    markLevelStarted(tempDir, state, 1);
    markLevelCompleted(tempDir, state, 1, 'level1.json');

    markLevelStarted(tempDir, state, 2);
    markLevelCompleted(tempDir, state, 2, 'level2.json');

    // Verify final state
    const loaded = loadCheckpoint(tempDir);
    assert.ok(loaded);
    assert.strictEqual(loaded.levels[0].status, 'completed');
    assert.strictEqual(loaded.levels[1].status, 'completed');
    assert.strictEqual(loaded.levels[2].status, 'completed');
    assert.strictEqual(loaded.levels[3].status, 'pending');
    assert.strictEqual(loaded.levels[4].status, 'pending');
    assert.strictEqual(loaded.current_level, 2);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: Level 3 task tracking
test('checkpoint workflow: tracks Level 3 task progress', () => {
  const tempDir = createTempDir();

  try {
    const state = initCheckpoint(tempDir, 'abc123');

    // Start Level 3 with task tracking
    updateLevelCheckpoint(tempDir, state, 3, {
      status: 'in_progress',
      tasks_total: 8,
      tasks_completed: 0,
      completed_task_ids: [],
    });

    // Simulate completing tasks
    updateLevelCheckpoint(tempDir, state, 3, {
      tasks_completed: 3,
      completed_task_ids: ['task_0', 'task_1', 'task_2'],
    });

    const loaded = loadCheckpoint(tempDir);
    assert.ok(loaded);
    assert.strictEqual(loaded.levels[3].tasks_total, 8);
    assert.strictEqual(loaded.levels[3].tasks_completed, 3);
    assert.deepStrictEqual(loaded.levels[3].completed_task_ids, [
      'task_0',
      'task_1',
      'task_2',
    ]);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: saveLevelOutput for different levels
test('saveLevelOutput: saves output for all levels', () => {
  const tempDir = createTempDir();

  try {
    const level0Data = { files: [], git_commit: 'abc' };
    const level1Data = { repo_name: 'test', purpose: 'testing' };
    const level2Data = { tasks: [], execution: 'parallel' };

    saveLevelOutput(tempDir, 0, level0Data);
    saveLevelOutput(tempDir, 1, level1Data);
    saveLevelOutput(tempDir, 2, level2Data);

    const loaded0 = loadLevelOutput(tempDir, 0);
    const loaded1 = loadLevelOutput(tempDir, 1);
    const loaded2 = loadLevelOutput(tempDir, 2);

    assert.deepStrictEqual(loaded0, level0Data);
    assert.deepStrictEqual(loaded1, level1Data);
    assert.deepStrictEqual(loaded2, level2Data);
  } finally {
    cleanupTempDir(tempDir);
  }
});
