/**
 * Tests for Level 3 Response Parser and Validator
 *
 * Tests LLM response parsing, import path normalization, and error handling
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  parseAnnotationResponse,
  normalizeImportPath,
  AnnotationValidationError,
} from '../../../src/levels/level3/parser.js';
import type { RawFileMetadata } from '../../../src/core/types.js';

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
    exports: ['generateToken', 'validateToken'],
    imports: ['src/config/env'],
  });

  const result = parseAnnotationResponse(validResponse, mockMetadata);

  assert.ok(result);
  assert.strictEqual(result.purpose, 'JWT token generation and validation');
  assert.deepStrictEqual(result.exports, ['generateToken', 'validateToken']);
});

// Test: Markdown code block removal
test('parseAnnotationResponse: removes markdown code blocks', () => {
  const responseWithMarkdown = `\`\`\`json
{
  "purpose": "Test file",
  "exports": ["testFn"],
  "imports": []
}
\`\`\``;

  const result = parseAnnotationResponse(responseWithMarkdown, mockMetadata);

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

// Test: Missing required fields
test('parseAnnotationResponse: throws on missing purpose', () => {
  const missingPurpose = JSON.stringify({
    exports: [],
    imports: [],
  });

  assert.throws(
    () => parseAnnotationResponse(missingPurpose, mockMetadata),
    AnnotationValidationError
  );
});

// Test: Purpose truncation
test('parseAnnotationResponse: truncates long purpose strings', () => {
  const longPurpose = 'A'.repeat(250);
  const response = JSON.stringify({
    purpose: longPurpose,
    exports: [],
    imports: [],
  });

  const result = parseAnnotationResponse(response, mockMetadata);

  // Should be truncated to 200 chars max
  assert.ok(result.purpose.length <= 200);
});

// Test: Import path normalization
test('normalizeImportPath: handles relative imports', () => {
  const result = normalizeImportPath('./config', 'src/auth/jwt.ts', '.');
  assert.ok(!result.startsWith('./'));
  assert.ok(result.includes('auth'));
});

// Test: Exports validation
test('parseAnnotationResponse: accepts valid exports', () => {
  const response = JSON.stringify({
    purpose: 'Test file',
    exports: ['function1', 'Class2'],
    imports: [],
  });

  const result = parseAnnotationResponse(response, mockMetadata);
  assert.deepStrictEqual(result.exports, ['function1', 'Class2']);
});
