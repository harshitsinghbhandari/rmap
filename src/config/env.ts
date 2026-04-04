/**
 * Environment Variable Configuration
 *
 * Reads RMAP_* environment variables and merges them with defaults.
 * Provides type-safe configuration with validation.
 */

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
} from './defaults.js';

/**
 * Parse an environment variable as an integer with validation
 *
 * @param envValue - Raw environment variable value
 * @param defaultValue - Default value if parsing fails
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns Validated integer value
 */
function parseEnvInt(
  envValue: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
): number {
  if (envValue === undefined) {
    return defaultValue;
  }

  let value = Number(envValue);

  // Return default if not a valid number
  if (!Number.isFinite(value)) {
    console.warn(
      `Warning: Invalid number in environment variable: "${envValue}". Using default: ${defaultValue}`,
    );
    return defaultValue;
  }

  // Truncate to integer
  value = Math.trunc(value);

  // Clamp to valid range
  if (value < min) {
    console.warn(
      `Warning: Value ${value} below minimum ${min}. Using minimum.`,
    );
    return min;
  }
  if (value > max) {
    console.warn(
      `Warning: Value ${value} above maximum ${max}. Using maximum.`,
    );
    return max;
  }

  return value;
}

/**
 * Parse an environment variable as a float with validation
 *
 * @param envValue - Raw environment variable value
 * @param defaultValue - Default value if parsing fails
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 * @returns Validated float value
 */
function parseEnvFloat(
  envValue: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
): number {
  if (envValue === undefined) {
    return defaultValue;
  }

  const value = Number(envValue);

  // Return default if not a valid number
  if (!Number.isFinite(value)) {
    console.warn(
      `Warning: Invalid number in environment variable: "${envValue}". Using default: ${defaultValue}`,
    );
    return defaultValue;
  }

  // Clamp to valid range
  if (value < min) {
    console.warn(
      `Warning: Value ${value} below minimum ${min}. Using minimum.`,
    );
    return min;
  }
  if (value > max) {
    console.warn(
      `Warning: Value ${value} above maximum ${max}. Using maximum.`,
    );
    return max;
  }

  return value;
}

/**
 * Delta configuration with environment overrides
 *
 * Environment variables:
 * - RMAP_DELTA_MIN_VALIDATION: Minimum files for validation (default: 20)
 * - RMAP_DELTA_MAX_UPDATE: Maximum files for delta update (default: 100)
 */
export const DELTA = {
  MIN_DELTA_WITH_VALIDATION: parseEnvInt(
    process.env.RMAP_DELTA_MIN_VALIDATION,
    DELTA_CONFIG.MIN_DELTA_WITH_VALIDATION,
    1,
    1000,
  ),
  MAX_DELTA_UPDATE: parseEnvInt(
    process.env.RMAP_DELTA_MAX_UPDATE,
    DELTA_CONFIG.MAX_DELTA_UPDATE,
    1,
    10000,
  ),
} as const;

/**
 * Validation configuration with environment overrides
 *
 * Environment variables:
 * - RMAP_VALIDATION_MAX_DEVIATION: Max deviation percentage (default: 15)
 * - RMAP_VALIDATION_MAX_MINUTES_PER_FILE: Max minutes per file warning (default: 5)
 */
export const VALIDATION = {
  MAX_DEVIATION_PERCENT: parseEnvInt(
    process.env.RMAP_VALIDATION_MAX_DEVIATION,
    VALIDATION_CONFIG.MAX_DEVIATION_PERCENT,
    1,
    100,
  ),
  MAX_MINUTES_PER_FILE_WARNING: parseEnvInt(
    process.env.RMAP_VALIDATION_MAX_MINUTES_PER_FILE,
    VALIDATION_CONFIG.MAX_MINUTES_PER_FILE_WARNING,
    1,
    60,
  ),
  TASK_IMBALANCE_HIGH_MULTIPLIER: parseEnvFloat(
    process.env.RMAP_VALIDATION_TASK_IMBALANCE_HIGH,
    VALIDATION_CONFIG.TASK_IMBALANCE_HIGH_MULTIPLIER,
    1.0,
    10.0,
  ),
  TASK_IMBALANCE_LOW_MULTIPLIER: parseEnvFloat(
    process.env.RMAP_VALIDATION_TASK_IMBALANCE_LOW,
    VALIDATION_CONFIG.TASK_IMBALANCE_LOW_MULTIPLIER,
    0.01,
    1.0,
  ),
  MIN_TASK_COUNT_THRESHOLD: parseEnvInt(
    process.env.RMAP_VALIDATION_MIN_TASK_COUNT,
    VALIDATION_CONFIG.MIN_TASK_COUNT_THRESHOLD,
    1,
    100,
  ),
  LARGE_REPO_FILE_THRESHOLD: parseEnvInt(
    process.env.RMAP_VALIDATION_LARGE_REPO_THRESHOLD,
    VALIDATION_CONFIG.LARGE_REPO_FILE_THRESHOLD,
    10,
    10000,
  ),
  SMALL_TASK_SUGGESTION_THRESHOLD: parseEnvInt(
    process.env.RMAP_VALIDATION_SMALL_TASK_THRESHOLD,
    VALIDATION_CONFIG.SMALL_TASK_SUGGESTION_THRESHOLD,
    10,
    10000,
  ),
} as const;

/**
 * Retry configuration with environment overrides
 *
 * Environment variables:
 * - RMAP_RETRY_MAX: Maximum retry attempts (default: 5)
 * - RMAP_RETRY_BASE_BACKOFF_MS: Base backoff in ms (default: 2000)
 * - RMAP_RETRY_REQUEST_DELAY_MS: Request delay in ms (default: 500)
 * - RMAP_RETRY_MAX_BACKOFF_MS: Max backoff cap in ms (default: 60000)
 * - RMAP_RATE_LIMIT_INITIAL_DELAY_MS: Initial delay for rate limit errors (default: 15000)
 * - RMAP_RETRY_VALIDATION_ERRORS: Validation error retries (default: 1)
 * - RMAP_RETRY_TAG_VALIDATION: Tag validation retries (default: 2)
 */
export const RETRY = {
  MAX_RETRIES: parseEnvInt(
    process.env.RMAP_RETRY_MAX,
    RETRY_CONFIG.MAX_RETRIES,
    0,
    20,
  ),
  BASE_BACKOFF_MS: parseEnvInt(
    process.env.RMAP_RETRY_BASE_BACKOFF_MS,
    RETRY_CONFIG.BASE_BACKOFF_MS,
    100,
    10000,
  ),
  REQUEST_DELAY_MS: parseEnvInt(
    process.env.RMAP_RETRY_REQUEST_DELAY_MS,
    RETRY_CONFIG.REQUEST_DELAY_MS,
    0,
    5000,
  ),
  MAX_BACKOFF_MS: parseEnvInt(
    process.env.RMAP_RETRY_MAX_BACKOFF_MS,
    RETRY_CONFIG.MAX_BACKOFF_MS,
    1000,
    120000,
  ),
  INITIAL_RATE_LIMIT_DELAY_MS: parseEnvInt(
    process.env.RMAP_RATE_LIMIT_INITIAL_DELAY_MS,
    RETRY_CONFIG.INITIAL_RATE_LIMIT_DELAY_MS,
    1000,
    120000,
  ),
  VALIDATION_ERROR_RETRIES: parseEnvInt(
    process.env.RMAP_RETRY_VALIDATION_ERRORS,
    RETRY_CONFIG.VALIDATION_ERROR_RETRIES,
    0,
    10,
  ),
  TAG_VALIDATION_RETRIES: parseEnvInt(
    process.env.RMAP_RETRY_TAG_VALIDATION,
    RETRY_CONFIG.TAG_VALIDATION_RETRIES,
    0,
    10,
  ),
} as const;

/**
 * Concurrency configuration with environment overrides
 *
 * Environment variables:
 * - RMAP_CONCURRENCY: Max concurrent annotations (default: 10)
 * - RMAP_TASK_DELAY: Task start delay in ms (default: 100)
 * - RMAP_MAX_PARALLEL: Max parallel file operations (default: 10)
 */
export const CONCURRENCY = {
  MAX_CONCURRENT_ANNOTATIONS: parseEnvInt(
    process.env.RMAP_CONCURRENCY,
    CONCURRENCY_CONFIG.MAX_CONCURRENT_ANNOTATIONS,
    1,
    CONCURRENCY_CONFIG.MAX_SAFE_CONCURRENT_ANNOTATIONS,
  ),
  TASK_START_DELAY_MS: parseEnvInt(
    process.env.RMAP_TASK_DELAY,
    CONCURRENCY_CONFIG.TASK_START_DELAY_MS,
    0,
    CONCURRENCY_CONFIG.MAX_SAFE_TASK_START_DELAY_MS,
  ),
  MAX_PARALLEL_FILES: parseEnvInt(
    process.env.RMAP_MAX_PARALLEL,
    CONCURRENCY_CONFIG.MAX_PARALLEL_FILES,
    1,
    100,
  ),
} as const;

/**
 * Scoring configuration with environment overrides
 *
 * Environment variables:
 * - RMAP_SCORING_POINTS_PER_TAG: Points per tag (default: 10)
 * - RMAP_SCORING_POINTS_PER_IMPORTED_BY: Points per import reference (default: 5)
 * - RMAP_SCORING_POINTS_PER_IMPORT: Points per import (default: 2)
 * - RMAP_SCORING_POINTS_PER_EXPORT: Points per export (default: 3)
 * - RMAP_SCORING_LARGE_FILE_THRESHOLD: Line count for large file (default: 1000)
 * - RMAP_SCORING_LARGE_FILE_PENALTY: Penalty for large files (default: 5)
 */
export const SCORING = {
  POINTS_PER_TAG: parseEnvInt(
    process.env.RMAP_SCORING_POINTS_PER_TAG,
    SCORING_CONFIG.POINTS_PER_TAG,
    0,
    1000,
  ),
  POINTS_PER_IMPORTED_BY: parseEnvInt(
    process.env.RMAP_SCORING_POINTS_PER_IMPORTED_BY,
    SCORING_CONFIG.POINTS_PER_IMPORTED_BY,
    0,
    1000,
  ),
  POINTS_PER_IMPORT: parseEnvInt(
    process.env.RMAP_SCORING_POINTS_PER_IMPORT,
    SCORING_CONFIG.POINTS_PER_IMPORT,
    0,
    1000,
  ),
  POINTS_PER_EXPORT: parseEnvInt(
    process.env.RMAP_SCORING_POINTS_PER_EXPORT,
    SCORING_CONFIG.POINTS_PER_EXPORT,
    0,
    1000,
  ),
  LARGE_FILE_LINE_THRESHOLD: parseEnvInt(
    process.env.RMAP_SCORING_LARGE_FILE_THRESHOLD,
    SCORING_CONFIG.LARGE_FILE_LINE_THRESHOLD,
    100,
    100000,
  ),
  LARGE_FILE_PENALTY: parseEnvInt(
    process.env.RMAP_SCORING_LARGE_FILE_PENALTY,
    SCORING_CONFIG.LARGE_FILE_PENALTY,
    0,
    1000,
  ),
} as const;

/**
 * Output configuration with environment overrides
 *
 * Environment variables:
 * - RMAP_OUTPUT_MAX_FILES: Max files per section (default: 10)
 * - RMAP_OUTPUT_MAX_EXPORTS: Max exports per file (default: 5)
 * - RMAP_OUTPUT_MAX_CONVENTIONS: Max conventions (default: 5)
 */
export const OUTPUT = {
  MAX_FILES_PER_SECTION: parseEnvInt(
    process.env.RMAP_OUTPUT_MAX_FILES,
    OUTPUT_CONFIG.MAX_FILES_PER_SECTION,
    1,
    1000,
  ),
  MAX_EXPORTS_PER_FILE: parseEnvInt(
    process.env.RMAP_OUTPUT_MAX_EXPORTS,
    OUTPUT_CONFIG.MAX_EXPORTS_PER_FILE,
    1,
    100,
  ),
  MAX_CONVENTIONS: parseEnvInt(
    process.env.RMAP_OUTPUT_MAX_CONVENTIONS,
    OUTPUT_CONFIG.MAX_CONVENTIONS,
    1,
    100,
  ),
  MAX_FILES_IN_PROMPT: parseEnvInt(
    process.env.RMAP_OUTPUT_MAX_FILES_IN_PROMPT,
    OUTPUT_CONFIG.MAX_FILES_IN_PROMPT,
    1,
    1000,
  ),
  PROGRESS_UPDATE_INTERVAL_FILES: parseEnvInt(
    process.env.RMAP_OUTPUT_PROGRESS_INTERVAL,
    OUTPUT_CONFIG.PROGRESS_UPDATE_INTERVAL_FILES,
    1,
    10000,
  ),
  PROGRESS_UPDATE_INTERVAL_L3: parseEnvInt(
    process.env.RMAP_OUTPUT_PROGRESS_INTERVAL_L3,
    OUTPUT_CONFIG.PROGRESS_UPDATE_INTERVAL_L3,
    1,
    1000,
  ),
} as const;

/**
 * Token configuration with environment overrides
 *
 * Environment variables:
 * - RMAP_TOKEN_MAX_L1: Max tokens for Level 1 (default: 2000)
 * - RMAP_TOKEN_MAX_L2: Max tokens for Level 2 (default: 4000)
 * - RMAP_TOKEN_MAX_L3: Max tokens for Level 3 (default: 2000)
 * - RMAP_TOKEN_MAX_LINES_IN_PROMPT: Max lines in prompt (default: 10000)
 */
export const TOKEN = {
  MAX_TOKENS_LEVEL1: parseEnvInt(
    process.env.RMAP_TOKEN_MAX_L1,
    TOKEN_CONFIG.MAX_TOKENS_LEVEL1,
    100,
    100000,
  ),
  MAX_TOKENS_LEVEL2: parseEnvInt(
    process.env.RMAP_TOKEN_MAX_L2,
    TOKEN_CONFIG.MAX_TOKENS_LEVEL2,
    100,
    100000,
  ),
  MAX_TOKENS_LEVEL3: parseEnvInt(
    process.env.RMAP_TOKEN_MAX_L3,
    TOKEN_CONFIG.MAX_TOKENS_LEVEL3,
    100,
    100000,
  ),
  MAX_LINES_IN_PROMPT: parseEnvInt(
    process.env.RMAP_TOKEN_MAX_LINES_IN_PROMPT,
    TOKEN_CONFIG.MAX_LINES_IN_PROMPT,
    100,
    1000000,
  ),
  MAX_PURPOSE_CHARS: parseEnvInt(
    process.env.RMAP_TOKEN_MAX_PURPOSE_CHARS,
    TOKEN_CONFIG.MAX_PURPOSE_CHARS,
    10,
    1000,
  ),
} as const;

/**
 * File processing configuration with environment overrides
 *
 * Environment variables:
 * - RMAP_FILE_MAX_LINE_COUNT: Max line count for files (default: 10000)
 * - RMAP_FILE_MAX_TAGS: Max tags per file (default: 3)
 * - RMAP_FILE_MAX_PER_TASK: Max files per task (default: 50)
 */
export const FILE = {
  MAX_LINE_COUNT: parseEnvInt(
    process.env.RMAP_FILE_MAX_LINE_COUNT,
    FILE_CONFIG.MAX_LINE_COUNT,
    100,
    1000000,
  ),
  BINARY_DETECTION_BUFFER_SIZE: parseEnvInt(
    process.env.RMAP_FILE_BINARY_BUFFER_SIZE,
    FILE_CONFIG.BINARY_DETECTION_BUFFER_SIZE,
    1024,
    65536,
  ),
  TRUNCATION_FIRST_PART_RATIO: parseEnvFloat(
    process.env.RMAP_FILE_TRUNCATION_RATIO,
    FILE_CONFIG.TRUNCATION_FIRST_PART_RATIO,
    0.1,
    0.9,
  ),
  MAX_TAGS_PER_FILE: parseEnvInt(
    process.env.RMAP_FILE_MAX_TAGS,
    FILE_CONFIG.MAX_TAGS_PER_FILE,
    1,
    20,
  ),
  MAX_FILES_PER_TASK: parseEnvInt(
    process.env.RMAP_FILE_MAX_PER_TASK,
    FILE_CONFIG.MAX_FILES_PER_TASK,
    1,
    1000,
  ),
} as const;

/**
 * Rate limiting configuration with environment overrides
 *
 * Environment variables:
 * - RMAP_RATE_LIMIT_RPM: Max requests per minute (default: 50)
 * - RMAP_RATE_LIMIT_TPM: Max input tokens per minute (default: 8000)
 *
 * Users with higher Anthropic quotas can increase these values.
 * Users with lower quotas can reduce if needed.
 */
export const RATE_LIMIT = {
  REQUESTS_PER_MINUTE: parseEnvInt(
    process.env.RMAP_RATE_LIMIT_RPM,
    RATE_LIMIT_CONFIG.REQUESTS_PER_MINUTE,
    1,
    1000,
  ),
  INPUT_TOKENS_PER_MINUTE: parseEnvInt(
    process.env.RMAP_RATE_LIMIT_TPM,
    RATE_LIMIT_CONFIG.INPUT_TOKENS_PER_MINUTE,
    100,
    1000000,
  ),
} as const;

/**
 * Complete configuration object with all settings
 */
export const CONFIG = {
  delta: DELTA,
  validation: VALIDATION,
  retry: RETRY,
  concurrency: CONCURRENCY,
  scoring: SCORING,
  output: OUTPUT,
  token: TOKEN,
  file: FILE,
  rateLimit: RATE_LIMIT,
} as const;
