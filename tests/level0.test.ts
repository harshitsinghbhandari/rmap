/**
 * Comprehensive tests for Level 0 metadata harvester
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { harvest } from '../src/levels/level0/index.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

describe('Level 0 Harvester - Full Integration', () => {
  test('harvest should collect metadata from repository', async () => {
    const result = await harvest(repoRoot);

    // Verify basic structure
    assert(result.files, 'Result should have files array');
    assert(result.git_commit, 'Result should have git_commit');
    assert(result.timestamp, 'Result should have timestamp');
    assert.strictEqual(typeof result.total_files, 'number', 'total_files should be a number');
    assert.strictEqual(
      typeof result.total_size_bytes,
      'number',
      'total_size_bytes should be a number'
    );

    // Verify we found some files
    assert(result.files.length > 0, 'Should find at least one file');
    assert(result.total_files === result.files.length, 'total_files should match files.length');

    // Verify file metadata structure
    const firstFile = result.files[0];
    assert(firstFile.name, 'File should have name');
    assert(firstFile.path, 'File should have path');
    assert(typeof firstFile.extension === 'string', 'File should have extension as string');
    assert(typeof firstFile.size_bytes === 'number', 'File should have size_bytes as number');
    assert(typeof firstFile.line_count === 'number', 'File should have line_count as number');
    assert(Array.isArray(firstFile.raw_imports), 'File should have raw_imports array');

    // Verify we can find our own test file
    const testFile = result.files.find((f) => f.path.includes('level0.test.ts'));
    assert(testFile, 'Should find this test file');

    // Verify TypeScript files are detected
    const tsFiles = result.files.filter((f) => f.language === 'TypeScript');
    assert(tsFiles.length > 0, 'Should find TypeScript files');

    // Log summary for visibility
    console.log('\nLevel 0 Harvest Summary:');
    console.log(`  Files found: ${result.total_files}`);
    console.log(`  Total size: ${(result.total_size_bytes / 1024).toFixed(2)} KB`);
    console.log(`  Git commit: ${result.git_commit}`);

    const languages = [...new Set(result.files.map((f) => f.language).filter(Boolean))];
    console.log(`  Languages detected: ${languages.join(', ')}`);
  });

  test('harvest should handle non-existent directory', async () => {
    const nonExistentPath = path.join(repoRoot, 'does-not-exist-' + Date.now());

    await assert.rejects(
      async () => await harvest(nonExistentPath),
      /does not exist/,
      'Should throw error for non-existent directory'
    );
  });

  test('harvest should handle file path instead of directory', async () => {
    const filePath = path.join(repoRoot, 'package.json');

    await assert.rejects(
      async () => await harvest(filePath),
      /not a directory/,
      'Should throw error when given a file instead of directory'
    );
  });
});

describe('Level 0 Harvester - File Discovery', () => {
  test('should find TypeScript source files', async () => {
    const result = await harvest(repoRoot);
    const tsFiles = result.files.filter((f) => f.extension === '.ts');

    assert(tsFiles.length > 0, 'Should find TypeScript files');

    // Verify we find core files
    const coreFiles = tsFiles.filter((f) => f.path.startsWith('src/'));
    assert(coreFiles.length > 0, 'Should find TypeScript files in src/');
  });

  test('should find test files', async () => {
    const result = await harvest(repoRoot);
    const testFiles = result.files.filter((f) => f.path.startsWith('tests/'));

    assert(testFiles.length > 0, 'Should find test files');
  });

  test('should find configuration files', async () => {
    const result = await harvest(repoRoot);
    const hasPackageJson = result.files.some((f) => f.name === 'package.json');
    const hasTsConfig = result.files.some((f) => f.name === 'tsconfig.json');

    assert(hasPackageJson, 'Should find package.json');
    assert(hasTsConfig, 'Should find tsconfig.json');
  });
});

describe('Level 0 Harvester - Directory Skipping', () => {
  test('should skip node_modules directory', async () => {
    const result = await harvest(repoRoot);

    const nodeModulesFiles = result.files.filter((f) => f.path.includes('node_modules'));
    assert.strictEqual(nodeModulesFiles.length, 0, 'Should not include node_modules files');
  });

  test('should skip .git directory', async () => {
    const result = await harvest(repoRoot);

    const gitDirFiles = result.files.filter((f) => f.path.includes('.git/'));
    assert.strictEqual(gitDirFiles.length, 0, 'Should not include .git directory files');
  });

  test('should skip dist directory', async () => {
    const result = await harvest(repoRoot);

    const distFiles = result.files.filter((f) => f.path.includes('dist/'));
    assert.strictEqual(distFiles.length, 0, 'Should not include dist files');
  });

  test('should skip build directory', async () => {
    const result = await harvest(repoRoot);

    const buildFiles = result.files.filter((f) => f.path.includes('build/'));
    assert.strictEqual(buildFiles.length, 0, 'Should not include build files');
  });

  test('should skip coverage directory', async () => {
    const result = await harvest(repoRoot);

    const coverageFiles = result.files.filter((f) => f.path.includes('coverage/'));
    assert.strictEqual(coverageFiles.length, 0, 'Should not include coverage files');
  });
});

describe('Level 0 Harvester - Binary File Handling', () => {
  test('should skip lock files', async () => {
    const result = await harvest(repoRoot);

    // Lock files like pnpm-lock.yaml should exist but shouldn't be in results if binary
    // Actually, .lock extension is in BINARY_EXTENSIONS
    const lockFiles = result.files.filter((f) => f.extension === '.lock');
    assert.strictEqual(lockFiles.length, 0, 'Should skip .lock files');
  });

  test('should skip image files if present', async () => {
    const result = await harvest(repoRoot);

    const imageFiles = result.files.filter((f) =>
      ['.png', '.jpg', '.jpeg', '.gif', '.svg'].includes(f.extension.toLowerCase())
    );
    assert.strictEqual(imageFiles.length, 0, 'Should skip image files');
  });
});

describe('Level 0 Harvester - Metadata Extraction', () => {
  test('should extract correct metadata for known file', async () => {
    const result = await harvest(repoRoot);
    const packageJson = result.files.find((f) => f.name === 'package.json');

    assert(packageJson, 'Should find package.json');
    assert.strictEqual(packageJson.name, 'package.json');
    assert.strictEqual(packageJson.extension, '.json');
    assert.strictEqual(packageJson.language, 'JSON');
    assert(packageJson.size_bytes > 0, 'Should have non-zero size');
    assert(packageJson.line_count > 0, 'Should have line count');
  });

  test('should calculate file sizes correctly', async () => {
    const result = await harvest(repoRoot);

    for (const file of result.files) {
      assert(file.size_bytes >= 0, `File ${file.path} should have non-negative size`);

      // Verify size matches actual file size
      const actualSize = fs.statSync(path.join(repoRoot, file.path)).size;
      assert.strictEqual(
        file.size_bytes,
        actualSize,
        `File ${file.path} size should match actual file size`
      );
    }
  });

  test('should count lines correctly', async () => {
    const result = await harvest(repoRoot);

    for (const file of result.files) {
      assert(file.line_count > 0, `File ${file.path} should have at least 1 line`);

      // Verify line count is reasonable (not negative, not absurdly large)
      assert(
        file.line_count < 1000000,
        `File ${file.path} line count seems unreasonable: ${file.line_count}`
      );
    }
  });

  test('should extract relative paths correctly', async () => {
    const result = await harvest(repoRoot);

    for (const file of result.files) {
      // All paths should be relative (not absolute)
      assert(!path.isAbsolute(file.path), `Path should be relative: ${file.path}`);

      // Paths should not start with .. or contain ..
      assert(!file.path.startsWith('..'), `Path should not escape repo root: ${file.path}`);
      assert(!file.path.includes('/../'), `Path should not contain ..: ${file.path}`);
    }
  });
});

describe('Level 0 Harvester - Language Detection', () => {
  test('should detect TypeScript files', async () => {
    const result = await harvest(repoRoot);
    const tsFiles = result.files.filter((f) => ['.ts', '.tsx'].includes(f.extension));

    for (const file of tsFiles) {
      assert.strictEqual(file.language, 'TypeScript', `${file.path} should be TypeScript`);
    }
  });

  test('should detect JavaScript files', async () => {
    const result = await harvest(repoRoot);
    const jsFiles = result.files.filter((f) =>
      ['.js', '.jsx', '.mjs', '.cjs'].includes(f.extension)
    );

    for (const file of jsFiles) {
      assert.strictEqual(file.language, 'JavaScript', `${file.path} should be JavaScript`);
    }
  });

  test('should detect JSON files', async () => {
    const result = await harvest(repoRoot);
    const jsonFiles = result.files.filter((f) => f.extension === '.json');

    for (const file of jsonFiles) {
      assert.strictEqual(file.language, 'JSON', `${file.path} should be JSON`);
    }
  });

  test('should detect YAML files', async () => {
    const result = await harvest(repoRoot);
    const yamlFiles = result.files.filter((f) => ['.yaml', '.yml'].includes(f.extension));

    for (const file of yamlFiles) {
      assert.strictEqual(file.language, 'YAML', `${file.path} should be YAML`);
    }
  });

  test('should detect Markdown files', async () => {
    const result = await harvest(repoRoot);
    const mdFiles = result.files.filter((f) => f.extension === '.md');

    for (const file of mdFiles) {
      assert.strictEqual(file.language, 'Markdown', `${file.path} should be Markdown`);
    }
  });
});

describe('Level 0 Harvester - Import Extraction', () => {
  test('should extract imports from TypeScript files', async () => {
    const result = await harvest(repoRoot);

    // Find the harvester file itself
    const harvesterFile = result.files.find((f) => f.path.includes('harvester.ts'));

    assert(harvesterFile, 'Should find harvester.ts');
    assert(
      harvesterFile.raw_imports.length > 0,
      'harvester.ts should have imports'
    );

    // Should have node imports
    const hasNodeImports = harvesterFile.raw_imports.some((imp) => imp.startsWith('node:'));
    assert(hasNodeImports, 'harvester.ts should have node: imports');

    // Log imports for verification
    console.log(`\nImports found in ${harvesterFile.path}:`);
    console.log(`  ${harvesterFile.raw_imports.join(', ')}`);
  });

  test('should extract imports from test files', async () => {
    const result = await harvest(repoRoot);

    const testFile = result.files.find((f) => f.path.includes('constants.test.ts'));
    assert(testFile, 'Should find constants.test.ts');

    // Should have imports from node:test and node:assert
    const hasTestImports = testFile.raw_imports.some((imp) => imp === 'node:test');
    const hasAssertImports = testFile.raw_imports.some((imp) => imp === 'node:assert');

    assert(hasTestImports, 'Test file should import node:test');
    assert(hasAssertImports, 'Test file should import node:assert');
  });

  test('should deduplicate imports', async () => {
    const result = await harvest(repoRoot);

    for (const file of result.files) {
      const uniqueImports = new Set(file.raw_imports);
      assert.strictEqual(
        file.raw_imports.length,
        uniqueImports.size,
        `File ${file.path} should have unique imports`
      );
    }
  });

  test('should extract relative imports', async () => {
    const result = await harvest(repoRoot);

    // CLI commands should import from other local files
    const cliFile = result.files.find((f) => f.path.includes('cli/index.ts'));
    if (cliFile) {
      const hasRelativeImports = cliFile.raw_imports.some((imp) => imp.startsWith('.'));
      assert(
        hasRelativeImports,
        'CLI index should have relative imports'
      );
    }
  });
});

describe('Level 0 Harvester - Git Integration', () => {
  test('should extract git commit hash', async () => {
    const result = await harvest(repoRoot);

    assert(result.git_commit, 'Should have git commit');
    assert(typeof result.git_commit === 'string', 'Git commit should be a string');

    // Commit hash should be 40 characters (SHA-1) or 'unknown'
    if (result.git_commit !== 'unknown') {
      assert(
        result.git_commit.length === 40,
        `Git commit should be 40 characters, got: ${result.git_commit}`
      );

      // Should be hexadecimal
      assert(
        /^[0-9a-f]{40}$/.test(result.git_commit),
        'Git commit should be hexadecimal'
      );
    }
  });

  test('should include timestamp', async () => {
    const result = await harvest(repoRoot);

    assert(result.timestamp, 'Should have timestamp');
    assert(typeof result.timestamp === 'string', 'Timestamp should be a string');

    // Should be valid ISO 8601 timestamp
    const date = new Date(result.timestamp);
    assert(!isNaN(date.getTime()), 'Timestamp should be valid ISO 8601 date');
  });
});

describe('Level 0 Harvester - Statistics', () => {
  test('should calculate total files correctly', async () => {
    const result = await harvest(repoRoot);

    assert.strictEqual(
      result.total_files,
      result.files.length,
      'total_files should equal files.length'
    );
  });

  test('should calculate total size correctly', async () => {
    const result = await harvest(repoRoot);

    const calculatedSize = result.files.reduce((sum, file) => sum + file.size_bytes, 0);
    assert.strictEqual(
      result.total_size_bytes,
      calculatedSize,
      'total_size_bytes should equal sum of all file sizes'
    );
  });

  test('should process reasonable number of files', async () => {
    const result = await harvest(repoRoot);

    // For this small project, expect at least 10 files and less than 1000
    assert(result.total_files >= 10, 'Should find at least 10 files');
    assert(result.total_files < 1000, 'Should not find excessive files (check SKIP_DIRS)');
  });
});

describe('Level 0 Harvester - Edge Cases', () => {
  test('should handle empty files', async () => {
    const result = await harvest(repoRoot);

    // .gitkeep files are often empty
    const gitkeepFiles = result.files.filter((f) => f.name === '.gitkeep');

    for (const file of gitkeepFiles) {
      assert(file.size_bytes >= 0, 'Empty file should have size 0');
      assert(file.line_count >= 0, 'Empty file should have line count >= 0');
      assert(Array.isArray(file.raw_imports), 'Empty file should have imports array');
    }
  });

  test('should handle files with no imports', async () => {
    const result = await harvest(repoRoot);

    // Version file should have no imports
    const versionFile = result.files.find((f) => f.path.includes('version.ts'));
    if (versionFile) {
      assert(Array.isArray(versionFile.raw_imports), 'Should have raw_imports array');
      assert.strictEqual(
        versionFile.raw_imports.length,
        0,
        'Version file should have no imports'
      );
    }
  });

  test('should handle files in nested directories', async () => {
    const result = await harvest(repoRoot);

    // CLI commands are nested in src/cli/commands/
    const nestedFiles = result.files.filter((f) => f.path.includes('cli/commands/'));
    assert(nestedFiles.length > 0, 'Should find files in nested directories');
  });
});
