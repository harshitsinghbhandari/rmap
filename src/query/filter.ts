/**
 * Tag filtering with alias expansion for query engine
 *
 * Handles tag normalization, alias expansion, and file filtering
 */

import { TAG_ALIASES, TAG_TAXONOMY } from '../core/constants.js';
import type { Tag } from '../core/constants.js';
import type { FileAnnotation, TagsJson } from '../core/types.js';

/**
 * Expand query tags using aliases
 *
 * Converts shorthand tags (e.g., "auth") to their full set of related tags
 * (e.g., ["authentication", "authorization", "jwt", "oauth", "session"])
 *
 * @param queryTags - Raw tags from user input
 * @returns Expanded set of tags to search for
 *
 * @example
 * expandTagAliases(["auth", "database"])
 * // Returns: ["authentication", "authorization", "jwt", "oauth", "session", "database"]
 */
export function expandTagAliases(queryTags: string[]): Tag[] {
  const expandedTags = new Set<Tag>();

  for (const queryTag of queryTags) {
    const normalizedTag = queryTag.toLowerCase().trim();

    // Check if it's an alias
    if (normalizedTag in TAG_ALIASES) {
      const aliasedTags = TAG_ALIASES[normalizedTag];
      aliasedTags.forEach((tag) => expandedTags.add(tag));
    }
    // Check if it's a valid tag in the taxonomy
    else if (TAG_TAXONOMY.includes(normalizedTag as Tag)) {
      expandedTags.add(normalizedTag as Tag);
    }
    // Otherwise, add it anyway (best-effort matching)
    else {
      // Try to find partial matches in taxonomy
      const matches = TAG_TAXONOMY.filter((tag) =>
        tag.includes(normalizedTag) || normalizedTag.includes(tag)
      );
      if (matches.length > 0) {
        matches.forEach((tag) => expandedTags.add(tag));
      }
    }
  }

  return Array.from(expandedTags);
}

/**
 * Filter files by tags
 *
 * Returns files that have at least one of the specified tags
 *
 * @param files - Array of file annotations
 * @param tags - Tags to filter by (should be expanded tags)
 * @returns Files matching at least one tag
 */
export function filterFilesByTags(
  files: FileAnnotation[],
  tags: Tag[]
): FileAnnotation[] {
  if (tags.length === 0) {
    return [];
  }

  const tagSet = new Set(tags);

  return files.filter((file) => {
    // Check if any of the file's tags match the query tags
    return file.tags.some((fileTag) => tagSet.has(fileTag));
  });
}

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

/**
 * Get files from tag index
 *
 * Uses the pre-built tag index for fast lookup
 *
 * @param tagsJson - Tag index from .repo_map/tags.json
 * @param queryTags - Tags to search for
 * @returns Set of file paths that match the tags
 */
export function getFilesFromTagIndex(
  tagsJson: TagsJson,
  queryTags: string[]
): Set<string> {
  const expandedTags = expandTagAliases(queryTags);
  const filePaths = new Set<string>();

  for (const tag of expandedTags) {
    const filesForTag = tagsJson.index[tag];
    if (filesForTag) {
      filesForTag.forEach((path) => filePaths.add(path));
    }
  }

  return filePaths;
}
