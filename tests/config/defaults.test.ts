/**
 * Tests for config/defaults.ts
 *
 * Tests default configuration constants for the rmap pipeline.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  DELTA_CONFIG,
  VALIDATION_CONFIG,
  RETRY_CONFIG,
  CONCURRENCY_CONFIG,
  SCORING_CONFIG,
  OUTPUT_CONFIG,
  TOKEN_CONFIG,
  FILE_CONFIG,
  RATE_LIMIT_CONFIG,
  DEFAULT_CONFIG,
} from '../../src/config/defaults.js';

// ============================================================================
// DELTA_CONFIG Tests
// ============================================================================

test('DELTA_CONFIG has correct structure', () => {
  assert.strictEqual(typeof DELTA_CONFIG, 'object');
  assert.ok('MIN_DELTA_WITH_VALIDATION' in DELTA_CONFIG);
  assert.ok('MAX_DELTA_UPDATE' in DELTA_CONFIG);
});

test('DELTA_CONFIG.MIN_DELTA_WITH_VALIDATION is correct', () => {
  assert.strictEqual(DELTA_CONFIG.MIN_DELTA_WITH_VALIDATION, 20);
  assert.strictEqual(typeof DELTA_CONFIG.MIN_DELTA_WITH_VALIDATION, 'number');
});

test('DELTA_CONFIG.MAX_DELTA_UPDATE is correct', () => {
  assert.strictEqual(DELTA_CONFIG.MAX_DELTA_UPDATE, 100);
  assert.strictEqual(typeof DELTA_CONFIG.MAX_DELTA_UPDATE, 'number');
});

test('DELTA_CONFIG thresholds create valid ranges', () => {
  // MIN should be less than MAX
  assert.ok(DELTA_CONFIG.MIN_DELTA_WITH_VALIDATION < DELTA_CONFIG.MAX_DELTA_UPDATE);
  // Both should be positive
  assert.ok(DELTA_CONFIG.MIN_DELTA_WITH_VALIDATION > 0);
  assert.ok(DELTA_CONFIG.MAX_DELTA_UPDATE > 0);
});

// ============================================================================
// VALIDATION_CONFIG Tests
// ============================================================================

test('VALIDATION_CONFIG has correct structure', () => {
  assert.strictEqual(typeof VALIDATION_CONFIG, 'object');
  assert.ok('MAX_DEVIATION_PERCENT' in VALIDATION_CONFIG);
  assert.ok('MAX_MINUTES_PER_FILE_WARNING' in VALIDATION_CONFIG);
  assert.ok('TASK_IMBALANCE_HIGH_MULTIPLIER' in VALIDATION_CONFIG);
  assert.ok('TASK_IMBALANCE_LOW_MULTIPLIER' in VALIDATION_CONFIG);
  assert.ok('MIN_TASK_COUNT_THRESHOLD' in VALIDATION_CONFIG);
  assert.ok('LARGE_REPO_FILE_THRESHOLD' in VALIDATION_CONFIG);
  assert.ok('SMALL_TASK_SUGGESTION_THRESHOLD' in VALIDATION_CONFIG);
});

test('VALIDATION_CONFIG.MAX_DEVIATION_PERCENT is valid', () => {
  assert.strictEqual(VALIDATION_CONFIG.MAX_DEVIATION_PERCENT, 15);
  assert.ok(VALIDATION_CONFIG.MAX_DEVIATION_PERCENT > 0);
  assert.ok(VALIDATION_CONFIG.MAX_DEVIATION_PERCENT <= 100);
});

test('VALIDATION_CONFIG task imbalance multipliers are valid', () => {
  // High multiplier should be > 1
  assert.ok(VALIDATION_CONFIG.TASK_IMBALANCE_HIGH_MULTIPLIER > 1);
  // Low multiplier should be < 1 and > 0
  assert.ok(VALIDATION_CONFIG.TASK_IMBALANCE_LOW_MULTIPLIER < 1);
  assert.ok(VALIDATION_CONFIG.TASK_IMBALANCE_LOW_MULTIPLIER > 0);
});

// ============================================================================
// RETRY_CONFIG Tests
// ============================================================================

test('RETRY_CONFIG has correct structure', () => {
  assert.strictEqual(typeof RETRY_CONFIG, 'object');
  assert.ok('MAX_RETRIES' in RETRY_CONFIG);
  assert.ok('BASE_BACKOFF_MS' in RETRY_CONFIG);
  assert.ok('REQUEST_DELAY_MS' in RETRY_CONFIG);
  assert.ok('MAX_BACKOFF_MS' in RETRY_CONFIG);
  assert.ok('INITIAL_RATE_LIMIT_DELAY_MS' in RETRY_CONFIG);
  assert.ok('VALIDATION_ERROR_RETRIES' in RETRY_CONFIG);
  assert.ok('VALIDATION_ERROR_RETRIES' in RETRY_CONFIG);
});

test('RETRY_CONFIG.MAX_RETRIES is correct', () => {
  assert.strictEqual(RETRY_CONFIG.MAX_RETRIES, 5);
  assert.ok(RETRY_CONFIG.MAX_RETRIES > 0);
});

test('RETRY_CONFIG.BASE_BACKOFF_MS is correct', () => {
  assert.strictEqual(RETRY_CONFIG.BASE_BACKOFF_MS, 2000);
  assert.ok(RETRY_CONFIG.BASE_BACKOFF_MS > 0);
});

test('RETRY_CONFIG backoff values create valid exponential sequence', () => {
  // MAX_BACKOFF should be > BASE_BACKOFF
  assert.ok(RETRY_CONFIG.MAX_BACKOFF_MS > RETRY_CONFIG.BASE_BACKOFF_MS);
  // Initial rate limit delay should be reasonable (> 1s)
  assert.ok(RETRY_CONFIG.INITIAL_RATE_LIMIT_DELAY_MS >= 1000);
});

// ============================================================================
// CONCURRENCY_CONFIG Tests
// ============================================================================

test('CONCURRENCY_CONFIG has correct structure', () => {
  assert.strictEqual(typeof CONCURRENCY_CONFIG, 'object');
  assert.ok('MAX_CONCURRENT_ANNOTATIONS' in CONCURRENCY_CONFIG);
  assert.ok('TASK_START_DELAY_MS' in CONCURRENCY_CONFIG);
  assert.ok('MAX_SAFE_CONCURRENT_ANNOTATIONS' in CONCURRENCY_CONFIG);
  assert.ok('MAX_SAFE_TASK_START_DELAY_MS' in CONCURRENCY_CONFIG);
  assert.ok('MAX_PARALLEL_FILES' in CONCURRENCY_CONFIG);
});

test('CONCURRENCY_CONFIG default values are within safe limits', () => {
  assert.ok(CONCURRENCY_CONFIG.MAX_CONCURRENT_ANNOTATIONS <= CONCURRENCY_CONFIG.MAX_SAFE_CONCURRENT_ANNOTATIONS);
  assert.ok(CONCURRENCY_CONFIG.TASK_START_DELAY_MS <= CONCURRENCY_CONFIG.MAX_SAFE_TASK_START_DELAY_MS);
});

test('CONCURRENCY_CONFIG values are positive', () => {
  assert.ok(CONCURRENCY_CONFIG.MAX_CONCURRENT_ANNOTATIONS > 0);
  assert.ok(CONCURRENCY_CONFIG.MAX_PARALLEL_FILES > 0);
  assert.ok(CONCURRENCY_CONFIG.TASK_START_DELAY_MS >= 0);
});

// ============================================================================
// SCORING_CONFIG Tests
// ============================================================================

test('SCORING_CONFIG has correct structure', () => {
  assert.strictEqual(typeof SCORING_CONFIG, 'object');
  assert.ok('POINTS_PER_IMPORTED_BY' in SCORING_CONFIG);
  assert.ok('POINTS_PER_IMPORT' in SCORING_CONFIG);
  assert.ok('POINTS_PER_EXPORT' in SCORING_CONFIG);
  assert.ok('LARGE_FILE_LINE_THRESHOLD' in SCORING_CONFIG);
  assert.ok('LARGE_FILE_PENALTY' in SCORING_CONFIG);
});

test('SCORING_CONFIG values are non-negative', () => {
  assert.ok(SCORING_CONFIG.POINTS_PER_IMPORTED_BY >= 0);
  assert.ok(SCORING_CONFIG.POINTS_PER_IMPORT >= 0);
  assert.ok(SCORING_CONFIG.POINTS_PER_EXPORT >= 0);
  assert.ok(SCORING_CONFIG.LARGE_FILE_PENALTY >= 0);
});

test('SCORING_CONFIG values create sensible ranking', () => {
  // Imported_by should be valued more than imports
  assert.ok(SCORING_CONFIG.POINTS_PER_IMPORTED_BY > SCORING_CONFIG.POINTS_PER_IMPORT);
});

// ============================================================================
// OUTPUT_CONFIG Tests
// ============================================================================

test('OUTPUT_CONFIG has correct structure', () => {
  assert.strictEqual(typeof OUTPUT_CONFIG, 'object');
  assert.ok('MAX_FILES_PER_SECTION' in OUTPUT_CONFIG);
  assert.ok('MAX_EXPORTS_PER_FILE' in OUTPUT_CONFIG);
  assert.ok('MAX_CONVENTIONS' in OUTPUT_CONFIG);
  assert.ok('MAX_FILES_IN_PROMPT' in OUTPUT_CONFIG);
  assert.ok('PROGRESS_UPDATE_INTERVAL_FILES' in OUTPUT_CONFIG);
  assert.ok('PROGRESS_UPDATE_INTERVAL_L3' in OUTPUT_CONFIG);
});

test('OUTPUT_CONFIG values are positive', () => {
  assert.ok(OUTPUT_CONFIG.MAX_FILES_PER_SECTION > 0);
  assert.ok(OUTPUT_CONFIG.MAX_EXPORTS_PER_FILE > 0);
  assert.ok(OUTPUT_CONFIG.MAX_CONVENTIONS > 0);
  assert.ok(OUTPUT_CONFIG.MAX_FILES_IN_PROMPT > 0);
});

// ============================================================================
// TOKEN_CONFIG Tests
// ============================================================================

test('TOKEN_CONFIG has correct structure', () => {
  assert.strictEqual(typeof TOKEN_CONFIG, 'object');
  assert.ok('MAX_TOKENS_LEVEL1' in TOKEN_CONFIG);
  assert.ok('MAX_TOKENS_LEVEL2' in TOKEN_CONFIG);
  assert.ok('MAX_TOKENS_LEVEL3' in TOKEN_CONFIG);
  assert.ok('MAX_LINES_IN_PROMPT' in TOKEN_CONFIG);
  assert.ok('MAX_PURPOSE_CHARS' in TOKEN_CONFIG);
});

test('TOKEN_CONFIG values are positive', () => {
  assert.ok(TOKEN_CONFIG.MAX_TOKENS_LEVEL1 > 0);
  assert.ok(TOKEN_CONFIG.MAX_TOKENS_LEVEL2 > 0);
  assert.ok(TOKEN_CONFIG.MAX_TOKENS_LEVEL3 > 0);
  assert.ok(TOKEN_CONFIG.MAX_LINES_IN_PROMPT > 0);
  assert.ok(TOKEN_CONFIG.MAX_PURPOSE_CHARS > 0);
});

// ============================================================================
// FILE_CONFIG Tests
// ============================================================================

test('FILE_CONFIG has correct structure', () => {
  assert.strictEqual(typeof FILE_CONFIG, 'object');
  assert.ok('MAX_LINE_COUNT' in FILE_CONFIG);
  assert.ok('BINARY_DETECTION_BUFFER_SIZE' in FILE_CONFIG);
  assert.ok('TRUNCATION_FIRST_PART_RATIO' in FILE_CONFIG);
  assert.ok('MAX_FILES_PER_TASK' in FILE_CONFIG);
});

test('FILE_CONFIG.TRUNCATION_FIRST_PART_RATIO is valid ratio', () => {
  assert.ok(FILE_CONFIG.TRUNCATION_FIRST_PART_RATIO > 0);
  assert.ok(FILE_CONFIG.TRUNCATION_FIRST_PART_RATIO < 1);
});

// ============================================================================
// RATE_LIMIT_CONFIG Tests
// ============================================================================

test('RATE_LIMIT_CONFIG has correct structure', () => {
  assert.strictEqual(typeof RATE_LIMIT_CONFIG, 'object');
  assert.ok('REQUESTS_PER_MINUTE' in RATE_LIMIT_CONFIG);
  assert.ok('INPUT_TOKENS_PER_MINUTE' in RATE_LIMIT_CONFIG);
});

test('RATE_LIMIT_CONFIG values are positive', () => {
  assert.ok(RATE_LIMIT_CONFIG.REQUESTS_PER_MINUTE > 0);
  assert.ok(RATE_LIMIT_CONFIG.INPUT_TOKENS_PER_MINUTE > 0);
});

// ============================================================================
// DEFAULT_CONFIG Aggregate Tests
// ============================================================================

test('DEFAULT_CONFIG contains all config sections', () => {
  assert.strictEqual(typeof DEFAULT_CONFIG, 'object');
  assert.ok('delta' in DEFAULT_CONFIG);
  assert.ok('validation' in DEFAULT_CONFIG);
  assert.ok('retry' in DEFAULT_CONFIG);
  assert.ok('concurrency' in DEFAULT_CONFIG);
  assert.ok('scoring' in DEFAULT_CONFIG);
  assert.ok('output' in DEFAULT_CONFIG);
  assert.ok('token' in DEFAULT_CONFIG);
  assert.ok('file' in DEFAULT_CONFIG);
  assert.ok('rateLimit' in DEFAULT_CONFIG);
});

test('DEFAULT_CONFIG sections reference correct configs', () => {
  assert.deepStrictEqual(DEFAULT_CONFIG.delta, DELTA_CONFIG);
  assert.deepStrictEqual(DEFAULT_CONFIG.validation, VALIDATION_CONFIG);
  assert.deepStrictEqual(DEFAULT_CONFIG.retry, RETRY_CONFIG);
  assert.deepStrictEqual(DEFAULT_CONFIG.concurrency, CONCURRENCY_CONFIG);
  assert.deepStrictEqual(DEFAULT_CONFIG.scoring, SCORING_CONFIG);
  assert.deepStrictEqual(DEFAULT_CONFIG.output, OUTPUT_CONFIG);
  assert.deepStrictEqual(DEFAULT_CONFIG.token, TOKEN_CONFIG);
  assert.deepStrictEqual(DEFAULT_CONFIG.file, FILE_CONFIG);
  assert.deepStrictEqual(DEFAULT_CONFIG.rateLimit, RATE_LIMIT_CONFIG);
});
