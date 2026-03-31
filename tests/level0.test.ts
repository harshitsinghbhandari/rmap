/**
 * Tests for Level 0 metadata harvester
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { harvest } from '../src/levels/level0/index.js';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

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

test('harvest should extract imports from TypeScript files', async () => {
  const result = await harvest(repoRoot);

  // Find the harvester file itself
  const harvesterFile = result.files.find((f) => f.path.includes('harvester.ts'));

  assert(harvesterFile, 'Should find harvester.ts');
  assert(
    harvesterFile.raw_imports.length > 0,
    'harvester.ts should have imports'
  );

  // Log imports for verification
  console.log(`\nImports found in ${harvesterFile.path}:`);
  console.log(`  ${harvesterFile.raw_imports.join(', ')}`);
});

test('harvest should skip binary files and ignored directories', async () => {
  const result = await harvest(repoRoot);

  // Should not include node_modules files
  const nodeModulesFiles = result.files.filter((f) => f.path.includes('node_modules'));
  assert.strictEqual(nodeModulesFiles.length, 0, 'Should not include node_modules files');

  // Should not include .git directory files (but .gitignore and .gitkeep are OK)
  const gitDirFiles = result.files.filter((f) => f.path.includes('.git/'));
  assert.strictEqual(gitDirFiles.length, 0, 'Should not include .git directory files');

  // Should not include dist files (build output)
  const distFiles = result.files.filter((f) => f.path.includes('dist/'));
  assert.strictEqual(distFiles.length, 0, 'Should not include dist files');
});
