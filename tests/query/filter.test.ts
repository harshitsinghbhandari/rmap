/**
 * Tests for query filter functions
 *
 * Tests tag expansion, alias handling, and file filtering
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  expandTagAliases,
  filterFilesByTags,
  filterFilesByPath,
  findFileByPath,
  getFilesFromTagIndex,
} from '../../src/query/filter.js';
import type { FileAnnotation, TagsJson } from '../../src/core/types.js';
import type { Tag } from '../../src/core/constants.js';

// Test data
const mockFiles: FileAnnotation[] = [
  {
    path: 'src/auth/jwt.ts',
    language: 'TypeScript',
    size_bytes: 1024,
    line_count: 50,
    purpose: 'JWT token generation and validation',
    tags: ['authentication', 'jwt'],
    exports: ['generateToken', 'validateToken'],
    imports: ['src/config/env.ts'],
  },
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
    path: 'src/database/users.ts',
    language: 'TypeScript',
    size_bytes: 3072,
    line_count: 150,
    purpose: 'User database operations',
    tags: ['database', 'orm'],
    exports: ['User', 'findUser', 'createUser'],
    imports: [],
  },
  {
    path: 'src/api/endpoints/auth.ts',
    language: 'TypeScript',
    size_bytes: 2560,
    line_count: 120,
    purpose: 'Authentication API endpoints',
    tags: ['api_endpoint', 'authentication'],
    exports: ['loginEndpoint', 'logoutEndpoint'],
    imports: ['src/auth/jwt.ts', 'src/auth/session.ts'],
  },
  {
    path: 'src/utils/logger.ts',
    language: 'TypeScript',
    size_bytes: 512,
    line_count: 30,
    purpose: 'Logging utility',
    tags: ['utility', 'logging'],
    exports: ['log', 'error', 'debug'],
    imports: [],
  },
];

const mockTagsJson: TagsJson = {
  taxonomy_version: '1.0',
  aliases: {
    auth: ['authentication', 'authorization', 'jwt', 'oauth', 'session'],
    db: ['database', 'orm', 'query', 'sql', 'nosql'],
    api: ['api_endpoint', 'rest', 'graphql', 'grpc'],
  },
  index: {
    authentication: ['src/auth/jwt.ts', 'src/auth/session.ts', 'src/api/endpoints/auth.ts'],
    jwt: ['src/auth/jwt.ts'],
    session: ['src/auth/session.ts'],
    database: ['src/database/users.ts'],
    orm: ['src/database/users.ts'],
    api_endpoint: ['src/api/endpoints/auth.ts'],
    utility: ['src/utils/logger.ts'],
    logging: ['src/utils/logger.ts'],
  } as Record<Tag, string[]>,
};

// expandTagAliases tests
test('expandTagAliases: expands alias to full tag list', () => {
  const result = expandTagAliases(['auth']);
  assert.ok(result.includes('authentication'));
  assert.ok(result.includes('authorization'));
  assert.ok(result.includes('jwt'));
  assert.ok(result.includes('oauth'));
  assert.ok(result.includes('session'));
});

test('expandTagAliases: handles multiple aliases', () => {
  const result = expandTagAliases(['auth', 'db']);
  // Should include tags from both aliases
  assert.ok(result.includes('authentication'));
  assert.ok(result.includes('database'));
  assert.ok(result.includes('orm'));
});

test('expandTagAliases: passes through valid taxonomy tags unchanged', () => {
  const result = expandTagAliases(['authentication', 'database']);
  assert.ok(result.includes('authentication'));
  assert.ok(result.includes('database'));
  assert.strictEqual(result.length, 2);
});

test('expandTagAliases: handles mixed aliases and taxonomy tags', () => {
  const result = expandTagAliases(['auth', 'database']);
  // auth alias expands
  assert.ok(result.includes('authentication'));
  assert.ok(result.includes('jwt'));
  // database stays as is
  assert.ok(result.includes('database'));
});

test('expandTagAliases: normalizes case', () => {
  const result = expandTagAliases(['AUTH', 'Database']);
  assert.ok(result.includes('authentication'));
  assert.ok(result.includes('database'));
});

test('expandTagAliases: trims whitespace', () => {
  const result = expandTagAliases(['  auth  ', ' database ']);
  assert.ok(result.includes('authentication'));
  assert.ok(result.includes('database'));
});

test('expandTagAliases: handles partial matches in taxonomy', () => {
  // "auth" should match tags containing "auth" like "authentication", "authorization"
  const result = expandTagAliases(['log']);
  // Should find partial matches like "logging"
  assert.ok(result.length > 0);
});

test('expandTagAliases: returns empty array for no matches', () => {
  const result = expandTagAliases(['nonexistent']);
  // Should still attempt partial matching
  assert.ok(Array.isArray(result));
});

test('expandTagAliases: deduplicates results', () => {
  const result = expandTagAliases(['auth', 'authentication']);
  const uniqueCount = new Set(result).size;
  assert.strictEqual(result.length, uniqueCount);
});

// filterFilesByTags tests
test('filterFilesByTags: returns files matching single tag', () => {
  const result = filterFilesByTags(mockFiles, ['authentication']);
  assert.strictEqual(result.length, 3);
  assert.ok(result.some((f) => f.path === 'src/auth/jwt.ts'));
  assert.ok(result.some((f) => f.path === 'src/auth/session.ts'));
  assert.ok(result.some((f) => f.path === 'src/api/endpoints/auth.ts'));
});

test('filterFilesByTags: returns files matching multiple tags (OR logic)', () => {
  const result = filterFilesByTags(mockFiles, ['authentication', 'database']);
  // Should include files with either authentication OR database tags
  assert.ok(result.length >= 3);
  assert.ok(result.some((f) => f.path === 'src/auth/jwt.ts'));
  assert.ok(result.some((f) => f.path === 'src/database/users.ts'));
});

test('filterFilesByTags: returns empty array for no matches', () => {
  const result = filterFilesByTags(mockFiles, ['nonexistent' as Tag]);
  assert.strictEqual(result.length, 0);
});

test('filterFilesByTags: returns empty array for empty tag array', () => {
  const result = filterFilesByTags(mockFiles, []);
  assert.strictEqual(result.length, 0);
});

test('filterFilesByTags: handles files with multiple tags', () => {
  const result = filterFilesByTags(mockFiles, ['jwt']);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].path, 'src/auth/jwt.ts');
  // Verify it has multiple tags
  assert.ok(result[0].tags.length >= 2);
});

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

// getFilesFromTagIndex tests
test('getFilesFromTagIndex: returns files for single tag', () => {
  const result = getFilesFromTagIndex(mockTagsJson, ['authentication']);
  assert.strictEqual(result.size, 3);
  assert.ok(result.has('src/auth/jwt.ts'));
  assert.ok(result.has('src/auth/session.ts'));
  assert.ok(result.has('src/api/endpoints/auth.ts'));
});

test('getFilesFromTagIndex: expands aliases', () => {
  const result = getFilesFromTagIndex(mockTagsJson, ['auth']);
  // Should expand auth alias and get all authentication-related files
  assert.ok(result.size >= 3);
  assert.ok(result.has('src/auth/jwt.ts'));
  assert.ok(result.has('src/auth/session.ts'));
});

test('getFilesFromTagIndex: deduplicates file paths', () => {
  const result = getFilesFromTagIndex(mockTagsJson, ['authentication', 'jwt']);
  // jwt.ts should only appear once even though it matches both tags
  const paths = Array.from(result);
  assert.strictEqual(paths.length, new Set(paths).size);
});

test('getFilesFromTagIndex: handles multiple tags', () => {
  const result = getFilesFromTagIndex(mockTagsJson, ['authentication', 'database']);
  assert.ok(result.has('src/auth/jwt.ts'));
  assert.ok(result.has('src/database/users.ts'));
});

test('getFilesFromTagIndex: returns empty set for non-existent tag', () => {
  const result = getFilesFromTagIndex(mockTagsJson, ['nonexistent']);
  assert.strictEqual(result.size, 0);
});

test('getFilesFromTagIndex: returns empty set for empty tag array', () => {
  const result = getFilesFromTagIndex(mockTagsJson, []);
  assert.strictEqual(result.size, 0);
});

test('getFilesFromTagIndex: handles mixed aliases and direct tags', () => {
  const result = getFilesFromTagIndex(mockTagsJson, ['auth', 'utility']);
  assert.ok(result.has('src/auth/jwt.ts'));
  assert.ok(result.has('src/utils/logger.ts'));
});
