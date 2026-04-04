/**
 * Tests for config/models.ts
 *
 * Tests Claude model configurations and API settings.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  MODELS,
  ANNOTATION_MODEL_MAP,
  DIVISION_MODEL,
  DETECTION_MODEL,
  RETRY_CONFIG,
  CONCURRENCY_CONFIG,
} from '../../src/config/models.js';
import type { AgentSize } from '../../src/config/models.js';

// ============================================================================
// MODELS Tests
// ============================================================================

test('MODELS has correct structure', () => {
  assert.strictEqual(typeof MODELS, 'object');
  assert.ok('HAIKU' in MODELS);
  assert.ok('SONNET' in MODELS);
});

test('MODELS.HAIKU is a valid Claude model name', () => {
  assert.strictEqual(typeof MODELS.HAIKU, 'string');
  assert.ok(MODELS.HAIKU.startsWith('claude-'));
  assert.ok(MODELS.HAIKU.includes('haiku'));
});

test('MODELS.SONNET is a valid Claude model name', () => {
  assert.strictEqual(typeof MODELS.SONNET, 'string');
  assert.ok(MODELS.SONNET.startsWith('claude-'));
  assert.ok(MODELS.SONNET.includes('sonnet'));
});

test('MODELS are distinct', () => {
  assert.notStrictEqual(MODELS.HAIKU, MODELS.SONNET);
});

// ============================================================================
// ANNOTATION_MODEL_MAP Tests
// ============================================================================

test('ANNOTATION_MODEL_MAP has correct structure', () => {
  assert.strictEqual(typeof ANNOTATION_MODEL_MAP, 'object');
  assert.ok('small' in ANNOTATION_MODEL_MAP);
  assert.ok('medium' in ANNOTATION_MODEL_MAP);
  assert.ok('large' in ANNOTATION_MODEL_MAP);
});

test('ANNOTATION_MODEL_MAP.small uses HAIKU', () => {
  assert.strictEqual(ANNOTATION_MODEL_MAP.small, MODELS.HAIKU);
});

test('ANNOTATION_MODEL_MAP.medium uses SONNET', () => {
  assert.strictEqual(ANNOTATION_MODEL_MAP.medium, MODELS.SONNET);
});

test('ANNOTATION_MODEL_MAP.large uses SONNET', () => {
  assert.strictEqual(ANNOTATION_MODEL_MAP.large, MODELS.SONNET);
});

test('ANNOTATION_MODEL_MAP values are all valid model names', () => {
  const validModels = Object.values(MODELS);
  for (const [size, model] of Object.entries(ANNOTATION_MODEL_MAP)) {
    assert.ok(
      validModels.includes(model),
      `ANNOTATION_MODEL_MAP.${size} (${model}) is not a valid model`
    );
  }
});

// ============================================================================
// Task-Specific Models Tests
// ============================================================================

test('DIVISION_MODEL is a valid model', () => {
  assert.strictEqual(typeof DIVISION_MODEL, 'string');
  assert.ok(DIVISION_MODEL.startsWith('claude-'));
});

test('DIVISION_MODEL uses SONNET for complex division task', () => {
  assert.strictEqual(DIVISION_MODEL, MODELS.SONNET);
});

test('DETECTION_MODEL is a valid model', () => {
  assert.strictEqual(typeof DETECTION_MODEL, 'string');
  assert.ok(DETECTION_MODEL.startsWith('claude-'));
});

test('DETECTION_MODEL uses HAIKU for simpler detection task', () => {
  assert.strictEqual(DETECTION_MODEL, MODELS.HAIKU);
});

// ============================================================================
// RETRY_CONFIG Tests (from models.ts)
// ============================================================================

test('models RETRY_CONFIG has correct structure', () => {
  assert.strictEqual(typeof RETRY_CONFIG, 'object');
  assert.ok('MAX_RETRIES' in RETRY_CONFIG);
  assert.ok('BASE_BACKOFF_MS' in RETRY_CONFIG);
  assert.ok('REQUEST_DELAY_MS' in RETRY_CONFIG);
});

test('models RETRY_CONFIG.MAX_RETRIES is valid', () => {
  assert.strictEqual(RETRY_CONFIG.MAX_RETRIES, 5);
  assert.ok(RETRY_CONFIG.MAX_RETRIES > 0);
});

test('models RETRY_CONFIG.BASE_BACKOFF_MS is valid', () => {
  assert.strictEqual(RETRY_CONFIG.BASE_BACKOFF_MS, 2000);
  assert.ok(RETRY_CONFIG.BASE_BACKOFF_MS > 0);
});

test('models RETRY_CONFIG.REQUEST_DELAY_MS is valid', () => {
  assert.strictEqual(RETRY_CONFIG.REQUEST_DELAY_MS, 500);
  assert.ok(RETRY_CONFIG.REQUEST_DELAY_MS >= 0);
});

// ============================================================================
// CONCURRENCY_CONFIG Tests (from models.ts)
// ============================================================================

test('models CONCURRENCY_CONFIG has correct structure', () => {
  assert.strictEqual(typeof CONCURRENCY_CONFIG, 'object');
  assert.ok('MAX_CONCURRENT_ANNOTATIONS' in CONCURRENCY_CONFIG);
  assert.ok('TASK_START_DELAY_MS' in CONCURRENCY_CONFIG);
});

test('models CONCURRENCY_CONFIG.MAX_CONCURRENT_ANNOTATIONS is valid', () => {
  assert.strictEqual(typeof CONCURRENCY_CONFIG.MAX_CONCURRENT_ANNOTATIONS, 'number');
  assert.ok(CONCURRENCY_CONFIG.MAX_CONCURRENT_ANNOTATIONS >= 1);
  assert.ok(CONCURRENCY_CONFIG.MAX_CONCURRENT_ANNOTATIONS <= 100);
});

test('models CONCURRENCY_CONFIG.TASK_START_DELAY_MS is valid', () => {
  assert.strictEqual(typeof CONCURRENCY_CONFIG.TASK_START_DELAY_MS, 'number');
  assert.ok(CONCURRENCY_CONFIG.TASK_START_DELAY_MS >= 0);
});

// ============================================================================
// AgentSize Type Tests
// ============================================================================

test('AgentSize type covers all map keys', () => {
  const validSizes: AgentSize[] = ['small', 'medium', 'large'];
  const mapKeys = Object.keys(ANNOTATION_MODEL_MAP);

  assert.deepStrictEqual(validSizes.sort(), mapKeys.sort());
});

test('All agent sizes map to valid models', () => {
  const sizes: AgentSize[] = ['small', 'medium', 'large'];
  const validModels = Object.values(MODELS);

  for (const size of sizes) {
    const model = ANNOTATION_MODEL_MAP[size];
    assert.ok(
      validModels.includes(model),
      `Agent size "${size}" maps to invalid model "${model}"`
    );
  }
});

// ============================================================================
// Model Selection Strategy Tests
// ============================================================================

test('Smaller agent sizes use smaller/cheaper models', () => {
  // Small should use the cheapest model (HAIKU)
  assert.strictEqual(
    ANNOTATION_MODEL_MAP.small,
    MODELS.HAIKU,
    'Small agent should use HAIKU model'
  );
});

test('Larger agent sizes use more capable models', () => {
  // Medium and large should use more capable model (SONNET)
  assert.strictEqual(
    ANNOTATION_MODEL_MAP.medium,
    MODELS.SONNET,
    'Medium agent should use SONNET model'
  );
  assert.strictEqual(
    ANNOTATION_MODEL_MAP.large,
    MODELS.SONNET,
    'Large agent should use SONNET model'
  );
});

test('Model names follow Claude versioning pattern', () => {
  // Model names should include version date pattern
  const versionPattern = /\d{8}$/; // YYYYMMDD at end

  for (const [name, model] of Object.entries(MODELS)) {
    assert.ok(
      versionPattern.test(model),
      `Model ${name} (${model}) should end with date version`
    );
  }
});
