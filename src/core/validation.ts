/**
 * Runtime Validation Layer
 *
 * Provides validation for configuration consistency, tag taxonomy,
 * threshold ordering, and retry config ranges.
 *
 * All validation functions throw descriptive errors for invalid configs.
 */

import { z } from 'zod';
import type { Tag } from './constants.js';
import { TAG_TAXONOMY, UPDATE_THRESHOLDS } from './constants.js';
import {
  DELTA_CONFIG,
  VALIDATION_CONFIG,
  RETRY_CONFIG,
  CONCURRENCY_CONFIG,
  SCORING_CONFIG,
  OUTPUT_CONFIG,
  TOKEN_CONFIG,
  FILE_CONFIG,
} from '../config/defaults.js';

/**
 * Validation error class for configuration errors
 */
export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

/**
 * Zod schema for DELTA_CONFIG
 */
const deltaConfigSchema = z
  .object({
    MIN_DELTA_WITH_VALIDATION: z
      .number()
      .int()
      .positive('MIN_DELTA_WITH_VALIDATION must be positive'),
    MAX_DELTA_UPDATE: z
      .number()
      .int()
      .positive('MAX_DELTA_UPDATE must be positive'),
  })
  .refine(
    (data) => data.MIN_DELTA_WITH_VALIDATION < data.MAX_DELTA_UPDATE,
    {
      message:
        'MIN_DELTA_WITH_VALIDATION must be less than MAX_DELTA_UPDATE',
    },
  );

/**
 * Zod schema for VALIDATION_CONFIG
 */
const validationConfigSchema = z
  .object({
    MAX_DEVIATION_PERCENT: z
      .number()
      .int()
      .min(1, 'MAX_DEVIATION_PERCENT must be at least 1')
      .max(100, 'MAX_DEVIATION_PERCENT must be at most 100'),
    MAX_MINUTES_PER_FILE_WARNING: z
      .number()
      .int()
      .positive('MAX_MINUTES_PER_FILE_WARNING must be positive'),
    TASK_IMBALANCE_HIGH_MULTIPLIER: z
      .number()
      .min(1.0, 'TASK_IMBALANCE_HIGH_MULTIPLIER must be at least 1.0'),
    TASK_IMBALANCE_LOW_MULTIPLIER: z
      .number()
      .min(0.01, 'TASK_IMBALANCE_LOW_MULTIPLIER must be at least 0.01')
      .max(1.0, 'TASK_IMBALANCE_LOW_MULTIPLIER must be at most 1.0'),
    MIN_TASK_COUNT_THRESHOLD: z
      .number()
      .int()
      .positive('MIN_TASK_COUNT_THRESHOLD must be positive'),
    LARGE_REPO_FILE_THRESHOLD: z
      .number()
      .int()
      .positive('LARGE_REPO_FILE_THRESHOLD must be positive'),
    SMALL_TASK_SUGGESTION_THRESHOLD: z
      .number()
      .int()
      .positive('SMALL_TASK_SUGGESTION_THRESHOLD must be positive'),
  })
  .refine(
    (data) =>
      data.TASK_IMBALANCE_LOW_MULTIPLIER < data.TASK_IMBALANCE_HIGH_MULTIPLIER,
    {
      message:
        'TASK_IMBALANCE_LOW_MULTIPLIER must be less than TASK_IMBALANCE_HIGH_MULTIPLIER',
    },
  );

/**
 * Zod schema for RETRY_CONFIG
 */
const retryConfigSchema = z
  .object({
    MAX_RETRIES: z
      .number()
      .int()
      .nonnegative('MAX_RETRIES must be non-negative'),
    BASE_BACKOFF_MS: z
      .number()
      .int()
      .positive('BASE_BACKOFF_MS must be positive'),
    REQUEST_DELAY_MS: z
      .number()
      .int()
      .nonnegative('REQUEST_DELAY_MS must be non-negative'),
    MAX_BACKOFF_MS: z
      .number()
      .int()
      .positive('MAX_BACKOFF_MS must be positive'),
    VALIDATION_ERROR_RETRIES: z
      .number()
      .int()
      .nonnegative('VALIDATION_ERROR_RETRIES must be non-negative'),
  })
  .refine((data) => data.BASE_BACKOFF_MS <= data.MAX_BACKOFF_MS, {
    message: 'BASE_BACKOFF_MS must be less than or equal to MAX_BACKOFF_MS',
  });

/**
 * Zod schema for CONCURRENCY_CONFIG
 */
const concurrencyConfigSchema = z.object({
  MAX_CONCURRENT_ANNOTATIONS: z
    .number()
    .int()
    .positive('MAX_CONCURRENT_ANNOTATIONS must be positive'),
  TASK_START_DELAY_MS: z
    .number()
    .int()
    .nonnegative('TASK_START_DELAY_MS must be non-negative'),
  MAX_SAFE_CONCURRENT_ANNOTATIONS: z
    .number()
    .int()
    .positive('MAX_SAFE_CONCURRENT_ANNOTATIONS must be positive'),
  MAX_SAFE_TASK_START_DELAY_MS: z
    .number()
    .int()
    .positive('MAX_SAFE_TASK_START_DELAY_MS must be positive'),
  MAX_PARALLEL_FILES: z
    .number()
    .int()
    .positive('MAX_PARALLEL_FILES must be positive'),
});

/**
 * Zod schema for SCORING_CONFIG
 */
const scoringConfigSchema = z.object({
  POINTS_PER_TAG: z
    .number()
    .int()
    .nonnegative('POINTS_PER_TAG must be non-negative'),
  POINTS_PER_IMPORTED_BY: z
    .number()
    .int()
    .nonnegative('POINTS_PER_IMPORTED_BY must be non-negative'),
  POINTS_PER_IMPORT: z
    .number()
    .int()
    .nonnegative('POINTS_PER_IMPORT must be non-negative'),
  POINTS_PER_EXPORT: z
    .number()
    .int()
    .nonnegative('POINTS_PER_EXPORT must be non-negative'),
  LARGE_FILE_LINE_THRESHOLD: z
    .number()
    .int()
    .positive('LARGE_FILE_LINE_THRESHOLD must be positive'),
  LARGE_FILE_PENALTY: z
    .number()
    .int()
    .nonnegative('LARGE_FILE_PENALTY must be non-negative'),
});

/**
 * Zod schema for OUTPUT_CONFIG
 */
const outputConfigSchema = z.object({
  MAX_FILES_PER_SECTION: z
    .number()
    .int()
    .positive('MAX_FILES_PER_SECTION must be positive'),
  MAX_EXPORTS_PER_FILE: z
    .number()
    .int()
    .positive('MAX_EXPORTS_PER_FILE must be positive'),
  MAX_CONVENTIONS: z
    .number()
    .int()
    .positive('MAX_CONVENTIONS must be positive'),
  MAX_FILES_IN_PROMPT: z
    .number()
    .int()
    .positive('MAX_FILES_IN_PROMPT must be positive'),
  PROGRESS_UPDATE_INTERVAL_FILES: z
    .number()
    .int()
    .positive('PROGRESS_UPDATE_INTERVAL_FILES must be positive'),
  PROGRESS_UPDATE_INTERVAL_L3: z
    .number()
    .int()
    .positive('PROGRESS_UPDATE_INTERVAL_L3 must be positive'),
});

/**
 * Zod schema for TOKEN_CONFIG
 */
const tokenConfigSchema = z.object({
  MAX_TOKENS_LEVEL1: z
    .number()
    .int()
    .positive('MAX_TOKENS_LEVEL1 must be positive'),
  MAX_TOKENS_LEVEL2: z
    .number()
    .int()
    .positive('MAX_TOKENS_LEVEL2 must be positive'),
  MAX_TOKENS_LEVEL3: z
    .number()
    .int()
    .positive('MAX_TOKENS_LEVEL3 must be positive'),
  MAX_LINES_IN_PROMPT: z
    .number()
    .int()
    .positive('MAX_LINES_IN_PROMPT must be positive'),
  MAX_PURPOSE_CHARS: z
    .number()
    .int()
    .positive('MAX_PURPOSE_CHARS must be positive'),
});

/**
 * Zod schema for FILE_CONFIG
 */
const fileConfigSchema = z.object({
  MAX_LINE_COUNT: z
    .number()
    .int()
    .positive('MAX_LINE_COUNT must be positive'),
  BINARY_DETECTION_BUFFER_SIZE: z
    .number()
    .int()
    .positive('BINARY_DETECTION_BUFFER_SIZE must be positive'),
  TRUNCATION_FIRST_PART_RATIO: z
    .number()
    .min(0.1, 'TRUNCATION_FIRST_PART_RATIO must be at least 0.1')
    .max(0.9, 'TRUNCATION_FIRST_PART_RATIO must be at most 0.9'),
  MAX_TAGS_PER_FILE: z
    .number()
    .int()
    .positive('MAX_TAGS_PER_FILE must be positive')
    .max(20, 'MAX_TAGS_PER_FILE must be at most 20'),
  MAX_FILES_PER_TASK: z
    .number()
    .int()
    .positive('MAX_FILES_PER_TASK must be positive'),
});

/**
 * Validate tag taxonomy for uniqueness and format
 *
 * Ensures:
 * - No duplicate tags
 * - All tags follow naming convention (lowercase or snake_case)
 * - No empty tags
 * - Tags are strings
 *
 * @param tags - Array of tags to validate (defaults to TAG_TAXONOMY)
 * @throws {ConfigValidationError} If validation fails
 */
export function validateTagTaxonomy(
  tags: readonly string[] = TAG_TAXONOMY,
): void {
  // Check for empty array
  if (tags.length === 0) {
    throw new ConfigValidationError('Tag taxonomy cannot be empty');
  }

  // Check for duplicates
  const uniqueTags = new Set(tags);
  if (uniqueTags.size !== tags.length) {
    const duplicates = tags.filter(
      (tag, index) => tags.indexOf(tag) !== index,
    );
    throw new ConfigValidationError(
      `Duplicate tags found in taxonomy: ${[...new Set(duplicates)].join(', ')}`,
    );
  }

  // Validate format: lowercase or snake_case (lowercase with underscores)
  const validFormatRegex = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

  const invalidTags = tags.filter((tag) => {
    if (typeof tag !== 'string') return true;
    if (tag.length === 0) return true;
    return !validFormatRegex.test(tag);
  });

  if (invalidTags.length > 0) {
    throw new ConfigValidationError(
      `Invalid tag format. Tags must be lowercase or snake_case: ${invalidTags.join(', ')}`,
    );
  }
}

/**
 * Validate UPDATE_THRESHOLDS ordering
 *
 * Ensures:
 * - MIN_DELTA_WITH_VALIDATION < MAX_DELTA_UPDATE
 * - All values are positive integers
 *
 * @param thresholds - Thresholds object to validate (defaults to UPDATE_THRESHOLDS)
 * @throws {ConfigValidationError} If validation fails
 */
export function validateThresholds(
  thresholds: typeof UPDATE_THRESHOLDS = UPDATE_THRESHOLDS,
): void {
  const { MIN_DELTA_WITH_VALIDATION, MAX_DELTA_UPDATE } = thresholds;

  // Check for positive values
  if (MIN_DELTA_WITH_VALIDATION <= 0) {
    throw new ConfigValidationError(
      'MIN_DELTA_WITH_VALIDATION must be positive',
    );
  }

  if (MAX_DELTA_UPDATE <= 0) {
    throw new ConfigValidationError('MAX_DELTA_UPDATE must be positive');
  }

  // Check ordering
  if (MIN_DELTA_WITH_VALIDATION >= MAX_DELTA_UPDATE) {
    throw new ConfigValidationError(
      `Invalid threshold ordering: MIN_DELTA_WITH_VALIDATION (${MIN_DELTA_WITH_VALIDATION}) must be less than MAX_DELTA_UPDATE (${MAX_DELTA_UPDATE})`,
    );
  }
}

/**
 * Validate complete configuration consistency
 *
 * Runs all config validators and ensures cross-config consistency.
 *
 * @param config - Configuration object to validate
 * @throws {ConfigValidationError} If validation fails
 */
export function validateConfig(config: {
  delta?: typeof DELTA_CONFIG;
  validation?: typeof VALIDATION_CONFIG;
  retry?: typeof RETRY_CONFIG;
  concurrency?: typeof CONCURRENCY_CONFIG;
  scoring?: typeof SCORING_CONFIG;
  output?: typeof OUTPUT_CONFIG;
  token?: typeof TOKEN_CONFIG;
  file?: typeof FILE_CONFIG;
} = {}): void {
  const {
    delta = DELTA_CONFIG,
    validation = VALIDATION_CONFIG,
    retry = RETRY_CONFIG,
    concurrency = CONCURRENCY_CONFIG,
    scoring = SCORING_CONFIG,
    output = OUTPUT_CONFIG,
    token = TOKEN_CONFIG,
    file = FILE_CONFIG,
  } = config;

  try {
    // Validate each config section
    deltaConfigSchema.parse(delta);
    validationConfigSchema.parse(validation);
    retryConfigSchema.parse(retry);
    concurrencyConfigSchema.parse(concurrency);
    scoringConfigSchema.parse(scoring);
    outputConfigSchema.parse(output);
    tokenConfigSchema.parse(token);
    fileConfigSchema.parse(file);
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Use Zod's built-in format() method for better error messages
      const formatted = error.format();
      const messages: string[] = [];

      // Extract error messages from formatted errors
      const extractErrors = (obj: any, prefix: string = '') => {
        for (const key in obj) {
          if (key === '_errors' && Array.isArray(obj[key]) && obj[key].length > 0) {
            messages.push(`${prefix}: ${obj[key].join(', ')}`);
          } else if (typeof obj[key] === 'object' && obj[key] !== null && key !== '_errors') {
            extractErrors(obj[key], prefix ? `${prefix}.${key}` : key);
          }
        }
      };

      extractErrors(formatted);

      // Use a single line format for better regex matching in tests
      throw new ConfigValidationError(
        `Configuration validation failed: ${messages.join('; ')}`,
      );
    }
    throw error;
  }
}

/**
 * Validate a single file annotation's tags
 *
 * Ensures tags are from the taxonomy and within limits
 *
 * @param tags - Tags to validate
 * @param maxTags - Maximum number of tags allowed (default: 5)
 * @throws {ConfigValidationError} If validation fails
 */
export function validateFileTags(
  tags: string[],
  maxTags: number = 5,
): asserts tags is Tag[] {
  if (tags.length === 0) {
    throw new ConfigValidationError('File must have at least one tag');
  }

  if (tags.length > maxTags) {
    throw new ConfigValidationError(
      `File has ${tags.length} tags but maximum is ${maxTags}`,
    );
  }

  // Check if all tags are in taxonomy
  const taxonomySet = new Set(TAG_TAXONOMY);
  const invalidTags = tags.filter((tag) => !taxonomySet.has(tag as Tag));

  if (invalidTags.length > 0) {
    throw new ConfigValidationError(
      `Invalid tags not in taxonomy: ${invalidTags.join(', ')}`,
    );
  }

  // Check for duplicates
  const uniqueTags = new Set(tags);
  if (uniqueTags.size !== tags.length) {
    throw new ConfigValidationError('File tags must be unique');
  }
}

/**
 * Run all validations on module load
 *
 * This ensures configuration errors are caught early during initialization.
 * Validation failures will throw ConfigValidationError.
 */
export function validateAll(): void {
  validateTagTaxonomy();
  validateThresholds();
  validateConfig();
}
