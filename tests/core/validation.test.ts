/**
 * Tests for runtime validation layer
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  validateThresholds,
  validateConfig,
  validateAll,
  ConfigValidationError,
} from '../../src/core/validation.js';
import { UPDATE_THRESHOLDS } from '../../src/core/constants.js';
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

test('validateConfig: should validate runtime CONFIG from env.ts', async () => {
  // Import the actual runtime CONFIG to verify it passes validation
  const { CONFIG } = await import('../../src/config/env.js');

  assert.doesNotThrow(() => {
    validateConfig(CONFIG);
  }, 'Runtime CONFIG from env.ts should pass validation');
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
