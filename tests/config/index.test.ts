/**
 * Tests for config/index.ts
 *
 * Tests the config module exports and module structure.
 */

import { test } from 'node:test';
import assert from 'node:assert';

// Import everything from config index to verify exports
import {
  // Models exports
  MODELS,
  ANNOTATION_MODEL_MAP,
  DIVISION_MODEL,
  DETECTION_MODEL,
  RETRY_CONFIG,
  CONCURRENCY_CONFIG,
  // Default config exports
  DELTA_CONFIG,
  VALIDATION_CONFIG,
  RETRY_DEFAULTS,
  CONCURRENCY_DEFAULTS,
  SCORING_CONFIG,
  OUTPUT_CONFIG,
  TOKEN_CONFIG,
  FILE_CONFIG,
  DEFAULT_CONFIG,
  // rmapignore exports
  DEFAULT_RMAPIGNORE,
  ALWAYS_IGNORE_PATTERNS,
  // Runtime config exports (env.ts)
  CONFIG,
  DELTA,
  VALIDATION,
  RETRY,
  CONCURRENCY,
  SCORING,
  OUTPUT,
  TOKEN,
  FILE,
  RATE_LIMIT,
} from '../../src/config/index.js';

import type { AgentSize } from '../../src/config/index.js';

// ============================================================================
// Export Verification Tests
// ============================================================================

test('config/index exports MODELS', () => {
  assert.strictEqual(typeof MODELS, 'object');
  assert.ok('HAIKU' in MODELS);
  assert.ok('SONNET' in MODELS);
});

test('config/index exports ANNOTATION_MODEL_MAP', () => {
  assert.strictEqual(typeof ANNOTATION_MODEL_MAP, 'object');
  assert.ok('small' in ANNOTATION_MODEL_MAP);
  assert.ok('medium' in ANNOTATION_MODEL_MAP);
  assert.ok('large' in ANNOTATION_MODEL_MAP);
});

test('config/index exports task-specific models', () => {
  assert.strictEqual(typeof DIVISION_MODEL, 'string');
  assert.strictEqual(typeof DETECTION_MODEL, 'string');
});

test('config/index exports RETRY_CONFIG from models', () => {
  assert.strictEqual(typeof RETRY_CONFIG, 'object');
  assert.ok('MAX_RETRIES' in RETRY_CONFIG);
  assert.ok('BASE_BACKOFF_MS' in RETRY_CONFIG);
});

test('config/index exports CONCURRENCY_CONFIG from models', () => {
  assert.strictEqual(typeof CONCURRENCY_CONFIG, 'object');
  assert.ok('MAX_CONCURRENT_ANNOTATIONS' in CONCURRENCY_CONFIG);
});

// ============================================================================
// Default Config Exports Tests
// ============================================================================

test('config/index exports DELTA_CONFIG', () => {
  assert.strictEqual(typeof DELTA_CONFIG, 'object');
  assert.ok('MIN_DELTA_WITH_VALIDATION' in DELTA_CONFIG);
  assert.ok('MAX_DELTA_UPDATE' in DELTA_CONFIG);
});

test('config/index exports VALIDATION_CONFIG', () => {
  assert.strictEqual(typeof VALIDATION_CONFIG, 'object');
  assert.ok('MAX_DEVIATION_PERCENT' in VALIDATION_CONFIG);
});

test('config/index exports RETRY_DEFAULTS (aliased from defaults)', () => {
  assert.strictEqual(typeof RETRY_DEFAULTS, 'object');
  assert.ok('MAX_RETRIES' in RETRY_DEFAULTS);
  assert.ok('BASE_BACKOFF_MS' in RETRY_DEFAULTS);
  assert.ok('MAX_BACKOFF_MS' in RETRY_DEFAULTS);
});

test('config/index exports CONCURRENCY_DEFAULTS (aliased from defaults)', () => {
  assert.strictEqual(typeof CONCURRENCY_DEFAULTS, 'object');
  assert.ok('MAX_CONCURRENT_ANNOTATIONS' in CONCURRENCY_DEFAULTS);
  assert.ok('MAX_SAFE_CONCURRENT_ANNOTATIONS' in CONCURRENCY_DEFAULTS);
});

test('config/index exports SCORING_CONFIG', () => {
  assert.strictEqual(typeof SCORING_CONFIG, 'object');
  assert.ok('POINTS_PER_IMPORTED_BY' in SCORING_CONFIG);
});

test('config/index exports OUTPUT_CONFIG', () => {
  assert.strictEqual(typeof OUTPUT_CONFIG, 'object');
  assert.ok('MAX_FILES_PER_SECTION' in OUTPUT_CONFIG);
});

test('config/index exports TOKEN_CONFIG', () => {
  assert.strictEqual(typeof TOKEN_CONFIG, 'object');
  assert.ok('MAX_TOKENS_LEVEL1' in TOKEN_CONFIG);
});

test('config/index exports FILE_CONFIG', () => {
  assert.strictEqual(typeof FILE_CONFIG, 'object');
  assert.ok('MAX_LINE_COUNT' in FILE_CONFIG);
});

test('config/index exports DEFAULT_CONFIG aggregate', () => {
  assert.strictEqual(typeof DEFAULT_CONFIG, 'object');
  assert.ok('delta' in DEFAULT_CONFIG);
  assert.ok('validation' in DEFAULT_CONFIG);
  assert.ok('retry' in DEFAULT_CONFIG);
});


// ============================================================================
// rmapignore Exports Tests
// ============================================================================

test('config/index exports DEFAULT_RMAPIGNORE', () => {
  assert.strictEqual(typeof DEFAULT_RMAPIGNORE, 'string');
  assert.ok(DEFAULT_RMAPIGNORE.includes('node_modules/'));
});

test('config/index exports ALWAYS_IGNORE_PATTERNS', () => {
  assert.ok(Array.isArray(ALWAYS_IGNORE_PATTERNS));
  assert.ok(ALWAYS_IGNORE_PATTERNS.includes('.git/'));
  assert.ok(ALWAYS_IGNORE_PATTERNS.includes('.repo_map/'));
});

// ============================================================================
// Runtime Config Exports Tests (env.ts)
// ============================================================================

test('config/index exports CONFIG from env', () => {
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

test('config/index exports DELTA from env', () => {
  assert.strictEqual(typeof DELTA, 'object');
  assert.ok('MIN_DELTA_WITH_VALIDATION' in DELTA);
  assert.ok('MAX_DELTA_UPDATE' in DELTA);
});

test('config/index exports VALIDATION from env', () => {
  assert.strictEqual(typeof VALIDATION, 'object');
  assert.ok('MAX_DEVIATION_PERCENT' in VALIDATION);
});

test('config/index exports RETRY from env', () => {
  assert.strictEqual(typeof RETRY, 'object');
  assert.ok('MAX_RETRIES' in RETRY);
  assert.ok('MAX_BACKOFF_MS' in RETRY);
  assert.ok('INITIAL_RATE_LIMIT_DELAY_MS' in RETRY);
});

test('config/index exports CONCURRENCY from env', () => {
  assert.strictEqual(typeof CONCURRENCY, 'object');
  assert.ok('MAX_CONCURRENT_ANNOTATIONS' in CONCURRENCY);
  assert.ok('MAX_PARALLEL_FILES' in CONCURRENCY);
});

test('config/index exports SCORING from env', () => {
  assert.strictEqual(typeof SCORING, 'object');
  assert.ok('POINTS_PER_IMPORTED_BY' in SCORING);
});

test('config/index exports OUTPUT from env', () => {
  assert.strictEqual(typeof OUTPUT, 'object');
  assert.ok('MAX_FILES_PER_SECTION' in OUTPUT);
});

test('config/index exports TOKEN from env', () => {
  assert.strictEqual(typeof TOKEN, 'object');
  assert.ok('MAX_TOKENS_LEVEL3' in TOKEN);
});

test('config/index exports FILE from env', () => {
  assert.strictEqual(typeof FILE, 'object');
  assert.ok('MAX_LINE_COUNT' in FILE);
});

test('config/index exports RATE_LIMIT from env', () => {
  assert.strictEqual(typeof RATE_LIMIT, 'object');
  assert.ok('REQUESTS_PER_MINUTE' in RATE_LIMIT);
  assert.ok('INPUT_TOKENS_PER_MINUTE' in RATE_LIMIT);
});

// ============================================================================
// Type Export Tests
// ============================================================================

test('AgentSize type works correctly', () => {
  const sizes: AgentSize[] = ['small', 'medium', 'large'];
  assert.strictEqual(sizes.length, 3);

  // Each size should be a valid key in ANNOTATION_MODEL_MAP
  for (const size of sizes) {
    assert.ok(size in ANNOTATION_MODEL_MAP);
  }
});

// ============================================================================
// Config Consistency Tests
// ============================================================================

test('RETRY from env and RETRY_DEFAULTS from defaults have consistent keys', () => {
  // RETRY from env should have all keys that RETRY_DEFAULTS has
  const defaultKeys = Object.keys(RETRY_DEFAULTS);
  const envKeys = Object.keys(RETRY);

  // env version has more keys (e.g., INITIAL_RATE_LIMIT_DELAY_MS)
  // but should include all defaults
  for (const key of defaultKeys) {
    assert.ok(
      key in RETRY,
      `RETRY from env is missing key "${key}" from RETRY_DEFAULTS`
    );
  }
});

test('CONCURRENCY from env uses safe limits from CONCURRENCY_DEFAULTS', () => {
  // Verify runtime values stay within safe defaults
  assert.ok(
    CONCURRENCY.MAX_CONCURRENT_ANNOTATIONS <= CONCURRENCY_DEFAULTS.MAX_SAFE_CONCURRENT_ANNOTATIONS,
    'MAX_CONCURRENT_ANNOTATIONS exceeds safe limit'
  );
});

test('CONFIG.delta matches DELTA', () => {
  assert.deepStrictEqual(CONFIG.delta, DELTA);
});

test('CONFIG.retry matches RETRY', () => {
  assert.deepStrictEqual(CONFIG.retry, RETRY);
});
