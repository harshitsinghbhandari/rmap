/**
 * Incremental annotation persistence for Level 3
 *
 * Provides functions to save annotations incrementally (JSONL format)
 * to enable resilient checkpoint-resume behavior.
 */

import * as fs from 'node:fs/promises';
import path from 'node:path';
import type { FileAnnotation } from '../core/types.js';
import { CHECKPOINT_DIR, CHECKPOINT_FILES } from '../core/constants.js';

/**
 * Get path to incremental annotations file
 */
function getIncrementalPath(repoRoot: string): string {
  return path.join(repoRoot, '.repo_map', CHECKPOINT_DIR, CHECKPOINT_FILES.LEVEL3_INCREMENTAL);
}

/**
 * Get path to final annotations file
 */
function getFinalPath(repoRoot: string): string {
  return path.join(repoRoot, '.repo_map', 'annotations.json');
}

/**
 * Append annotations to incremental JSONL file
 *
 * Each annotation is written as a single line of JSON, making it safe to append
 * without loading the entire file into memory.
 *
 * @param repoRoot - Repository root directory
 * @param annotations - Annotations to append
 */
export async function appendAnnotationsToFile(
  repoRoot: string,
  annotations: FileAnnotation[]
): Promise<void> {
  if (annotations.length === 0) {
    return;
  }

  const filePath = getIncrementalPath(repoRoot);

  // Ensure checkpoint directory exists
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // Convert annotations to JSONL (one JSON object per line)
  const lines = annotations.map((a) => JSON.stringify(a)).join('\n') + '\n';

  // Append to file
  await fs.appendFile(filePath, lines, 'utf-8');
}

/**
 * Load all annotations from incremental JSONL file
 *
 * Parses each line individually and skips malformed lines (e.g., from interrupted writes)
 * to ensure resume remains robust even if the file is corrupted.
 *
 * @param repoRoot - Repository root directory
 * @returns Array of annotations, or empty array if file doesn't exist
 */
export async function loadIncrementalAnnotations(repoRoot: string): Promise<FileAnnotation[]> {
  const filePath = getIncrementalPath(repoRoot);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const trimmed = content.trim();

    if (!trimmed) {
      return [];
    }

    const lines = trimmed.split('\n');
    const annotations: FileAnnotation[] = [];

    // Parse each line individually with error handling for robustness
    for (const line of lines) {
      try {
        const annotation = JSON.parse(line) as FileAnnotation;
        annotations.push(annotation);
      } catch (parseErr) {
        // Skip malformed lines (e.g., truncated final line from interrupted write)
        console.warn(`Skipping malformed line in incremental annotations: ${parseErr}`);
      }
    }

    return annotations;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/**
 * Consolidate incremental annotations into final annotations.json
 *
 * Reads all annotations from the JSONL file and writes them to the final
 * annotations.json file in standard JSON format.
 *
 * @param repoRoot - Repository root directory
 */
export async function finalizeAnnotations(repoRoot: string): Promise<void> {
  const annotations = await loadIncrementalAnnotations(repoRoot);
  const finalPath = getFinalPath(repoRoot);

  await fs.writeFile(finalPath, JSON.stringify(annotations, null, 2), 'utf-8');
}

/**
 * Clear incremental annotations file
 *
 * Deletes the JSONL file to start fresh. Called when starting a new Level 3 run.
 *
 * @param repoRoot - Repository root directory
 */
export async function clearIncrementalAnnotations(repoRoot: string): Promise<void> {
  const filePath = getIncrementalPath(repoRoot);

  try {
    await fs.unlink(filePath);
  } catch (err) {
    // Ignore if file doesn't exist
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw err;
    }
  }
}

/**
 * Get count of annotations in incremental file
 *
 * Reads the file and counts valid JSONL lines.
 *
 * @param repoRoot - Repository root directory
 * @returns Number of annotations saved
 */
export async function getIncrementalAnnotationCount(repoRoot: string): Promise<number> {
  const filePath = getIncrementalPath(repoRoot);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const trimmed = content.trim();

    if (!trimmed) {
      return 0;
    }

    return trimmed.split('\n').length;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0;
    }
    throw err;
  }
}
