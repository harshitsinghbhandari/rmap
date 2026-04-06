/**
 * File filtering for query engine
 *
 * Handles file filtering by path and exact path lookup
 */

import type { FileAnnotation } from '../core/types.js';

/**
 * Filter files by path prefix
 *
 * Returns files under a specific directory
 *
 * @param files - Array of file annotations
 * @param pathPrefix - Directory path to filter by (e.g., "src/auth/")
 * @returns Files under the specified path
 */
export function filterFilesByPath(
  files: FileAnnotation[],
  pathPrefix: string
): FileAnnotation[] {
  // Normalize path prefix
  const normalizedPrefix = pathPrefix.endsWith('/')
    ? pathPrefix
    : `${pathPrefix}/`;

  return files.filter((file) => {
    return file.path.startsWith(normalizedPrefix) || file.path === pathPrefix;
  });
}

/**
 * Find a specific file by exact path
 *
 * @param files - Array of file annotations
 * @param filePath - Exact file path to find
 * @returns The file annotation if found, undefined otherwise
 */
export function findFileByPath(
  files: FileAnnotation[],
  filePath: string
): FileAnnotation | undefined {
  return files.find((file) => file.path === filePath);
}
