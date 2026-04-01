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

export type AgentSize = keyof typeof ANNOTATION_MODEL_MAP;
