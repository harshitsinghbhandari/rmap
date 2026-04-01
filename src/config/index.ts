/**
 * Configuration module exports
 *
 * Re-exports all model configurations and constants from the config module
 */

// Export all model constants and types
export {
  MODELS,
  ANNOTATION_MODEL_MAP,
  DIVISION_MODEL,
  DETECTION_MODEL,
  RETRY_CONFIG,
  CONCURRENCY_CONFIG,
} from './models.js';

export type { AgentSize } from './models.js';

// Export default configuration constants (no environment overrides)
export {
  DELTA_CONFIG,
  VALIDATION_CONFIG,
  RETRY_CONFIG as RETRY_DEFAULTS,
  CONCURRENCY_CONFIG as CONCURRENCY_DEFAULTS,
  SCORING_CONFIG,
  OUTPUT_CONFIG,
  TOKEN_CONFIG,
  FILE_CONFIG,
  DEFAULT_CONFIG,
} from './defaults.js';

// Export runtime configuration (with environment overrides)
export {
  CONFIG,
  DELTA,
  VALIDATION,
  RETRY,
  CONCURRENCY,
  SCORING,
  OUTPUT,
  TOKEN,
  FILE,
} from './env.js';
