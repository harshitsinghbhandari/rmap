/**
 * Core module exports
 *
 * Re-exports all types and constants from the core module
 */

// Export all types
export type {
  FileAnnotation,
  Module,
  MetaJson,
  GraphNode,
  GraphJson,
  TagsJson,
  StatsJson,
  ValidationSeverity,
  ValidationIssue,
  ValidationJson,
  DelegationTask,
  TaskDelegation,
  RawFileMetadata,
  CheckpointState,
  LevelCheckpoint,
  LevelStatus,
  Level0Output,
  Level1Output,
} from './types.js';

// Export all constants
export {
  SCHEMA_VERSION,
  TAG_TAXONOMY,
  TAG_ALIASES,
  UPDATE_THRESHOLDS,
  MAX_TAGS_PER_FILE,
  MAX_FILES_PER_TASK,
  CHECKPOINT_DIR,
  CHECKPOINT_VERSION,
  CHECKPOINT_FILES,
} from './constants.js';

// Export Tag type
export type { Tag } from './constants.js';

// Export git utilities
export {
  validateGitRef,
  getGitDiffSafe,
  getCommitTimestampSafe,
  getCommitCountSafe,
  getCurrentCommitSafe,
} from './git-utils.js';
// Export concurrency utilities
export { ConcurrencyPool } from './concurrency.js';
export type { ConcurrencyPoolOptions, TaskResult } from './concurrency.js';
// Export LLM client with retry logic
export { LLMClient, withRetry } from './llm-client.js';
export type { RetryConfig, LLMCallOptions, LLMResponse } from './llm-client.js';
// Export rate limiter
export {
  TokenBucket,
  RateLimiter,
  estimateTokens,
  globalRateLimiter,
} from './rate-limiter.js';
export type { RateLimiterConfig } from './rate-limiter.js';
// Export model configuration types
export type { AgentSize } from '../config/models.js';
// Export metrics collection and logging
export { MetricsCollector, MODEL_PRICING } from './metrics.js';
export type { LevelMetrics, MetricsSummary, LLMCallMetrics } from './metrics.js';
export {
  writeMetricsLog,
  formatMetricsSummary,
  printCompactSummary,
  getLatestMetrics,
} from './metrics-logger.js';
// Export error classes
export {
  RmapError,
  ConfigError,
  GitError,
  LLMError,
  ParseError,
  ValidationError,
  FileSystemError,
  CheckpointError,
} from './errors.js';
// Export validation functions
export {
  validateTagTaxonomy,
  validateThresholds,
  validateConfig,
  validateFileTags,
  validateAll,
  ConfigValidationError,
} from './validation.js';
// Export prompt logging utilities
export {
  initPromptLogger,
  isLoggingEnabled,
  logPromptResponse,
  displayLoggingWarning,
} from './prompt-logger.js';
export type { PromptLogContext } from './prompt-logger.js';
