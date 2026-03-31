/**
 * Delta Update Re-annotation
 *
 * Re-runs Level 3 annotation only on changed files for fast incremental updates.
 * Handles file additions, modifications, and deletions without re-processing
 * the entire codebase.
 */

import type {
  FileAnnotation,
  RawFileMetadata,
  Level0Output,
  DelegationTask,
} from '../core/types.js';
import { annotateTask } from '../levels/level3/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Options for delta update
 */
export interface DeltaUpdateOptions {
  /** Repository root path */
  repoRoot: string;
  /** Files that were changed or added */
  changedFiles: string[];
  /** Files that were deleted */
  deletedFiles: string[];
  /** Existing annotations to update */
  existingAnnotations: FileAnnotation[];
  /** Level 0 metadata for all files */
  level0Data: Level0Output;
  /** Run annotation tasks in parallel */
  parallel?: boolean;
}

/**
 * Result of delta update
 */
export interface DeltaUpdateResult {
  /** Updated annotations (includes unchanged files) */
  annotations: FileAnnotation[];
  /** Number of files re-annotated */
  filesReAnnotated: number;
  /** Number of files removed */
  filesRemoved: number;
  /** Number of files kept unchanged */
  filesKept: number;
}

/**
 * Perform delta update on changed files
 *
 * Re-annotates only the changed files while keeping existing annotations
 * for unchanged files. Removes annotations for deleted files.
 *
 * @param options - Delta update options
 * @returns Updated annotations with statistics
 */
export async function performDeltaUpdate(
  options: DeltaUpdateOptions
): Promise<DeltaUpdateResult> {
  const {
    repoRoot,
    changedFiles,
    deletedFiles,
    existingAnnotations,
    level0Data,
    parallel = true,
  } = options;

  console.log(`\n🔄 Delta Update:`);
  console.log(`   • Changed: ${changedFiles.length} files`);
  console.log(`   • Deleted: ${deletedFiles.length} files`);

  // Create a map of existing annotations by path for quick lookup
  const annotationMap = new Map<string, FileAnnotation>();
  for (const annotation of existingAnnotations) {
    annotationMap.set(annotation.path, annotation);
  }

  // Remove deleted files from annotations (no LLM needed)
  const deletedSet = new Set(deletedFiles);
  for (const deletedPath of deletedFiles) {
    annotationMap.delete(deletedPath);
  }

  // Re-annotate changed files
  let newAnnotations: FileAnnotation[] = [];

  if (changedFiles.length > 0) {
    console.log(`\n📝 Re-annotating ${changedFiles.length} changed files...`);

    // Create a delegation task for the changed files
    const task: DelegationTask = {
      scope: 'delta-update',
      agent_size: changedFiles.length < 10 ? 'small' : 'medium',
      estimated_files: changedFiles.length,
    };

    // Filter Level 0 data to only include changed files
    const changedFileSet = new Set(changedFiles);
    const relevantMetadata = level0Data.files.filter((file) => changedFileSet.has(file.path));

    try {
      // Re-annotate the changed files
      newAnnotations = await annotateTask(task, relevantMetadata, repoRoot);
      console.log(`   ✓ Re-annotated ${newAnnotations.length} files`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Delta update failed: ${message}`);
    }
  }

  // Merge new annotations with existing ones
  for (const annotation of newAnnotations) {
    annotationMap.set(annotation.path, annotation);
  }

  // Convert map back to array and sort by path
  const updatedAnnotations = Array.from(annotationMap.values()).sort((a, b) =>
    a.path.localeCompare(b.path)
  );

  return {
    annotations: updatedAnnotations,
    filesReAnnotated: newAnnotations.length,
    filesRemoved: deletedFiles.length,
    filesKept: existingAnnotations.length - deletedFiles.length - changedFiles.length,
  };
}

/**
 * Remove deleted files from annotations (script-based, no LLM)
 *
 * This is a pure utility function that removes annotations for deleted files.
 *
 * @param annotations - Current annotations
 * @param deletedPaths - Paths of deleted files
 * @returns Filtered annotations
 */
export function removeDeletedFiles(
  annotations: FileAnnotation[],
  deletedPaths: string[]
): FileAnnotation[] {
  const deletedSet = new Set(deletedPaths);
  return annotations.filter((annotation) => !deletedSet.has(annotation.path));
}

/**
 * Read existing annotations from .repo_map/tree/*.json files
 *
 * @param repoRoot - Repository root path
 * @returns Array of all existing annotations
 */
export function readExistingAnnotations(repoRoot: string): FileAnnotation[] {
  const treeDir = path.join(repoRoot, '.repo_map', 'tree');

  if (!fs.existsSync(treeDir)) {
    return [];
  }

  const annotations: FileAnnotation[] = [];

  try {
    const files = fs.readdirSync(treeDir);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(treeDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const treeAnnotations = JSON.parse(content) as FileAnnotation[];

      annotations.push(...treeAnnotations);
    }

    return annotations;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Warning: Failed to read existing annotations: ${message}`);
    return [];
  }
}

/**
 * Filter Level 0 metadata to only include changed files
 *
 * @param level0Data - Complete Level 0 output
 * @param changedFiles - List of changed file paths
 * @returns Filtered Level 0 output with only changed files
 */
export function filterLevel0Data(
  level0Data: Level0Output,
  changedFiles: string[]
): Level0Output {
  const changedSet = new Set(changedFiles);

  const filteredFiles = level0Data.files.filter((file) => changedSet.has(file.path));

  return {
    ...level0Data,
    files: filteredFiles,
    total_files: filteredFiles.length,
    total_size_bytes: filteredFiles.reduce((sum, file) => sum + file.size_bytes, 0),
  };
}
