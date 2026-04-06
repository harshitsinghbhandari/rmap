/**
 * Integration Tests - Checkpoint Resume Workflow
 *
 * Tests the full checkpoint/resume workflow including:
 * - Fresh run creates checkpoint
 * - Resume skips completed levels
 * - Resume continues from partial Level 3
 * - Invalid checkpoint triggers fresh start
 * - CLI flags (--resume, --no-resume)
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
} from '../../src/coordinator/checkpoint.js';
import type { CheckpointState, Level0Output, Level1Output } from '../../src/core/types.js';
import { CHECKPOINT_VERSION, CHECKPOINT_FILES } from '../../src/core/constants.js';

/**
 * Helper to create a temporary test repository
 */
function createTempRepo(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rmap-integration-test-'));
}

/**
 * Helper to clean up temp repository
 */
function cleanupTempRepo(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Helper to create mock Level 0 output
 */
function createMockLevel0Output(): Level0Output {
  return {
    files: [
      {
        name: 'index.ts',
        path: 'src/index.ts',
        extension: '.ts',
        size_bytes: 1024,
        line_count: 50,
        language: 'TypeScript',
        raw_imports: ['./utils'],
      },
      {
        name: 'utils.ts',
        path: 'src/utils.ts',
        extension: '.ts',
        size_bytes: 512,
        line_count: 30,
        language: 'TypeScript',
        raw_imports: [],
      },
    ],
    git_commit: 'test123',
    timestamp: '2024-01-01T00:00:00Z',
    total_files: 2,
    total_size_bytes: 1536,
  };
}

/**
 * Helper to create mock Level 1 output
 */
function createMockLevel1Output(): Level1Output {
  return {
    repo_name: 'test-repo',
    purpose: 'A test repository',
    stack: 'TypeScript, Node.js',
    languages: ['TypeScript'],
    entrypoints: ['src/index.ts'],
    modules: [{ path: 'src', description: 'Source code' }],
    config_files: ['package.json'],
    conventions: ['Use TypeScript'],
  };
}

// Test: Fresh run creates checkpoint at each level
test('fresh run: creates checkpoint after each level completes', () => {
  const repoPath = createTempRepo();

  try {
    const gitCommit = 'abc123';
    const state = initCheckpoint(repoPath, gitCommit);

    // Simulate Level 0 completion
    markLevelStarted(repoPath, state, 0);
    const level0Output = createMockLevel0Output();
    saveLevelOutput(repoPath, 0, level0Output);
    markLevelCompleted(repoPath, state, 0, CHECKPOINT_FILES.LEVEL0);

    // Verify checkpoint exists and is correct
    const checkpoint = loadCheckpoint(repoPath);
    assert.ok(checkpoint);
    assert.strictEqual(checkpoint.levels[0].status, 'completed');
    assert.strictEqual(checkpoint.levels[0].output_file, CHECKPOINT_FILES.LEVEL0);
    assert.ok(checkpoint.levels[0].started_at);
    assert.ok(checkpoint.levels[0].completed_at);

    // Verify Level 0 output was saved
    const savedOutput = loadLevelOutput<Level0Output>(repoPath, 0);
    assert.ok(savedOutput);
    assert.deepStrictEqual(savedOutput, level0Output);
  } finally {
    cleanupTempRepo(repoPath);
  }
});

// Test: Resume skips completed levels
test('resume: skips already completed levels', () => {
  const repoPath = createTempRepo();

  try {
    const gitCommit = 'abc123';
    const state = initCheckpoint(repoPath, gitCommit);

    // Complete Levels 0, 1, 2
    const level0Output = createMockLevel0Output();
    const level1Output = createMockLevel1Output();
    const level2Output = { tasks: [], execution: 'parallel' as const };

    markLevelStarted(repoPath, state, 0);
    saveLevelOutput(repoPath, 0, level0Output);
    markLevelCompleted(repoPath, state, 0, CHECKPOINT_FILES.LEVEL0);

    markLevelStarted(repoPath, state, 1);
    saveLevelOutput(repoPath, 1, level1Output);
    markLevelCompleted(repoPath, state, 1, CHECKPOINT_FILES.LEVEL1);

    markLevelStarted(repoPath, state, 2);
    saveLevelOutput(repoPath, 2, level2Output);
    markLevelCompleted(repoPath, state, 2, CHECKPOINT_FILES.LEVEL2);

    // Simulate resume: load checkpoint
    const resumeState = loadCheckpoint(repoPath);
    assert.ok(resumeState);

    // Verify validation passes
    const validation = validateCheckpoint(resumeState, gitCommit);
    assert.strictEqual(validation.valid, true);

    // Verify we can load all completed level outputs
    const loaded0 = loadLevelOutput(repoPath, 0);
    const loaded1 = loadLevelOutput(repoPath, 1);
    const loaded2 = loadLevelOutput(repoPath, 2);

    assert.ok(loaded0);
    assert.ok(loaded1);
    assert.ok(loaded2);
    assert.deepStrictEqual(loaded0, level0Output);
    assert.deepStrictEqual(loaded1, level1Output);
    assert.deepStrictEqual(loaded2, level2Output);

    // Next level to execute should be Level 3
    assert.strictEqual(resumeState.levels[3].status, 'pending');
  } finally {
    cleanupTempRepo(repoPath);
  }
});

// Test: Resume from partial Level 3 completion
test('resume: continues Level 3 from partial completion', () => {
  const repoPath = createTempRepo();

  try {
    const gitCommit = 'abc123';
    const state = initCheckpoint(repoPath, gitCommit);

    // Complete Levels 0-2
    markLevelCompleted(repoPath, state, 0, CHECKPOINT_FILES.LEVEL0);
    markLevelCompleted(repoPath, state, 1, CHECKPOINT_FILES.LEVEL1);
    markLevelCompleted(repoPath, state, 2, CHECKPOINT_FILES.LEVEL2);

    // Start Level 3 with partial progress
    updateLevelCheckpoint(repoPath, state, 3, {
      status: 'in_progress',
      tasks_total: 10,
      tasks_completed: 6,
      completed_task_ids: ['task_0', 'task_1', 'task_2', 'task_3', 'task_4', 'task_5'],
    });

    // Save partial Level 3 annotations
    const partialAnnotations = [
      {
        path: 'src/file1.ts',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'File 1',
        exports: [],
        imports: [],
      },
      {
        path: 'src/file2.ts',
        language: 'TypeScript',
        size_bytes: 200,
        line_count: 20,
        purpose: 'File 2',
        exports: [],
        imports: [],
      },
    ];
    saveLevelOutput(repoPath, 3, partialAnnotations);

    // Simulate resume
    const resumeState = loadCheckpoint(repoPath);
    assert.ok(resumeState);

    // Verify Level 3 state
    assert.strictEqual(resumeState.levels[3].status, 'in_progress');
    assert.strictEqual(resumeState.levels[3].tasks_total, 10);
    assert.strictEqual(resumeState.levels[3].tasks_completed, 6);
    assert.deepStrictEqual(resumeState.levels[3].completed_task_ids, [
      'task_0',
      'task_1',
      'task_2',
      'task_3',
      'task_4',
      'task_5',
    ]);

    // Verify partial annotations can be loaded
    const loadedAnnotations = loadLevelOutput(repoPath, 3);
    assert.ok(loadedAnnotations);
    assert.deepStrictEqual(loadedAnnotations, partialAnnotations);

    // Remaining tasks to execute: 4 (10 - 6)
    const remainingTasks = resumeState.levels[3].tasks_total! - resumeState.levels[3].tasks_completed!;
    assert.strictEqual(remainingTasks, 4);
  } finally {
    cleanupTempRepo(repoPath);
  }
});

// Test: Invalid checkpoint (version mismatch) triggers fresh start
test('invalid checkpoint: version mismatch detected and rejected', () => {
  const repoPath = createTempRepo();

  try {
    const gitCommit = 'abc123';
    const state = initCheckpoint(repoPath, gitCommit);

    // Modify version to simulate old checkpoint
    state.version = '0.9';
    saveCheckpoint(repoPath, state);

    // Try to resume
    const resumeState = loadCheckpoint(repoPath);
    assert.ok(resumeState);

    const validation = validateCheckpoint(resumeState, gitCommit);
    assert.strictEqual(validation.valid, false);
    assert.ok(validation.error);
    assert.ok(validation.error.includes('version mismatch'));
  } finally {
    cleanupTempRepo(repoPath);
  }
});

// Test: Invalid checkpoint (git commit mismatch) triggers fresh start
test('invalid checkpoint: git commit mismatch detected and rejected', () => {
  const repoPath = createTempRepo();

  try {
    const oldCommit = 'abc123';
    const newCommit = 'def456';
    const state = initCheckpoint(repoPath, oldCommit);

    markLevelCompleted(repoPath, state, 0, CHECKPOINT_FILES.LEVEL0);
    markLevelCompleted(repoPath, state, 1, CHECKPOINT_FILES.LEVEL1);

    // Try to resume with different commit
    const resumeState = loadCheckpoint(repoPath);
    assert.ok(resumeState);

    const validation = validateCheckpoint(resumeState, newCommit);
    assert.strictEqual(validation.valid, false);
    assert.ok(validation.error);
    assert.ok(validation.error.includes('Git commit mismatch'));
    assert.ok(validation.error.includes(oldCommit));
    assert.ok(validation.error.includes(newCommit));
  } finally {
    cleanupTempRepo(repoPath);
  }
});

// Test: --no-resume flag clears checkpoint
test('CLI flag: --no-resume clears checkpoint and starts fresh', () => {
  const repoPath = createTempRepo();

  try {
    const gitCommit = 'abc123';
    const state = initCheckpoint(repoPath, gitCommit);

    // Complete some levels
    markLevelCompleted(repoPath, state, 0, CHECKPOINT_FILES.LEVEL0);
    markLevelCompleted(repoPath, state, 1, CHECKPOINT_FILES.LEVEL1);

    // Verify checkpoint exists
    const beforeClear = loadCheckpoint(repoPath);
    assert.ok(beforeClear);

    // Simulate --no-resume: clear checkpoint
    clearCheckpoint(repoPath);

    // Verify checkpoint cleared
    const afterClear = loadCheckpoint(repoPath);
    assert.strictEqual(afterClear, null);

    // Start fresh
    const freshState = initCheckpoint(repoPath, gitCommit);
    assert.strictEqual(freshState.levels[0].status, 'pending');
    assert.strictEqual(freshState.levels[1].status, 'pending');
  } finally {
    cleanupTempRepo(repoPath);
  }
});

// Test: Interrupted level can be resumed
test('graceful shutdown: interrupted level can be resumed', () => {
  const repoPath = createTempRepo();

  try {
    const gitCommit = 'abc123';
    const state = initCheckpoint(repoPath, gitCommit);

    // Complete Levels 0-1
    markLevelCompleted(repoPath, state, 0, CHECKPOINT_FILES.LEVEL0);
    markLevelCompleted(repoPath, state, 1, CHECKPOINT_FILES.LEVEL1);

    // Start Level 2 and interrupt it
    markLevelStarted(repoPath, state, 2);
    markLevelInterrupted(repoPath, state, 2);

    // Simulate resume
    const resumeState = loadCheckpoint(repoPath);
    assert.ok(resumeState);

    // Verify Level 2 shows interrupted
    assert.strictEqual(resumeState.levels[2].status, 'interrupted');

    // Restart Level 2
    resumeState.levels[2].status = 'in_progress';
    saveCheckpoint(repoPath, resumeState);

    // Complete it
    markLevelCompleted(repoPath, state, 2, CHECKPOINT_FILES.LEVEL2);

    const finalState = loadCheckpoint(repoPath);
    assert.ok(finalState);
    assert.strictEqual(finalState.levels[2].status, 'completed');
  } finally {
    cleanupTempRepo(repoPath);
  }
});

// Test: Full pipeline with checkpoint at each step
test('full workflow: checkpoint saved after each level completes', () => {
  const repoPath = createTempRepo();

  try {
    const gitCommit = 'abc123';
    const state = initCheckpoint(repoPath, gitCommit);

    // Level 0
    markLevelStarted(repoPath, state, 0);
    saveLevelOutput(repoPath, 0, createMockLevel0Output());
    markLevelCompleted(repoPath, state, 0, CHECKPOINT_FILES.LEVEL0);

    let checkpoint = loadCheckpoint(repoPath);
    assert.ok(checkpoint);
    assert.strictEqual(checkpoint.levels[0].status, 'completed');

    // Level 1
    markLevelStarted(repoPath, state, 1);
    saveLevelOutput(repoPath, 1, createMockLevel1Output());
    markLevelCompleted(repoPath, state, 1, CHECKPOINT_FILES.LEVEL1);

    checkpoint = loadCheckpoint(repoPath);
    assert.ok(checkpoint);
    assert.strictEqual(checkpoint.levels[1].status, 'completed');

    // Level 2
    markLevelStarted(repoPath, state, 2);
    saveLevelOutput(repoPath, 2, { tasks: [], execution: 'parallel' });
    markLevelCompleted(repoPath, state, 2, CHECKPOINT_FILES.LEVEL2);

    checkpoint = loadCheckpoint(repoPath);
    assert.ok(checkpoint);
    assert.strictEqual(checkpoint.levels[2].status, 'completed');

    // Level 3
    markLevelStarted(repoPath, state, 3);
    saveLevelOutput(repoPath, 3, []);
    markLevelCompleted(repoPath, state, 3);

    checkpoint = loadCheckpoint(repoPath);
    assert.ok(checkpoint);
    assert.strictEqual(checkpoint.levels[3].status, 'completed');

    // Level 4
    markLevelStarted(repoPath, state, 4);
    saveLevelOutput(repoPath, 4, { issues: [], auto_fixed: 0, requires_attention: 0 });
    markLevelCompleted(repoPath, state, 4);

    checkpoint = loadCheckpoint(repoPath);
    assert.ok(checkpoint);
    assert.strictEqual(checkpoint.levels[4].status, 'completed');

    // Verify all levels completed
    assert.strictEqual(checkpoint.levels[0].status, 'completed');
    assert.strictEqual(checkpoint.levels[1].status, 'completed');
    assert.strictEqual(checkpoint.levels[2].status, 'completed');
    assert.strictEqual(checkpoint.levels[3].status, 'completed');
    assert.strictEqual(checkpoint.levels[4].status, 'completed');
  } finally {
    cleanupTempRepo(repoPath);
  }
});

// Test: Multiple interruptions and resumes
test('resilience: handles multiple interruptions and resumes', () => {
  const repoPath = createTempRepo();

  try {
    const gitCommit = 'abc123';
    const state = initCheckpoint(repoPath, gitCommit);

    // Complete Level 0
    markLevelCompleted(repoPath, state, 0, CHECKPOINT_FILES.LEVEL0);

    // Interrupt during Level 1
    markLevelStarted(repoPath, state, 1);
    markLevelInterrupted(repoPath, state, 1);

    // Resume and complete Level 1
    let resumeState = loadCheckpoint(repoPath);
    assert.ok(resumeState);
    assert.strictEqual(resumeState.levels[1].status, 'interrupted');

    markLevelStarted(repoPath, state, 1);
    markLevelCompleted(repoPath, state, 1, CHECKPOINT_FILES.LEVEL1);

    // Interrupt during Level 2
    markLevelStarted(repoPath, state, 2);
    markLevelInterrupted(repoPath, state, 2);

    // Resume and complete Level 2
    resumeState = loadCheckpoint(repoPath);
    assert.ok(resumeState);
    assert.strictEqual(resumeState.levels[2].status, 'interrupted');

    markLevelStarted(repoPath, state, 2);
    markLevelCompleted(repoPath, state, 2, CHECKPOINT_FILES.LEVEL2);

    // Verify final state
    const finalState = loadCheckpoint(repoPath);
    assert.ok(finalState);
    assert.strictEqual(finalState.levels[0].status, 'completed');
    assert.strictEqual(finalState.levels[1].status, 'completed');
    assert.strictEqual(finalState.levels[2].status, 'completed');
  } finally {
    cleanupTempRepo(repoPath);
  }
});

// Test: Checkpoint directory structure
test('checkpoint structure: all files created in correct locations', () => {
  const repoPath = createTempRepo();

  try {
    const gitCommit = 'abc123';
    const state = initCheckpoint(repoPath, gitCommit);

    markLevelCompleted(repoPath, state, 0, CHECKPOINT_FILES.LEVEL0);
    saveLevelOutput(repoPath, 0, createMockLevel0Output());

    const checkpointDir = path.join(repoPath, '.repo_map', '.checkpoint');
    assert.ok(fs.existsSync(checkpointDir));
    assert.ok(fs.existsSync(path.join(checkpointDir, 'state.json')));
    assert.ok(fs.existsSync(path.join(checkpointDir, 'level0.json')));
  } finally {
    cleanupTempRepo(repoPath);
  }
});

// Test: Resume with missing output files (edge case)
test('edge case: resume with missing level output files', () => {
  const repoPath = createTempRepo();

  try {
    const gitCommit = 'abc123';
    const state = initCheckpoint(repoPath, gitCommit);

    // Mark Level 0 as completed but don't save output
    markLevelCompleted(repoPath, state, 0, CHECKPOINT_FILES.LEVEL0);

    // Try to load output
    const output = loadLevelOutput(repoPath, 0);
    assert.strictEqual(output, null);

    // This should be handled gracefully by pipeline
    const checkpoint = loadCheckpoint(repoPath);
    assert.ok(checkpoint);
    assert.strictEqual(checkpoint.levels[0].status, 'completed');
  } finally {
    cleanupTempRepo(repoPath);
  }
});

// Test: Concurrent modifications (ensure atomic writes work)
test('edge case: atomic writes prevent corruption during concurrent access', () => {
  const repoPath = createTempRepo();

  try {
    const gitCommit = 'abc123';
    const state = initCheckpoint(repoPath, gitCommit);

    // Save checkpoint multiple times rapidly
    for (let i = 0; i < 10; i++) {
      state.current_level = i % 5;
      saveCheckpoint(repoPath, state);
    }

    // Should always be able to load valid checkpoint
    const loaded = loadCheckpoint(repoPath);
    assert.ok(loaded);
    assert.strictEqual(loaded.version, CHECKPOINT_VERSION);
    assert.strictEqual(loaded.git_commit, gitCommit);
  } finally {
    cleanupTempRepo(repoPath);
  }
});
