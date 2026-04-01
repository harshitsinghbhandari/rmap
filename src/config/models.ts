/**
 * Centralized Model Configuration
 *
 * Defines which Claude models to use for different tasks across the rmap pipeline.
 */

/**
 * Available Claude models
 */
export const MODELS = {
  HAIKU: 'claude-haiku-4-5-20251001',
  SONNET: 'claude-sonnet-4-5-20250929',
} as const;

/**
 * Model selection based on agent size for Level 3 annotations
 */
export const ANNOTATION_MODEL_MAP = {
  small: MODELS.HAIKU,
  medium: MODELS.SONNET,
  large: MODELS.SONNET,
} as const;

/**
 * Model for Level 2 work division
 */
export const DIVISION_MODEL = MODELS.SONNET;

/**
 * Model for Level 1 repository detection
 */
export const DETECTION_MODEL = MODELS.HAIKU;

/**
 * Retry and timeout configuration for API calls
 *
 * Increased values to handle Claude rate limits more gracefully.
 * Adjust these values based on your API tier and rate limits.
 */
export const RETRY_CONFIG = {
  /**
   * Maximum number of retry attempts for failed API calls
   * Default: 5 (increased from 3 for better rate limit handling)
   */
  MAX_RETRIES: 5,

  /**
   * Base backoff multiplier in milliseconds for exponential backoff
   * Formula: Math.pow(2, attempt) * BASE_BACKOFF_MS
   * Default: 2000ms (2s, 4s, 8s, 16s, 32s)
   * Increased from 1000ms for more breathing room between retries
   */
  BASE_BACKOFF_MS: 2000,

  /**
   * Delay between sequential API requests in milliseconds
   * Used to avoid hitting rate limits when processing multiple files
   * Default: 500ms (increased from 100ms)
   */
  REQUEST_DELAY_MS: 500,
} as const;

/**
 * Concurrency configuration for parallel processing
 *
 * Controls how many files are annotated in parallel during Level 3 processing.
 * Higher values = faster processing but more API load and potential rate limiting.
 * Lower values = slower but safer for API rate limits.
 */
export const CONCURRENCY_CONFIG = {
  /**
   * Maximum number of concurrent Level 3 annotation tasks
   * Default: 10 (provides ~7x speedup vs sequential)
   * Can be overridden with RMAP_CONCURRENCY environment variable
   */
  MAX_CONCURRENT_ANNOTATIONS: parseInt(process.env.RMAP_CONCURRENCY || '10', 10),

  /**
   * Delay in milliseconds between starting each annotation task
   * Default: 100ms (helps smooth out API request bursts)
   * Can be overridden with RMAP_TASK_DELAY environment variable
   */
  TASK_START_DELAY_MS: parseInt(process.env.RMAP_TASK_DELAY || '100', 10),
} as const;

export type AgentSize = keyof typeof ANNOTATION_MODEL_MAP;
