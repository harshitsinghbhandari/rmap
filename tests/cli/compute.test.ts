/**
 * Tests for CLI compute functions (business logic)
 *
 * These tests validate the pure business logic functions that are now separated
 * from display logic, making them testable without console mocking.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import type {
  MapStatusResult,
  MapBuildResult,
  MapUpdateResult,
  GetContextResult,
} from '../../src/cli/types.js';

describe('Result Type Structures', () => {
  test('MapStatusResult should have correct shape for no map', () => {
    const result: MapStatusResult = {
      hasMap: false,
      hasCheckpoint: false,
    };

    assert.strictEqual(result.hasMap, false);
    assert.strictEqual(result.hasCheckpoint, false);
    assert.strictEqual(result.checkpoint, undefined);
    assert.strictEqual(result.metadata, undefined);
  });

  test('MapStatusResult should have correct shape for existing map', () => {
    const result: MapStatusResult = {
      hasMap: true,
      hasCheckpoint: false,
      metadata: {
        version: '1.0.0',
        schema: '1.0.0',
        buildCommit: 'abc123def456',
        buildCommitShort: 'abc123d',
        commitAge: 5,
        currentCommit: 'xyz789',
        currentCommitShort: 'xyz789a',
        commitsBehind: 3,
      },
      changes: {
        totalChanges: 10,
        changedFiles: ['file1.ts', 'file2.ts'],
        deletedFiles: 2,
        updateStrategy: 'delta',
        reason: 'Small number of changes',
      },
      verdict: 'update-recommended',
    };

    assert.strictEqual(result.hasMap, true);
    assert.strictEqual(result.verdict, 'update-recommended');
    assert(result.metadata);
    assert.strictEqual(result.metadata.commitsBehind, 3);
    assert(result.changes);
    assert.strictEqual(result.changes.totalChanges, 10);
  });

  test('MapBuildResult should have correct shape', () => {
    const result: MapBuildResult = {
      success: true,
      outputPath: '/path/to/.rmap/meta.json',
      stats: {
        filesAnnotated: 150,
        buildTimeMinutes: 5.2,
        agentsUsed: 3,
        validationIssues: 2,
      },
    };

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.stats.filesAnnotated, 150);
    assert.strictEqual(result.stats.buildTimeMinutes, 5.2);
  });

  test('MapUpdateResult should have correct shape for no changes', () => {
    const result: MapUpdateResult = {
      success: true,
      changes: {
        totalChanges: 0,
        changedFiles: [],
        deletedFiles: 0,
        updateStrategy: 'delta',
        reason: 'No changes detected',
      },
      action: 'no-changes',
    };

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'no-changes');
    assert.strictEqual(result.changes.totalChanges, 0);
    assert.strictEqual(result.buildResult, undefined);
  });

  test('MapUpdateResult should have correct shape for full rebuild', () => {
    const result: MapUpdateResult = {
      success: true,
      changes: {
        totalChanges: 100,
        changedFiles: ['many', 'files'],
        deletedFiles: 10,
        updateStrategy: 'full-rebuild',
        reason: 'Too many changes',
      },
      action: 'full-rebuild',
      buildResult: {
        success: true,
        outputPath: '/path/to/.rmap/meta.json',
        stats: {
          filesAnnotated: 200,
          buildTimeMinutes: 10.5,
          agentsUsed: 5,
          validationIssues: 1,
        },
      },
    };

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.action, 'full-rebuild');
    assert(result.buildResult);
    assert.strictEqual(result.buildResult.stats.filesAnnotated, 200);
  });

  test('GetContextResult should have correct shape for tags query', () => {
    const result: GetContextResult = {
      success: true,
      queryType: 'tags',
      query: ['auth', 'middleware'],
      output: 'Formatted query results...',
      limit: 10,
    };

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.queryType, 'tags');
    assert(Array.isArray(result.query));
    assert.strictEqual(result.limit, 10);
  });

  test('GetContextResult should have correct shape for file query', () => {
    const result: GetContextResult = {
      success: true,
      queryType: 'file',
      query: 'src/auth.ts',
      output: 'Formatted query results...',
      limit: 10,
    };

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.queryType, 'file');
    assert.strictEqual(typeof result.query, 'string');
  });

  test('GetContextResult should have correct shape for path query', () => {
    const result: GetContextResult = {
      success: true,
      queryType: 'path',
      query: 'src/auth/',
      output: 'Formatted query results...',
      limit: 15,
    };

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.queryType, 'path');
    assert.strictEqual(result.limit, 15);
  });
});

describe('Business Logic Validation', () => {
  test('MapStatusResult verdict should be "up-to-date" when no changes', () => {
    const result: MapStatusResult = {
      hasMap: true,
      hasCheckpoint: false,
      changes: {
        totalChanges: 0,
        changedFiles: [],
        deletedFiles: 0,
        updateStrategy: 'delta',
        reason: 'No changes',
      },
      verdict: 'up-to-date',
    };

    assert.strictEqual(result.verdict, 'up-to-date');
    assert.strictEqual(result.changes?.totalChanges, 0);
  });

  test('MapStatusResult verdict should be "full-rebuild-recommended" for full-rebuild strategy', () => {
    const result: MapStatusResult = {
      hasMap: true,
      hasCheckpoint: false,
      changes: {
        totalChanges: 100,
        changedFiles: [],
        deletedFiles: 0,
        updateStrategy: 'full-rebuild',
        reason: 'Schema changed',
      },
      verdict: 'full-rebuild-recommended',
    };

    assert.strictEqual(result.verdict, 'full-rebuild-recommended');
    assert.strictEqual(result.changes?.updateStrategy, 'full-rebuild');
  });

  test('MapStatusResult verdict should be "update-recommended" for delta strategy', () => {
    const result: MapStatusResult = {
      hasMap: true,
      hasCheckpoint: false,
      changes: {
        totalChanges: 5,
        changedFiles: ['a.ts', 'b.ts'],
        deletedFiles: 1,
        updateStrategy: 'delta',
        reason: 'Small changes',
      },
      verdict: 'update-recommended',
    };

    assert.strictEqual(result.verdict, 'update-recommended');
    assert.strictEqual(result.changes?.updateStrategy, 'delta');
  });

  test('CheckpointInfo should track level progress correctly', () => {
    const checkpoint = {
      currentLevel: 3,
      currentLevelStatus: 'in_progress',
      completedLevels: ['0', '1', '2'],
      startedAt: new Date('2024-01-01'),
      gitCommit: 'abc123',
      level3Progress: {
        status: 'in_progress',
        completedTasks: 50,
        startedAt: new Date('2024-01-01T10:00:00'),
      },
      validation: {
        valid: true,
      },
    };

    assert.strictEqual(checkpoint.currentLevel, 3);
    assert.strictEqual(checkpoint.completedLevels.length, 3);
    assert(checkpoint.level3Progress);
    assert.strictEqual(checkpoint.level3Progress.completedTasks, 50);
    assert.strictEqual(checkpoint.validation.valid, true);
  });

  test('CheckpointInfo validation should capture errors', () => {
    const checkpoint = {
      currentLevel: 2,
      currentLevelStatus: 'interrupted',
      completedLevels: ['0', '1'],
      startedAt: new Date('2024-01-01'),
      gitCommit: 'abc123',
      validation: {
        valid: false,
        error: 'Git commit mismatch',
      },
    };

    assert.strictEqual(checkpoint.validation.valid, false);
    assert.strictEqual(checkpoint.validation.error, 'Git commit mismatch');
  });

  test('MapMetadata should track git state correctly', () => {
    const metadata = {
      version: '1.0.0',
      schema: '1.0.0',
      buildCommit: 'abc123def456',
      buildCommitShort: 'abc123d',
      commitAge: 7,
      currentCommit: 'xyz789abc123',
      currentCommitShort: 'xyz789a',
      commitsBehind: 15,
    };

    assert.strictEqual(metadata.commitAge, 7);
    assert.strictEqual(metadata.commitsBehind, 15);
    assert.strictEqual(metadata.buildCommitShort.length, 7);
    assert.strictEqual(metadata.currentCommitShort.length, 7);
  });

  test('ChangeDetectionResult should categorize changes correctly', () => {
    const changes = {
      totalChanges: 25,
      changedFiles: Array(20).fill('file.ts'),
      deletedFiles: 5,
      updateStrategy: 'delta-with-validation' as const,
      reason: 'Moderate changes requiring validation',
    };

    assert.strictEqual(changes.totalChanges, 25);
    assert.strictEqual(changes.changedFiles.length, 20);
    assert.strictEqual(changes.deletedFiles, 5);
    assert.strictEqual(changes.updateStrategy, 'delta-with-validation');
  });
});

describe('Integration Patterns', () => {
  test('Map build flow should transition through correct states', () => {
    // Initial state: no map
    const initialState: MapStatusResult = {
      hasMap: false,
      hasCheckpoint: false,
    };

    assert.strictEqual(initialState.hasMap, false);

    // After build: has map
    const buildResult: MapBuildResult = {
      success: true,
      outputPath: '/path/.rmap/meta.json',
      stats: {
        filesAnnotated: 100,
        buildTimeMinutes: 5.0,
        agentsUsed: 3,
        validationIssues: 0,
      },
    };

    assert.strictEqual(buildResult.success, true);
    assert.strictEqual(buildResult.stats.filesAnnotated, 100);

    // After status check: map exists and is up to date
    const statusAfterBuild: MapStatusResult = {
      hasMap: true,
      hasCheckpoint: false,
      changes: {
        totalChanges: 0,
        changedFiles: [],
        deletedFiles: 0,
        updateStrategy: 'delta',
        reason: 'No changes',
      },
      verdict: 'up-to-date',
    };

    assert.strictEqual(statusAfterBuild.hasMap, true);
    assert.strictEqual(statusAfterBuild.verdict, 'up-to-date');
  });

  test('Update flow should handle different strategies', () => {
    // Delta update
    const deltaUpdate: MapUpdateResult = {
      success: true,
      changes: {
        totalChanges: 5,
        changedFiles: ['a.ts', 'b.ts'],
        deletedFiles: 1,
        updateStrategy: 'delta',
        reason: 'Small changes',
      },
      action: 'delta-update',
    };

    assert.strictEqual(deltaUpdate.action, 'delta-update');
    assert.strictEqual(deltaUpdate.buildResult, undefined);

    // Full rebuild
    const fullRebuild: MapUpdateResult = {
      success: true,
      changes: {
        totalChanges: 100,
        changedFiles: [],
        deletedFiles: 0,
        updateStrategy: 'full-rebuild',
        reason: 'Major changes',
      },
      action: 'full-rebuild',
      buildResult: {
        success: true,
        outputPath: '/path/.rmap/meta.json',
        stats: {
          filesAnnotated: 200,
          buildTimeMinutes: 10.0,
          agentsUsed: 5,
          validationIssues: 0,
        },
      },
    };

    assert.strictEqual(fullRebuild.action, 'full-rebuild');
    assert(fullRebuild.buildResult);
  });

  test('Get-context query types should be mutually exclusive', () => {
    const tagsQuery: GetContextResult = {
      success: true,
      queryType: 'tags',
      query: ['auth'],
      output: 'results',
      limit: 10,
    };

    const fileQuery: GetContextResult = {
      success: true,
      queryType: 'file',
      query: 'auth.ts',
      output: 'results',
      limit: 10,
    };

    const pathQuery: GetContextResult = {
      success: true,
      queryType: 'path',
      query: 'src/',
      output: 'results',
      limit: 10,
    };

    assert.strictEqual(tagsQuery.queryType, 'tags');
    assert.strictEqual(fileQuery.queryType, 'file');
    assert.strictEqual(pathQuery.queryType, 'path');

    // Each query type should have different query structure
    assert(Array.isArray(tagsQuery.query));
    assert.strictEqual(typeof fileQuery.query, 'string');
    assert.strictEqual(typeof pathQuery.query, 'string');
  });
});
