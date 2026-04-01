/**
 * File ranking algorithm for query results
 *
 * Ranks files by relevance using graph connectivity and other metrics
 */

import type { FileAnnotation, GraphJson } from '../core/types.js';
import { SCORING } from '../config/index.js';

/**
 * Score interface for ranking
 */
export interface FileScore {
  /** File annotation */
  file: FileAnnotation;

  /** Computed relevance score */
  score: number;

  /** Number of files this file imports */
  importCount: number;

  /** Number of files that import this file */
  importedByCount: number;

  /** Total connectivity (imports + imported_by) */
  connectivity: number;
}

/**
 * Compute relevance score for a file
 *
 * Scoring factors:
 * - Number of matching tags (if query tags provided)
 * - Graph connectivity (imports + imported_by)
 * - Number of exports (indicates API surface area)
 *
 * @param file - File annotation
 * @param graph - Dependency graph
 * @param queryTags - Tags from the query (optional)
 * @returns Computed score
 */
function computeScore(
  file: FileAnnotation,
  graph: GraphJson,
  queryTags?: string[]
): number {
  let score = 0;

  // Tag matching score (if query tags provided)
  if (queryTags && queryTags.length > 0) {
    const queryTagSet = new Set(queryTags.map((t) => t.toLowerCase()));
    const matchingTags = file.tags.filter((tag) =>
      queryTagSet.has(tag.toLowerCase())
    );
    score += matchingTags.length * SCORING.POINTS_PER_TAG;
  }

  // Graph connectivity score
  const graphNode = graph[file.path];
  if (graphNode) {
    const importCount = graphNode.imports.length;
    const importedByCount = graphNode.imported_by.length;

    // Files that are imported by many others are more central
    score += importedByCount * SCORING.POINTS_PER_IMPORTED_BY;

    // Files that import many others might be entry points
    score += importCount * SCORING.POINTS_PER_IMPORT;
  }

  // Export count score (files with more exports are likely more important)
  score += file.exports.length * SCORING.POINTS_PER_EXPORT;

  // File size penalty (very large files might be less focused)
  if (file.line_count > SCORING.LARGE_FILE_LINE_THRESHOLD) {
    score -= SCORING.LARGE_FILE_PENALTY;
  }

  return score;
}

/**
 * Rank files by relevance
 *
 * Computes scores for each file and sorts by descending score
 *
 * @param files - Array of file annotations to rank
 * @param graph - Dependency graph
 * @param queryTags - Optional tags from query for relevance scoring
 * @returns Array of files with scores, sorted by score (highest first)
 */
export function rankFilesByRelevance(
  files: FileAnnotation[],
  graph: GraphJson,
  queryTags?: string[]
): FileScore[] {
  const scored = files.map((file) => {
    const score = computeScore(file, graph, queryTags);
    const graphNode = graph[file.path];

    const importCount = graphNode?.imports.length || 0;
    const importedByCount = graphNode?.imported_by.length || 0;

    return {
      file,
      score,
      importCount,
      importedByCount,
      connectivity: importCount + importedByCount,
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  return scored;
}

/**
 * Get top N files from ranked results
 *
 * @param rankedFiles - Ranked file scores
 * @param limit - Maximum number of files to return
 * @returns Top N files
 */
export function getTopFiles(
  rankedFiles: FileScore[],
  limit: number
): FileScore[] {
  return rankedFiles.slice(0, limit);
}

/**
 * Get dependents for a set of files
 *
 * Returns all files that import the given files (dependents)
 *
 * @param filePaths - Paths of files to get dependents for
 * @param graph - Dependency graph
 * @param allFiles - All file annotations (to get full file info)
 * @returns Files that import any of the input files
 */
export function getDependents(
  filePaths: string[],
  graph: GraphJson,
  allFiles: FileAnnotation[]
): FileAnnotation[] {
  const dependentsSet = new Set<string>();

  // Collect all files that import the target files
  for (const filePath of filePaths) {
    const graphNode = graph[filePath];
    if (graphNode && graphNode.imported_by) {
      graphNode.imported_by.forEach((path) => dependentsSet.add(path));
    }
  }

  // Convert to file annotations
  const fileMap = new Map(allFiles.map((f) => [f.path, f]));
  const dependentFiles: FileAnnotation[] = [];

  for (const path of dependentsSet) {
    const file = fileMap.get(path);
    if (file) {
      dependentFiles.push(file);
    }
  }

  // Sort by path for consistent ordering (simpler and faster than relevance ranking)
  return dependentFiles.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * @deprecated Use getDependents instead. This function returns dependents (importers), not a "blast radius".
 */
export function getBlastRadius(
  filePaths: string[],
  graph: GraphJson,
  allFiles: FileAnnotation[]
): FileAnnotation[] {
  return getDependents(filePaths, graph, allFiles);
}

/**
 * Get dependencies for a file
 *
 * Returns all files that the given file imports
 *
 * @param filePath - Path of file to get dependencies for
 * @param graph - Dependency graph
 * @param allFiles - All file annotations
 * @returns Files that the input file imports
 */
export function getDependencies(
  filePath: string,
  graph: GraphJson,
  allFiles: FileAnnotation[]
): FileAnnotation[] {
  const graphNode = graph[filePath];
  if (!graphNode || !graphNode.imports) {
    return [];
  }

  const fileMap = new Map(allFiles.map((f) => [f.path, f]));
  const dependencies: FileAnnotation[] = [];

  for (const path of graphNode.imports) {
    const file = fileMap.get(path);
    if (file) {
      dependencies.push(file);
    }
  }

  return dependencies;
}
