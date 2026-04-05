/**
 * Configuration module exports
 *
 * Re-exports all model configurations and constants from the config module
 */

// Export all model constants and types
export {
  MODELS,
  CLAUDE_MODELS,
  GEMINI_MODELS,
  ANNOTATION_MODEL_MAP,
  GEMINI_ANNOTATION_MODEL_MAP,
  DIVISION_MODEL,
  DETECTION_MODEL,
  RETRY_CONFIG,
  CONCURRENCY_CONFIG,
  // Provider-aware model selection functions
  getDetectionModel,
  getDivisionModel,
  getAnnotationModel,
} from './models.js';

export type { AgentSize } from './models.js';

// Export YAML config utilities
export {
  loadYamlConfig,
  findConfigFile,
  getYamlLLMProvider,
  clearConfigCache,
  getLoadedConfigPath,
} from './yaml-config.js';

export type { YamlConfig, YamlLLMConfig } from './yaml-config.js';

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
  LOC_CONFIG,
  DEFAULT_CONFIG,
} from './defaults.js';

// Export .rmapignore default patterns
export {
  DEFAULT_RMAPIGNORE,
  ALWAYS_IGNORE_PATTERNS,
} from './rmapignore-defaults.js';

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
  RATE_LIMIT,
  LOC,
  LLM_PROVIDER,
} from './env.js';

// Import for validation
import { CONFIG } from './env.js';
import { validateConfig, validateAll } from '../core/validation.js';

/**
 * Validate configuration on import
 *
 * Runs validation checks on the loaded configuration.
 * Logs warnings but doesn't crash to allow graceful degradation.
 */
function validateConfigOnLoad(): void {
  try {
    // validateAll now accepts config and validates it along with taxonomy and thresholds
    validateAll(CONFIG);
  } catch (error) {
    // Log validation errors but don't crash - allow runtime to handle
    if (error instanceof Error) {
      // In test/development, log full error for debugging
      if (process.env.NODE_ENV === 'test' || process.env.DEBUG) {
        console.error(`Configuration validation warning:`, error);
      } else {
        console.error(`Configuration validation warning: ${error.message}`);
      }
    }
  }
}

// Run validation on module load only if not in test mode
// Tests will explicitly call validation functions
if (process.env.NODE_ENV !== 'test') {
  validateConfigOnLoad();
}
