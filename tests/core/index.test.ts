/**
 * Tests for core module re-exports
 *
 * Verifies that all types and constants are properly exported from the core module
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as core from '../../src/core/index.js';

describe('Core module exports', () => {
  it('should export all constants', () => {
    // Check that constants are defined
    assert.ok(core.SCHEMA_VERSION, 'SCHEMA_VERSION should be exported');
    assert.ok(core.UPDATE_THRESHOLDS, 'UPDATE_THRESHOLDS should be exported');
    assert.ok(typeof core.MAX_FILES_PER_TASK === 'number', 'MAX_FILES_PER_TASK should be a number');
  });

  it('should export SCHEMA_VERSION as a string', () => {
    assert.strictEqual(typeof core.SCHEMA_VERSION, 'string');
    assert.match(core.SCHEMA_VERSION, /^\d+\.\d+$/);
  });

  it('should export UPDATE_THRESHOLDS with correct properties', () => {
    assert.ok(core.UPDATE_THRESHOLDS);
    assert.strictEqual(typeof core.UPDATE_THRESHOLDS.MIN_DELTA_WITH_VALIDATION, 'number');
    assert.strictEqual(typeof core.UPDATE_THRESHOLDS.MAX_DELTA_UPDATE, 'number');
    assert.ok(core.UPDATE_THRESHOLDS.MIN_DELTA_WITH_VALIDATION < core.UPDATE_THRESHOLDS.MAX_DELTA_UPDATE);
  });

  it('should export valid MAX_FILES_PER_TASK', () => {
    assert.ok(core.MAX_FILES_PER_TASK > 0);
    assert.strictEqual(core.MAX_FILES_PER_TASK, 50);
  });

  it('should export all required type names (check via module structure)', () => {
    // We can't directly test types at runtime, but we can verify the module exports them
    // by checking that the module has the expected structure
    const exportedKeys = Object.keys(core);

    // Check that constants are exported
    assert.ok(exportedKeys.includes('SCHEMA_VERSION'));
    assert.ok(exportedKeys.includes('UPDATE_THRESHOLDS'));
    assert.ok(exportedKeys.includes('MAX_FILES_PER_TASK'));
  });

  it('should export latency tracking utilities', () => {
    const exportedKeys = Object.keys(core);

    // Check latency tracker exports
    assert.ok(exportedKeys.includes('LatencyTracker'), 'LatencyTracker should be exported');
    assert.ok(
      exportedKeys.includes('globalLatencyTracker'),
      'globalLatencyTracker should be exported'
    );
    assert.ok(
      exportedKeys.includes('extractTaskIdFromPurpose'),
      'extractTaskIdFromPurpose should be exported'
    );
    assert.ok(
      exportedKeys.includes('printLatencyAnalysis'),
      'printLatencyAnalysis should be exported'
    );
    assert.ok(exportedKeys.includes('writeLatencyLog'), 'writeLatencyLog should be exported');
  });

  it('should export globalLatencyTracker as an instance of LatencyTracker', () => {
    assert.ok(core.globalLatencyTracker instanceof core.LatencyTracker);
  });

  it('should export extractTaskIdFromPurpose as a function', () => {
    assert.strictEqual(typeof core.extractTaskIdFromPurpose, 'function');
  });

  it('should export printLatencyAnalysis as a function', () => {
    assert.strictEqual(typeof core.printLatencyAnalysis, 'function');
  });

  it('should export writeLatencyLog as a function', () => {
    assert.strictEqual(typeof core.writeLatencyLog, 'function');
  });
});
