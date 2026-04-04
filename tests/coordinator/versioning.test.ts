/**
 * Tests for coordinator/versioning.ts
 *
 * Tests version management for delta updates.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  updateVersion,
  buildMetadata,
  getVersionHistory,
  needsUpdate,
  formatVersionString,
  compareVersions,
  bumpVersion,
  validateVersionConsistency,
} from '../../src/coordinator/versioning.js';
import type { MetaJson, Level1Output } from '../../src/core/types.js';
import { SCHEMA_VERSION } from '../../src/core/constants.js';

// ============================================================================
// Test Fixtures
// ============================================================================

const mockLevel1Output: Level1Output = {
  repo_name: 'test-repo',
  purpose: 'Test repository',
  stack: 'Node.js',
  languages: ['TypeScript', 'JavaScript'],
  entrypoints: ['src/index.ts'],
  modules: [
    { path: 'src/', description: 'Source code' },
  ],
  config_files: ['package.json', 'tsconfig.json'],
  conventions: ['ESM modules', 'TypeScript strict mode'],
};

function createMockMeta(overrides: Partial<MetaJson> = {}): MetaJson {
  return {
    schema_version: SCHEMA_VERSION,
    map_version: 1,
    git_commit: 'abc123',
    created_at: '2024-01-01T00:00:00.000Z',
    last_updated: '2024-01-01T00:00:00.000Z',
    parent_version: null,
    update_type: 'full',
    files_changed: null,
    repo_name: 'test-repo',
    purpose: 'Test repository',
    stack: 'Node.js',
    languages: ['TypeScript'],
    entrypoints: ['src/index.ts'],
    modules: [{ path: 'src/', description: 'Source' }],
    config_files: ['package.json'],
    conventions: ['ESM'],
    ...overrides,
  };
}

// ============================================================================
// updateVersion Tests
// ============================================================================

test('updateVersion: first version (no existing meta)', () => {
  const result = updateVersion({
    existingMeta: null,
    level1: mockLevel1Output,
    newCommitHash: 'abc123',
    updateType: 'full',
    filesChanged: null,
  });

  assert.strictEqual(result.mapVersion, 1);
  assert.strictEqual(result.parentVersion, null);
  assert.ok(result.createdAt);
  assert.ok(result.lastUpdated);
  assert.strictEqual(result.createdAt, result.lastUpdated);
});

test('updateVersion: increments version from existing', () => {
  const existingMeta = createMockMeta({ map_version: 3 });

  const result = updateVersion({
    existingMeta,
    level1: mockLevel1Output,
    newCommitHash: 'def456',
    updateType: 'delta',
    filesChanged: 10,
  });

  assert.strictEqual(result.mapVersion, 4);
  assert.strictEqual(result.parentVersion, 3);
});

test('updateVersion: preserves original creation time', () => {
  const originalCreatedAt = '2023-06-15T10:30:00.000Z';
  const existingMeta = createMockMeta({
    map_version: 1,
    created_at: originalCreatedAt,
  });

  const result = updateVersion({
    existingMeta,
    level1: mockLevel1Output,
    newCommitHash: 'def456',
    updateType: 'delta',
    filesChanged: 5,
  });

  assert.strictEqual(result.createdAt, originalCreatedAt);
  assert.notStrictEqual(result.lastUpdated, originalCreatedAt);
});

test('updateVersion: sets lastUpdated to current time', () => {
  const before = new Date().toISOString();

  const result = updateVersion({
    existingMeta: null,
    level1: mockLevel1Output,
    newCommitHash: 'abc123',
    updateType: 'full',
    filesChanged: null,
  });

  const after = new Date().toISOString();

  assert.ok(result.lastUpdated >= before);
  assert.ok(result.lastUpdated <= after);
});

// ============================================================================
// buildMetadata Tests
// ============================================================================

test('buildMetadata: creates complete MetaJson', () => {
  const versionInfo = {
    mapVersion: 1,
    parentVersion: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    lastUpdated: '2024-01-01T00:00:00.000Z',
  };

  const result = buildMetadata({
    versionInfo,
    level1: mockLevel1Output,
    gitCommit: 'abc123',
    updateType: 'full',
    filesChanged: null,
  });

  assert.strictEqual(result.schema_version, SCHEMA_VERSION);
  assert.strictEqual(result.map_version, 1);
  assert.strictEqual(result.git_commit, 'abc123');
  assert.strictEqual(result.update_type, 'full');
  assert.strictEqual(result.files_changed, null);
  assert.strictEqual(result.repo_name, 'test-repo');
  assert.strictEqual(result.purpose, 'Test repository');
});

test('buildMetadata: includes delta update info', () => {
  const versionInfo = {
    mapVersion: 2,
    parentVersion: 1,
    createdAt: '2024-01-01T00:00:00.000Z',
    lastUpdated: '2024-01-02T00:00:00.000Z',
  };

  const result = buildMetadata({
    versionInfo,
    level1: mockLevel1Output,
    gitCommit: 'def456',
    updateType: 'delta',
    filesChanged: 15,
  });

  assert.strictEqual(result.update_type, 'delta');
  assert.strictEqual(result.files_changed, 15);
  assert.strictEqual(result.parent_version, 1);
});

// ============================================================================
// getVersionHistory Tests
// ============================================================================

test('getVersionHistory: initial version', () => {
  const meta = createMockMeta({ map_version: 1 });
  const history = getVersionHistory(meta);

  assert.strictEqual(history, 'Initial version');
});

test('getVersionHistory: includes version number', () => {
  const meta = createMockMeta({
    map_version: 5,
    parent_version: 4,
    update_type: 'delta',
    files_changed: 10,
  });

  const history = getVersionHistory(meta);

  assert.ok(history.includes('Version 5'));
  assert.ok(history.includes('Built from version 4'));
  assert.ok(history.includes('Update type: delta'));
  assert.ok(history.includes('Files changed: 10'));
});

test('getVersionHistory: full rebuild has no files_changed', () => {
  const meta = createMockMeta({
    map_version: 2,
    parent_version: 1,
    update_type: 'full',
    files_changed: null,
  });

  const history = getVersionHistory(meta);

  assert.ok(history.includes('Update type: full'));
  assert.ok(!history.includes('Files changed:'));
});

// ============================================================================
// needsUpdate Tests
// ============================================================================

test('needsUpdate: true when no meta exists', () => {
  const result = needsUpdate(null, 'abc123');
  assert.strictEqual(result, true);
});

test('needsUpdate: false when commit matches', () => {
  const meta = createMockMeta({ git_commit: 'abc123' });
  const result = needsUpdate(meta, 'abc123');
  assert.strictEqual(result, false);
});

test('needsUpdate: true when commit differs', () => {
  const meta = createMockMeta({ git_commit: 'abc123' });
  const result = needsUpdate(meta, 'def456');
  assert.strictEqual(result, true);
});

// ============================================================================
// formatVersionString Tests
// ============================================================================

test('formatVersionString: simple version', () => {
  const meta = createMockMeta({
    map_version: 1,
    update_type: 'full',
    parent_version: null,
  });

  const result = formatVersionString(meta);
  assert.strictEqual(result, 'v1');
});

test('formatVersionString: delta update', () => {
  const meta = createMockMeta({
    map_version: 5,
    update_type: 'delta',
    parent_version: 4,
  });

  const result = formatVersionString(meta);
  assert.ok(result.includes('v5'));
  assert.ok(result.includes('(delta)'));
  assert.ok(result.includes('← v4'));
});

test('formatVersionString: full rebuild with parent', () => {
  const meta = createMockMeta({
    map_version: 3,
    update_type: 'full',
    parent_version: 2,
  });

  const result = formatVersionString(meta);
  assert.ok(result.includes('v3'));
  assert.ok(!result.includes('(delta)'));
  assert.ok(result.includes('← v2'));
});

// ============================================================================
// compareVersions Tests
// ============================================================================

test('compareVersions: single version difference', () => {
  const oldMeta = createMockMeta({ map_version: 1 });
  const newMeta = createMockMeta({ map_version: 2 });

  const result = compareVersions(oldMeta, newMeta);

  assert.strictEqual(result.versionDiff, 1);
  assert.strictEqual(result.updatesSinceOld, 1);
  assert.ok(result.description.includes('1 update'));
});

test('compareVersions: multiple version difference', () => {
  const oldMeta = createMockMeta({ map_version: 1 });
  const newMeta = createMockMeta({ map_version: 5 });

  const result = compareVersions(oldMeta, newMeta);

  assert.strictEqual(result.versionDiff, 4);
  assert.strictEqual(result.updatesSinceOld, 4);
  assert.ok(result.description.includes('4 versions newer'));
});

// ============================================================================
// bumpVersion Tests
// ============================================================================

test('bumpVersion: null to 1', () => {
  const result = bumpVersion(null);

  assert.strictEqual(result.newVersion, 1);
  assert.strictEqual(result.parentVersion, null);
});

test('bumpVersion: increments from current', () => {
  const result = bumpVersion(5);

  assert.strictEqual(result.newVersion, 6);
  assert.strictEqual(result.parentVersion, 5);
});

test('bumpVersion: handles version 1', () => {
  const result = bumpVersion(1);

  assert.strictEqual(result.newVersion, 2);
  assert.strictEqual(result.parentVersion, 1);
});

// ============================================================================
// validateVersionConsistency Tests
// ============================================================================

test('validateVersionConsistency: valid first version', () => {
  const meta = createMockMeta({
    map_version: 1,
    parent_version: null,
    update_type: 'full',
    files_changed: null,
  });

  const result = validateVersionConsistency(meta);
  assert.strictEqual(result, true);
});

test('validateVersionConsistency: valid later version', () => {
  const meta = createMockMeta({
    map_version: 5,
    parent_version: 4,
    update_type: 'full',
    files_changed: null,
  });

  const result = validateVersionConsistency(meta);
  assert.strictEqual(result, true);
});

test('validateVersionConsistency: valid delta update', () => {
  const meta = createMockMeta({
    map_version: 3,
    parent_version: 2,
    update_type: 'delta',
    files_changed: 10,
  });

  const result = validateVersionConsistency(meta);
  assert.strictEqual(result, true);
});

test('validateVersionConsistency: invalid - version less than 1', () => {
  const meta = createMockMeta({ map_version: 0 });
  const result = validateVersionConsistency(meta);
  assert.strictEqual(result, false);
});

test('validateVersionConsistency: invalid - first version with parent', () => {
  const meta = createMockMeta({
    map_version: 1,
    parent_version: 0, // Invalid: first version should have no parent
  });

  const result = validateVersionConsistency(meta);
  assert.strictEqual(result, false);
});

test('validateVersionConsistency: invalid - later version without parent', () => {
  const meta = createMockMeta({
    map_version: 5,
    parent_version: null, // Invalid: should have parent
  });

  const result = validateVersionConsistency(meta);
  assert.strictEqual(result, false);
});

test('validateVersionConsistency: invalid - parent >= current', () => {
  const meta = createMockMeta({
    map_version: 3,
    parent_version: 3, // Invalid: parent must be less than current
  });

  const result = validateVersionConsistency(meta);
  assert.strictEqual(result, false);
});

test('validateVersionConsistency: invalid - delta without files_changed', () => {
  const meta = createMockMeta({
    map_version: 2,
    parent_version: 1,
    update_type: 'delta',
    files_changed: null, // Invalid: delta must have files_changed
  });

  const result = validateVersionConsistency(meta);
  assert.strictEqual(result, false);
});

test('validateVersionConsistency: invalid - full with files_changed', () => {
  const meta = createMockMeta({
    map_version: 2,
    parent_version: 1,
    update_type: 'full',
    files_changed: 50, // Invalid: full rebuild should not have files_changed
  });

  const result = validateVersionConsistency(meta);
  assert.strictEqual(result, false);
});
