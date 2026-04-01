/**
 * Map File Assembler
 *
 * Assembles and writes all .repo_map/ files atomically:
 * - meta.json
 * - annotations.json (all file annotations)
 * - tree/*.json (file annotations organized by directory)
 * - graph.json
 * - tags.json
 * - stats.json
 * - validation.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  FileAnnotation,
  GraphJson,
  MetaJson,
  TagsJson,
  StatsJson,
  ValidationJson,
} from '../core/types.js';
import type { Tag } from '../core/constants.js';
import { TAG_TAXONOMY, TAG_ALIASES, SCHEMA_VERSION } from '../core/constants.js';

/**
 * Options for assembling the map
 */
export interface AssemblerOptions {
  /** Repository root path */
  repoRoot: string;
  /** Output directory (defaults to .repo_map) */
  outputDir?: string;
}

/**
 * Result of the assembly process
 */
export interface AssemblerResult {
  /** Path to the output directory */
  outputPath: string;
  /** Paths to all written files */
  filesWritten: string[];
}

/**
 * Assemble and write all map files
 *
 * @param annotations - File annotations from Level 3
 * @param graph - Dependency graph
 * @param meta - Repository metadata
 * @param stats - Build statistics
 * @param validation - Validation results
 * @param options - Assembly options
 * @returns Paths to written files
 */
export function assembleMap(
  annotations: FileAnnotation[],
  graph: GraphJson,
  meta: MetaJson,
  stats: StatsJson,
  validation: ValidationJson,
  options: AssemblerOptions
): AssemblerResult {
  const { repoRoot, outputDir = '.repo_map' } = options;
  const outputPath = path.join(repoRoot, outputDir);
  const filesWritten: string[] = [];

  // Create output directory structure
  ensureDirectory(outputPath);
  const treeDir = path.join(outputPath, 'tree');
  ensureDirectory(treeDir);

  // Write meta.json
  const metaPath = path.join(outputPath, 'meta.json');
  writeJsonFile(metaPath, meta);
  filesWritten.push(metaPath);

  // Write annotations.json (all file annotations)
  const annotationsPath = path.join(outputPath, 'annotations.json');
  writeJsonFile(annotationsPath, annotations);
  filesWritten.push(annotationsPath);

  // Write graph.json
  const graphPath = path.join(outputPath, 'graph.json');
  writeJsonFile(graphPath, graph);
  filesWritten.push(graphPath);

  // Write tags.json
  const tags = buildTagsIndex(annotations);
  const tagsPath = path.join(outputPath, 'tags.json');
  writeJsonFile(tagsPath, tags);
  filesWritten.push(tagsPath);

  // Write stats.json
  const statsPath = path.join(outputPath, 'stats.json');
  writeJsonFile(statsPath, stats);
  filesWritten.push(statsPath);

  // Write validation.json
  const validationPath = path.join(outputPath, 'validation.json');
  writeJsonFile(validationPath, validation);
  filesWritten.push(validationPath);

  // Write tree/*.json (annotations organized by directory)
  const treePaths = writeTreeFiles(annotations, treeDir);
  filesWritten.push(...treePaths);

  return {
    outputPath,
    filesWritten,
  };
}

/**
 * Build the tags index from annotations
 *
 * @param annotations - File annotations
 * @returns Tags index
 */
function buildTagsIndex(annotations: FileAnnotation[]): TagsJson {
  const index: Record<string, string[]> = {};

  // Initialize index with all taxonomy tags
  for (const tag of TAG_TAXONOMY) {
    index[tag] = [];
  }

  // Populate index with file paths
  for (const annotation of annotations) {
    for (const tag of annotation.tags) {
      if (index[tag]) {
        index[tag].push(annotation.path);
      }
    }
  }

  // Sort file paths in each tag
  for (const tag in index) {
    index[tag].sort();
  }

  return {
    taxonomy_version: SCHEMA_VERSION,
    aliases: TAG_ALIASES,
    index: index as Record<Tag, string[]>,
  };
}

/**
 * Write tree files organized by directory
 *
 * @param annotations - File annotations
 * @param treeDir - Tree directory path
 * @returns Paths to written files
 */
function writeTreeFiles(annotations: FileAnnotation[], treeDir: string): string[] {
  const filesWritten: string[] = [];

  // Group annotations by top-level directory
  const dirMap = new Map<string, FileAnnotation[]>();

  for (const annotation of annotations) {
    const topLevelDir = getTopLevelDir(annotation.path);
    if (!dirMap.has(topLevelDir)) {
      dirMap.set(topLevelDir, []);
    }
    dirMap.get(topLevelDir)!.push(annotation);
  }

  // Write a JSON file for each directory
  for (const [dir, dirAnnotations] of dirMap.entries()) {
    // Sanitize directory name for filename (replace / with _)
    const filename = dir === '.' ? 'root.json' : `${dir.replace(/\//g, '_')}.json`;
    const filepath = path.join(treeDir, filename);

    // Sort annotations by path
    dirAnnotations.sort((a, b) => a.path.localeCompare(b.path));

    writeJsonFile(filepath, dirAnnotations);
    filesWritten.push(filepath);
  }

  return filesWritten;
}

/**
 * Get the top-level directory from a file path
 *
 * @param filepath - File path
 * @returns Top-level directory name
 */
function getTopLevelDir(filepath: string): string {
  const parts = filepath.split('/');
  if (parts.length === 1) {
    return '.'; // Root-level file
  }
  return parts[0];
}

/**
 * Ensure a directory exists, creating it if necessary
 *
 * @param dir - Directory path
 */
function ensureDirectory(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Write a JSON file with pretty formatting
 *
 * @param filepath - File path
 * @param data - Data to write
 */
function writeJsonFile(filepath: string, data: unknown): void {
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(filepath, json + '\n', 'utf8');
}

/**
 * Read existing meta.json if it exists
 *
 * @param repoRoot - Repository root path
 * @returns Existing meta or null
 */
export function readExistingMeta(repoRoot: string): MetaJson | null {
  const metaPath = path.join(repoRoot, '.repo_map', 'meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      const content = fs.readFileSync(metaPath, 'utf8');
      return JSON.parse(content) as MetaJson;
    } catch (error) {
      console.warn(`Warning: Failed to read existing meta.json: ${error}`);
      return null;
    }
  }
  return null;
}
