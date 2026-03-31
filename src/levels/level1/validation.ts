/**
 * Level 1 Response Validation
 *
 * Validates LLM responses to ensure they match expected schema
 */

import type { Level1Output, Module } from '../../core/types.js';

/**
 * Validation error class
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Check if value is a non-empty string
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Check if value is an array of strings
 */
function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string')
  );
}

/**
 * Check if value is a valid Module
 */
function isModule(value: unknown): value is Module {
  return (
    typeof value === 'object' &&
    value !== null &&
    'path' in value &&
    'description' in value &&
    isNonEmptyString((value as Module).path) &&
    isNonEmptyString((value as Module).description)
  );
}

/**
 * Check if value is an array of Modules
 */
function isModuleArray(value: unknown): value is Module[] {
  return Array.isArray(value) && value.every(isModule);
}

/**
 * Validate Level1Output structure
 *
 * @param data - Parsed JSON data from LLM
 * @throws ValidationError if structure is invalid
 * @returns Validated Level1Output
 */
export function validateLevel1Output(data: unknown): Level1Output {
  if (typeof data !== 'object' || data === null) {
    throw new ValidationError('Response must be a JSON object');
  }

  const obj = data as Record<string, unknown>;

  // Validate required string fields
  const requiredStringFields = ['repo_name', 'purpose', 'stack'];
  for (const field of requiredStringFields) {
    if (!isNonEmptyString(obj[field])) {
      throw new ValidationError(`Missing or invalid field: ${field} (must be non-empty string)`);
    }
  }

  // Validate languages array
  if (!isStringArray(obj.languages)) {
    throw new ValidationError('Field "languages" must be an array of strings');
  }

  if (obj.languages.length === 0) {
    throw new ValidationError('Field "languages" must contain at least one language');
  }

  // Validate entrypoints array
  if (!isStringArray(obj.entrypoints)) {
    throw new ValidationError('Field "entrypoints" must be an array of strings');
  }

  // Validate modules array
  if (!isModuleArray(obj.modules)) {
    throw new ValidationError('Field "modules" must be an array of {path, description} objects');
  }

  // Validate config_files array
  if (!isStringArray(obj.config_files)) {
    throw new ValidationError('Field "config_files" must be an array of strings');
  }

  // Validate conventions array
  if (!isStringArray(obj.conventions)) {
    throw new ValidationError('Field "conventions" must be an array of strings');
  }

  return {
    repo_name: obj.repo_name as string,
    purpose: obj.purpose as string,
    stack: obj.stack as string,
    languages: obj.languages,
    entrypoints: obj.entrypoints,
    modules: obj.modules,
    config_files: obj.config_files,
    conventions: obj.conventions,
  };
}
