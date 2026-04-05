/**
 * Centralized Model Configuration
 *
 * Defines which LLM models to use for different tasks across the rmap pipeline.
 * Supports multiple providers (Anthropic, Gemini, OpenAI).
 */

import type { ProviderType } from '../core/providers/types.js';

/**
 * Available Claude models (Anthropic)
 */
export const CLAUDE_MODELS = {
  HAIKU: 'claude-haiku-4-5-20251001',
  SONNET: 'claude-sonnet-4-5-20250929',
} as const;

/**
 * Available Gemini models (Google)
 */
export const GEMINI_MODELS = {
  FLASH: 'gemma-4-31b-it',
  PRO: 'gemini-3.1-flash-lite-preview',
} as const;

/**
 * Legacy alias for backward compatibility
 */
export const MODELS = CLAUDE_MODELS;

/**
 * Model selection based on agent size for Level 3 annotations (Claude)
 */
export const ANNOTATION_MODEL_MAP = {
  small: MODELS.HAIKU,
  medium: MODELS.SONNET,
  large: MODELS.SONNET,
} as const;

/**
 * Model selection based on agent size for Level 3 annotations (Gemini)
 */
export const GEMINI_ANNOTATION_MODEL_MAP = {
  small: GEMINI_MODELS.FLASH,
  medium: GEMINI_MODELS.PRO,
  large: GEMINI_MODELS.PRO,
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
 * Get the appropriate detection model (Level 1) for a provider
 *
 * @param provider - The LLM provider type
 * @returns Model identifier string
 */
export function getDetectionModel(provider: ProviderType): string {
  switch (provider) {
    case 'anthropic':
      return CLAUDE_MODELS.HAIKU;
    case 'gemini':
      return GEMINI_MODELS.FLASH;
    case 'openai':
      throw new Error('OpenAI provider not yet implemented');
    default:
      return CLAUDE_MODELS.HAIKU;
  }
}

/**
 * Get the appropriate division model (Level 2) for a provider
 *
 * @param provider - The LLM provider type
 * @returns Model identifier string
 */
export function getDivisionModel(provider: ProviderType): string {
  switch (provider) {
    case 'anthropic':
      return CLAUDE_MODELS.SONNET;
    case 'gemini':
      return GEMINI_MODELS.PRO;
    case 'openai':
      throw new Error('OpenAI provider not yet implemented');
    default:
      return CLAUDE_MODELS.SONNET;
  }
}

/**
 * Get the appropriate annotation model (Level 3) for a provider and agent size
 *
 * @param provider - The LLM provider type
 * @param size - Agent size (small, medium, large)
 * @returns Model identifier string
 */
export function getAnnotationModel(provider: ProviderType, size: AgentSize): string {
  switch (provider) {
    case 'anthropic':
      return ANNOTATION_MODEL_MAP[size];
    case 'gemini':
      return GEMINI_ANNOTATION_MODEL_MAP[size];
    case 'openai':
      throw new Error('OpenAI provider not yet implemented');
    default:
      return ANNOTATION_MODEL_MAP[size];
  }
}

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

const DEFAULT_MAX_CONCURRENT_ANNOTATIONS = 1;
const DEFAULT_TASK_START_DELAY_MS = 100;
const MAX_SAFE_CONCURRENT_ANNOTATIONS = 100;
const MAX_SAFE_TASK_START_DELAY_MS = 60_000;

function parseEnvInt(
  envValue: string | undefined,
  defaultValue: number,
  min: number,
  max: number,
): number {
  let value: number = envValue !== undefined ? Number(envValue) : defaultValue;

  if (!Number.isFinite(value)) {
    value = defaultValue;
  }

  value = Math.trunc(value);

  if (value < min) {
    value = min;
  } else if (value > max) {
    value = max;
  }

  return value;
}

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
  MAX_CONCURRENT_ANNOTATIONS: parseEnvInt(
    process.env.RMAP_CONCURRENCY,
    DEFAULT_MAX_CONCURRENT_ANNOTATIONS,
    1,
    MAX_SAFE_CONCURRENT_ANNOTATIONS,
  ),

  /**
   * Delay in milliseconds between starting each annotation task
   * Default: 100ms (helps smooth out API request bursts)
   * Can be overridden with RMAP_TASK_DELAY environment variable
   */
  TASK_START_DELAY_MS: parseEnvInt(
    process.env.RMAP_TASK_DELAY,
    DEFAULT_TASK_START_DELAY_MS,
    0,
    MAX_SAFE_TASK_START_DELAY_MS,
  ),
} as const;

export type AgentSize = keyof typeof ANNOTATION_MODEL_MAP;
