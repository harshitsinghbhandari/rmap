/**
 * Tests for core constants
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  SCHEMA_VERSION,
  UPDATE_THRESHOLDS,
  MAX_FILES_PER_TASK,
} from '../../src/core/constants.js';

test('SCHEMA_VERSION is a string', () => {
  assert.strictEqual(typeof SCHEMA_VERSION, 'string');
  assert.strictEqual(SCHEMA_VERSION, '1.0');
});

test('UPDATE_THRESHOLDS has correct values', () => {
  assert.strictEqual(UPDATE_THRESHOLDS.MIN_DELTA_WITH_VALIDATION, 20);
  assert.strictEqual(UPDATE_THRESHOLDS.MAX_DELTA_UPDATE, 100);
  // Verify thresholds create distinct ranges
  assert.ok(UPDATE_THRESHOLDS.MIN_DELTA_WITH_VALIDATION < UPDATE_THRESHOLDS.MAX_DELTA_UPDATE);
});

test('UPDATE_THRESHOLDS has backward-compatible deprecated aliases', () => {
  // @deprecated aliases map to the same values as the canonical names
  assert.strictEqual(UPDATE_THRESHOLDS.DELTA_WITH_VALIDATION, UPDATE_THRESHOLDS.MIN_DELTA_WITH_VALIDATION);
  assert.strictEqual(UPDATE_THRESHOLDS.FULL_REBUILD, UPDATE_THRESHOLDS.MAX_DELTA_UPDATE);
  assert.strictEqual(UPDATE_THRESHOLDS.DELTA_ONLY, 0);
});

test('MAX_FILES_PER_TASK is correct', () => {
  assert.strictEqual(MAX_FILES_PER_TASK, 50);
});

