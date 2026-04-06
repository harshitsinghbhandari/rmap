import assert from 'node:assert';
import { describe, test, before, after } from 'node:test';
import { tryLoadCheckpoint } from '../../src/coordinator/checkpoint-orchestrator.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Checkpoint Orchestrator', () => {
  const testRepoRoot = path.join(process.cwd(), 'test-checkpoint-repo');

  before(() => {
    if (!fs.existsSync(testRepoRoot)) {
      fs.mkdirSync(testRepoRoot, { recursive: true });
    }
  });

  after(() => {
    if (fs.existsSync(testRepoRoot)) {
      fs.rmSync(testRepoRoot, { recursive: true, force: true });
    }
  });

  test('tryLoadCheckpoint returns invalid when no checkpoint exists', async () => {
    // CheckpointOrchestrator constructor automatically creates a checkpoint
    // So "no checkpoint exists" isn't possible just by instantiating it.
    // We must manually delete the checkpoint it creates to test this branch.
    const { CheckpointOrchestrator } = await import('../../src/coordinator/checkpoint-orchestrator.js');
    const orchestrator = new CheckpointOrchestrator(testRepoRoot, 'abc1234');

    // Remove the checkpoint dir created by constructor
    const checkpointDir = path.join(testRepoRoot, '.repo_map', '.checkpoint');
    fs.rmSync(checkpointDir, { recursive: true, force: true });

    const result = orchestrator.tryLoadCheckpoint('abc1234', true);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, 'No checkpoint found');
  });

  test('tryLoadCheckpoint returns invalid when resume is disabled', async () => {
    const { CheckpointOrchestrator } = await import('../../src/coordinator/checkpoint-orchestrator.js');
    const orchestrator = new CheckpointOrchestrator(testRepoRoot, 'abc1234');

    const result = orchestrator.tryLoadCheckpoint('abc1234', false);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, 'Resume disabled');
  });
});
