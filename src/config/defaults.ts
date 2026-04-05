/**
 * Default Configuration Constants
 *
 * Centralized location for all configurable constants in rmap.
 * Grouped by domain for better organization and discoverability.
 *
 * These values can be overridden via environment variables (see env.ts).
 */

/**
 * Delta update and validation thresholds
 *
 * Controls when to use delta updates vs full rebuilds based on
 * the number of changed files.
 */
export const DELTA_CONFIG = {
  /**
   * Threshold for delta update vs full rebuild
   * Files changed < this value: delta update only
   * Files changed >= this value: delta update with validation
   * @default 20
   */
  MIN_DELTA_WITH_VALIDATION: 20,

  /**
   * Maximum files for delta update (full rebuild if exceeded)
   * Files changed > this value: force full rebuild
   * @default 100
   */
  MAX_DELTA_UPDATE: 100,
} as const;

/**
 * Validation configuration for Level 2 division
 *
 * Thresholds and limits for validating work division quality.
 */
export const VALIDATION_CONFIG = {
  /**
   * Maximum allowed deviation percentage for task distribution
   * @default 15
   */
  MAX_DEVIATION_PERCENT: 15,

  /**
   * Warning threshold for estimated minutes per file
   * @default 5
   */
  MAX_MINUTES_PER_FILE_WARNING: 5,

  /**
   * Task imbalance detection multipliers
   * Tasks with files > avg * HIGH_MULTIPLIER are considered large
   * Tasks with files < avg * LOW_MULTIPLIER are considered small
   */
  TASK_IMBALANCE_HIGH_MULTIPLIER: 1.5,
  TASK_IMBALANCE_LOW_MULTIPLIER: 0.5,

  /**
   * Minimum task count for large repositories
   * @default 3
   */
  MIN_TASK_COUNT_THRESHOLD: 3,

  /**
   * File count threshold for considering a repo "large"
   * @default 100
   */
  LARGE_REPO_FILE_THRESHOLD: 100,

  /**
   * File count threshold for suggesting small tasks
   * @default 50
   */
  SMALL_TASK_SUGGESTION_THRESHOLD: 50,
} as const;

/**
 * Retry and backoff configuration for API calls
 *
 * Controls retry behavior when API calls fail or are rate-limited.
 */
export const RETRY_CONFIG = {
  /**
   * Maximum number of retry attempts for failed API calls
   * @default 5
   */
  MAX_RETRIES: 5,

  /**
   * Base backoff multiplier in milliseconds for exponential backoff
   * Formula: Math.pow(2, attempt) * BASE_BACKOFF_MS
   * Default sequence: 2s, 4s, 8s, 16s, 32s
   * @default 2000
   */
  BASE_BACKOFF_MS: 2000,

  /**
   * Delay between sequential API requests in milliseconds
   * Used to avoid hitting rate limits when processing multiple files
   * @default 500
   */
  REQUEST_DELAY_MS: 500,

  /**
   * Maximum backoff delay cap in milliseconds
   * Prevents exponential backoff from growing too large
   * @default 60000 (60 seconds)
   */
  MAX_BACKOFF_MS: 60000,

  /**
   * Initial delay in milliseconds specifically for rate limit (429) errors
   * Starting at 15s gives the quota time to refresh, reducing wasted retry attempts.
   * Anthropic rate limits often reset every 60 seconds, so waiting 15s on first
   * retry is more effective than aggressive 1-2s retries.
   * @default 15000 (15 seconds)
   */
  INITIAL_RATE_LIMIT_DELAY_MS: 15000,

  /**
   * Retry attempts specifically for validation errors in Level 3
   * @default 1
   */
  VALIDATION_ERROR_RETRIES: 1,

  /**
   * Maximum retry attempts for tag validation errors
   * When LLM outputs invalid tags, retry with corrected prompt up to this many times
   * @default 2
   */
  TAG_VALIDATION_RETRIES: 2,
} as const;

/**
 * Concurrency and parallelism configuration
 *
 * Controls how many operations can run in parallel.
 */
export const CONCURRENCY_CONFIG = {
  /**
   * Maximum number of concurrent Level 3 annotation tasks
   * Higher values = faster processing but more API load
   * @default 10
   */
  MAX_CONCURRENT_ANNOTATIONS: 10,

  /**
   * Delay in milliseconds between starting each annotation task
   * Helps smooth out API request bursts
   * @default 100
   */
  TASK_START_DELAY_MS: 100,

  /**
   * Upper safety limit for concurrent annotations
   * @default 100
   */
  MAX_SAFE_CONCURRENT_ANNOTATIONS: 100,

  /**
   * Upper safety limit for task start delay
   * @default 60000
   */
  MAX_SAFE_TASK_START_DELAY_MS: 60_000,

  /**
   * Default max parallel file processing operations
   * @default 10
   */
  MAX_PARALLEL_FILES: 10,
} as const;

/**
 * Scoring weights for query ranking
 *
 * Point values used to rank files in query results.
 */
export const SCORING_CONFIG = {
  /**
   * Points per matching tag
   * @default 10
   */
  POINTS_PER_TAG: 10,

  /**
   * Points per file that imports this file
   * @default 5
   */
  POINTS_PER_IMPORTED_BY: 5,

  /**
   * Points per import in this file
   * @default 2
   */
  POINTS_PER_IMPORT: 2,

  /**
   * Points per export in this file
   * @default 3
   */
  POINTS_PER_EXPORT: 3,

  /**
   * Line count threshold for large file penalty
   * @default 1000
   */
  LARGE_FILE_LINE_THRESHOLD: 1000,

  /**
   * Penalty points for large files
   * @default 5
   */
  LARGE_FILE_PENALTY: 5,
} as const;

/**
 * Output formatting and display limits
 *
 * Controls how much information is displayed in various outputs.
 */
export const OUTPUT_CONFIG = {
  /**
   * Maximum files to display per section in query results
   * @default 10
   */
  MAX_FILES_PER_SECTION: 10,

  /**
   * Maximum exports to display per file
   * @default 5
   */
  MAX_EXPORTS_PER_FILE: 5,

  /**
   * Maximum conventions to display
   * @default 5
   */
  MAX_CONVENTIONS: 5,

  /**
   * Maximum tags to display per file in output
   * Files may have more tags internally, but only the highest-signal
   * tags are shown for readability. Uses TAG_TIERS for prioritization.
   * @default 2
   */
  MAX_DISPLAY_TAGS: 2,

  /**
   * Maximum files to show in Level 2 prompt output
   * @default 10
   */
  MAX_FILES_IN_PROMPT: 10,

  /**
   * Progress update frequency (every N files)
   * @default 100
   */
  PROGRESS_UPDATE_INTERVAL_FILES: 100,

  /**
   * Progress update frequency for Level 3 (every N files)
   * @default 10
   */
  PROGRESS_UPDATE_INTERVAL_L3: 10,
} as const;

/**
 * Token and content limits for LLM calls
 *
 * Maximum token counts and content sizes for API requests.
 */
export const TOKEN_CONFIG = {
  /**
   * Max tokens for Level 1 detection
   * @default 2000
   */
  MAX_TOKENS_LEVEL1: 2000,

  /**
   * Max tokens for Level 2 division
   * @default 4000
   */
  MAX_TOKENS_LEVEL2: 4000,

  /**
   * Max tokens for Level 3 annotation
   * @default 2000
   */
  MAX_TOKENS_LEVEL3: 2000,

  /**
   * Maximum lines to include in Level 3 prompt
   * @default 10000
   */
  MAX_LINES_IN_PROMPT: 10000,

  /**
   * Maximum characters for purpose field
   * @default 100
   */
  MAX_PURPOSE_CHARS: 100,
} as const;

/**
 * File processing thresholds
 *
 * Limits for file sizes and processing behavior.
 */
export const FILE_CONFIG = {
  /**
   * Maximum line count for files (skip if exceeded)
   * @default 10000
   */
  MAX_LINE_COUNT: 10000,

  /**
   * Buffer size for binary file detection
   * @default 8192
   */
  BINARY_DETECTION_BUFFER_SIZE: 8192,

  /**
   * Percentage of file content to show from the beginning when truncating
   * @default 0.7 (70%)
   */
  TRUNCATION_FIRST_PART_RATIO: 0.7,

  /**
   * Maximum number of tags per file
   * Reduced to 3 to improve tag precision and reduce over-tagging
   * @default 3
   */
  MAX_TAGS_PER_FILE: 3,

  /**
   * Maximum number of files per Level 3 annotation task
   * @default 50
   */
  MAX_FILES_PER_TASK: 50,
} as const;

/**
 * Rate limiting configuration for API calls
 *
 * Controls global rate limits to prevent hitting API quotas.
 *
 * Official Claude API limits vary by tier:
 * - Tier 1: 50 RPM, 30k TPM
 * - Higher tiers: Increased limits
 *
 * Default values are set to be sustainable for most Anthropic tier plans
 * while allowing reasonable concurrent processing.
 */
export const RATE_LIMIT_CONFIG = {
  /**
   * Maximum requests per minute
   * Set to 50 RPM to match Tier 1 limits
   * @default 50
   */
  REQUESTS_PER_MINUTE: 50,

  /**
   * Maximum input tokens per minute
   * 8000 tokens/min is sustainable for most Anthropic tier plans
   * and allows ~2-3 concurrent Level 3 tasks without hitting limits.
   * Can be overridden via RMAP_RATE_LIMIT_TPM env var if user has higher quota.
   * @default 8000
   */
  INPUT_TOKENS_PER_MINUTE: 8000,
} as const;

/**
 * LOC-based task division configuration (Level 2.5)
 *
 * Controls how files are grouped into tasks based on lines of code.
 */
export const LOC_CONFIG = {
  /**
   * Target LOC per task for balanced workloads
   * Tasks will be grouped to stay at or below this target
   * @default 500
   */
  TARGET_LOC_PER_TASK: 500,

  /**
   * Maximum LOC to send to LLM per file
   * Files exceeding this will be trimmed (middle section removed)
   * @default 500
   */
  MAX_LOC_PER_FILE_FOR_LLM: 500,

  /**
   * Ratio of beginning content to keep when trimming large files
   * @default 0.7 (70% from start, 30% from end)
   */
  TRIM_HEAD_RATIO: 0.7,

  /**
   * Large file threshold for complexity classification
   * Files exceeding this are considered complex (medium agent)
   * @default 300
   */
  LARGE_FILE_THRESHOLD: 300,

  /**
   * Minimum LOC for a standalone task
   * Very small files will be grouped together
   * @default 50
   */
  MIN_LOC_FOR_STANDALONE_TASK: 50,
} as const;

/**
 * All configuration grouped for convenience
 */
export const DEFAULT_CONFIG = {
  delta: DELTA_CONFIG,
  validation: VALIDATION_CONFIG,
  retry: RETRY_CONFIG,
  concurrency: CONCURRENCY_CONFIG,
  scoring: SCORING_CONFIG,
  output: OUTPUT_CONFIG,
  token: TOKEN_CONFIG,
  file: FILE_CONFIG,
  rateLimit: RATE_LIMIT_CONFIG,
  loc: LOC_CONFIG,
} as const;
