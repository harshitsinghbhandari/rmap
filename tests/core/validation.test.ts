/**
 * Tests for runtime validation layer
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  validateTagTaxonomy,
  validateThresholds,
  validateConfig,
  validateFileTags,
  validateAll,
  ConfigValidationError,
} from '../../src/core/validation.js';
import { TAG_TAXONOMY, UPDATE_THRESHOLDS } from '../../src/core/constants.js';
import {
  DELTA_CONFIG,
  VALIDATION_CONFIG,
  RETRY_CONFIG,
  CONCURRENCY_CONFIG,
  SCORING_CONFIG,
  OUTPUT_CONFIG,
  TOKEN_CONFIG,
  FILE_CONFIG,
} from '../../src/config/defaults.js';

// ==========================
// validateTagTaxonomy() Tests
// ==========================

test('validateTagTaxonomy: should pass with valid TAG_TAXONOMY', () => {
  assert.doesNotThrow(() => {
    validateTagTaxonomy();
  });
});

test('validateTagTaxonomy: should pass with valid custom taxonomy', () => {
  const validTags = ['authentication', 'database', 'api_endpoint'];
  assert.doesNotThrow(() => {
    validateTagTaxonomy(validTags);
  });
});

test('validateTagTaxonomy: should reject empty taxonomy', () => {
  assert.throws(
    () => {
      validateTagTaxonomy([]);
    },
    {
      name: 'ConfigValidationError',
      message: /Tag taxonomy cannot be empty/,
    },
  );
});

test('validateTagTaxonomy: should reject duplicate tags', () => {
  const duplicateTags = ['authentication', 'database', 'authentication'];
  assert.throws(
    () => {
      validateTagTaxonomy(duplicateTags);
    },
    {
      name: 'ConfigValidationError',
      message: /Duplicate tags found in taxonomy: authentication/,
    },
  );
});

test('validateTagTaxonomy: should reject tags with uppercase letters', () => {
  const invalidTags = ['Authentication', 'database'];
  assert.throws(
    () => {
      validateTagTaxonomy(invalidTags);
    },
    {
      name: 'ConfigValidationError',
      message: /Invalid tag format.*Authentication/,
    },
  );
});

test('validateTagTaxonomy: should reject tags with hyphens', () => {
  const invalidTags = ['api-endpoint', 'database'];
  assert.throws(
    () => {
      validateTagTaxonomy(invalidTags);
    },
    {
      name: 'ConfigValidationError',
      message: /Invalid tag format.*api-endpoint/,
    },
  );
});

test('validateTagTaxonomy: should reject tags with spaces', () => {
  const invalidTags = ['api endpoint', 'database'];
  assert.throws(
    () => {
      validateTagTaxonomy(invalidTags);
    },
    {
      name: 'ConfigValidationError',
      message: /Invalid tag format.*api endpoint/,
    },
  );
});

test('validateTagTaxonomy: should reject empty string tags', () => {
  const invalidTags = ['', 'database'];
  assert.throws(
    () => {
      validateTagTaxonomy(invalidTags);
    },
    {
      name: 'ConfigValidationError',
      message: /Invalid tag format/,
    },
  );
});

test('validateTagTaxonomy: should accept snake_case tags', () => {
  const validTags = ['api_endpoint', 'error_handling', 'unit_test'];
  assert.doesNotThrow(() => {
    validateTagTaxonomy(validTags);
  });
});

test('validateTagTaxonomy: should reject tags starting with underscore', () => {
  const invalidTags = ['_private', 'database'];
  assert.throws(
    () => {
      validateTagTaxonomy(invalidTags);
    },
    {
      name: 'ConfigValidationError',
      message: /Invalid tag format.*_private/,
    },
  );
});

test('validateTagTaxonomy: should reject tags ending with underscore', () => {
  const invalidTags = ['api_', 'database'];
  assert.throws(
    () => {
      validateTagTaxonomy(invalidTags);
    },
    {
      name: 'ConfigValidationError',
      message: /Invalid tag format.*api_/,
    },
  );
});

test('validateTagTaxonomy: should reject tags with consecutive underscores', () => {
  const invalidTags = ['api__endpoint', 'database'];
  assert.throws(
    () => {
      validateTagTaxonomy(invalidTags);
    },
    {
      name: 'ConfigValidationError',
      message: /Invalid tag format.*api__endpoint/,
    },
  );
});

test('validateTagTaxonomy: should accept tags with numbers', () => {
  const validTags = ['oauth2', 'http2', 'level3_test'];
  assert.doesNotThrow(() => {
    validateTagTaxonomy(validTags);
  });
});

// ==========================
// validateThresholds() Tests
// ==========================

test('validateThresholds: should pass with valid UPDATE_THRESHOLDS', () => {
  assert.doesNotThrow(() => {
    validateThresholds();
  });
});

test('validateThresholds: should pass with valid custom thresholds', () => {
  const validThresholds = {
    MIN_DELTA_WITH_VALIDATION: 10,
    MAX_DELTA_UPDATE: 50,
    DELTA_WITH_VALIDATION: 10,
    FULL_REBUILD: 50,
    DELTA_ONLY: 0,
  } as const;

  assert.doesNotThrow(() => {
    validateThresholds(validThresholds);
  });
});

test('validateThresholds: should reject when MIN >= MAX', () => {
  const invalidThresholds = {
    MIN_DELTA_WITH_VALIDATION: 100,
    MAX_DELTA_UPDATE: 50,
    DELTA_WITH_VALIDATION: 100,
    FULL_REBUILD: 50,
    DELTA_ONLY: 0,
  } as const;

  assert.throws(
    () => {
      validateThresholds(invalidThresholds);
    },
    {
      name: 'ConfigValidationError',
      message: /Invalid threshold ordering.*MIN_DELTA_WITH_VALIDATION.*MAX_DELTA_UPDATE/,
    },
  );
});

test('validateThresholds: should reject when MIN equals MAX', () => {
  const invalidThresholds = {
    MIN_DELTA_WITH_VALIDATION: 50,
    MAX_DELTA_UPDATE: 50,
    DELTA_WITH_VALIDATION: 50,
    FULL_REBUILD: 50,
    DELTA_ONLY: 0,
  } as const;

  assert.throws(
    () => {
      validateThresholds(invalidThresholds);
    },
    {
      name: 'ConfigValidationError',
      message: /Invalid threshold ordering/,
    },
  );
});

test('validateThresholds: should reject negative MIN_DELTA_WITH_VALIDATION', () => {
  const invalidThresholds = {
    MIN_DELTA_WITH_VALIDATION: -10,
    MAX_DELTA_UPDATE: 50,
    DELTA_WITH_VALIDATION: -10,
    FULL_REBUILD: 50,
    DELTA_ONLY: 0,
  } as const;

  assert.throws(
    () => {
      validateThresholds(invalidThresholds);
    },
    {
      name: 'ConfigValidationError',
      message: /MIN_DELTA_WITH_VALIDATION must be positive/,
    },
  );
});

test('validateThresholds: should reject zero MAX_DELTA_UPDATE', () => {
  const invalidThresholds = {
    MIN_DELTA_WITH_VALIDATION: 10,
    MAX_DELTA_UPDATE: 0,
    DELTA_WITH_VALIDATION: 10,
    FULL_REBUILD: 0,
    DELTA_ONLY: 0,
  } as const;

  assert.throws(
    () => {
      validateThresholds(invalidThresholds);
    },
    {
      name: 'ConfigValidationError',
      message: /MAX_DELTA_UPDATE must be positive/,
    },
  );
});

// ==========================
// validateConfig() Tests
// ==========================

test('validateConfig: should pass with default config', () => {
  assert.doesNotThrow(() => {
    validateConfig();
  });
});

test('validateConfig: should pass with complete valid config', () => {
  assert.doesNotThrow(() => {
    validateConfig({
      delta: DELTA_CONFIG,
      validation: VALIDATION_CONFIG,
      retry: RETRY_CONFIG,
      concurrency: CONCURRENCY_CONFIG,
      scoring: SCORING_CONFIG,
      output: OUTPUT_CONFIG,
      token: TOKEN_CONFIG,
      file: FILE_CONFIG,
    });
  });
});

test('validateConfig: should reject invalid delta config', () => {
  const invalidConfig = {
    delta: {
      MIN_DELTA_WITH_VALIDATION: 100,
      MAX_DELTA_UPDATE: 50, // Invalid: MIN > MAX
    },
  };

  assert.throws(
    () => {
      validateConfig(invalidConfig);
    },
    {
      name: 'ConfigValidationError',
      message: /Configuration validation failed/,
    },
  );
});

test('validateConfig: should reject negative MAX_RETRIES', () => {
  const invalidConfig = {
    retry: {
      ...RETRY_CONFIG,
      MAX_RETRIES: -1,
    },
  };

  assert.throws(
    () => {
      validateConfig(invalidConfig);
    },
    {
      name: 'ConfigValidationError',
      message: /Configuration validation failed.*MAX_RETRIES/,
    },
  );
});

test('validateConfig: should reject BASE_BACKOFF_MS > MAX_BACKOFF_MS', () => {
  const invalidConfig = {
    retry: {
      ...RETRY_CONFIG,
      BASE_BACKOFF_MS: 50000,
      MAX_BACKOFF_MS: 10000,
    },
  };

  assert.throws(
    () => {
      validateConfig(invalidConfig);
    },
    {
      name: 'ConfigValidationError',
      message: /Configuration validation failed.*BASE_BACKOFF_MS/,
    },
  );
});

test('validateConfig: should reject invalid TASK_IMBALANCE multipliers', () => {
  const invalidConfig = {
    validation: {
      ...VALIDATION_CONFIG,
      TASK_IMBALANCE_HIGH_MULTIPLIER: 0.5,
      TASK_IMBALANCE_LOW_MULTIPLIER: 1.5, // Invalid: LOW > HIGH
    },
  };

  assert.throws(
    () => {
      validateConfig(invalidConfig);
    },
    {
      name: 'ConfigValidationError',
      message: /Configuration validation failed/,
    },
  );
});

test('validateConfig: should reject MAX_DEVIATION_PERCENT > 100', () => {
  const invalidConfig = {
    validation: {
      ...VALIDATION_CONFIG,
      MAX_DEVIATION_PERCENT: 150,
    },
  };

  assert.throws(
    () => {
      validateConfig(invalidConfig);
    },
    {
      name: 'ConfigValidationError',
      message: /Configuration validation failed.*MAX_DEVIATION_PERCENT/,
    },
  );
});

test('validateConfig: should reject zero or negative concurrency values', () => {
  const invalidConfig = {
    concurrency: {
      ...CONCURRENCY_CONFIG,
      MAX_CONCURRENT_ANNOTATIONS: 0,
    },
  };

  assert.throws(
    () => {
      validateConfig(invalidConfig);
    },
    {
      name: 'ConfigValidationError',
      message: /Configuration validation failed.*MAX_CONCURRENT_ANNOTATIONS/,
    },
  );
});

test('validateConfig: should reject negative scoring values', () => {
  const invalidConfig = {
    scoring: {
      ...SCORING_CONFIG,
      POINTS_PER_TAG: -5,
    },
  };

  assert.throws(
    () => {
      validateConfig(invalidConfig);
    },
    {
      name: 'ConfigValidationError',
      message: /Configuration validation failed.*POINTS_PER_TAG/,
    },
  );
});

test('validateConfig: should reject zero output limits', () => {
  const invalidConfig = {
    output: {
      ...OUTPUT_CONFIG,
      MAX_FILES_PER_SECTION: 0,
    },
  };

  assert.throws(
    () => {
      validateConfig(invalidConfig);
    },
    {
      name: 'ConfigValidationError',
      message: /Configuration validation failed.*MAX_FILES_PER_SECTION/,
    },
  );
});

test('validateConfig: should reject zero token limits', () => {
  const invalidConfig = {
    token: {
      ...TOKEN_CONFIG,
      MAX_TOKENS_LEVEL1: 0,
    },
  };

  assert.throws(
    () => {
      validateConfig(invalidConfig);
    },
    {
      name: 'ConfigValidationError',
      message: /Configuration validation failed.*MAX_TOKENS_LEVEL1/,
    },
  );
});

test('validateConfig: should reject invalid TRUNCATION_FIRST_PART_RATIO', () => {
  const invalidConfig = {
    file: {
      ...FILE_CONFIG,
      TRUNCATION_FIRST_PART_RATIO: 1.5, // Invalid: > 0.9
    },
  };

  assert.throws(
    () => {
      validateConfig(invalidConfig);
    },
    {
      name: 'ConfigValidationError',
      message: /Configuration validation failed.*TRUNCATION_FIRST_PART_RATIO/,
    },
  );
});

test('validateConfig: should reject MAX_TAGS_PER_FILE > 20', () => {
  const invalidConfig = {
    file: {
      ...FILE_CONFIG,
      MAX_TAGS_PER_FILE: 25,
    },
  };

  assert.throws(
    () => {
      validateConfig(invalidConfig);
    },
    {
      name: 'ConfigValidationError',
      message: /Configuration validation failed.*MAX_TAGS_PER_FILE/,
    },
  );
});

// ==========================
// validateFileTags() Tests
// ==========================

test('validateFileTags: should pass with valid tags', () => {
  const validTags = ['authentication', 'database', 'api_endpoint'];
  assert.doesNotThrow(() => {
    validateFileTags(validTags);
  });
});

test('validateFileTags: should pass with single tag', () => {
  const validTags = ['database'];
  assert.doesNotThrow(() => {
    validateFileTags(validTags);
  });
});

test('validateFileTags: should reject empty tag array', () => {
  const emptyTags: string[] = [];
  assert.throws(
    () => {
      validateFileTags(emptyTags);
    },
    {
      name: 'ConfigValidationError',
      message: /File must have at least one tag/,
    },
  );
});

test('validateFileTags: should reject too many tags', () => {
  const tooManyTags = [
    'authentication',
    'database',
    'api_endpoint',
    'middleware',
    'logging',
    'monitoring', // 6 tags, max is 5
  ];
  assert.throws(
    () => {
      validateFileTags(tooManyTags);
    },
    {
      name: 'ConfigValidationError',
      message: /File has 6 tags but maximum is 5/,
    },
  );
});

test('validateFileTags: should reject tags not in taxonomy', () => {
  const invalidTags = ['authentication', 'invalid_tag', 'database'];
  assert.throws(
    () => {
      validateFileTags(invalidTags);
    },
    {
      name: 'ConfigValidationError',
      message: /Invalid tags not in taxonomy: invalid_tag/,
    },
  );
});

test('validateFileTags: should reject duplicate tags', () => {
  const duplicateTags = ['authentication', 'database', 'authentication'];
  assert.throws(
    () => {
      validateFileTags(duplicateTags);
    },
    {
      name: 'ConfigValidationError',
      message: /File tags must be unique/,
    },
  );
});

test('validateFileTags: should accept custom maxTags limit', () => {
  const tags = ['authentication', 'database'];
  assert.doesNotThrow(() => {
    validateFileTags(tags, 3);
  });

  assert.throws(
    () => {
      validateFileTags(tags, 1);
    },
    {
      name: 'ConfigValidationError',
      message: /File has 2 tags but maximum is 1/,
    },
  );
});

test('validateFileTags: should reject multiple invalid tags', () => {
  const invalidTags = ['invalid1', 'invalid2', 'authentication'];
  assert.throws(
    () => {
      validateFileTags(invalidTags);
    },
    {
      name: 'ConfigValidationError',
      message: /Invalid tags not in taxonomy: invalid1, invalid2/,
    },
  );
});

// ==========================
// validateAll() Tests
// ==========================

test('validateAll: should pass with valid configuration', () => {
  assert.doesNotThrow(() => {
    validateAll();
  });
});

// ==========================
// ConfigValidationError Tests
// ==========================

test('ConfigValidationError: should have correct name', () => {
  const error = new ConfigValidationError('Test error');
  assert.strictEqual(error.name, 'ConfigValidationError');
  assert.strictEqual(error.message, 'Test error');
  assert.ok(error instanceof Error);
});

// ==========================
// Edge Cases and Integration
// ==========================

test('validateConfig: should handle partial config objects', () => {
  assert.doesNotThrow(() => {
    validateConfig({
      delta: DELTA_CONFIG,
    });
  });

  assert.doesNotThrow(() => {
    validateConfig({
      retry: RETRY_CONFIG,
      concurrency: CONCURRENCY_CONFIG,
    });
  });
});

test('validateConfig: should validate multiple issues in one call', () => {
  const invalidConfig = {
    delta: {
      MIN_DELTA_WITH_VALIDATION: -1, // Invalid: negative
      MAX_DELTA_UPDATE: 50,
    },
    retry: {
      ...RETRY_CONFIG,
      MAX_RETRIES: -5, // Invalid: negative
    },
  };

  assert.throws(
    () => {
      validateConfig(invalidConfig);
    },
    {
      name: 'ConfigValidationError',
      message: /Configuration validation failed/,
    },
  );
});

test('validateTagTaxonomy: current TAG_TAXONOMY should pass validation', () => {
  // This ensures our actual TAG_TAXONOMY is valid
  assert.doesNotThrow(() => {
    validateTagTaxonomy(TAG_TAXONOMY);
  });

  // Verify no duplicates
  const uniqueTags = new Set(TAG_TAXONOMY);
  assert.strictEqual(
    uniqueTags.size,
    TAG_TAXONOMY.length,
    'TAG_TAXONOMY should have no duplicates',
  );
});

test('validateThresholds: current UPDATE_THRESHOLDS should pass validation', () => {
  // This ensures our actual UPDATE_THRESHOLDS is valid
  assert.doesNotThrow(() => {
    validateThresholds(UPDATE_THRESHOLDS);
  });

  // Verify ordering
  assert.ok(
    UPDATE_THRESHOLDS.MIN_DELTA_WITH_VALIDATION <
      UPDATE_THRESHOLDS.MAX_DELTA_UPDATE,
    'MIN_DELTA_WITH_VALIDATION should be less than MAX_DELTA_UPDATE',
  );
});
