/**
 * Level 3 Response Parser and Validator
 *
 * Parses LLM responses into FileAnnotation objects with validation
 */

import type { FileAnnotation, RawFileMetadata } from '../../core/types.js';
import type { Tag } from '../../core/constants.js';
import { FILE } from '../../config/index.js';
import * as path from 'node:path';
import { validateTagsWithDetails, type TagValidationResult } from './tag-validator.js';
import { extractJson, fixCommonJsonIssues } from '../../core/json-utils.js';

/**
 * Validation error for annotation parsing
 */
export class AnnotationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnnotationValidationError';
  }
}

/**
 * Result of parsing annotation with validation details
 */
export interface AnnotationParseResult {
  /** The parsed file annotation (may have only partial tags if some were invalid) */
  annotation: FileAnnotation | null;
  /** Tag validation result with valid and invalid tags */
  tagValidation: TagValidationResult;
  /** The raw response text from the LLM */
  rawResponse: string;
}

/**
 * Raw annotation response from LLM (before validation)
 */
interface RawAnnotation {
  purpose: string;
  tags: string[];
  exports: string[];
  imports: string[];
}

/**
 * Normalize a file path to be repo-root-relative
 *
 * Converts relative paths (./foo, ../bar) to absolute repo-root paths
 */
export function normalizeImportPath(
  importPath: string,
  currentFilePath: string,
  repoRoot: string
): string {
  // If already absolute or looks like a package, return as-is
  if (!importPath.startsWith('.')) {
    return importPath;
  }

  // Resolve relative path
  const currentDir = path.dirname(currentFilePath);
  const absolutePath = path.join(currentDir, importPath);

  // Normalize to remove '..' and '.'
  const normalized = path.normalize(absolutePath);

  // Remove leading './' if present
  return normalized.startsWith('./') ? normalized.slice(2) : normalized;
}


/**
 * Filter out external package imports
 *
 * Keeps only internal repository imports (paths with slashes or file extensions)
 */
function filterInternalImports(imports: string[]): string[] {
  return imports.filter((imp) => {
    // Skip if it looks like a package name (no path separators)
    if (!imp.includes('/') && !imp.includes('\\')) {
      return false;
    }

    // Skip node: protocol imports
    if (imp.startsWith('node:')) {
      return false;
    }

    // Skip @scope/package imports
    if (imp.startsWith('@') && !imp.includes('/./') && !imp.includes('/../')) {
      const parts = imp.split('/');
      // @scope/package is external, but @scope/package/path might be internal
      if (parts.length <= 2) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Normalize all import paths in the imports array
 */
function normalizeImports(
  imports: string[],
  currentFilePath: string,
  repoRoot: string
): string[] {
  // Filter external imports first
  const internal = filterInternalImports(imports);

  // Normalize paths
  return internal.map((imp) => {
    // Remove file extensions for consistency
    let normalized = normalizeImportPath(imp, currentFilePath, repoRoot);

    // Remove common extensions if present
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.rs', '.java'];
    for (const ext of extensions) {
      if (normalized.endsWith(ext)) {
        normalized = normalized.slice(0, -ext.length);
      }
    }

    // Normalize to forward slashes for cross-platform consistency
    // Graph keys and queries use POSIX-style paths, so backslashes would break lookups on Windows
    normalized = normalized.replace(/\\/g, '/');

    return normalized;
  });
}

/**
 * Process raw_imports from Level 0 parsers into normalized internal imports
 *
 * This function takes the imports extracted by Level 0 parsers (Babel AST or regex)
 * and filters/normalizes them to produce repo-root-relative paths for internal files only.
 *
 * @param rawImports - Import strings from Level 0 (raw_imports field)
 * @param currentFilePath - Path of the file being processed (for resolving relative imports)
 * @param repoRoot - Repository root path
 * @returns Array of normalized internal import paths
 */
export function processRawImports(
  rawImports: string[],
  currentFilePath: string,
  repoRoot: string
): string[] {
  return normalizeImports(rawImports, currentFilePath, repoRoot);
}

/**
 * Validate the structure of raw annotation
 */
function validateRawAnnotation(data: unknown): RawAnnotation {
  if (typeof data !== 'object' || data === null) {
    throw new AnnotationValidationError('Response must be a JSON object');
  }

  const obj = data as Record<string, unknown>;

  // Validate purpose
  if (typeof obj.purpose !== 'string' || obj.purpose.trim().length === 0) {
    throw new AnnotationValidationError('Field "purpose" must be a non-empty string');
  }

  let purpose = obj.purpose;
  if (purpose.length > 200) {
    console.warn('Warning: Purpose is longer than 200 chars, truncating');
    purpose = purpose.slice(0, 197) + '...';
  }

  // Validate tags
  if (!Array.isArray(obj.tags)) {
    throw new AnnotationValidationError('Field "tags" must be an array');
  }

  if (obj.tags.length === 0) {
    throw new AnnotationValidationError('Field "tags" must contain at least one tag');
  }

  if (!obj.tags.every((tag) => typeof tag === 'string')) {
    throw new AnnotationValidationError('All tags must be strings');
  }

  // Validate exports
  if (!Array.isArray(obj.exports)) {
    throw new AnnotationValidationError('Field "exports" must be an array');
  }

  if (!obj.exports.every((exp) => typeof exp === 'string')) {
    throw new AnnotationValidationError('All exports must be strings');
  }

  // Validate imports (optional, since imports are now extracted by Level 0 parsers)
  // If provided by LLM, validate the structure
  let imports: string[] = [];
  if (obj.imports !== undefined) {
    if (!Array.isArray(obj.imports)) {
      throw new AnnotationValidationError('Field "imports" must be an array if provided');
    }

    if (!obj.imports.every((imp) => typeof imp === 'string')) {
      throw new AnnotationValidationError('All imports must be strings');
    }

    imports = obj.imports as string[];
  }

  return {
    purpose,
    tags: obj.tags as string[],
    exports: obj.exports as string[],
    imports,
  };
}

/**
 * Parse and validate LLM response into FileAnnotation with detailed validation
 *
 * @param responseText - Raw text response from LLM
 * @param metadata - File metadata from Level 0
 * @param repoRoot - Repository root path (for normalizing imports)
 * @param preExtractedImports - Optional pre-extracted imports from Level 0 parsers (overrides LLM-extracted imports)
 * @returns Parse result with annotation and validation details
 */
// Removed redundant extractJson function that is now in json-utils.ts

export function parseAnnotationResponseWithDetails(
  responseText: string,
  metadata: RawFileMetadata,
  repoRoot: string = '.',
  preExtractedImports?: string[]
): AnnotationParseResult {
  const jsonText = extractJson(responseText);

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    // Try to fix common JSON issues from LLMs
    try {
      parsed = JSON.parse(fixCommonJsonIssues(jsonText));
    } catch {
      const preview = jsonText.slice(0, 200);
      throw new AnnotationValidationError(
        `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}\n` +
        `Response preview: ${preview}...`
      );
    }
  }

  // Validate structure
  const raw = validateRawAnnotation(parsed);

  // Validate and filter tags with detailed results
  const tagValidation = validateTagsWithDetails(raw.tags, metadata.path);

  // If no valid tags, return null annotation with validation details
  if (tagValidation.valid.length === 0) {
    return {
      annotation: null,
      tagValidation,
      rawResponse: responseText,
    };
  }

  // Use pre-extracted imports from Level 0 if available, otherwise use LLM-extracted imports
  const normalizedImports = preExtractedImports !== undefined
    ? preExtractedImports
    : normalizeImports(raw.imports, metadata.path, repoRoot);

  // Build FileAnnotation
  const annotation: FileAnnotation = {
    path: metadata.path,
    language: metadata.language || 'Unknown',
    size_bytes: metadata.size_bytes,
    line_count: metadata.line_count,
    purpose: raw.purpose.trim(),
    tags: tagValidation.valid,
    exports: raw.exports.map((e) => e.trim()).filter((e) => e.length > 0),
    imports: normalizedImports,
  };

  return {
    annotation,
    tagValidation,
    rawResponse: responseText,
  };
}

/**
 * Parse and validate LLM response into FileAnnotation
 *
 * @param responseText - Raw text response from LLM
 * @param metadata - File metadata from Level 0
 * @param repoRoot - Repository root path (for normalizing imports)
 * @param preExtractedImports - Optional pre-extracted imports from Level 0 parsers
 * @returns Validated FileAnnotation
 */
export function parseAnnotationResponse(
  responseText: string,
  metadata: RawFileMetadata,
  repoRoot: string = '.',
  preExtractedImports?: string[]
): FileAnnotation {
  const result = parseAnnotationResponseWithDetails(responseText, metadata, repoRoot, preExtractedImports);

  if (result.annotation === null) {
    throw new AnnotationValidationError(
      `No valid tags found for file ${metadata.path}. Tags provided: ${result.tagValidation.invalid.join(', ')}`
    );
  }

  return result.annotation;
}
