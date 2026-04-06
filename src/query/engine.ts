/**
 * Main query engine for rmap
 *
 * Orchestrates file-based and path-based queries
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  FileAnnotation,
  GraphJson,
  MetaJson,
} from '../core/types.js';
import { ValidationError, FileSystemError } from '../core/index.js';
import {
  filterFilesByPath,
  findFileByPath,
} from './filter.js';
import {
  formatFileQueryOutput,
  formatPathQueryOutput,
  type FormatOptions,
} from './formatter.js';
import {
  getDependents,
  getDependencies,
  rankFilesByRelevance,
} from './ranking.js';
import {
  MetaJsonSchema,
  GraphJsonSchema,
  AnnotationsJsonSchema,
} from './schemas.js';
import { ZodIssue } from 'zod';

/**
 * Format Zod issues into a human-readable string
 */
function formatZodIssues(issues: ZodIssue[]): string {
  return issues
    .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
    .join('\n');
}

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
  files: FileAnnotation[];
}

/**
 * Load repository map files
 *
 * Reads meta.json, graph.json, and reconstructs file annotations
 *
 * @param repoMapPath - Path to .repo_map directory
 * @returns Loaded repository map data
 */
async function loadRepoMap(repoMapPath: string): Promise<RepoMapData> {
  try {
    // Read all map files
    const [metaContent, graphContent, annotationsContent] =
      await Promise.all([
        readFile(join(repoMapPath, 'meta.json'), 'utf-8'),
        readFile(join(repoMapPath, 'graph.json'), 'utf-8'),
        readFile(join(repoMapPath, 'annotations.json'), 'utf-8').catch((err) => {
          if (err.code === 'ENOENT') {
            throw new Error(
              'annotations.json not found. Please rebuild the map with "rmap map --full" to generate complete annotations.'
            );
          }
          throw err;
        }),
      ]);

    // Parse JSON content
    let metaRaw: unknown;
    let graphRaw: unknown;
    let filesRaw: unknown;

    try {
      metaRaw = JSON.parse(metaContent);
    } catch (error) {
      throw new ValidationError(
        `Failed to parse meta.json: ${error instanceof Error ? error.message : 'Invalid JSON'}`,
        error instanceof Error ? error : undefined
      );
    }

    try {
      graphRaw = JSON.parse(graphContent);
    } catch (error) {
      throw new ValidationError(
        `Failed to parse graph.json: ${error instanceof Error ? error.message : 'Invalid JSON'}`,
        error instanceof Error ? error : undefined
      );
    }

    try {
      filesRaw = JSON.parse(annotationsContent);
    } catch (error) {
      throw new ValidationError(
        `Failed to parse annotations.json: ${error instanceof Error ? error.message : 'Invalid JSON'}`,
        error instanceof Error ? error : undefined
      );
    }

    // Validate parsed JSON against schemas
    const metaResult = MetaJsonSchema.safeParse(metaRaw);
    if (!metaResult.success) {
      throw new ValidationError(
        `Invalid meta.json schema:\n${formatZodIssues(metaResult.error.issues)}\n\nPlease rebuild the map with "rmap map --full".`
      );
    }

    const graphResult = GraphJsonSchema.safeParse(graphRaw);
    if (!graphResult.success) {
      throw new ValidationError(
        `Invalid graph.json schema:\n${formatZodIssues(graphResult.error.issues)}\n\nPlease rebuild the map with "rmap map --full".`
      );
    }

    const filesResult = AnnotationsJsonSchema.safeParse(filesRaw);
    if (!filesResult.success) {
      throw new ValidationError(
        `Invalid annotations.json schema:\n${formatZodIssues(filesResult.error.issues)}\n\nPlease rebuild the map with "rmap map --full".`
      );
    }

    const meta = metaResult.data as MetaJson;
    const graph = graphResult.data as GraphJson;
    const files = filesResult.data as FileAnnotation[];

    return { meta, graph, files };
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new FileSystemError(
        'Repository map not found. Run "rmap map" to build the map first',
        repoMapPath,
        error
      );
    }
    throw error;
  }
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
    throw new ValidationError(`File not found in repository map: ${filePath}`);
  }

  // Get dependencies (files this file imports)
  const dependencies = getDependencies(filePath, data.graph, data.files);

  // Get dependents (files that import this file)
  const dependents = getDependents([filePath], data.graph, data.files);

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
    throw new ValidationError(`No files found in directory: ${dirPath}`);
  }

  // Rank files by relevance
  const rankedFiles = rankFilesByRelevance(filesInDir, data.graph);

  // Get external dependents (files outside the directory that import files from it)
  const filePaths = filesInDir.map((f) => f.path);
  const allDependents = getDependents(filePaths, data.graph, data.files);

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
