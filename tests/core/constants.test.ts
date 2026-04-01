/**
 * Tests for core constants
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  SCHEMA_VERSION,
  TAG_TAXONOMY,
  TAG_ALIASES,
  UPDATE_THRESHOLDS,
  MAX_TAGS_PER_FILE,
  MAX_FILES_PER_TASK,
} from '../../src/core/constants.js';

test('SCHEMA_VERSION is a string', () => {
  assert.strictEqual(typeof SCHEMA_VERSION, 'string');
  assert.strictEqual(SCHEMA_VERSION, '1.0');
});

test('TAG_TAXONOMY is an array with expected tags', () => {
  assert.ok(Array.isArray(TAG_TAXONOMY));
  assert.ok(TAG_TAXONOMY.length > 0);

  // Check for expected categories
  assert.ok(TAG_TAXONOMY.includes('authentication'));
  assert.ok(TAG_TAXONOMY.includes('database'));
  assert.ok(TAG_TAXONOMY.includes('api_endpoint'));
  assert.ok(TAG_TAXONOMY.includes('middleware'));
  assert.ok(TAG_TAXONOMY.includes('testing'));
  assert.ok(TAG_TAXONOMY.includes('frontend'));
  assert.ok(TAG_TAXONOMY.includes('backend'));
  assert.ok(TAG_TAXONOMY.includes('build'));
});

test('TAG_TAXONOMY contains exactly 68 tags', () => {
  assert.strictEqual(TAG_TAXONOMY.length, 68);
});

test('TAG_TAXONOMY has no duplicates', () => {
  const uniqueTags = new Set(TAG_TAXONOMY);
  assert.strictEqual(uniqueTags.size, TAG_TAXONOMY.length);
});

test('TAG_ALIASES is an object with expected aliases', () => {
  assert.strictEqual(typeof TAG_ALIASES, 'object');
  assert.ok('auth' in TAG_ALIASES);
  assert.ok('db' in TAG_ALIASES);
  assert.ok('api' in TAG_ALIASES);
  assert.ok('test' in TAG_ALIASES);
  assert.ok('devops' in TAG_ALIASES);
});

test('TAG_ALIASES.auth expands to correct tags', () => {
  assert.ok(Array.isArray(TAG_ALIASES.auth));
  assert.ok(TAG_ALIASES.auth.includes('authentication'));
  assert.ok(TAG_ALIASES.auth.includes('authorization'));
  assert.ok(TAG_ALIASES.auth.includes('jwt'));
  assert.ok(TAG_ALIASES.auth.includes('oauth'));
  assert.ok(TAG_ALIASES.auth.includes('session'));
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

test('MAX_TAGS_PER_FILE is correct', () => {
  assert.strictEqual(MAX_TAGS_PER_FILE, 5);
});

test('MAX_FILES_PER_TASK is correct', () => {
  assert.strictEqual(MAX_FILES_PER_TASK, 50);
});
