/**
 * Tests for levels/level3/prompt.ts
 *
 * Tests Level 3 file annotation prompt generation.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  truncateContent,
  buildAnnotationPrompt,
} from '../../../src/levels/level3/prompt.js';
import { TOKEN } from '../../../src/config/index.js';
import type { RawFileMetadata } from '../../../src/core/types.js';

// ============================================================================
// truncateContent Tests
// ============================================================================

test('truncateContent: returns content unchanged if under max lines', () => {
  const content = 'line1\nline2\nline3';
  const result = truncateContent(content, 100);

  assert.strictEqual(result, content);
});

test('truncateContent: truncates content exceeding max lines', () => {
  const lines = Array(200).fill('line').join('\n');
  const result = truncateContent(lines, 100);

  assert.ok(result.includes('[TRUNCATED:'));
  assert.ok(result.includes('lines omitted'));
});

// ============================================================================
// buildAnnotationPrompt Tests
// ============================================================================

test('buildAnnotationPrompt: includes file path', () => {
  const metadata: RawFileMetadata = {
    name: 'test.ts',
    path: 'src/utils/test.ts',
    extension: '.ts',
    size_bytes: 1000,
    line_count: 50,
    language: 'TypeScript',
    raw_imports: [],
  };

  const prompt = buildAnnotationPrompt(
    'src/utils/test.ts',
    'const x = 1;',
    metadata
  );

  assert.ok(prompt.includes('File: src/utils/test.ts'));
});

test('buildAnnotationPrompt: includes purpose instruction', () => {
  const metadata: RawFileMetadata = {
    name: 'test.ts',
    path: 'src/test.ts',
    extension: '.ts',
    size_bytes: 1000,
    line_count: 50,
    language: 'TypeScript',
    raw_imports: [],
  };

  const prompt = buildAnnotationPrompt('src/test.ts', 'code', metadata);

  assert.ok(prompt.includes('**purpose**'));
  assert.ok(prompt.includes(`max ${TOKEN.MAX_PURPOSE_CHARS} chars`));
});

test('buildAnnotationPrompt: includes JSON response format', () => {
  const metadata: RawFileMetadata = {
    name: 'test.ts',
    path: 'src/test.ts',
    extension: '.ts',
    size_bytes: 1000,
    line_count: 50,
    language: 'TypeScript',
    raw_imports: [],
  };

  const prompt = buildAnnotationPrompt('src/test.ts', 'code', metadata);

  assert.ok(prompt.includes('"purpose"'));
  assert.ok(prompt.includes('"exports"'));
  assert.ok(prompt.includes('valid JSON'));
});

