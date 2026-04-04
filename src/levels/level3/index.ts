/**
 * Level 3 - Deep File Annotator
 *
 * Core annotation engine that produces semantic file annotations
 * using Claude Haiku or Sonnet based on task complexity
 */

export { annotateFiles, annotateTask, type AnnotationOptions, type TaskAnnotationOptions } from './annotator.js';
export { buildAnnotationPrompt, truncateContent } from './prompt.js';
export { parseAnnotationResponse, normalizeImportPath, AnnotationValidationError } from './parser.js';
