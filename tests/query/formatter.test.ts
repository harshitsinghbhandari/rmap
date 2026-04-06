/**
 * Tests for query output formatter
 *
 * Tests formatting of query results for file, and path queries
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  formatQueryOutput,
  formatFileQueryOutput,
  formatPathQueryOutput,
  type FormatOptions,
} from '../../src/query/formatter.js';
import type { FileAnnotation, MetaJson } from '../../src/core/types.js';
import type { FileScore } from '../../src/query/ranking.js';

// Test data
const mockMeta: MetaJson = {
  schema_version: '1.0',
  map_version: 1,
  git_commit: 'abc123',
  created_at: '2024-01-01T00:00:00Z',
  last_updated: '2024-01-01T00:00:00Z',
  parent_version: null,
  update_type: 'full',
  files_changed: null,
  repo_name: 'test-repo',
  purpose: 'A test repository for unit testing',
  stack: 'TypeScript, Node.js',
  languages: ['TypeScript'],
  entrypoints: ['src/index.ts'],
  modules: [
    { path: 'src/auth', description: 'Authentication module' },
    { path: 'src/api', description: 'API endpoints' },
  ],
  config_files: ['package.json', 'tsconfig.json'],
  conventions: [
    'Use camelCase for variables',
    'Use PascalCase for types',
    'Export all public APIs from index.ts',
  ],
};

const mockFile: FileAnnotation = {
  path: 'src/auth/jwt.ts',
  language: 'TypeScript',
  size_bytes: 1024,
  line_count: 50,
  purpose: 'JWT token generation and validation',
  exports: ['generateToken', 'validateToken', 'refreshToken'],
  imports: ['src/config/env.ts'],
};

const mockFiles: FileAnnotation[] = [
  mockFile,
  {
    path: 'src/auth/session.ts',
    language: 'TypeScript',
    size_bytes: 2048,
    line_count: 100,
    purpose: 'Session management',
    exports: ['createSession', 'destroySession'],
    imports: ['src/database/users.ts'],
  },
  {
    path: 'src/api/endpoints/auth.ts',
    language: 'TypeScript',
    size_bytes: 2560,
    line_count: 120,
    purpose: 'Authentication API endpoints',
    exports: ['loginEndpoint', 'logoutEndpoint'],
    imports: ['src/auth/jwt.ts'],
  },
];

const mockFileScores: FileScore[] = mockFiles.map((file, index) => ({
  file,
  score: 100 - index * 10,
  importCount: index,
  importedByCount: index + 1,
  connectivity: index + index + 1,
}));

// formatQueryOutput tests
test('formatQueryOutput: includes all required sections', () => {
  const output = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: mockFileScores,
    blastRadiusFiles: [],
  });

  assert.ok(output.includes('═══ REPO CONTEXT ═══'));
  assert.ok(output.includes('═══ RELEVANT FILES'));
  assert.ok(output.includes('═══ BLAST RADIUS ═══'));
  assert.ok(output.includes('═══ CONVENTIONS ═══'));
});

test('formatQueryOutput: displays repository metadata', () => {
  const output = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: [],
    blastRadiusFiles: [],
  });

  assert.ok(output.includes('Repository: test-repo'));
  assert.ok(output.includes('Purpose: A test repository for unit testing'));
  assert.ok(output.includes('Stack: TypeScript, Node.js'));
});

test('formatQueryOutput: formats file with path, purpose, exports', () => {
  const output = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: mockFileScores.slice(0, 1),
    blastRadiusFiles: [],
  });

  assert.ok(output.includes('src/auth/jwt.ts'));
  assert.ok(output.includes('JWT token generation and validation'));
  assert.ok(output.includes('Exports: generateToken, validateToken, refreshToken'));
});

test('formatQueryOutput: limits exports display', () => {
  const fileWithManyExports: FileAnnotation = {
    path: 'src/utils.ts',
    language: 'TypeScript',
    size_bytes: 1000,
    line_count: 100,
    purpose: 'Utilities',
    exports: ['fn1', 'fn2', 'fn3', 'fn4', 'fn5', 'fn6', 'fn7'],
    imports: [],
  };

  const output = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: [{ file: fileWithManyExports, score: 100, importCount: 0, importedByCount: 0, connectivity: 0 }],
    blastRadiusFiles: [],
  });

  // Default maxExports is 5
  assert.ok(output.includes('... and 2 more'));
});

test('formatQueryOutput: limits number of files displayed', () => {
  const manyFiles: FileScore[] = Array.from({ length: 15 }, (_, i) => ({
    file: {
      path: `src/file${i}.ts`,
      language: 'TypeScript',
      size_bytes: 100,
      line_count: 10,
      purpose: `File ${i}`,
      exports: [],
      imports: [],
    },
    score: 100 - i,
    importCount: 0,
    importedByCount: 0,
    connectivity: 0,
  }));

  const output = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: manyFiles,
    blastRadiusFiles: [],
  });

  // Default maxFiles is 10
  assert.ok(output.includes('... and 5 more files'));
});

// formatFileQueryOutput tests
test('formatFileQueryOutput: displays file details', () => {
  const output = formatFileQueryOutput({
    meta: mockMeta,
    file: mockFile,
    dependencies: [],
    dependents: [],
  });

  assert.ok(output.includes('src/auth/jwt.ts'));
  assert.ok(output.includes('JWT token generation and validation'));
  assert.ok(output.includes('Exports: generateToken, validateToken, refreshToken'));
});

// formatPathQueryOutput tests
test('formatPathQueryOutput: displays files in directory', () => {
  const output = formatPathQueryOutput({
    meta: mockMeta,
    path: 'src/auth',
    files: mockFileScores.slice(0, 2),
    externalDependents: [],
  });

  assert.ok(output.includes('2 files in this directory:'));
  assert.ok(output.includes('src/auth/jwt.ts'));
  assert.ok(output.includes('src/auth/session.ts'));
});

// Edge cases and integration
test('formatQueryOutput: handles file with no exports', () => {
  const fileNoExports: FileAnnotation = {
    path: 'src/test.ts',
    language: 'TypeScript',
    size_bytes: 100,
    line_count: 10,
    purpose: 'Test file',
    exports: [],
    imports: [],
  };

  const output = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: [{ file: fileNoExports, score: 100, importCount: 0, importedByCount: 0, connectivity: 0 }],
    blastRadiusFiles: [],
  });

  // Should not show "Exports:" line when empty
  assert.ok(output.includes('src/test.ts'));
  assert.ok(!output.includes('Exports:'));
});

test('all formatters: produce non-empty output', () => {
  const output1 = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: mockFileScores,
    blastRadiusFiles: mockFiles,
  });

  const output2 = formatFileQueryOutput({
    meta: mockMeta,
    file: mockFile,
    dependencies: mockFiles,
    dependents: mockFiles,
  });

  const output3 = formatPathQueryOutput({
    meta: mockMeta,
    path: 'src/auth',
    files: mockFileScores,
    externalDependents: mockFiles,
  });

  assert.ok(output1.length > 100);
  assert.ok(output2.length > 100);
  assert.ok(output3.length > 100);
});
