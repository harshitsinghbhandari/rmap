/**
 * Level 0 Metadata Harvester
 *
 * Pure script-based metadata extraction (no LLM calls).
 * Recursively walks the file tree, extracts metadata, and collects import statements.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import type { RawFileMetadata, Level0Output } from '../../core/types.js';
import { FILE, OUTPUT } from '../../config/index.js';

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
 * Import statement regex patterns for different languages
 */
const IMPORT_PATTERNS = {
  // JavaScript/TypeScript: import, require, export from
  javascript: [
    /import\s+(?:(?:\*\s+as\s+\w+)|(?:\{[^}]*\})|(?:\w+))\s+from\s+['"]([^'"]+)['"]/g,
    /import\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /export\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g,
  ],
  // Python: import, from ... import
  python: [
    /from\s+([\w.]+)\s+import/g,
    /import\s+([\w.]+)/g,
  ],
  // Go: import
  go: [
    /import\s+['"]([^'"]+)['"]/g,
    /import\s+\w+\s+['"]([^'"]+)['"]/g,
  ],
  // Rust: use
  rust: [
    /use\s+([\w:]+)/g,
  ],
};

/**
 * Extract import statements from file content using regex
 */
function extractImports(content: string, language: string): string[] {
  const imports: string[] = [];
  let patterns: RegExp[] = [];

  // Select appropriate patterns based on language
  if (
    language === 'JavaScript' ||
    language === 'TypeScript'
  ) {
    patterns = IMPORT_PATTERNS.javascript;
  } else if (language === 'Python') {
    patterns = IMPORT_PATTERNS.python;
  } else if (language === 'Go') {
    patterns = IMPORT_PATTERNS.go;
  } else if (language === 'Rust') {
    patterns = IMPORT_PATTERNS.rust;
  }

  // Extract imports using each pattern
  for (const pattern of patterns) {
    let match;
    const regex = new RegExp(pattern);
    while ((match = regex.exec(content)) !== null) {
      if (match[1]) {
        imports.push(match[1]);
      }
    }
  }

  return [...new Set(imports)]; // Remove duplicates
}

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
  return content.split('\n').length;
}

/**
 * Get current git commit hash
 */
function getGitCommit(repoRoot: string): string {
  try {
    const commit = execSync('git rev-parse HEAD', {
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
    const raw_imports = language ? extractImports(content, language) : [];

    return {
      name,
      path: relativePath,
      extension,
      size_bytes,
      line_count,
      language,
      raw_imports,
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
 */
function* walkDirectory(
  dirPath: string,
  repoRoot: string
): Generator<string> {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip directories we don't want to process
        if (shouldSkipDirectory(entry.name)) {
          continue;
        }

        // Recursively walk subdirectories
        yield* walkDirectory(fullPath, repoRoot);
      } else if (entry.isFile()) {
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
 * Main harvester function
 *
 * Recursively scans the repository and extracts metadata for all files.
 * This is a pure script operation with no LLM calls.
 *
 * @param repoRoot - Absolute path to the repository root
 * @returns Level0Output containing all file metadata and git info
 */
export async function harvest(repoRoot: string): Promise<Level0Output> {
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

  // Get git commit
  const git_commit = getGitCommit(repoRoot);
  console.log(`Git commit: ${git_commit}`);

  // Collect all files
  const files: RawFileMetadata[] = [];
  let totalSizeBytes = 0;
  let processedCount = 0;

  // Walk directory tree
  for (const filePath of walkDirectory(repoRoot, repoRoot)) {
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

  return {
    files,
    git_commit,
    timestamp: new Date().toISOString(),
    total_files: files.length,
    total_size_bytes: totalSizeBytes,
  };
}
