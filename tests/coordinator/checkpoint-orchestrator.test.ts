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

  test('tryLoadCheckpoint returns invalid when no checkpoint exists', () => {
    const { CheckpointOrchestrator } = require('../../src/coordinator/checkpoint-orchestrator.js');
    const orchestrator = new CheckpointOrchestrator(testRepoRoot, 'abc1234');

    // Manually clear checkpoint directory to ensure no existing state
    if (fs.existsSync(path.join(testRepoRoot, '.repo_map', '.checkpoint'))) {
      fs.rmSync(path.join(testRepoRoot, '.repo_map', '.checkpoint'), { recursive: true, force: true });
    }

    const result = orchestrator.tryLoadCheckpoint('abc1234', true);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, 'No checkpoint found');
  });

  test('tryLoadCheckpoint returns invalid when resume is disabled', () => {
    const { CheckpointOrchestrator } = require('../../src/coordinator/checkpoint-orchestrator.js');
    const orchestrator = new CheckpointOrchestrator(testRepoRoot, 'abc1234');

    const result = orchestrator.tryLoadCheckpoint('abc1234', false);
    assert.strictEqual(result.valid, false);
    assert.strictEqual(result.error, 'Resume disabled');
  });
});
