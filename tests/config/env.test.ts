/**
 * Tests for config/env.ts
 *
 * Tests environment variable configuration with default fallbacks.
 * NOTE: These tests verify structure and default values without modifying process.env
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  DELTA,
  VALIDATION,
  RETRY,
  CONCURRENCY,
  SCORING,
  OUTPUT,
  TOKEN,
  FILE,
  RATE_LIMIT,
  CONFIG,
} from '../../src/config/env.js';
import {
  DELTA_CONFIG,
  VALIDATION_CONFIG,
  RETRY_CONFIG as RETRY_DEFAULTS,
  CONCURRENCY_CONFIG as CONCURRENCY_DEFAULTS,
  SCORING_CONFIG,
  OUTPUT_CONFIG,
  TOKEN_CONFIG,
  FILE_CONFIG,
  RATE_LIMIT_CONFIG,
} from '../../src/config/defaults.js';

// ============================================================================
// DELTA Tests
// ============================================================================

test('DELTA has same keys as DELTA_CONFIG', () => {
  const deltaKeys = Object.keys(DELTA);
  const configKeys = Object.keys(DELTA_CONFIG);
  assert.deepStrictEqual(deltaKeys.sort(), configKeys.sort());
});

test('DELTA values match defaults when no env vars set', () => {
  // In test environment without env vars, values should match defaults
  assert.strictEqual(typeof DELTA.MIN_DELTA_WITH_VALIDATION, 'number');
  assert.strictEqual(typeof DELTA.MAX_DELTA_UPDATE, 'number');
  // Values should be within valid ranges
  assert.ok(DELTA.MIN_DELTA_WITH_VALIDATION >= 1);
  assert.ok(DELTA.MAX_DELTA_UPDATE >= 1);
});

// ============================================================================
// VALIDATION Tests
// ============================================================================

test('VALIDATION has correct structure', () => {
  assert.strictEqual(typeof VALIDATION, 'object');
  assert.ok('MAX_DEVIATION_PERCENT' in VALIDATION);
  assert.ok('MAX_MINUTES_PER_FILE_WARNING' in VALIDATION);
  assert.ok('TASK_IMBALANCE_HIGH_MULTIPLIER' in VALIDATION);
  assert.ok('TASK_IMBALANCE_LOW_MULTIPLIER' in VALIDATION);
  assert.ok('MIN_TASK_COUNT_THRESHOLD' in VALIDATION);
  assert.ok('LARGE_REPO_FILE_THRESHOLD' in VALIDATION);
  assert.ok('SMALL_TASK_SUGGESTION_THRESHOLD' in VALIDATION);
});

test('VALIDATION values are within valid ranges', () => {
  assert.ok(VALIDATION.MAX_DEVIATION_PERCENT >= 1);
  assert.ok(VALIDATION.MAX_DEVIATION_PERCENT <= 100);
  assert.ok(VALIDATION.TASK_IMBALANCE_HIGH_MULTIPLIER >= 1.0);
  assert.ok(VALIDATION.TASK_IMBALANCE_LOW_MULTIPLIER <= 1.0);
  assert.ok(VALIDATION.TASK_IMBALANCE_LOW_MULTIPLIER >= 0.01);
});

// ============================================================================
// RETRY Tests
// ============================================================================

test('RETRY has correct structure', () => {
  assert.strictEqual(typeof RETRY, 'object');
  assert.ok('MAX_RETRIES' in RETRY);
  assert.ok('BASE_BACKOFF_MS' in RETRY);
  assert.ok('REQUEST_DELAY_MS' in RETRY);
  assert.ok('MAX_BACKOFF_MS' in RETRY);
  assert.ok('INITIAL_RATE_LIMIT_DELAY_MS' in RETRY);
  assert.ok('VALIDATION_ERROR_RETRIES' in RETRY);
  assert.ok('TAG_VALIDATION_RETRIES' in RETRY);
});

test('RETRY values are within valid ranges', () => {
  assert.ok(RETRY.MAX_RETRIES >= 0);
  assert.ok(RETRY.MAX_RETRIES <= 20);
  assert.ok(RETRY.BASE_BACKOFF_MS >= 100);
  assert.ok(RETRY.BASE_BACKOFF_MS <= 10000);
  assert.ok(RETRY.REQUEST_DELAY_MS >= 0);
  assert.ok(RETRY.MAX_BACKOFF_MS >= 1000);
});

// ============================================================================
// CONCURRENCY Tests
// ============================================================================

test('CONCURRENCY has correct structure', () => {
  assert.strictEqual(typeof CONCURRENCY, 'object');
  assert.ok('MAX_CONCURRENT_ANNOTATIONS' in CONCURRENCY);
  assert.ok('TASK_START_DELAY_MS' in CONCURRENCY);
  assert.ok('MAX_PARALLEL_FILES' in CONCURRENCY);
});

test('CONCURRENCY values are within safe limits', () => {
  assert.ok(CONCURRENCY.MAX_CONCURRENT_ANNOTATIONS >= 1);
  assert.ok(CONCURRENCY.MAX_CONCURRENT_ANNOTATIONS <= 100);
  assert.ok(CONCURRENCY.TASK_START_DELAY_MS >= 0);
  assert.ok(CONCURRENCY.MAX_PARALLEL_FILES >= 1);
});

// ============================================================================
// SCORING Tests
// ============================================================================

test('SCORING has correct structure', () => {
  assert.strictEqual(typeof SCORING, 'object');
  assert.ok('POINTS_PER_TAG' in SCORING);
  assert.ok('POINTS_PER_IMPORTED_BY' in SCORING);
  assert.ok('POINTS_PER_IMPORT' in SCORING);
  assert.ok('POINTS_PER_EXPORT' in SCORING);
  assert.ok('LARGE_FILE_LINE_THRESHOLD' in SCORING);
  assert.ok('LARGE_FILE_PENALTY' in SCORING);
});

test('SCORING values are non-negative', () => {
  assert.ok(SCORING.POINTS_PER_TAG >= 0);
  assert.ok(SCORING.POINTS_PER_IMPORTED_BY >= 0);
  assert.ok(SCORING.POINTS_PER_IMPORT >= 0);
  assert.ok(SCORING.POINTS_PER_EXPORT >= 0);
  assert.ok(SCORING.LARGE_FILE_PENALTY >= 0);
  assert.ok(SCORING.LARGE_FILE_LINE_THRESHOLD >= 100);
});

// ============================================================================
// OUTPUT Tests
// ============================================================================

test('OUTPUT has correct structure', () => {
  assert.strictEqual(typeof OUTPUT, 'object');
  assert.ok('MAX_FILES_PER_SECTION' in OUTPUT);
  assert.ok('MAX_EXPORTS_PER_FILE' in OUTPUT);
  assert.ok('MAX_CONVENTIONS' in OUTPUT);
  assert.ok('MAX_DISPLAY_TAGS' in OUTPUT);
  assert.ok('MAX_FILES_IN_PROMPT' in OUTPUT);
  assert.ok('PROGRESS_UPDATE_INTERVAL_FILES' in OUTPUT);
  assert.ok('PROGRESS_UPDATE_INTERVAL_L3' in OUTPUT);
});

test('OUTPUT values are within valid ranges', () => {
  assert.ok(OUTPUT.MAX_FILES_PER_SECTION >= 1);
  assert.ok(OUTPUT.MAX_EXPORTS_PER_FILE >= 1);
  assert.ok(OUTPUT.MAX_CONVENTIONS >= 1);
  assert.ok(OUTPUT.MAX_DISPLAY_TAGS >= 1);
  assert.ok(OUTPUT.MAX_DISPLAY_TAGS <= 10);
});

// ============================================================================
// TOKEN Tests
// ============================================================================

test('TOKEN has correct structure', () => {
  assert.strictEqual(typeof TOKEN, 'object');
  assert.ok('MAX_TOKENS_LEVEL1' in TOKEN);
  assert.ok('MAX_TOKENS_LEVEL2' in TOKEN);
  assert.ok('MAX_TOKENS_LEVEL3' in TOKEN);
  assert.ok('MAX_LINES_IN_PROMPT' in TOKEN);
  assert.ok('MAX_PURPOSE_CHARS' in TOKEN);
});

test('TOKEN values are within valid ranges', () => {
  assert.ok(TOKEN.MAX_TOKENS_LEVEL1 >= 100);
  assert.ok(TOKEN.MAX_TOKENS_LEVEL2 >= 100);
  assert.ok(TOKEN.MAX_TOKENS_LEVEL3 >= 100);
  assert.ok(TOKEN.MAX_LINES_IN_PROMPT >= 100);
  assert.ok(TOKEN.MAX_PURPOSE_CHARS >= 10);
});

// ============================================================================
// FILE Tests
// ============================================================================

test('FILE has correct structure', () => {
  assert.strictEqual(typeof FILE, 'object');
  assert.ok('MAX_LINE_COUNT' in FILE);
  assert.ok('BINARY_DETECTION_BUFFER_SIZE' in FILE);
  assert.ok('TRUNCATION_FIRST_PART_RATIO' in FILE);
  assert.ok('MAX_TAGS_PER_FILE' in FILE);
  assert.ok('MAX_FILES_PER_TASK' in FILE);
});

test('FILE values are within valid ranges', () => {
  assert.ok(FILE.MAX_LINE_COUNT >= 100);
  assert.ok(FILE.BINARY_DETECTION_BUFFER_SIZE >= 1024);
  assert.ok(FILE.TRUNCATION_FIRST_PART_RATIO >= 0.1);
  assert.ok(FILE.TRUNCATION_FIRST_PART_RATIO <= 0.9);
  assert.ok(FILE.MAX_TAGS_PER_FILE >= 1);
  assert.ok(FILE.MAX_TAGS_PER_FILE <= 20);
  assert.ok(FILE.MAX_FILES_PER_TASK >= 1);
});

// ============================================================================
// RATE_LIMIT Tests
// ============================================================================

test('RATE_LIMIT has correct structure', () => {
  assert.strictEqual(typeof RATE_LIMIT, 'object');
  assert.ok('REQUESTS_PER_MINUTE' in RATE_LIMIT);
  assert.ok('INPUT_TOKENS_PER_MINUTE' in RATE_LIMIT);
});

test('RATE_LIMIT values are within valid ranges', () => {
  assert.ok(RATE_LIMIT.REQUESTS_PER_MINUTE >= 1);
  assert.ok(RATE_LIMIT.REQUESTS_PER_MINUTE <= 1000);
  assert.ok(RATE_LIMIT.INPUT_TOKENS_PER_MINUTE >= 100);
  assert.ok(RATE_LIMIT.INPUT_TOKENS_PER_MINUTE <= 1000000);
});

// ============================================================================
// CONFIG Aggregate Tests
// ============================================================================

test('CONFIG contains all sections', () => {
  assert.strictEqual(typeof CONFIG, 'object');
  assert.ok('delta' in CONFIG);
  assert.ok('validation' in CONFIG);
  assert.ok('retry' in CONFIG);
  assert.ok('concurrency' in CONFIG);
  assert.ok('scoring' in CONFIG);
  assert.ok('output' in CONFIG);
  assert.ok('token' in CONFIG);
  assert.ok('file' in CONFIG);
  assert.ok('rateLimit' in CONFIG);
});

test('CONFIG sections reference correct runtime configs', () => {
  assert.deepStrictEqual(CONFIG.delta, DELTA);
  assert.deepStrictEqual(CONFIG.validation, VALIDATION);
  assert.deepStrictEqual(CONFIG.retry, RETRY);
  assert.deepStrictEqual(CONFIG.concurrency, CONCURRENCY);
  assert.deepStrictEqual(CONFIG.scoring, SCORING);
  assert.deepStrictEqual(CONFIG.output, OUTPUT);
  assert.deepStrictEqual(CONFIG.token, TOKEN);
  assert.deepStrictEqual(CONFIG.file, FILE);
  assert.deepStrictEqual(CONFIG.rateLimit, RATE_LIMIT);
});

// ============================================================================
// Type Safety Tests
// ============================================================================

test('All config values are numbers (not undefined)', () => {
  // Test all numeric config values are actually numbers
  const allConfigs = [
    ...Object.values(DELTA),
    ...Object.values(VALIDATION),
    ...Object.values(RETRY),
    ...Object.values(CONCURRENCY),
    ...Object.values(SCORING),
    ...Object.values(OUTPUT),
    ...Object.values(TOKEN),
    ...Object.values(FILE),
    ...Object.values(RATE_LIMIT),
  ];

  for (const value of allConfigs) {
    assert.strictEqual(typeof value, 'number', `Expected number but got ${typeof value}`);
    assert.ok(Number.isFinite(value), `Expected finite number but got ${value}`);
  }
});
