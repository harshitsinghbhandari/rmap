import assert from 'node:assert';
import { performDeltaUpdate } from '../../src/coordinator/delta-update.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Delta Update', () => {
  const testRepoRoot = path.join(process.cwd(), 'test-delta-repo');

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

  test('performDeltaUpdate handles no changes correctly', async () => {
    const options = {
      repoRoot: testRepoRoot,
      changedFiles: [],
      deletedFiles: [],
      existingAnnotations: [],
      level0Data: {
        files: [],
        total_files: 0,
        total_size_bytes: 0,
        git_commit: 'abc',
        timestamp: new Date().toISOString(),
      },
    };

    const result = await performDeltaUpdate(options);
    assert.strictEqual(result.filesReAnnotated, 0);
    assert.strictEqual(result.filesRemoved, 0);
    assert.strictEqual(result.annotations.length, 0);
  });
});
