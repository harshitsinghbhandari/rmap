/**
 * Level 3 Response Parser and Validator
 *
 * Parses LLM responses into FileAnnotation objects with validation
 */

import type { FileAnnotation, RawFileMetadata } from '../../core/types.js';
import { TAG_TAXONOMY, MAX_TAGS_PER_FILE, type Tag } from '../../core/constants.js';
import * as path from 'node:path';

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
 * Validate a tag is in the taxonomy
 *
 * @param tag - Tag to validate
 * @returns The tag if valid, or null if invalid
 */
function validateTag(tag: string): Tag | null {
  // Check if tag exists in taxonomy (case-insensitive)
  const lowerTag = tag.toLowerCase();
  const validTag = TAG_TAXONOMY.find((t) => t.toLowerCase() === lowerTag);

  return validTag || null;
}

/**
 * Filter and validate tags from LLM response
 *
 * - Removes tags not in taxonomy
 * - Limits to MAX_TAGS_PER_FILE
 * - Warns about dropped tags
 */
function validateTags(tags: string[], filePath: string): Tag[] {
  const validTags: Tag[] = [];

  for (const tag of tags) {
    const validTag = validateTag(tag);

    if (validTag) {
      // Avoid duplicates
      if (!validTags.includes(validTag)) {
        validTags.push(validTag);
      }
    } else {
      console.warn(`Warning: Tag "${tag}" not in taxonomy for file ${filePath}, skipping`);
    }
  }

  // Limit to max tags
  if (validTags.length > MAX_TAGS_PER_FILE) {
    console.warn(
      `Warning: File ${filePath} has ${validTags.length} tags, limiting to ${MAX_TAGS_PER_FILE}`
    );
    return validTags.slice(0, MAX_TAGS_PER_FILE);
  }

  return validTags;
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

    return normalized;
  });
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

  // Validate imports
  if (!Array.isArray(obj.imports)) {
    throw new AnnotationValidationError('Field "imports" must be an array');
  }

  if (!obj.imports.every((imp) => typeof imp === 'string')) {
    throw new AnnotationValidationError('All imports must be strings');
  }

  return {
    purpose,
    tags: obj.tags as string[],
    exports: obj.exports as string[],
    imports: obj.imports as string[],
  };
}

/**
 * Parse and validate LLM response into FileAnnotation
 *
 * @param responseText - Raw text response from LLM
 * @param metadata - File metadata from Level 0
 * @param repoRoot - Repository root path (for normalizing imports)
 * @returns Validated FileAnnotation
 */
export function parseAnnotationResponse(
  responseText: string,
  metadata: RawFileMetadata,
  repoRoot: string = '.'
): FileAnnotation {
  // Remove markdown code blocks if present
  let jsonText = responseText.trim();

  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new AnnotationValidationError(
      `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Validate structure
  const raw = validateRawAnnotation(parsed);

  // Validate and filter tags
  const validTags = validateTags(raw.tags, metadata.path);

  if (validTags.length === 0) {
    throw new AnnotationValidationError(
      `No valid tags found for file ${metadata.path}. Tags provided: ${raw.tags.join(', ')}`
    );
  }

  // Normalize imports
  const normalizedImports = normalizeImports(raw.imports, metadata.path, repoRoot);

  // Build FileAnnotation
  const annotation: FileAnnotation = {
    path: metadata.path,
    language: metadata.language || 'Unknown',
    size_bytes: metadata.size_bytes,
    line_count: metadata.line_count,
    purpose: raw.purpose.trim(),
    tags: validTags,
    exports: raw.exports.map((e) => e.trim()).filter((e) => e.length > 0),
    imports: normalizedImports,
  };

  return annotation;
}
