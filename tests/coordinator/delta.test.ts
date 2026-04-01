/**
 * Tests for delta change detection boundary conditions
 *
 * Covers strategy selection around MIN_DELTA_WITH_VALIDATION and MAX_DELTA_UPDATE
 * to prevent regressions in both strategy selection and user-facing reason strings.
 */

import { test, after } from 'node:test';
import assert from 'node:assert';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { detectChanges } from '../../src/coordinator/delta.js';
import { UPDATE_THRESHOLDS } from '../../src/core/constants.js';
import type { MetaJson } from '../../src/core/types.js';

/** Temporary directories to clean up after tests */
const tmpDirs: string[] = [];

after(() => {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  }
});

/**
 * Creates a temporary git repo with `numChanges` TypeScript source files
 * added in a second commit.  Returns the repo root and the two commit hashes.
 */
function createTestRepo(numChanges: number): { repoRoot: string; commitA: string } {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'delta-test-'));
  tmpDirs.push(repoRoot);

  execSync('git init', { cwd: repoRoot, stdio: 'pipe' });
  execSync('git config user.email "test@example.com"', { cwd: repoRoot, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: repoRoot, stdio: 'pipe' });

  // Initial commit – this will be the "last map" commit stored in meta.json
  fs.writeFileSync(path.join(repoRoot, 'README.md'), 'init');
  execSync('git add .', { cwd: repoRoot, stdio: 'pipe' });
  execSync('git commit -m "initial"', { cwd: repoRoot, stdio: 'pipe' });
  const commitA = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();

  // Add `numChanges` source files in a second commit
  if (numChanges > 0) {
    fs.mkdirSync(path.join(repoRoot, 'src'), { recursive: true });
    for (let i = 0; i < numChanges; i++) {
      fs.writeFileSync(path.join(repoRoot, 'src', `file${i}.ts`), `export const x${i} = ${i};`);
    }
    execSync('git add .', { cwd: repoRoot, stdio: 'pipe' });
    execSync('git commit -m "add files"', { cwd: repoRoot, stdio: 'pipe' });
  }

  return { repoRoot, commitA };
}

/** Minimal MetaJson fixture pointing to the given git commit */
function makeMeta(gitCommit: string): MetaJson {
  return {
    schema_version: '1.0',
    map_version: 1,
    git_commit: gitCommit,
    created_at: new Date().toISOString(),
    last_updated: new Date().toISOString(),
    total_files: 0,
    languages: [],
    top_tags: [],
  } as unknown as MetaJson;
}

// ---------------------------------------------------------------------------
// Boundary tests
// ---------------------------------------------------------------------------

test('detectChanges: 0 files changed → delta strategy', () => {
  const { repoRoot, commitA } = createTestRepo(0);
  // HEAD == commitA, so no changes
  const result = detectChanges(repoRoot, makeMeta(commitA));
  assert.strictEqual(result.updateStrategy, 'delta');
  assert.strictEqual(result.totalChanges, 0);
});

test(`detectChanges: ${UPDATE_THRESHOLDS.MIN_DELTA_WITH_VALIDATION - 1} files changed → delta strategy`, () => {
  const count = UPDATE_THRESHOLDS.MIN_DELTA_WITH_VALIDATION - 1; // 19
  const { repoRoot, commitA } = createTestRepo(count);
  const result = detectChanges(repoRoot, makeMeta(commitA));
  assert.strictEqual(result.updateStrategy, 'delta');
  assert.strictEqual(result.totalChanges, count);
  assert.ok(
    result.reason.includes(`<${UPDATE_THRESHOLDS.MIN_DELTA_WITH_VALIDATION}`),
    `reason should mention threshold, got: ${result.reason}`
  );
});

test(`detectChanges: ${UPDATE_THRESHOLDS.MIN_DELTA_WITH_VALIDATION} files changed → delta-with-validation strategy`, () => {
  const count = UPDATE_THRESHOLDS.MIN_DELTA_WITH_VALIDATION; // 20
  const { repoRoot, commitA } = createTestRepo(count);
  const result = detectChanges(repoRoot, makeMeta(commitA));
  assert.strictEqual(result.updateStrategy, 'delta-with-validation');
  assert.strictEqual(result.totalChanges, count);
  assert.ok(
    result.reason.includes(`${UPDATE_THRESHOLDS.MIN_DELTA_WITH_VALIDATION}`),
    `reason should mention lower threshold, got: ${result.reason}`
  );
  assert.ok(
    result.reason.includes(`${UPDATE_THRESHOLDS.MAX_DELTA_UPDATE}`),
    `reason should mention upper threshold, got: ${result.reason}`
  );
});

test(`detectChanges: ${UPDATE_THRESHOLDS.MAX_DELTA_UPDATE} files changed → delta-with-validation strategy`, () => {
  const count = UPDATE_THRESHOLDS.MAX_DELTA_UPDATE; // 100
  const { repoRoot, commitA } = createTestRepo(count);
  const result = detectChanges(repoRoot, makeMeta(commitA));
  assert.strictEqual(result.updateStrategy, 'delta-with-validation');
  assert.strictEqual(result.totalChanges, count);
});

test(`detectChanges: ${UPDATE_THRESHOLDS.MAX_DELTA_UPDATE + 1} files changed → full-rebuild strategy`, () => {
  const count = UPDATE_THRESHOLDS.MAX_DELTA_UPDATE + 1; // 101
  const { repoRoot, commitA } = createTestRepo(count);
  const result = detectChanges(repoRoot, makeMeta(commitA));
  assert.strictEqual(result.updateStrategy, 'full-rebuild');
  assert.strictEqual(result.totalChanges, count);
  assert.ok(
    result.reason.includes(`>${UPDATE_THRESHOLDS.MAX_DELTA_UPDATE}`),
    `reason should mention threshold, got: ${result.reason}`
  );
});

test('detectChanges: null existingMeta → full-rebuild strategy', () => {
  const { repoRoot } = createTestRepo(0);
  const result = detectChanges(repoRoot, null);
  assert.strictEqual(result.updateStrategy, 'full-rebuild');
  assert.strictEqual(result.reason, 'No existing map found');
});
