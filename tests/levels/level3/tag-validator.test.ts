/**
 * Tests for Tag Validation with Retry Logic
 *
 * Tests tag validation, invalid tag detection, and correction prompt building
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  validateTag,
  validateTagsWithDetails,
  buildTagCorrectionPrompt,
} from '../../../src/levels/level3/tag-validator.js';
import { TAG_TAXONOMY } from '../../../src/core/constants.js';

// Test: Single tag validation
test('validateTag: returns valid tag from taxonomy', () => {
  const result = validateTag('authentication');
  assert.strictEqual(result, 'authentication');
});

test('validateTag: returns null for invalid tag', () => {
  const result = validateTag('invalid_tag_name');
  assert.strictEqual(result, null);
});

test('validateTag: handles case-insensitive matching', () => {
  const result = validateTag('AUTHENTICATION');
  assert.strictEqual(result, 'authentication');
});

test('validateTag: handles mixed case', () => {
  const result = validateTag('AuthEntiCation');
  assert.strictEqual(result, 'authentication');
});

test('validateTag: returns null for close but incorrect tags', () => {
  const result = validateTag('authentification'); // Common typo
  assert.strictEqual(result, null);
});

// Test: Multiple tags validation
test('validateTagsWithDetails: validates all valid tags', () => {
  const tags = ['authentication', 'jwt', 'api_endpoint'];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  assert.strictEqual(result.valid.length, 3);
  assert.strictEqual(result.invalid.length, 0);
  assert.strictEqual(result.isValid, true);
  assert.deepStrictEqual(result.valid, ['authentication', 'jwt', 'api_endpoint']);
});

test('validateTagsWithDetails: separates valid and invalid tags', () => {
  const tags = ['authentication', 'invalid_tag', 'jwt', 'another_bad_tag'];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  assert.strictEqual(result.valid.length, 2);
  assert.strictEqual(result.invalid.length, 2);
  assert.strictEqual(result.isValid, false);
  assert.deepStrictEqual(result.valid, ['authentication', 'jwt']);
  assert.deepStrictEqual(result.invalid, ['invalid_tag', 'another_bad_tag']);
});

test('validateTagsWithDetails: handles all invalid tags', () => {
  const tags = ['bad_tag1', 'bad_tag2', 'bad_tag3'];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  assert.strictEqual(result.valid.length, 0);
  assert.strictEqual(result.invalid.length, 3);
  assert.strictEqual(result.isValid, false);
  assert.deepStrictEqual(result.invalid, ['bad_tag1', 'bad_tag2', 'bad_tag3']);
});

test('validateTagsWithDetails: removes duplicate valid tags', () => {
  const tags = ['authentication', 'jwt', 'authentication', 'jwt'];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  assert.strictEqual(result.valid.length, 2);
  assert.strictEqual(result.invalid.length, 0);
  assert.deepStrictEqual(result.valid, ['authentication', 'jwt']);
});

test('validateTagsWithDetails: removes duplicate invalid tags', () => {
  const tags = ['bad_tag', 'authentication', 'bad_tag', 'jwt'];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  assert.strictEqual(result.valid.length, 2);
  assert.strictEqual(result.invalid.length, 1);
  assert.deepStrictEqual(result.valid, ['authentication', 'jwt']);
  assert.deepStrictEqual(result.invalid, ['bad_tag']);
});

test('validateTagsWithDetails: enforces MAX_TAGS_PER_FILE limit', () => {
  const tags = ['authentication', 'jwt', 'api_endpoint', 'database', 'orm', 'cache', 'testing'];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  // MAX_TAGS_PER_FILE is 5
  assert.strictEqual(result.valid.length, 5);
  assert.strictEqual(result.invalid.length, 0);
  assert.strictEqual(result.isValid, true);
  // First 5 tags should be kept
  assert.deepStrictEqual(result.valid, ['authentication', 'jwt', 'api_endpoint', 'database', 'orm']);
});

test('validateTagsWithDetails: handles case-insensitive tags', () => {
  const tags = ['AUTHENTICATION', 'Jwt', 'api_ENDPOINT'];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  assert.strictEqual(result.valid.length, 3);
  assert.strictEqual(result.invalid.length, 0);
  assert.strictEqual(result.isValid, true);
  // Should normalize to lowercase
  assert.deepStrictEqual(result.valid, ['authentication', 'jwt', 'api_endpoint']);
});

test('validateTagsWithDetails: handles empty tag array', () => {
  const tags: string[] = [];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  assert.strictEqual(result.valid.length, 0);
  assert.strictEqual(result.invalid.length, 0);
  assert.strictEqual(result.isValid, true);
});

test('validateTagsWithDetails: handles mixed valid/invalid with duplicates', () => {
  const tags = [
    'authentication',
    'bad_tag',
    'jwt',
    'AUTHENTICATION', // duplicate, different case
    'another_bad',
    'JWT', // duplicate, different case
  ];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  assert.strictEqual(result.valid.length, 2);
  assert.strictEqual(result.invalid.length, 2);
  assert.strictEqual(result.isValid, false);
  assert.deepStrictEqual(result.valid, ['authentication', 'jwt']);
  assert.deepStrictEqual(result.invalid, ['bad_tag', 'another_bad']);
});

// Test: Correction prompt building
test('buildTagCorrectionPrompt: includes invalid tags', () => {
  const invalidTags = ['login_flow', 'user_management_system'];
  const originalResponse = JSON.stringify({
    purpose: 'Test',
    tags: ['authentication', 'login_flow', 'user_management_system'],
    exports: [],
    imports: [],
  });

  const prompt = buildTagCorrectionPrompt(invalidTags, originalResponse);

  assert.ok(prompt.includes('login_flow'));
  assert.ok(prompt.includes('user_management_system'));
  assert.ok(prompt.includes('Invalid tags'));
});

test('buildTagCorrectionPrompt: includes full taxonomy', () => {
  const invalidTags = ['bad_tag'];
  const originalResponse = JSON.stringify({
    purpose: 'Test',
    tags: ['bad_tag'],
    exports: [],
    imports: [],
  });

  const prompt = buildTagCorrectionPrompt(invalidTags, originalResponse);

  // Check that some taxonomy tags are present
  assert.ok(prompt.includes('authentication'));
  assert.ok(prompt.includes('database'));
  assert.ok(prompt.includes('api_endpoint'));
  assert.ok(prompt.includes('Valid Tag Taxonomy'));
});

test('buildTagCorrectionPrompt: includes original response', () => {
  const invalidTags = ['bad_tag'];
  const originalResponse = JSON.stringify({
    purpose: 'This is the original purpose',
    tags: ['bad_tag'],
    exports: ['testExport'],
    imports: ['test/import'],
  });

  const prompt = buildTagCorrectionPrompt(invalidTags, originalResponse);

  assert.ok(prompt.includes(originalResponse));
  assert.ok(prompt.includes('Your previous response'));
});

test('buildTagCorrectionPrompt: handles single invalid tag', () => {
  const invalidTags = ['single_bad_tag'];
  const originalResponse = '{}';

  const prompt = buildTagCorrectionPrompt(invalidTags, originalResponse);

  assert.ok(prompt.includes('"single_bad_tag"'));
  assert.ok(prompt.includes('Invalid tags'));
});

test('buildTagCorrectionPrompt: handles multiple invalid tags', () => {
  const invalidTags = ['tag1', 'tag2', 'tag3'];
  const originalResponse = '{}';

  const prompt = buildTagCorrectionPrompt(invalidTags, originalResponse);

  assert.ok(prompt.includes('"tag1"'));
  assert.ok(prompt.includes('"tag2"'));
  assert.ok(prompt.includes('"tag3"'));
});

// Test: Integration with actual taxonomy
test('validateTag: all tags in TAG_TAXONOMY are valid', () => {
  for (const tag of TAG_TAXONOMY) {
    const result = validateTag(tag);
    assert.strictEqual(
      result,
      tag,
      `Tag "${tag}" from TAG_TAXONOMY should be valid but validateTag returned ${result}`
    );
  }
});

test('validateTagsWithDetails: validates real taxonomy tags', () => {
  const tags = [
    'authentication',
    'authorization',
    'database',
    'api_endpoint',
    'testing',
  ];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  assert.strictEqual(result.valid.length, 5);
  assert.strictEqual(result.invalid.length, 0);
  assert.strictEqual(result.isValid, true);
});

test('validateTagsWithDetails: common typos are caught as invalid', () => {
  const tags = [
    'authentification', // typo
    'authorisation', // UK spelling
    'databse', // typo
    'api_enpoint', // typo
  ];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  assert.strictEqual(result.valid.length, 0);
  assert.strictEqual(result.invalid.length, 4);
  assert.strictEqual(result.isValid, false);
});
