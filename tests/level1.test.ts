/**
 * Tests for Level 1 structure detector
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { validateLevel1Output, ValidationError } from '../src/levels/level1/validation.js';
import type { Level1Output } from '../src/core/types.js';

test('validateLevel1Output should accept valid structure', () => {
  const validData: Level1Output = {
    repo_name: 'test-repo',
    purpose: 'A test repository for validation',
    stack: 'TypeScript, Node.js',
    languages: ['TypeScript', 'JavaScript'],
    entrypoints: ['src/index.ts'],
    modules: [
      { path: 'src/core', description: 'Core functionality' },
      { path: 'src/cli', description: 'Command-line interface' },
    ],
    config_files: ['package.json', 'tsconfig.json'],
    conventions: ['Uses barrel exports for module organization'],
  };

  const result = validateLevel1Output(validData);

  assert.strictEqual(result.repo_name, 'test-repo');
  assert.strictEqual(result.purpose, 'A test repository for validation');
  assert.strictEqual(result.stack, 'TypeScript, Node.js');
  assert.deepStrictEqual(result.languages, ['TypeScript', 'JavaScript']);
  assert.deepStrictEqual(result.entrypoints, ['src/index.ts']);
  assert.strictEqual(result.modules.length, 2);
  assert.strictEqual(result.config_files.length, 2);
  assert.strictEqual(result.conventions.length, 1);
});

test('validateLevel1Output should reject non-object input', () => {
  assert.throws(
    () => validateLevel1Output(null),
    ValidationError,
    'Should reject null'
  );

  assert.throws(
    () => validateLevel1Output('string'),
    ValidationError,
    'Should reject string'
  );

  assert.throws(
    () => validateLevel1Output(123),
    ValidationError,
    'Should reject number'
  );

  assert.throws(
    () => validateLevel1Output([]),
    ValidationError,
    'Should reject array'
  );
});

test('validateLevel1Output should reject missing required string fields', () => {
  const testCases = [
    { field: 'repo_name', data: { purpose: 'test', stack: 'TypeScript' } },
    { field: 'purpose', data: { repo_name: 'test', stack: 'TypeScript' } },
    { field: 'stack', data: { repo_name: 'test', purpose: 'test' } },
  ];

  for (const { field, data } of testCases) {
    assert.throws(
      () =>
        validateLevel1Output({
          ...data,
          languages: ['TypeScript'],
          entrypoints: [],
          modules: [],
          config_files: [],
          conventions: [],
        }),
      ValidationError,
      `Should reject missing ${field}`
    );
  }
});

test('validateLevel1Output should reject empty string fields', () => {
  assert.throws(
    () =>
      validateLevel1Output({
        repo_name: '',
        purpose: 'test',
        stack: 'test',
        languages: ['TypeScript'],
        entrypoints: [],
        modules: [],
        config_files: [],
        conventions: [],
      }),
    ValidationError,
    'Should reject empty repo_name'
  );

  assert.throws(
    () =>
      validateLevel1Output({
        repo_name: '   ',
        purpose: 'test',
        stack: 'test',
        languages: ['TypeScript'],
        entrypoints: [],
        modules: [],
        config_files: [],
        conventions: [],
      }),
    ValidationError,
    'Should reject whitespace-only repo_name'
  );
});

test('validateLevel1Output should reject invalid languages array', () => {
  assert.throws(
    () =>
      validateLevel1Output({
        repo_name: 'test',
        purpose: 'test',
        stack: 'test',
        languages: 'TypeScript' as any,
        entrypoints: [],
        modules: [],
        config_files: [],
        conventions: [],
      }),
    ValidationError,
    'Should reject non-array languages'
  );

  assert.throws(
    () =>
      validateLevel1Output({
        repo_name: 'test',
        purpose: 'test',
        stack: 'test',
        languages: [123] as any,
        entrypoints: [],
        modules: [],
        config_files: [],
        conventions: [],
      }),
    ValidationError,
    'Should reject non-string language items'
  );

  assert.throws(
    () =>
      validateLevel1Output({
        repo_name: 'test',
        purpose: 'test',
        stack: 'test',
        languages: [],
        entrypoints: [],
        modules: [],
        config_files: [],
        conventions: [],
      }),
    ValidationError,
    'Should reject empty languages array'
  );
});

test('validateLevel1Output should validate entrypoints array', () => {
  assert.throws(
    () =>
      validateLevel1Output({
        repo_name: 'test',
        purpose: 'test',
        stack: 'test',
        languages: ['TypeScript'],
        entrypoints: 'src/index.ts' as any,
        modules: [],
        config_files: [],
        conventions: [],
      }),
    ValidationError,
    'Should reject non-array entrypoints'
  );

  assert.throws(
    () =>
      validateLevel1Output({
        repo_name: 'test',
        purpose: 'test',
        stack: 'test',
        languages: ['TypeScript'],
        entrypoints: [123] as any,
        modules: [],
        config_files: [],
        conventions: [],
      }),
    ValidationError,
    'Should reject non-string entrypoint items'
  );
});

test('validateLevel1Output should validate modules array structure', () => {
  assert.throws(
    () =>
      validateLevel1Output({
        repo_name: 'test',
        purpose: 'test',
        stack: 'test',
        languages: ['TypeScript'],
        entrypoints: [],
        modules: 'src/core' as any,
        config_files: [],
        conventions: [],
      }),
    ValidationError,
    'Should reject non-array modules'
  );

  assert.throws(
    () =>
      validateLevel1Output({
        repo_name: 'test',
        purpose: 'test',
        stack: 'test',
        languages: ['TypeScript'],
        entrypoints: [],
        modules: [{ path: 'src/core' }] as any,
        config_files: [],
        conventions: [],
      }),
    ValidationError,
    'Should reject module without description'
  );

  assert.throws(
    () =>
      validateLevel1Output({
        repo_name: 'test',
        purpose: 'test',
        stack: 'test',
        languages: ['TypeScript'],
        entrypoints: [],
        modules: [{ description: 'Core module' }] as any,
        config_files: [],
        conventions: [],
      }),
    ValidationError,
    'Should reject module without path'
  );

  assert.throws(
    () =>
      validateLevel1Output({
        repo_name: 'test',
        purpose: 'test',
        stack: 'test',
        languages: ['TypeScript'],
        entrypoints: [],
        modules: [{ path: '', description: 'test' }],
        config_files: [],
        conventions: [],
      }),
    ValidationError,
    'Should reject module with empty path'
  );
});

test('validateLevel1Output should validate config_files array', () => {
  assert.throws(
    () =>
      validateLevel1Output({
        repo_name: 'test',
        purpose: 'test',
        stack: 'test',
        languages: ['TypeScript'],
        entrypoints: [],
        modules: [],
        config_files: 'package.json' as any,
        conventions: [],
      }),
    ValidationError,
    'Should reject non-array config_files'
  );

  assert.throws(
    () =>
      validateLevel1Output({
        repo_name: 'test',
        purpose: 'test',
        stack: 'test',
        languages: ['TypeScript'],
        entrypoints: [],
        modules: [],
        config_files: [{ file: 'package.json' }] as any,
        conventions: [],
      }),
    ValidationError,
    'Should reject non-string config_file items'
  );
});

test('validateLevel1Output should validate conventions array', () => {
  assert.throws(
    () =>
      validateLevel1Output({
        repo_name: 'test',
        purpose: 'test',
        stack: 'test',
        languages: ['TypeScript'],
        entrypoints: [],
        modules: [],
        config_files: [],
        conventions: 'Uses barrel exports' as any,
      }),
    ValidationError,
    'Should reject non-array conventions'
  );

  assert.throws(
    () =>
      validateLevel1Output({
        repo_name: 'test',
        purpose: 'test',
        stack: 'test',
        languages: ['TypeScript'],
        entrypoints: [],
        modules: [],
        config_files: [],
        conventions: [123] as any,
      }),
    ValidationError,
    'Should reject non-string convention items'
  );
});

test('validateLevel1Output should accept valid structure with empty arrays', () => {
  const validData = {
    repo_name: 'minimal-repo',
    purpose: 'A minimal repository',
    stack: 'TypeScript',
    languages: ['TypeScript'],
    entrypoints: [],
    modules: [],
    config_files: [],
    conventions: [],
  };

  const result = validateLevel1Output(validData);

  assert.strictEqual(result.repo_name, 'minimal-repo');
  assert.strictEqual(result.entrypoints.length, 0);
  assert.strictEqual(result.modules.length, 0);
  assert.strictEqual(result.config_files.length, 0);
  assert.strictEqual(result.conventions.length, 0);
});

test('validateLevel1Output should accept structure with multiple modules', () => {
  const validData = {
    repo_name: 'complex-repo',
    purpose: 'A complex repository with many modules',
    stack: 'TypeScript, React, Node.js',
    languages: ['TypeScript', 'JavaScript'],
    entrypoints: ['src/index.ts', 'src/cli/index.ts'],
    modules: [
      { path: 'src/core', description: 'Core functionality' },
      { path: 'src/cli', description: 'CLI commands' },
      { path: 'src/levels', description: 'Level implementations' },
      { path: 'src/query', description: 'Query engine' },
    ],
    config_files: ['package.json', 'tsconfig.json', '.gitignore'],
    conventions: [
      'Uses barrel exports for module organization',
      'Test files use .test.ts suffix',
      'All modules export through index.ts',
    ],
  };

  const result = validateLevel1Output(validData);

  assert.strictEqual(result.modules.length, 4);
  assert.strictEqual(result.conventions.length, 3);
  assert.strictEqual(result.entrypoints.length, 2);
});
