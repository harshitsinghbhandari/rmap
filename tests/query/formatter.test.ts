/**
 * Tests for query output formatter
 *
 * Tests formatting of query results for tag, file, and path queries
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
  tags: ['authentication', 'jwt'],
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
    tags: ['authentication', 'session'],
    exports: ['createSession', 'destroySession'],
    imports: ['src/database/users.ts'],
  },
  {
    path: 'src/api/endpoints/auth.ts',
    language: 'TypeScript',
    size_bytes: 2560,
    line_count: 120,
    purpose: 'Authentication API endpoints',
    tags: ['api_endpoint', 'authentication'],
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
    queryTags: ['auth'],
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
    queryTags: [],
    blastRadiusFiles: [],
  });

  assert.ok(output.includes('Repository: test-repo'));
  assert.ok(output.includes('Purpose: A test repository for unit testing'));
  assert.ok(output.includes('Stack: TypeScript, Node.js'));
});

test('formatQueryOutput: displays entry points', () => {
  const output = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: [],
    queryTags: [],
    blastRadiusFiles: [],
  });

  assert.ok(output.includes('Entry Points:'));
  assert.ok(output.includes('src/index.ts'));
});

test('formatQueryOutput: displays module structure', () => {
  const output = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: [],
    queryTags: [],
    blastRadiusFiles: [],
  });

  assert.ok(output.includes('Structure:'));
  assert.ok(output.includes('src/auth: Authentication module'));
  assert.ok(output.includes('src/api: API endpoints'));
});

test('formatQueryOutput: includes query tags in relevant files header', () => {
  const output = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: mockFileScores,
    queryTags: ['auth', 'database'],
    blastRadiusFiles: [],
  });

  assert.ok(output.includes('[auth, database]'));
});

test('formatQueryOutput: formats file with path, purpose, tags, exports', () => {
  const output = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: mockFileScores.slice(0, 1),
    queryTags: ['auth'],
    blastRadiusFiles: [],
  });

  assert.ok(output.includes('src/auth/jwt.ts'));
  assert.ok(output.includes('JWT token generation and validation'));
  assert.ok(output.includes('Tags: authentication, jwt'));
  assert.ok(output.includes('Exports: generateToken, validateToken, refreshToken'));
});

test('formatQueryOutput: limits exports display', () => {
  const fileWithManyExports: FileAnnotation = {
    path: 'src/utils.ts',
    language: 'TypeScript',
    size_bytes: 1000,
    line_count: 100,
    purpose: 'Utilities',
    tags: ['utility'],
    exports: ['fn1', 'fn2', 'fn3', 'fn4', 'fn5', 'fn6', 'fn7'],
    imports: [],
  };

  const output = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: [{ file: fileWithManyExports, score: 100, importCount: 0, importedByCount: 0, connectivity: 0 }],
    queryTags: [],
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
      tags: ['utility'],
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
    queryTags: [],
    blastRadiusFiles: [],
  });

  // Default maxFiles is 10
  assert.ok(output.includes('... and 5 more files'));
});

test('formatQueryOutput: shows "No matching files found" when empty', () => {
  const output = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: [],
    queryTags: ['nonexistent'],
    blastRadiusFiles: [],
  });

  assert.ok(output.includes('No matching files found'));
});

test('formatQueryOutput: displays blast radius files', () => {
  const output = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: mockFileScores.slice(0, 1),
    queryTags: ['auth'],
    blastRadiusFiles: mockFiles.slice(1, 2),
  });

  assert.ok(output.includes('═══ BLAST RADIUS ═══'));
  assert.ok(output.includes('1 file imports the results above'));
  assert.ok(output.includes('src/auth/session.ts'));
});

test('formatQueryOutput: shows "No files import" when blast radius empty', () => {
  const output = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: mockFileScores,
    queryTags: ['auth'],
    blastRadiusFiles: [],
  });

  assert.ok(output.includes('No files import the results above'));
});

test('formatQueryOutput: displays conventions', () => {
  const output = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: [],
    queryTags: [],
    blastRadiusFiles: [],
  });

  assert.ok(output.includes('Use camelCase for variables'));
  assert.ok(output.includes('Use PascalCase for types'));
  assert.ok(output.includes('Export all public APIs from index.ts'));
});

test('formatQueryOutput: limits conventions displayed', () => {
  const metaWithManyConventions: MetaJson = {
    ...mockMeta,
    conventions: Array.from({ length: 10 }, (_, i) => `Convention ${i}`),
  };

  const output = formatQueryOutput({
    meta: metaWithManyConventions,
    relevantFiles: [],
    queryTags: [],
    blastRadiusFiles: [],
  });

  // Default maxConventions is 5
  assert.ok(output.includes('... and 5 more conventions'));
});

test('formatQueryOutput: shows "No conventions documented" when empty', () => {
  const metaNoConventions: MetaJson = {
    ...mockMeta,
    conventions: [],
  };

  const output = formatQueryOutput({
    meta: metaNoConventions,
    relevantFiles: [],
    queryTags: [],
    blastRadiusFiles: [],
  });

  assert.ok(output.includes('No conventions documented'));
});

test('formatQueryOutput: respects custom format options', () => {
  const options: FormatOptions = {
    maxFiles: 2,
    maxExports: 2,
    maxConventions: 2,
  };

  const output = formatQueryOutput(
    {
      meta: mockMeta,
      relevantFiles: mockFileScores,
      queryTags: [],
      blastRadiusFiles: [],
    },
    options
  );

  // Should only show 2 files
  assert.ok(output.includes('... and 1 more file'));
});

test('formatQueryOutput: handles plural/singular correctly', () => {
  const output = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: mockFileScores,
    queryTags: [],
    blastRadiusFiles: mockFiles.slice(0, 1),
  });

  // Singular
  assert.ok(output.includes('1 file imports the results above'));

  const outputPlural = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: mockFileScores,
    queryTags: [],
    blastRadiusFiles: mockFiles,
  });

  // Plural
  assert.ok(outputPlural.includes('3 files import the results above'));
});

// formatFileQueryOutput tests
test('formatFileQueryOutput: includes all required sections', () => {
  const output = formatFileQueryOutput({
    meta: mockMeta,
    file: mockFile,
    dependencies: [],
    dependents: [],
  });

  assert.ok(output.includes('═══ REPO CONTEXT ═══'));
  assert.ok(output.includes('═══ FILE DETAILS ═══'));
  assert.ok(output.includes('═══ DEPENDENCIES ═══'));
  assert.ok(output.includes('═══ BLAST RADIUS ═══'));
  assert.ok(output.includes('═══ CONVENTIONS ═══'));
});

test('formatFileQueryOutput: displays file details', () => {
  const output = formatFileQueryOutput({
    meta: mockMeta,
    file: mockFile,
    dependencies: [],
    dependents: [],
  });

  assert.ok(output.includes('src/auth/jwt.ts'));
  assert.ok(output.includes('JWT token generation and validation'));
  assert.ok(output.includes('Tags: authentication, jwt'));
  assert.ok(output.includes('Exports: generateToken, validateToken, refreshToken'));
});

test('formatFileQueryOutput: displays dependencies', () => {
  const deps = mockFiles.slice(1, 2);
  const output = formatFileQueryOutput({
    meta: mockMeta,
    file: mockFile,
    dependencies: deps,
    dependents: [],
  });

  assert.ok(output.includes('This file imports 1 file:'));
  assert.ok(output.includes('src/auth/session.ts'));
  assert.ok(output.includes('Session management'));
});

test('formatFileQueryOutput: shows "no dependencies" when empty', () => {
  const output = formatFileQueryOutput({
    meta: mockMeta,
    file: mockFile,
    dependencies: [],
    dependents: [],
  });

  assert.ok(output.includes('This file has no internal dependencies'));
});

test('formatFileQueryOutput: displays dependents', () => {
  const dependents = mockFiles.slice(2, 3);
  const output = formatFileQueryOutput({
    meta: mockMeta,
    file: mockFile,
    dependencies: [],
    dependents,
  });

  assert.ok(output.includes('1 file imports this file:'));
  assert.ok(output.includes('src/api/endpoints/auth.ts'));
});

test('formatFileQueryOutput: shows "no files import" when empty', () => {
  const output = formatFileQueryOutput({
    meta: mockMeta,
    file: mockFile,
    dependencies: [],
    dependents: [],
  });

  assert.ok(output.includes('No files import this file'));
});

test('formatFileQueryOutput: limits dependencies displayed', () => {
  const manyDeps = Array.from({ length: 15 }, (_, i) => ({
    path: `src/dep${i}.ts`,
    language: 'TypeScript',
    size_bytes: 100,
    line_count: 10,
    purpose: `Dependency ${i}`,
    tags: ['utility'],
    exports: [],
    imports: [],
  }));

  const output = formatFileQueryOutput({
    meta: mockMeta,
    file: mockFile,
    dependencies: manyDeps,
    dependents: [],
  });

  // Default maxFiles is 10
  assert.ok(output.includes('... and 5 more files'));
});

test('formatFileQueryOutput: handles plural/singular in dependencies', () => {
  const output = formatFileQueryOutput({
    meta: mockMeta,
    file: mockFile,
    dependencies: mockFiles.slice(0, 1),
    dependents: [],
  });

  assert.ok(output.includes('This file imports 1 file:'));

  const outputPlural = formatFileQueryOutput({
    meta: mockMeta,
    file: mockFile,
    dependencies: mockFiles,
    dependents: [],
  });

  assert.ok(outputPlural.includes('This file imports 3 files:'));
});

// formatPathQueryOutput tests
test('formatPathQueryOutput: includes all required sections', () => {
  const output = formatPathQueryOutput({
    meta: mockMeta,
    path: 'src/auth',
    files: mockFileScores,
    externalDependents: [],
  });

  assert.ok(output.includes('═══ REPO CONTEXT ═══'));
  assert.ok(output.includes('═══ DIRECTORY: src/auth ═══'));
  assert.ok(output.includes('═══ EXTERNAL DEPENDENCIES ═══'));
  assert.ok(output.includes('═══ CONVENTIONS ═══'));
});

test('formatPathQueryOutput: displays directory path', () => {
  const output = formatPathQueryOutput({
    meta: mockMeta,
    path: 'src/auth',
    files: mockFileScores,
    externalDependents: [],
  });

  assert.ok(output.includes('DIRECTORY: src/auth'));
});

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

test('formatPathQueryOutput: shows "No files found" when empty', () => {
  const output = formatPathQueryOutput({
    meta: mockMeta,
    path: 'src/empty',
    files: [],
    externalDependents: [],
  });

  assert.ok(output.includes('No files found in this directory'));
});

test('formatPathQueryOutput: displays external dependents', () => {
  const output = formatPathQueryOutput({
    meta: mockMeta,
    path: 'src/auth',
    files: mockFileScores,
    externalDependents: mockFiles.slice(2, 3),
  });

  assert.ok(output.includes('1 file outside this directory imports from here:'));
  assert.ok(output.includes('src/api/endpoints/auth.ts'));
});

test('formatPathQueryOutput: shows "No files outside" when no external deps', () => {
  const output = formatPathQueryOutput({
    meta: mockMeta,
    path: 'src/auth',
    files: mockFileScores,
    externalDependents: [],
  });

  assert.ok(output.includes('No files outside this directory import files from here'));
});

test('formatPathQueryOutput: limits files displayed', () => {
  const manyFiles: FileScore[] = Array.from({ length: 15 }, (_, i) => ({
    file: {
      path: `src/auth/file${i}.ts`,
      language: 'TypeScript',
      size_bytes: 100,
      line_count: 10,
      purpose: `File ${i}`,
      tags: ['authentication'],
      exports: [],
      imports: [],
    },
    score: 100 - i,
    importCount: 0,
    importedByCount: 0,
    connectivity: 0,
  }));

  const output = formatPathQueryOutput({
    meta: mockMeta,
    path: 'src/auth',
    files: manyFiles,
    externalDependents: [],
  });

  // Default maxFiles is 10
  assert.ok(output.includes('... and 5 more files'));
});

test('formatPathQueryOutput: handles plural/singular in file count', () => {
  const output = formatPathQueryOutput({
    meta: mockMeta,
    path: 'src/auth',
    files: mockFileScores.slice(0, 1),
    externalDependents: [],
  });

  assert.ok(output.includes('1 file in this directory:'));

  const outputPlural = formatPathQueryOutput({
    meta: mockMeta,
    path: 'src/auth',
    files: mockFileScores,
    externalDependents: [],
  });

  assert.ok(outputPlural.includes('3 files in this directory:'));
});

test('formatPathQueryOutput: respects custom format options', () => {
  const options: FormatOptions = {
    maxFiles: 1,
  };

  const output = formatPathQueryOutput(
    {
      meta: mockMeta,
      path: 'src/auth',
      files: mockFileScores,
      externalDependents: [],
    },
    options
  );

  // Should only show 1 file
  assert.ok(output.includes('... and 2 more files'));
});

// Edge cases and integration
test('formatQueryOutput: handles file with no tags', () => {
  const fileNoTags: FileAnnotation = {
    path: 'src/test.ts',
    language: 'TypeScript',
    size_bytes: 100,
    line_count: 10,
    purpose: 'Test file',
    tags: [],
    exports: [],
    imports: [],
  };

  const output = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: [{ file: fileNoTags, score: 100, importCount: 0, importedByCount: 0, connectivity: 0 }],
    queryTags: [],
    blastRadiusFiles: [],
  });

  // Should not crash and should include the file
  assert.ok(output.includes('src/test.ts'));
});

test('formatQueryOutput: handles file with no exports', () => {
  const fileNoExports: FileAnnotation = {
    path: 'src/test.ts',
    language: 'TypeScript',
    size_bytes: 100,
    line_count: 10,
    purpose: 'Test file',
    tags: ['testing'],
    exports: [],
    imports: [],
  };

  const output = formatQueryOutput({
    meta: mockMeta,
    relevantFiles: [{ file: fileNoExports, score: 100, importCount: 0, importedByCount: 0, connectivity: 0 }],
    queryTags: [],
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
    queryTags: ['auth'],
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
