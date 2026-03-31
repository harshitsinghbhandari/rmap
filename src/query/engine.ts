/**
 * Main query engine for rmap
 *
 * Orchestrates tag-based, file-based, and path-based queries
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  FileAnnotation,
  GraphJson,
  MetaJson,
  TagsJson,
} from '../core/types.js';
import {
  expandTagAliases,
  filterFilesByPath,
  filterFilesByTags,
  findFileByPath,
  getFilesFromTagIndex,
} from './filter.js';
import {
  formatFileQueryOutput,
  formatPathQueryOutput,
  formatQueryOutput,
  type FormatOptions,
} from './formatter.js';
import {
  getBlastRadius,
  getDependencies,
  getTopFiles,
  rankFilesByRelevance,
} from './ranking.js';

/**
 * Query engine configuration
 */
export interface QueryConfig {
  /** Path to .repo_map directory */
  repoMapPath?: string;

  /** Root directory of the repository */
  repoRoot?: string;

  /** Format options for output */
  formatOptions?: Partial<FormatOptions>;
}

/**
 * Loaded repository map data
 */
interface RepoMapData {
  meta: MetaJson;
  graph: GraphJson;
  tags: TagsJson;
  files: FileAnnotation[];
}

/**
 * Load repository map files
 *
 * Reads meta.json, graph.json, tags.json, and reconstructs file annotations
 *
 * @param repoMapPath - Path to .repo_map directory
 * @returns Loaded repository map data
 */
async function loadRepoMap(repoMapPath: string): Promise<RepoMapData> {
  try {
    // Read all map files
    const [metaContent, graphContent, tagsContent] = await Promise.all([
      readFile(join(repoMapPath, 'meta.json'), 'utf-8'),
      readFile(join(repoMapPath, 'graph.json'), 'utf-8'),
      readFile(join(repoMapPath, 'tags.json'), 'utf-8'),
    ]);

    const meta: MetaJson = JSON.parse(metaContent);
    const graph: GraphJson = JSON.parse(graphContent);
    const tags: TagsJson = JSON.parse(tagsContent);

    // Reconstruct file annotations from graph and tags
    // For now, we'll build a minimal file list from the graph
    // In the full implementation, this would load from a separate annotations.json
    const fileMap = new Map<string, Partial<FileAnnotation>>();

    // Collect files from graph
    for (const [filePath, graphNode] of Object.entries(graph)) {
      fileMap.set(filePath, {
        path: filePath,
        imports: graphNode.imports,
        exports: [], // Will be populated from annotations
        tags: [],
        purpose: '',
        language: '',
        size_bytes: 0,
        line_count: 0,
      });
    }

    // Populate tags from tag index
    for (const [tag, filePaths] of Object.entries(tags.index)) {
      for (const filePath of filePaths) {
        const file = fileMap.get(filePath);
        if (file && file.tags) {
          file.tags.push(tag as any);
        }
      }
    }

    // Convert to FileAnnotation array
    // Note: In a real implementation, we'd load full annotations from a separate file
    const files: FileAnnotation[] = Array.from(fileMap.values()).map(
      (partial) => ({
        path: partial.path!,
        language: partial.language || 'unknown',
        size_bytes: partial.size_bytes || 0,
        line_count: partial.line_count || 0,
        purpose: partial.purpose || '',
        tags: partial.tags || [],
        exports: partial.exports || [],
        imports: partial.imports || [],
      })
    );

    return { meta, graph, tags, files };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        'Repository map not found. Run "rmap map" to build the map first.'
      );
    }
    throw error;
  }
}

/**
 * Query by tags
 *
 * Finds files matching the specified tags, ranks them, and formats output
 *
 * @param queryTags - Tags to search for (can include aliases like "auth")
 * @param config - Query configuration
 * @returns Formatted query output
 */
export async function queryByTags(
  queryTags: string[],
  config: QueryConfig = {}
): Promise<string> {
  const repoMapPath = config.repoMapPath || join(process.cwd(), '.repo_map');
  const data = await loadRepoMap(repoMapPath);

  // Expand tag aliases
  const expandedTags = expandTagAliases(queryTags);

  // Get matching files using tag index for performance
  const matchingFilePaths = getFilesFromTagIndex(data.tags, queryTags);

  // Filter files to those that exist in our file list
  const matchingFiles = data.files.filter((file) =>
    matchingFilePaths.has(file.path)
  );

  // Rank files by relevance
  const rankedFiles = rankFilesByRelevance(
    matchingFiles,
    data.graph,
    expandedTags
  );

  // Get top files (limit to 10 by default)
  const topFiles = getTopFiles(rankedFiles, config.formatOptions?.maxFiles || 10);

  // Get blast radius (files that import the top results)
  const blastRadiusFiles = getBlastRadius(
    topFiles.map((f) => f.file.path),
    data.graph,
    data.files
  );

  // Format and return output
  return formatQueryOutput(
    {
      meta: data.meta,
      relevantFiles: topFiles,
      queryTags,
      blastRadiusFiles,
    },
    config.formatOptions
  );
}

/**
 * Query by file path
 *
 * Shows details about a specific file, its dependencies, and dependents
 *
 * @param filePath - Path to the file to query
 * @param config - Query configuration
 * @returns Formatted query output
 */
export async function queryByFile(
  filePath: string,
  config: QueryConfig = {}
): Promise<string> {
  const repoMapPath = config.repoMapPath || join(process.cwd(), '.repo_map');
  const data = await loadRepoMap(repoMapPath);

  // Find the file
  const file = findFileByPath(data.files, filePath);
  if (!file) {
    throw new Error(`File not found in repository map: ${filePath}`);
  }

  // Get dependencies (files this file imports)
  const dependencies = getDependencies(filePath, data.graph, data.files);

  // Get dependents (files that import this file)
  const dependents = getBlastRadius([filePath], data.graph, data.files);

  // Format and return output
  return formatFileQueryOutput(
    {
      meta: data.meta,
      file,
      dependencies,
      dependents,
    },
    config.formatOptions
  );
}

/**
 * Query by directory path
 *
 * Shows all files in a directory and external files that depend on them
 *
 * @param dirPath - Path to the directory to query
 * @param config - Query configuration
 * @returns Formatted query output
 */
export async function queryByPath(
  dirPath: string,
  config: QueryConfig = {}
): Promise<string> {
  const repoMapPath = config.repoMapPath || join(process.cwd(), '.repo_map');
  const data = await loadRepoMap(repoMapPath);

  // Filter files in the directory
  const filesInDir = filterFilesByPath(data.files, dirPath);

  if (filesInDir.length === 0) {
    throw new Error(`No files found in directory: ${dirPath}`);
  }

  // Rank files by relevance
  const rankedFiles = rankFilesByRelevance(filesInDir, data.graph);

  // Get external dependents (files outside the directory that import files from it)
  const filePaths = filesInDir.map((f) => f.path);
  const allDependents = getBlastRadius(filePaths, data.graph, data.files);

  // Filter to only external dependents (outside the directory)
  const normalizedDirPath = dirPath.endsWith('/') ? dirPath : `${dirPath}/`;
  const externalDependents = allDependents.filter(
    (file) => !file.path.startsWith(normalizedDirPath)
  );

  // Format and return output
  return formatPathQueryOutput(
    {
      meta: data.meta,
      path: dirPath,
      files: rankedFiles,
      externalDependents,
    },
    config.formatOptions
  );
}

/**
 * Check if repository map exists
 *
 * @param repoMapPath - Path to .repo_map directory
 * @returns True if map exists, false otherwise
 */
export async function hasRepoMap(repoMapPath?: string): Promise<boolean> {
  const mapPath = repoMapPath || join(process.cwd(), '.repo_map');
  try {
    await readFile(join(mapPath, 'meta.json'), 'utf-8');
    return true;
  } catch {
    return false;
  }
}
