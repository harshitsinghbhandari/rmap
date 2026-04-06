/**
 * Tests for query filter functions
 *
 * Tests path-based file filtering and exact path lookup
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  filterFilesByPath,
  findFileByPath,
} from '../../src/query/filter.js';
import type { FileAnnotation } from '../../src/core/types.js';

// Test data
const mockFiles: FileAnnotation[] = [
  {
    path: 'src/auth/jwt.ts',
    language: 'TypeScript',
    size_bytes: 1024,
    line_count: 50,
    purpose: 'JWT token generation and validation',
    exports: ['generateToken', 'validateToken'],
    imports: ['src/config/env.ts'],
  },
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
    path: 'src/database/users.ts',
    language: 'TypeScript',
    size_bytes: 3072,
    line_count: 150,
    purpose: 'User database operations',
    exports: ['User', 'findUser', 'createUser'],
    imports: [],
  },
  {
    path: 'src/api/endpoints/auth.ts',
    language: 'TypeScript',
    size_bytes: 2560,
    line_count: 120,
    purpose: 'Authentication API endpoints',
    exports: ['loginEndpoint', 'logoutEndpoint'],
    imports: ['src/auth/jwt.ts', 'src/auth/session.ts'],
  },
  {
    path: 'src/utils/logger.ts',
    language: 'TypeScript',
    size_bytes: 512,
    line_count: 30,
    purpose: 'Logging utility',
    exports: ['log', 'error', 'debug'],
    imports: [],
  },
];

// filterFilesByPath tests
test('filterFilesByPath: returns files under directory with trailing slash', () => {
  const result = filterFilesByPath(mockFiles, 'src/auth/');
  assert.strictEqual(result.length, 2);
  assert.ok(result.some((f) => f.path === 'src/auth/jwt.ts'));
  assert.ok(result.some((f) => f.path === 'src/auth/session.ts'));
});

test('filterFilesByPath: returns files under directory without trailing slash', () => {
  const result = filterFilesByPath(mockFiles, 'src/auth');
  assert.strictEqual(result.length, 2);
  assert.ok(result.some((f) => f.path === 'src/auth/jwt.ts'));
  assert.ok(result.some((f) => f.path === 'src/auth/session.ts'));
});

test('filterFilesByPath: returns exact file match', () => {
  const result = filterFilesByPath(mockFiles, 'src/utils/logger.ts');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].path, 'src/utils/logger.ts');
});

test('filterFilesByPath: returns nested directory files', () => {
  const result = filterFilesByPath(mockFiles, 'src/api/');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].path, 'src/api/endpoints/auth.ts');
});

test('filterFilesByPath: returns empty array for non-matching path', () => {
  const result = filterFilesByPath(mockFiles, 'src/nonexistent/');
  assert.strictEqual(result.length, 0);
});

test('filterFilesByPath: handles root-level paths', () => {
  const result = filterFilesByPath(mockFiles, 'src/');
  // Should match all files under src/
  assert.strictEqual(result.length, 5);
});

test('filterFilesByPath: case sensitive matching', () => {
  const result = filterFilesByPath(mockFiles, 'SRC/auth/');
  // Should not match due to case sensitivity
  assert.strictEqual(result.length, 0);
});

// findFileByPath tests
test('findFileByPath: finds file by exact path', () => {
  const result = findFileByPath(mockFiles, 'src/auth/jwt.ts');
  assert.ok(result);
  assert.strictEqual(result.path, 'src/auth/jwt.ts');
  assert.strictEqual(result.purpose, 'JWT token generation and validation');
});

test('findFileByPath: returns undefined for non-existent file', () => {
  const result = findFileByPath(mockFiles, 'src/nonexistent.ts');
  assert.strictEqual(result, undefined);
});

test('findFileByPath: returns undefined for partial path match', () => {
  const result = findFileByPath(mockFiles, 'src/auth/');
  // Should not match directory, only exact file paths
  assert.strictEqual(result, undefined);
});

test('findFileByPath: case sensitive exact matching', () => {
  const result = findFileByPath(mockFiles, 'SRC/auth/jwt.ts');
  assert.strictEqual(result, undefined);
});

test('findFileByPath: handles empty file list', () => {
  const result = findFileByPath([], 'any/path.ts');
  assert.strictEqual(result, undefined);
});
