/**
 * Ignore Patterns Module
 *
 * Handles loading and parsing .rmapignore files for excluding files from annotation.
 * Uses the 'ignore' package for gitignore-compatible pattern matching.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ignore, { type Ignore } from 'ignore';
import {
  DEFAULT_RMAPIGNORE,
  ALWAYS_IGNORE_PATTERNS,
} from '../config/rmapignore-defaults.js';

/**
 * Default filename for the ignore file
 */
export const RMAPIGNORE_FILENAME = '.rmapignore';

/**
 * Options for loading ignore patterns
 */
export interface LoadIgnorePatternsOptions {
  /**
   * Whether to auto-create .rmapignore if it doesn't exist
   * @default true
   */
  autoCreate?: boolean;

  /**
   * Whether to log when files are skipped (verbose mode)
   * @default false
   */
  verbose?: boolean;
}

/**
 * Result of loading ignore patterns
 */
export interface IgnorePatternsResult {
  /**
   * The ignore instance for checking files
   */
  ig: Ignore;

  /**
   * Whether a new .rmapignore file was created
   */
  created: boolean;

  /**
   * Path to the .rmapignore file
   */
  ignoreFilePath: string;
}

/**
 * Load and parse .rmapignore file from the repository root
 *
 * If the file doesn't exist and autoCreate is true, creates a default .rmapignore file.
 *
 * @param repoRoot - Absolute path to the repository root
 * @param options - Options for loading ignore patterns
 * @returns The ignore instance and metadata about the load operation
 */
export async function loadIgnorePatterns(
  repoRoot: string,
  options: LoadIgnorePatternsOptions = {}
): Promise<IgnorePatternsResult> {
  const { autoCreate = true } = options;

  const ignoreFilePath = path.join(repoRoot, RMAPIGNORE_FILENAME);
  const ig = ignore();

  // Always ignore internal rmap directories
  ig.add(ALWAYS_IGNORE_PATTERNS);

  let created = false;

  try {
    // Try to read existing .rmapignore file
    const content = fs.readFileSync(ignoreFilePath, 'utf-8');
    ig.add(content);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;

    if (error.code === 'ENOENT') {
      // File doesn't exist
      if (autoCreate) {
        // Create default .rmapignore file
        try {
          fs.writeFileSync(ignoreFilePath, DEFAULT_RMAPIGNORE, 'utf-8');
          console.log(
            `Created ${RMAPIGNORE_FILENAME} with default patterns. Customize as needed.`
          );
          created = true;
          ig.add(DEFAULT_RMAPIGNORE);
        } catch (writeErr) {
          // If we can't write, just use the defaults in memory
          console.warn(
            `Warning: Could not create ${RMAPIGNORE_FILENAME}: ${(writeErr as Error).message}`
          );
          ig.add(DEFAULT_RMAPIGNORE);
        }
      } else {
        // No file and autoCreate is false, use defaults in memory
        ig.add(DEFAULT_RMAPIGNORE);
      }
    } else if (error.code === 'EACCES') {
      // Permission denied - use defaults
      console.warn(
        `Warning: Permission denied reading ${RMAPIGNORE_FILENAME}. Using default patterns.`
      );
      ig.add(DEFAULT_RMAPIGNORE);
    } else {
      // Other error - re-throw
      throw err;
    }
  }

  return { ig, created, ignoreFilePath };
}

/**
 * Synchronous version of loadIgnorePatterns
 *
 * @param repoRoot - Absolute path to the repository root
 * @param options - Options for loading ignore patterns
 * @returns The ignore instance and metadata about the load operation
 */
export function loadIgnorePatternsSync(
  repoRoot: string,
  options: LoadIgnorePatternsOptions = {}
): IgnorePatternsResult {
  const { autoCreate = true } = options;

  const ignoreFilePath = path.join(repoRoot, RMAPIGNORE_FILENAME);
  const ig = ignore();

  // Always ignore internal rmap directories
  ig.add(ALWAYS_IGNORE_PATTERNS);

  let created = false;

  try {
    // Try to read existing .rmapignore file
    const content = fs.readFileSync(ignoreFilePath, 'utf-8');
    ig.add(content);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;

    if (error.code === 'ENOENT') {
      // File doesn't exist
      if (autoCreate) {
        // Create default .rmapignore file
        try {
          fs.writeFileSync(ignoreFilePath, DEFAULT_RMAPIGNORE, 'utf-8');
          console.log(
            `Created ${RMAPIGNORE_FILENAME} with default patterns. Customize as needed.`
          );
          created = true;
          ig.add(DEFAULT_RMAPIGNORE);
        } catch (writeErr) {
          // If we can't write, just use the defaults in memory
          console.warn(
            `Warning: Could not create ${RMAPIGNORE_FILENAME}: ${(writeErr as Error).message}`
          );
          ig.add(DEFAULT_RMAPIGNORE);
        }
      } else {
        // No file and autoCreate is false, use defaults in memory
        ig.add(DEFAULT_RMAPIGNORE);
      }
    } else if (error.code === 'EACCES') {
      // Permission denied - use defaults
      console.warn(
        `Warning: Permission denied reading ${RMAPIGNORE_FILENAME}. Using default patterns.`
      );
      ig.add(DEFAULT_RMAPIGNORE);
    } else {
      // Other error - re-throw
      throw err;
    }
  }

  return { ig, created, ignoreFilePath };
}

/**
 * Check if a file should be ignored based on the ignore patterns
 *
 * @param ig - The ignore instance
 * @param filePath - Relative path to the file (from repo root)
 * @returns true if the file should be ignored, false otherwise
 */
export function shouldIgnoreFile(ig: Ignore, filePath: string): boolean {
  // Normalize path separators for cross-platform compatibility
  const normalizedPath = filePath.replace(/\\/g, '/');
  return ig.ignores(normalizedPath);
}

/**
 * Create an ignore instance from a list of patterns
 *
 * Useful for testing or when you have patterns from a different source.
 *
 * @param patterns - Array of gitignore-style patterns
 * @param includeDefaults - Whether to include the default .rmapignore patterns
 * @returns The ignore instance
 */
export function createIgnoreFromPatterns(
  patterns: string[],
  includeDefaults = false
): Ignore {
  const ig = ignore();

  // Always ignore internal rmap directories
  ig.add(ALWAYS_IGNORE_PATTERNS);

  if (includeDefaults) {
    ig.add(DEFAULT_RMAPIGNORE);
  }

  ig.add(patterns);
  return ig;
}

/**
 * Statistics about ignored files
 */
export interface IgnoreStats {
  /**
   * Total files checked
   */
  totalChecked: number;

  /**
   * Number of files ignored
   */
  ignoredCount: number;

  /**
   * Number of files passed (not ignored)
   */
  passedCount: number;

  /**
   * Percentage of files ignored
   */
  ignoredPercent: number;
}

/**
 * Create an ignore filter function that tracks statistics
 *
 * @param ig - The ignore instance
 * @param options - Options including verbose mode
 * @returns A filter function and a way to get stats
 */
export function createIgnoreFilter(
  ig: Ignore,
  options: { verbose?: boolean } = {}
): {
  filter: (filePath: string) => boolean;
  getStats: () => IgnoreStats;
} {
  const stats = {
    totalChecked: 0,
    ignoredCount: 0,
    passedCount: 0,
  };

  const filter = (filePath: string): boolean => {
    stats.totalChecked++;

    if (shouldIgnoreFile(ig, filePath)) {
      stats.ignoredCount++;
      if (options.verbose) {
        console.log(`  Skipped: ${filePath} (matched .rmapignore)`);
      }
      return false; // Filter out (don't include)
    }

    stats.passedCount++;
    return true; // Include
  };

  const getStats = (): IgnoreStats => ({
    ...stats,
    ignoredPercent:
      stats.totalChecked > 0
        ? Math.round((stats.ignoredCount / stats.totalChecked) * 100)
        : 0,
  });

  return { filter, getStats };
}
