/**
 * Level 3 - Deep File Annotator
 *
 * Core annotation engine that produces semantic file annotations.
 * Uses fast or capable LLM models based on task complexity.
 * The LLM provider is configurable via rmap.yaml or environment variables.
 */

export {
  annotateFiles,
  annotateTask,
  annotateExplicitTask,
  type AnnotationOptions,
  type TaskAnnotationOptions,
  type ExplicitTaskAnnotationOptions,
} from './annotator.js';
export { buildAnnotationPrompt, truncateContent } from './prompt.js';
export { parseAnnotationResponse, normalizeImportPath, AnnotationValidationError } from './parser.js';
