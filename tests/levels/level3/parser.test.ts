/**
 * Tests for Level 3 Response Parser and Validator
 *
 * Tests LLM response parsing, tag validation against TAG_TAXONOMY,
 * import path normalization, and error handling
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  parseAnnotationResponse,
  normalizeImportPath,
  AnnotationValidationError,
} from '../../../src/levels/level3/parser.js';
import type { RawFileMetadata } from '../../../src/core/types.js';
import { TAG_TAXONOMY, MAX_TAGS_PER_FILE } from '../../../src/core/constants.js';

// Mock file metadata
const mockMetadata: RawFileMetadata = {
  name: 'jwt.ts',
  path: 'src/auth/jwt.ts',
  extension: '.ts',
  size_bytes: 2048,
  line_count: 100,
  language: 'TypeScript',
  raw_imports: [],
};

// Test: Valid JSON response parsing
test('parseAnnotationResponse: parses valid JSON response', () => {
  const validResponse = JSON.stringify({
    purpose: 'JWT token generation and validation',
    tags: ['authentication', 'jwt'],
    exports: ['generateToken', 'validateToken'],
    imports: ['src/config/env'],
  });

  const result = parseAnnotationResponse(validResponse, mockMetadata);

  assert.ok(result);
  assert.strictEqual(result.purpose, 'JWT token generation and validation');
  assert.deepStrictEqual(result.tags, ['authentication', 'jwt']);
  assert.deepStrictEqual(result.exports, ['generateToken', 'validateToken']);
});

// Test: Markdown code block removal
test('parseAnnotationResponse: removes markdown code blocks', () => {
  const responseWithMarkdown = `\`\`\`json
{
  "purpose": "Test file",
  "tags": ["testing"],
  "exports": ["testFn"],
  "imports": []
}
\`\`\``;

  const result = parseAnnotationResponse(responseWithMarkdown, mockMetadata);

  assert.ok(result);
  assert.strictEqual(result.purpose, 'Test file');
});

test('parseAnnotationResponse: removes generic code blocks', () => {
  const responseWithCodeBlock = `\`\`\`
{
  "purpose": "Test file",
  "tags": ["testing"],
  "exports": [],
  "imports": []
}
\`\`\``;

  const result = parseAnnotationResponse(responseWithCodeBlock, mockMetadata);

  assert.ok(result);
  assert.strictEqual(result.purpose, 'Test file');
});

// Test: Malformed JSON handling
test('parseAnnotationResponse: throws on malformed JSON', () => {
  const malformedJSON = 'Not valid JSON at all';

  assert.throws(
    () => parseAnnotationResponse(malformedJSON, mockMetadata),
    AnnotationValidationError
  );
});

test('parseAnnotationResponse: throws on incomplete JSON', () => {
  const incompleteJSON = '{"purpose": "Test", "tags":';

  assert.throws(
    () => parseAnnotationResponse(incompleteJSON, mockMetadata),
    AnnotationValidationError
  );
});

// Test: Missing required fields
test('parseAnnotationResponse: throws on missing purpose', () => {
  const missingPurpose = JSON.stringify({
    tags: ['testing'],
    exports: [],
    imports: [],
  });

  assert.throws(
    () => parseAnnotationResponse(missingPurpose, mockMetadata),
    AnnotationValidationError
  );
});

test('parseAnnotationResponse: throws on empty purpose', () => {
  const emptyPurpose = JSON.stringify({
    purpose: '',
    tags: ['testing'],
    exports: [],
    imports: [],
  });

  assert.throws(
    () => parseAnnotationResponse(emptyPurpose, mockMetadata),
    AnnotationValidationError
  );
});

test('parseAnnotationResponse: throws on missing tags', () => {
  const missingTags = JSON.stringify({
    purpose: 'Test file',
    exports: [],
    imports: [],
  });

  assert.throws(
    () => parseAnnotationResponse(missingTags, mockMetadata),
    AnnotationValidationError
  );
});

test('parseAnnotationResponse: throws on empty tags array', () => {
  const emptyTags = JSON.stringify({
    purpose: 'Test file',
    tags: [],
    exports: [],
    imports: [],
  });

  assert.throws(
    () => parseAnnotationResponse(emptyTags, mockMetadata),
    AnnotationValidationError
  );
});

// Test: Tag validation
test('parseAnnotationResponse: validates tags against TAG_TAXONOMY', () => {
  const validResponse = JSON.stringify({
    purpose: 'Test file',
    tags: ['authentication', 'jwt', 'database'],
    exports: [],
    imports: [],
  });

  const result = parseAnnotationResponse(validResponse, mockMetadata);

  // All tags should be from TAG_TAXONOMY
  assert.ok(result.tags.every(tag => TAG_TAXONOMY.includes(tag)));
});

test('parseAnnotationResponse: filters invalid tags', () => {
  const invalidTags = JSON.stringify({
    purpose: 'Test file',
    tags: ['authentication', 'invalid-tag', 'database', 'made-up-tag'],
    exports: [],
    imports: [],
  });

  const result = parseAnnotationResponse(invalidTags, mockMetadata);

  // Should only include valid tags
  assert.ok(result.tags.includes('authentication'));
  assert.ok(result.tags.includes('database'));
  assert.ok(!result.tags.includes('invalid-tag'));
  assert.ok(!result.tags.includes('made-up-tag'));
});

test('parseAnnotationResponse: handles case-insensitive tag matching', () => {
  const mixedCaseTags = JSON.stringify({
    purpose: 'Test file',
    tags: ['Authentication', 'JWT', 'Database'],
    exports: [],
    imports: [],
  });

  const result = parseAnnotationResponse(mixedCaseTags, mockMetadata);

  // Should normalize to taxonomy case
  assert.ok(result.tags.every(tag => TAG_TAXONOMY.includes(tag)));
});

test('parseAnnotationResponse: limits tags to MAX_TAGS_PER_FILE', () => {
  const tooManyTags = JSON.stringify({
    purpose: 'Test file',
    tags: ['authentication', 'jwt', 'database', 'api_endpoint', 'testing', 'logging'],
    exports: [],
    imports: [],
  });

  const result = parseAnnotationResponse(tooManyTags, mockMetadata);

  assert.ok(result.tags.length <= MAX_TAGS_PER_FILE);
});

test('parseAnnotationResponse: removes duplicate tags', () => {
  const duplicateTags = JSON.stringify({
    purpose: 'Test file',
    tags: ['authentication', 'jwt', 'authentication', 'jwt'],
    exports: [],
    imports: [],
  });

  const result = parseAnnotationResponse(duplicateTags, mockMetadata);

  // Should remove duplicates
  const uniqueTags = new Set(result.tags);
  assert.strictEqual(result.tags.length, uniqueTags.size);
});

test('parseAnnotationResponse: throws when no valid tags remain', () => {
  const allInvalidTags = JSON.stringify({
    purpose: 'Test file',
    tags: ['invalid1', 'invalid2', 'invalid3'],
    exports: [],
    imports: [],
  });

  assert.throws(
    () => parseAnnotationResponse(allInvalidTags, mockMetadata),
    AnnotationValidationError
  );
});

// Test: Purpose truncation
test('parseAnnotationResponse: truncates long purpose strings', () => {
  const longPurpose = 'A'.repeat(250);
  const response = JSON.stringify({
    purpose: longPurpose,
    tags: ['testing'],
    exports: [],
    imports: [],
  });

  const result = parseAnnotationResponse(response, mockMetadata);

  // Should be truncated to 200 chars max
  assert.ok(result.purpose.length <= 200);
});

// Test: Import path normalization
test('normalizeImportPath: handles relative imports with ./', () => {
  const result = normalizeImportPath('./config', 'src/auth/jwt.ts', '.');

  assert.ok(!result.startsWith('./'));
  assert.ok(result.includes('auth'));
});

test('normalizeImportPath: handles relative imports with ../', () => {
  const result = normalizeImportPath('../database/users', 'src/auth/jwt.ts', '.');

  assert.ok(!result.includes('../'));
  assert.ok(result.includes('database'));
});

test('normalizeImportPath: leaves absolute paths unchanged', () => {
  const result = normalizeImportPath('src/utils/logger', 'src/auth/jwt.ts', '.');

  assert.strictEqual(result, 'src/utils/logger');
});

test('normalizeImportPath: leaves package imports unchanged', () => {
  const packageImports = ['express', 'react', '@anthropic-ai/sdk', 'node:fs'];

  for (const pkg of packageImports) {
    const result = normalizeImportPath(pkg, 'src/auth/jwt.ts', '.');
    assert.strictEqual(result, pkg);
  }
});

test('normalizeImportPath: normalizes paths correctly', () => {
  const result = normalizeImportPath('./foo/../bar', 'src/auth/jwt.ts', '.');

  // Should remove . and .. segments
  assert.ok(!result.includes('..'));
  assert.ok(!result.includes('./'));
});

// Test: Internal imports filtering
test('parseAnnotationResponse: filters external package imports', () => {
  const responseWithExternalImports = JSON.stringify({
    purpose: 'Test file',
    tags: ['api_endpoint'],
    exports: ['handler'],
    imports: [
      'express',
      'src/auth/jwt',
      '@anthropic-ai/sdk',
      'src/database/users',
      'node:fs',
      'crypto',
    ],
  });

  const result = parseAnnotationResponse(responseWithExternalImports, mockMetadata);

  // Should only include internal imports
  assert.ok(result.imports.includes('src/auth/jwt'));
  assert.ok(result.imports.includes('src/database/users'));
  assert.ok(!result.imports.includes('express'));
  assert.ok(!result.imports.includes('@anthropic-ai/sdk'));
  assert.ok(!result.imports.includes('node:fs'));
  assert.ok(!result.imports.includes('crypto'));
});

test('parseAnnotationResponse: removes file extensions from imports', () => {
  const responseWithExtensions = JSON.stringify({
    purpose: 'Test file',
    tags: ['testing'],
    exports: [],
    imports: [
      'src/auth/jwt.ts',
      'src/database/users.js',
      'src/utils/logger.tsx',
      'src/models/user.py',
    ],
  });

  const result = parseAnnotationResponse(responseWithExtensions, mockMetadata);

  // Extensions should be removed
  assert.ok(result.imports.some(imp => imp === 'src/auth/jwt' || imp.includes('jwt')));
  assert.ok(!result.imports.some(imp => imp.endsWith('.ts')));
  assert.ok(!result.imports.some(imp => imp.endsWith('.js')));
});

test('parseAnnotationResponse: normalizes relative imports', () => {
  const metadata: RawFileMetadata = {
    ...mockMetadata,
    path: 'src/auth/session.ts',
  };

  const responseWithRelativeImports = JSON.stringify({
    purpose: 'Session management',
    tags: ['authentication'],
    exports: ['createSession'],
    imports: ['./jwt', '../database/users', '../utils/logger'],
  });

  const result = parseAnnotationResponse(responseWithRelativeImports, metadata);

  // Relative imports should be normalized
  for (const imp of result.imports) {
    assert.ok(!imp.startsWith('./'));
    assert.ok(!imp.includes('../'));
  }
});

// Test: Exports validation
test('parseAnnotationResponse: accepts valid exports', () => {
  const response = JSON.stringify({
    purpose: 'Test file',
    tags: ['testing'],
    exports: ['function1', 'Class2', 'CONSTANT', 'TypeName'],
    imports: [],
  });

  const result = parseAnnotationResponse(response, mockMetadata);

  assert.deepStrictEqual(result.exports, ['function1', 'Class2', 'CONSTANT', 'TypeName']);
});

test('parseAnnotationResponse: allows empty exports', () => {
  const response = JSON.stringify({
    purpose: 'Test file',
    tags: ['testing'],
    exports: [],
    imports: [],
  });

  const result = parseAnnotationResponse(response, mockMetadata);

  assert.strictEqual(result.exports.length, 0);
});

test('parseAnnotationResponse: trims whitespace from exports', () => {
  const response = JSON.stringify({
    purpose: 'Test file',
    tags: ['testing'],
    exports: ['  function1  ', ' Class2 ', 'CONSTANT'],
    imports: [],
  });

  const result = parseAnnotationResponse(response, mockMetadata);

  assert.ok(result.exports.every(exp => exp.trim() === exp));
  assert.ok(result.exports.every(exp => exp.length > 0));
});

test('parseAnnotationResponse: filters empty export strings', () => {
  const response = JSON.stringify({
    purpose: 'Test file',
    tags: ['testing'],
    exports: ['function1', '', '  ', 'Class2'],
    imports: [],
  });

  const result = parseAnnotationResponse(response, mockMetadata);

  // Should remove empty/whitespace-only strings
  assert.ok(!result.exports.includes(''));
  assert.ok(result.exports.every(exp => exp.length > 0));
});

// Test: Type validation
test('parseAnnotationResponse: throws on non-object response', () => {
  const invalidTypes = ['string', '123', 'true', 'null', '[]'];

  for (const invalid of invalidTypes) {
    assert.throws(
      () => parseAnnotationResponse(invalid, mockMetadata),
      AnnotationValidationError
    );
  }
});

test('parseAnnotationResponse: throws on non-string purpose', () => {
  const response = JSON.stringify({
    purpose: 123,
    tags: ['testing'],
    exports: [],
    imports: [],
  });

  assert.throws(
    () => parseAnnotationResponse(response, mockMetadata),
    AnnotationValidationError
  );
});

test('parseAnnotationResponse: throws on non-array tags', () => {
  const response = JSON.stringify({
    purpose: 'Test file',
    tags: 'not-an-array',
    exports: [],
    imports: [],
  });

  assert.throws(
    () => parseAnnotationResponse(response, mockMetadata),
    AnnotationValidationError
  );
});

test('parseAnnotationResponse: throws on non-string tag items', () => {
  const response = JSON.stringify({
    purpose: 'Test file',
    tags: ['valid', 123, 'another-valid'],
    exports: [],
    imports: [],
  });

  assert.throws(
    () => parseAnnotationResponse(response, mockMetadata),
    AnnotationValidationError
  );
});

// Test: FileAnnotation output structure
test('parseAnnotationResponse: returns complete FileAnnotation', () => {
  const response = JSON.stringify({
    purpose: 'JWT operations',
    tags: ['authentication', 'jwt'],
    exports: ['generateToken'],
    imports: ['src/config/env'],
  });

  const result = parseAnnotationResponse(response, mockMetadata);

  // Should have all required FileAnnotation fields
  assert.ok('path' in result);
  assert.ok('language' in result);
  assert.ok('size_bytes' in result);
  assert.ok('line_count' in result);
  assert.ok('purpose' in result);
  assert.ok('tags' in result);
  assert.ok('exports' in result);
  assert.ok('imports' in result);
});

test('parseAnnotationResponse: preserves metadata fields', () => {
  const response = JSON.stringify({
    purpose: 'Test file',
    tags: ['testing'],
    exports: [],
    imports: [],
  });

  const result = parseAnnotationResponse(response, mockMetadata);

  assert.strictEqual(result.path, mockMetadata.path);
  assert.strictEqual(result.language, mockMetadata.language);
  assert.strictEqual(result.size_bytes, mockMetadata.size_bytes);
  assert.strictEqual(result.line_count, mockMetadata.line_count);
});

test('parseAnnotationResponse: handles missing language in metadata', () => {
  const metadataNoLang: RawFileMetadata = {
    ...mockMetadata,
    language: undefined,
  };

  const response = JSON.stringify({
    purpose: 'Test file',
    tags: ['testing'],
    exports: [],
    imports: [],
  });

  const result = parseAnnotationResponse(response, metadataNoLang);

  assert.strictEqual(result.language, 'Unknown');
});

// Test: AnnotationValidationError type
test('AnnotationValidationError: is an instance of Error', () => {
  const error = new AnnotationValidationError('Test error');

  assert.ok(error instanceof Error);
  assert.strictEqual(error.name, 'AnnotationValidationError');
  assert.strictEqual(error.message, 'Test error');
});
