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
import { TOKEN, FILE } from '../../../src/config/index.js';
import type { RawFileMetadata } from '../../../src/core/types.js';

// ============================================================================
// truncateContent Tests
// ============================================================================

test('truncateContent: returns content unchanged if under max lines', () => {
  const content = 'line1\nline2\nline3';
  const result = truncateContent(content, 100);

  assert.strictEqual(result, content);
});

test('truncateContent: returns content unchanged when exactly at max lines', () => {
  const lines = Array(100).fill('line').join('\n');
  const result = truncateContent(lines, 100);

  assert.strictEqual(result, lines);
});

test('truncateContent: truncates content exceeding max lines', () => {
  const lines = Array(200).fill('line').join('\n');
  const result = truncateContent(lines, 100);

  assert.ok(result.includes('[TRUNCATED:'));
  assert.ok(result.includes('lines omitted'));
});

test('truncateContent: includes first and last parts', () => {
  const lines = Array(200).fill(0).map((_, i) => `line${i}`).join('\n');
  const result = truncateContent(lines, 100);

  // Should include some early lines
  assert.ok(result.includes('line0'));
  assert.ok(result.includes('line1'));

  // Should include some late lines
  assert.ok(result.includes('line199'));
  assert.ok(result.includes('line198'));
});

test('truncateContent: uses default maxLines from config', () => {
  const content = 'short content';
  const result = truncateContent(content);

  // Should use TOKEN.MAX_LINES_IN_PROMPT as default
  assert.strictEqual(result, content);
});

test('truncateContent: truncation message shows omitted count', () => {
  const lineCount = 150;
  const maxLines = 100;
  const lines = Array(lineCount).fill('line').join('\n');

  const result = truncateContent(lines, maxLines);

  const omittedCount = lineCount - maxLines;
  assert.ok(result.includes(`${omittedCount} lines omitted`));
});

test('truncateContent: handles empty content', () => {
  const result = truncateContent('', 100);
  assert.strictEqual(result, '');
});

test('truncateContent: handles single line', () => {
  const result = truncateContent('single line', 100);
  assert.strictEqual(result, 'single line');
});

test('truncateContent: handles maxLines of 1', () => {
  const lines = 'line1\nline2\nline3';
  const result = truncateContent(lines, 1);

  // Should truncate
  assert.ok(result.includes('[TRUNCATED:'));
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

test('buildAnnotationPrompt: includes language', () => {
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

  assert.ok(prompt.includes('Language: TypeScript'));
});

test('buildAnnotationPrompt: includes line count', () => {
  const metadata: RawFileMetadata = {
    name: 'test.ts',
    path: 'src/test.ts',
    extension: '.ts',
    size_bytes: 1000,
    line_count: 150,
    language: 'TypeScript',
    raw_imports: [],
  };

  const prompt = buildAnnotationPrompt('src/test.ts', 'code', metadata);

  assert.ok(prompt.includes('Lines: 150'));
});

test('buildAnnotationPrompt: includes file content in code block', () => {
  const content = 'export function hello() { return "world"; }';
  const metadata: RawFileMetadata = {
    name: 'test.ts',
    path: 'src/test.ts',
    extension: '.ts',
    size_bytes: 1000,
    line_count: 1,
    language: 'TypeScript',
    raw_imports: [],
  };

  const prompt = buildAnnotationPrompt('src/test.ts', content, metadata);

  assert.ok(prompt.includes('```typescript'));
  assert.ok(prompt.includes(content));
  assert.ok(prompt.includes('```'));
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

test('buildAnnotationPrompt: includes tags instruction', () => {
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

  assert.ok(prompt.includes('**tags**'));
  assert.ok(prompt.includes(`1-${FILE.MAX_TAGS_PER_FILE}`));
});

test('buildAnnotationPrompt: includes exports instruction', () => {
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

  assert.ok(prompt.includes('**exports**'));
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
  assert.ok(prompt.includes('"tags"'));
  assert.ok(prompt.includes('"exports"'));
  assert.ok(prompt.includes('valid JSON'));
});

test('buildAnnotationPrompt: includes tag taxonomy tiers', () => {
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

  assert.ok(prompt.includes('TIER 1: HIGH-SIGNAL'));
  assert.ok(prompt.includes('TIER 2: ARCHITECTURE'));
  assert.ok(prompt.includes('TIER 3: LOW-SIGNAL'));
});

test('buildAnnotationPrompt: handles unknown language', () => {
  const metadata: RawFileMetadata = {
    name: 'test.xyz',
    path: 'src/test.xyz',
    extension: '.xyz',
    size_bytes: 1000,
    line_count: 50,
    language: undefined as unknown as string,
    raw_imports: [],
  };

  const prompt = buildAnnotationPrompt('src/test.xyz', 'code', metadata);

  assert.ok(prompt.includes('Language: Unknown'));
});

// ============================================================================
// Barrel File Detection Tests
// ============================================================================

test('buildAnnotationPrompt: includes barrel file guidance for index.ts', () => {
  const metadata: RawFileMetadata = {
    name: 'index.ts',
    path: 'src/utils/index.ts',
    extension: '.ts',
    size_bytes: 500,
    line_count: 20,
    language: 'TypeScript',
    raw_imports: [],
  };

  const prompt = buildAnnotationPrompt('src/utils/index.ts', 'export * from "./helper";', metadata);

  assert.ok(prompt.includes('barrel'));
});

test('buildAnnotationPrompt: includes barrel file guidance for index.js', () => {
  const metadata: RawFileMetadata = {
    name: 'index.js',
    path: 'src/index.js',
    extension: '.js',
    size_bytes: 500,
    line_count: 20,
    language: 'JavaScript',
    raw_imports: [],
  };

  const prompt = buildAnnotationPrompt('src/index.js', 'module.exports = {}', metadata);

  assert.ok(prompt.includes('barrel'));
});

test('buildAnnotationPrompt: no barrel guidance for regular files', () => {
  const metadata: RawFileMetadata = {
    name: 'utils.ts',
    path: 'src/utils.ts',
    extension: '.ts',
    size_bytes: 1000,
    line_count: 50,
    language: 'TypeScript',
    raw_imports: [],
  };

  const prompt = buildAnnotationPrompt('src/utils.ts', 'export function helper() {}', metadata);

  // The word "barrel" should not appear in guidance for regular files
  // (it may appear in tag taxonomy, so we check for the specific guidance text)
  assert.ok(!prompt.includes('This is a barrel/index file'));
});

// ============================================================================
// Tag Selection Guidance Tests
// ============================================================================

test('buildAnnotationPrompt: includes tag quality guidance', () => {
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

  assert.ok(prompt.includes('Quality over quantity'));
  assert.ok(prompt.includes('MOST DEFINING tags'));
});

test('buildAnnotationPrompt: includes banned tag combinations', () => {
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

  assert.ok(prompt.includes('BANNED combinations'));
  assert.ok(prompt.includes('"utility" + "helper"'));
});

test('buildAnnotationPrompt: includes tags to avoid guidance', () => {
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

  assert.ok(prompt.includes('Tags to AVOID'));
});

// ============================================================================
// Content Truncation in Prompts Tests
// ============================================================================

test('buildAnnotationPrompt: truncates long content', () => {
  const longContent = Array(20000).fill('const x = 1;').join('\n');
  const metadata: RawFileMetadata = {
    name: 'big.ts',
    path: 'src/big.ts',
    extension: '.ts',
    size_bytes: 500000,
    line_count: 20000,
    language: 'TypeScript',
    raw_imports: [],
  };

  const prompt = buildAnnotationPrompt('src/big.ts', longContent, metadata);

  assert.ok(prompt.includes('[TRUNCATED:'));
});

test('buildAnnotationPrompt: short content is not truncated', () => {
  const shortContent = 'const x = 1;\nexport default x;';
  const metadata: RawFileMetadata = {
    name: 'small.ts',
    path: 'src/small.ts',
    extension: '.ts',
    size_bytes: 100,
    line_count: 2,
    language: 'TypeScript',
    raw_imports: [],
  };

  const prompt = buildAnnotationPrompt('src/small.ts', shortContent, metadata);

  assert.ok(!prompt.includes('[TRUNCATED:'));
  assert.ok(prompt.includes(shortContent));
});
