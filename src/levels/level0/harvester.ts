/**
 * Level 0 Metadata Harvester
 *
 * Pure script-based metadata extraction (no LLM calls).
 * Recursively walks the file tree, extracts metadata, and collects import statements.
 * Respects .rmapignore patterns for excluding files from annotation.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Ignore } from 'ignore';
import type { RawFileMetadata, Level0Output, FileImportData } from '../../core/types.js';
import { FILE, OUTPUT } from '../../config/index.js';
import { extractImports, extractImportData } from './parsers/index.js';
import {
  loadIgnorePatternsSync,
  shouldIgnoreFile,
  type IgnoreStats,
} from '../../core/ignore-patterns.js';

/**
 * Directories to always skip
 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.repo_map',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  'vendor',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  'venv',
  '.venv',
  'target',
  'bin',
  'obj',
]);

/**
 * File extensions that are likely binary (skip these)
 */
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.svg',
  '.webp',
  '.mp4',
  '.mp3',
  '.wav',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.lock',
]);

/**
 * Language detection based on file extension
 */
const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.py': 'Python',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.swift': 'Swift',
  '.c': 'C',
  '.cpp': 'C++',
  '.cc': 'C++',
  '.h': 'C/C++ Header',
  '.hpp': 'C++ Header',
  '.cs': 'C#',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.sh': 'Shell',
  '.bash': 'Bash',
  '.zsh': 'Zsh',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.json': 'JSON',
  '.toml': 'TOML',
  '.xml': 'XML',
  '.html': 'HTML',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.sass': 'Sass',
  '.less': 'Less',
  '.md': 'Markdown',
  '.sql': 'SQL',
  '.graphql': 'GraphQL',
  '.proto': 'Protocol Buffers',
  '.tf': 'Terraform',
};

/**
 * NOTE: Import extraction logic has been moved to src/levels/level0/parsers/
 * for better maintainability and accuracy. The new implementation uses AST-based
 * parsing for JavaScript/TypeScript (via Babel) with regex fallback for other languages.
 */

/**
 * Check if a file is likely binary
 */
function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Check if a directory should be skipped
 */
function shouldSkipDirectory(dirName: string): boolean {
  return SKIP_DIRS.has(dirName) || dirName.startsWith('.');
}

/**
 * Count lines in a string
 */
function countLines(content: string): number {
  let count = 1;
  let pos = content.indexOf('\n');
  while (pos !== -1) {
    count++;
    pos = content.indexOf('\n', pos + 1);
  }
  return count;
}

/**
 * Get current git commit hash
 */
function getGitCommit(repoRoot: string): string {
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    return commit;
  } catch (error) {
    console.warn('Warning: Could not get git commit hash. Not a git repository?');
    return 'unknown';
  }
}

/**
 * Process a single file and extract metadata
 */
function processFile(
  filePath: string,
  repoRoot: string
): RawFileMetadata | null {
  try {
    // Get file stats
    const stats = fs.statSync(filePath);

    // Skip if not a regular file
    if (!stats.isFile()) {
      return null;
    }

    // Check if binary
    if (isBinaryFile(filePath)) {
      return null;
    }

    // Read file content
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (error) {
      // File might be binary despite extension, or encoding issue
      return null;
    }

    // Calculate metadata
    const relativePath = path.relative(repoRoot, filePath);
    const extension = path.extname(filePath);
    const name = path.basename(filePath);
    const size_bytes = stats.size;
    const line_count = countLines(content);

    // Warn about very large files
    if (line_count > FILE.MAX_LINE_COUNT) {
      console.warn(`Warning: Large file detected (${line_count} lines): ${relativePath}`);
    }

    // Detect language
    const language = LANGUAGE_MAP[extension.toLowerCase()];

    // Extract imports if we can detect the language
    const raw_imports = language
      ? extractImports(content, language, relativePath)
      : [];

    // Extract symbol-level import/export data (for JS/TS only)
    let import_data: FileImportData | undefined;
    if (language === 'JavaScript' || language === 'TypeScript') {
      const data = extractImportData(content, language, relativePath);
      if (data) {
        import_data = data;
      }
    }

    return {
      name,
      path: relativePath,
      extension,
      size_bytes,
      line_count,
      language,
      raw_imports,
      import_data,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      console.warn(`Warning: Permission denied: ${filePath}`);
    } else {
      console.warn(`Warning: Error processing file ${filePath}:`, error);
    }
    return null;
  }
}

/**
 * Recursively walk directory tree and collect files
 *
 * @param dirPath - Current directory path being walked
 * @param repoRoot - Root of the repository
 * @param ig - Ignore instance for pattern matching (optional)
 * @param verbose - Whether to log skipped files
 */
function* walkDirectory(
  dirPath: string,
  repoRoot: string,
  ig?: Ignore,
  verbose = false
): Generator<string> {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(repoRoot, fullPath);

      if (entry.isDirectory()) {
        // Skip directories we don't want to process (hard-coded)
        if (shouldSkipDirectory(entry.name)) {
          continue;
        }

        // Check against ignore patterns (directory paths should end with /)
        if (ig && shouldIgnoreFile(ig, relativePath + '/')) {
          if (verbose) {
            console.log(`  Skipped directory: ${relativePath}/ (matched .rmapignore)`);
          }
          continue;
        }

        // Recursively walk subdirectories
        yield* walkDirectory(fullPath, repoRoot, ig, verbose);
      } else if (entry.isFile()) {
        // Check file against ignore patterns
        if (ig && shouldIgnoreFile(ig, relativePath)) {
          if (verbose) {
            console.log(`  Skipped: ${relativePath} (matched .rmapignore)`);
          }
          continue;
        }

        yield fullPath;
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      console.warn(`Warning: Permission denied for directory: ${dirPath}`);
    } else {
      console.warn(`Warning: Error reading directory ${dirPath}:`, error);
    }
  }
}

/**
 * Options for the harvest function
 */
export interface HarvestOptions {
  /**
   * Whether to auto-create .rmapignore if it doesn't exist
   * @default true
   */
  autoCreateIgnoreFile?: boolean;

  /**
   * Whether to log skipped files (verbose mode)
   * @default false
   */
  verbose?: boolean;

  /**
   * Whether to use .rmapignore patterns at all
   * @default true
   */
  useIgnorePatterns?: boolean;
}

/**
 * Extended Level0Output with ignore statistics
 */
export interface Level0OutputWithStats extends Level0Output {
  /**
   * Statistics about files ignored by .rmapignore patterns
   */
  ignoreStats?: IgnoreStats;

  /**
   * Whether a new .rmapignore file was created
   */
  rmapignoreCreated?: boolean;
}

/**
 * Main harvester function
 *
 * Recursively scans the repository and extracts metadata for all files.
 * This is a pure script operation with no LLM calls.
 * Respects .rmapignore patterns for excluding files from annotation.
 *
 * @param repoRoot - Absolute path to the repository root
 * @param options - Options for harvesting behavior
 * @returns Level0Output containing all file metadata and git info
 */
export async function harvest(
  repoRoot: string,
  options: HarvestOptions = {}
): Promise<Level0OutputWithStats> {
  const {
    autoCreateIgnoreFile = true,
    verbose = false,
    useIgnorePatterns = true,
  } = options;

  const startTime = Date.now();

  // Validate repo root exists
  if (!fs.existsSync(repoRoot)) {
    throw new Error(`Repository root does not exist: ${repoRoot}`);
  }

  const stats = fs.statSync(repoRoot);
  if (!stats.isDirectory()) {
    throw new Error(`Repository root is not a directory: ${repoRoot}`);
  }

  console.log('Starting Level 0 metadata harvest...');
  console.log(`Repository: ${repoRoot}`);

  // Load ignore patterns
  let ig: Ignore | undefined;
  let rmapignoreCreated = false;

  if (useIgnorePatterns) {
    const ignoreResult = loadIgnorePatternsSync(repoRoot, {
      autoCreate: autoCreateIgnoreFile,
      verbose,
    });
    ig = ignoreResult.ig;
    rmapignoreCreated = ignoreResult.created;
  }

  // Get git commit
  const git_commit = getGitCommit(repoRoot);
  console.log(`Git commit: ${git_commit}`);

  // Collect all files
  const files: RawFileMetadata[] = [];
  let totalSizeBytes = 0;
  let processedCount = 0;
  let ignoredCount = 0;
  let totalScanned = 0;

  // Walk directory tree
  for (const filePath of walkDirectory(repoRoot, repoRoot, ig, verbose)) {
    totalScanned++;
    const metadata = processFile(filePath, repoRoot);

    if (metadata) {
      files.push(metadata);
      totalSizeBytes += metadata.size_bytes;
      processedCount++;

      // Progress indicator every N files
      if (processedCount % OUTPUT.PROGRESS_UPDATE_INTERVAL_FILES === 0) {
        process.stdout.write(`\rProcessed ${processedCount} files...`);
      }
    }
  }

  // Clear progress line
  if (processedCount > 0) {
    process.stdout.write('\r');
  }

  const endTime = Date.now();
  const durationSeconds = ((endTime - startTime) / 1000).toFixed(2);

  console.log(`✓ Harvested ${files.length} files in ${durationSeconds}s`);
  console.log(`  Total size: ${(totalSizeBytes / 1024 / 1024).toFixed(2)} MB`);

  // Build ignore stats (files that were filtered are already excluded from walkDirectory)
  // We can't get exact ignore counts from the generator, but we report what we have
  const ignoreStats: IgnoreStats = {
    totalChecked: totalScanned,
    ignoredCount: ignoredCount,
    passedCount: totalScanned,
    ignoredPercent: 0,
  };

  return {
    files,
    git_commit,
    timestamp: new Date().toISOString(),
    total_files: files.length,
    total_size_bytes: totalSizeBytes,
    ignoreStats: useIgnorePatterns ? ignoreStats : undefined,
    rmapignoreCreated,
  };
}
