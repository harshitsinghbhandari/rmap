/**
 * Tests for Tag Validation with Retry Logic and Quality Checks
 *
 * Tests tag validation, invalid tag detection, quality warnings,
 * banned combinations, barrel file handling, and correction prompt building
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  validateTag,
  validateTagsWithDetails,
  buildTagCorrectionPrompt,
  buildTagQualityPrompt,
  isBarrelFile,
  getTagTier,
  detectBannedCombinations,
  detectBarrelFileDiscouragedTags,
  getLowSignalTags,
} from '../../../src/levels/level3/tag-validator.js';
import { TAG_TAXONOMY, TAG_TIERS, BANNED_TAG_COMBINATIONS } from '../../../src/core/constants.js';
import { FILE } from '../../../src/config/index.js';

// ====================
// Single tag validation
// ====================

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

// ====================
// Multiple tags validation
// ====================

test('validateTagsWithDetails: validates all valid tags', () => {
  const tags = ['authentication', 'jwt'];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  assert.strictEqual(result.valid.length, 2);
  assert.strictEqual(result.invalid.length, 0);
  assert.strictEqual(result.isValid, true);
  assert.deepStrictEqual(result.valid, ['authentication', 'jwt']);
});

test('validateTagsWithDetails: separates valid and invalid tags', () => {
  const tags = ['authentication', 'invalid_tag', 'jwt'];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  assert.strictEqual(result.valid.length, 2);
  assert.strictEqual(result.invalid.length, 1);
  assert.strictEqual(result.isValid, false);
  assert.deepStrictEqual(result.valid, ['authentication', 'jwt']);
  assert.deepStrictEqual(result.invalid, ['invalid_tag']);
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
  const tags = ['authentication', 'jwt', 'authentication'];
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

test('validateTagsWithDetails: enforces MAX_TAGS_PER_FILE limit of 3', () => {
  // MAX_TAGS_PER_FILE is now 3
  assert.strictEqual(FILE.MAX_TAGS_PER_FILE, 3, 'MAX_TAGS_PER_FILE should be 3');

  const tags = ['authentication', 'jwt', 'api_endpoint', 'database', 'orm'];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  // Should be limited to 3 tags
  assert.strictEqual(result.valid.length, 3);
  assert.strictEqual(result.invalid.length, 0);
  assert.strictEqual(result.isValid, true);
  // First 3 tags should be kept
  assert.deepStrictEqual(result.valid, ['authentication', 'jwt', 'api_endpoint']);
});

test('validateTagsWithDetails: handles case-insensitive tags', () => {
  const tags = ['AUTHENTICATION', 'Jwt'];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  assert.strictEqual(result.valid.length, 2);
  assert.strictEqual(result.invalid.length, 0);
  assert.strictEqual(result.isValid, true);
  // Should normalize to lowercase
  assert.deepStrictEqual(result.valid, ['authentication', 'jwt']);
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

// ====================
// Barrel file detection
// ====================

test('isBarrelFile: detects index.ts', () => {
  assert.strictEqual(isBarrelFile('src/index.ts'), true);
  assert.strictEqual(isBarrelFile('src/services/index.ts'), true);
  assert.strictEqual(isBarrelFile('index.ts'), true);
});

test('isBarrelFile: detects index.js', () => {
  assert.strictEqual(isBarrelFile('src/index.js'), true);
  assert.strictEqual(isBarrelFile('lib/index.jsx'), true);
});

test('isBarrelFile: detects mod.rs (Rust)', () => {
  assert.strictEqual(isBarrelFile('src/mod.rs'), true);
  assert.strictEqual(isBarrelFile('services/mod.rs'), true);
});

test('isBarrelFile: detects __init__.py (Python)', () => {
  assert.strictEqual(isBarrelFile('src/__init__.py'), true);
  assert.strictEqual(isBarrelFile('package/__init__.py'), true);
});

test('isBarrelFile: returns false for non-barrel files', () => {
  assert.strictEqual(isBarrelFile('src/auth.ts'), false);
  assert.strictEqual(isBarrelFile('src/services/user-service.ts'), false);
  assert.strictEqual(isBarrelFile('index-helper.ts'), false);
  assert.strictEqual(isBarrelFile('reindex.ts'), false);
});

// ====================
// Tag tier classification
// ====================

test('getTagTier: classifies high-signal tags as tier 1', () => {
  assert.strictEqual(getTagTier('authentication'), 1);
  assert.strictEqual(getTagTier('database'), 1);
  assert.strictEqual(getTagTier('api_endpoint'), 1);
  assert.strictEqual(getTagTier('config'), 1);
  assert.strictEqual(getTagTier('testing'), 1);
  assert.strictEqual(getTagTier('logging'), 1);
});

test('getTagTier: classifies architecture tags as tier 2', () => {
  assert.strictEqual(getTagTier('service'), 2);
  assert.strictEqual(getTagTier('controller'), 2);
  assert.strictEqual(getTagTier('middleware'), 2);
  assert.strictEqual(getTagTier('repository'), 2);
  assert.strictEqual(getTagTier('model'), 2);
});

test('getTagTier: classifies low-signal tags as tier 3', () => {
  assert.strictEqual(getTagTier('utility'), 3);
  assert.strictEqual(getTagTier('helper'), 3);
  assert.strictEqual(getTagTier('handler'), 3);
  assert.strictEqual(getTagTier('interface'), 3);
  assert.strictEqual(getTagTier('backend'), 3);
});

// ====================
// Banned combinations
// ====================

test('detectBannedCombinations: detects utility + helper', () => {
  const tags = ['utility', 'helper', 'config'] as const;
  const result = detectBannedCombinations([...tags]);

  assert.strictEqual(result.length, 1);
  assert.deepStrictEqual(result[0], ['utility', 'helper']);
});

test('detectBannedCombinations: detects service + handler', () => {
  const tags = ['service', 'handler', 'api_endpoint'] as const;
  const result = detectBannedCombinations([...tags]);

  assert.strictEqual(result.length, 1);
  assert.deepStrictEqual(result[0], ['service', 'handler']);
});

test('detectBannedCombinations: detects multiple banned combos', () => {
  const tags = ['utility', 'helper', 'backend', 'server'] as const;
  const result = detectBannedCombinations([...tags]);

  // Should detect: utility+helper, backend+server
  assert.strictEqual(result.length, 2);
});

test('detectBannedCombinations: returns empty for clean tags', () => {
  const tags = ['authentication', 'jwt', 'config'] as const;
  const result = detectBannedCombinations([...tags]);

  assert.strictEqual(result.length, 0);
});

// ====================
// Barrel file discouraged tags
// ====================

test('detectBarrelFileDiscouragedTags: warns on barrel files with generic tags', () => {
  const tags = ['interface', 'utility', 'helper'] as const;
  const result = detectBarrelFileDiscouragedTags([...tags], 'src/index.ts');

  assert.strictEqual(result.length, 3);
  assert.ok(result.includes('interface'));
  assert.ok(result.includes('utility'));
  assert.ok(result.includes('helper'));
});

test('detectBarrelFileDiscouragedTags: returns empty for non-barrel files', () => {
  const tags = ['interface', 'utility', 'helper'] as const;
  const result = detectBarrelFileDiscouragedTags([...tags], 'src/auth.ts');

  assert.strictEqual(result.length, 0);
});

test('detectBarrelFileDiscouragedTags: allows domain tags on barrels', () => {
  const tags = ['authentication', 'jwt'] as const;
  const result = detectBarrelFileDiscouragedTags([...tags], 'src/index.ts');

  assert.strictEqual(result.length, 0);
});

// ====================
// Low-signal tag detection
// ====================

test('getLowSignalTags: identifies low-signal tags', () => {
  const tags = ['authentication', 'utility', 'helper', 'jwt'] as const;
  const result = getLowSignalTags([...tags]);

  assert.strictEqual(result.length, 2);
  assert.ok(result.includes('utility'));
  assert.ok(result.includes('helper'));
});

test('getLowSignalTags: returns empty for high-signal tags', () => {
  const tags = ['authentication', 'database', 'api_endpoint'] as const;
  const result = getLowSignalTags([...tags]);

  assert.strictEqual(result.length, 0);
});

// ====================
// Quality warnings in validation
// ====================

test('validateTagsWithDetails: adds warning for banned combinations', () => {
  const tags = ['utility', 'helper'];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  assert.strictEqual(result.warnings.length > 0, true);
  const bannedWarning = result.warnings.find((w) => w.type === 'banned_combination');
  assert.ok(bannedWarning, 'Should have banned_combination warning');
  assert.deepStrictEqual(bannedWarning.tags, ['utility', 'helper']);
  assert.strictEqual(result.passesQualityChecks, false);
});

test('validateTagsWithDetails: adds warning for barrel file with discouraged tags', () => {
  const tags = ['interface', 'utility'];
  const result = validateTagsWithDetails(tags, 'src/index.ts');

  const barrelWarning = result.warnings.find((w) => w.type === 'barrel_file_discouraged');
  assert.ok(barrelWarning, 'Should have barrel_file_discouraged warning');
  assert.ok(barrelWarning.tags.includes('interface'));
  assert.ok(barrelWarning.tags.includes('utility'));
});

test('validateTagsWithDetails: adds warning for low-signal tags', () => {
  const tags = ['utility', 'config'];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  const lowSignalWarning = result.warnings.find((w) => w.type === 'low_signal_tag');
  assert.ok(lowSignalWarning, 'Should have low_signal_tag warning');
  assert.ok(lowSignalWarning.tags.includes('utility'));
});

test('validateTagsWithDetails: adds critical warning for too many low-signal tags', () => {
  const tags = ['utility', 'helper', 'handler'];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  const tooManyWarning = result.warnings.find((w) => w.type === 'too_many_low_signal');
  assert.ok(tooManyWarning, 'Should have too_many_low_signal warning');
  assert.strictEqual(result.passesQualityChecks, false);
});

test('validateTagsWithDetails: passes quality checks for good tags', () => {
  const tags = ['authentication', 'jwt'];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  // High-signal tags should pass quality checks
  assert.strictEqual(result.passesQualityChecks, true);
  // Should have no warnings (or only informational ones)
  const criticalWarnings = result.warnings.filter(
    (w) => w.type === 'banned_combination' || w.type === 'too_many_low_signal'
  );
  assert.strictEqual(criticalWarnings.length, 0);
});

test('validateTagsWithDetails: allows single low-signal tag with warning', () => {
  const tags = ['config', 'utility'];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  // Should have low_signal_tag warning but pass quality checks
  const lowSignalWarning = result.warnings.find((w) => w.type === 'low_signal_tag');
  assert.ok(lowSignalWarning, 'Should have low_signal_tag warning');

  // Should pass because only one low-signal tag
  const tooManyWarning = result.warnings.find((w) => w.type === 'too_many_low_signal');
  assert.strictEqual(tooManyWarning, undefined, 'Should not have too_many_low_signal warning');
  assert.strictEqual(result.passesQualityChecks, true);
});

// ====================
// Correction prompt building
// ====================

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

test('buildTagCorrectionPrompt: includes taxonomy organized by tiers', () => {
  const invalidTags = ['bad_tag'];
  const originalResponse = JSON.stringify({
    purpose: 'Test',
    tags: ['bad_tag'],
    exports: [],
    imports: [],
  });

  const prompt = buildTagCorrectionPrompt(invalidTags, originalResponse);

  // Check that tier headers are present
  assert.ok(prompt.includes('HIGH-SIGNAL DOMAIN TAGS'));
  assert.ok(prompt.includes('ARCHITECTURE PATTERN TAGS'));
  assert.ok(prompt.includes('LOW-SIGNAL FALLBACK TAGS'));
  // Check some taxonomy tags are present
  assert.ok(prompt.includes('authentication'));
  assert.ok(prompt.includes('database'));
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

test('buildTagCorrectionPrompt: includes guidance on tag limits', () => {
  const invalidTags = ['bad_tag'];
  const originalResponse = '{}';

  const prompt = buildTagCorrectionPrompt(invalidTags, originalResponse);

  // Should mention the max tags limit
  assert.ok(prompt.includes(`1-${FILE.MAX_TAGS_PER_FILE}`));
  assert.ok(prompt.includes('MOST DEFINING'));
});

// ====================
// Quality prompt building
// ====================

test('buildTagQualityPrompt: includes warning messages', () => {
  const warnings = [
    {
      type: 'banned_combination' as const,
      message: 'Banned combination: "utility" + "helper"',
      tags: ['utility', 'helper'] as const,
    },
  ];
  const originalResponse = JSON.stringify({
    purpose: 'Test',
    tags: ['utility', 'helper'],
    exports: [],
  });

  const prompt = buildTagQualityPrompt(warnings, originalResponse);

  assert.ok(prompt.includes('Banned combination'));
  assert.ok(prompt.includes('utility'));
  assert.ok(prompt.includes('helper'));
});

test('buildTagQualityPrompt: includes guidance for better selection', () => {
  const warnings = [
    {
      type: 'low_signal_tag' as const,
      message: 'Low-signal tags detected',
      tags: ['utility'] as const,
    },
  ];
  const originalResponse = '{}';

  const prompt = buildTagQualityPrompt(warnings, originalResponse);

  assert.ok(prompt.includes('MOST DEFINING'));
  assert.ok(prompt.includes('specific domain tags'));
  assert.ok(prompt.includes('Barrel files'));
});

// ====================
// Integration with actual taxonomy
// ====================

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
  const tags = ['authentication', 'authorization', 'database'];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  assert.strictEqual(result.valid.length, 3);
  assert.strictEqual(result.invalid.length, 0);
  assert.strictEqual(result.isValid, true);
});

test('validateTagsWithDetails: common typos are caught as invalid', () => {
  const tags = [
    'authentification', // typo
    'authorisation', // UK spelling
    'databse', // typo
  ];
  const result = validateTagsWithDetails(tags, 'test/file.ts');

  assert.strictEqual(result.valid.length, 0);
  assert.strictEqual(result.invalid.length, 3);
  assert.strictEqual(result.isValid, false);
});

// ====================
// Verify constants are set correctly
// ====================

test('MAX_TAGS_PER_FILE is set to 3', () => {
  assert.strictEqual(FILE.MAX_TAGS_PER_FILE, 3);
});

test('TAG_TIERS contains all expected categories', () => {
  assert.ok(Array.isArray(TAG_TIERS.HIGH_SIGNAL));
  assert.ok(Array.isArray(TAG_TIERS.ARCHITECTURE));
  assert.ok(Array.isArray(TAG_TIERS.LOW_SIGNAL));
  assert.ok(TAG_TIERS.HIGH_SIGNAL.length > 0);
  assert.ok(TAG_TIERS.ARCHITECTURE.length > 0);
  assert.ok(TAG_TIERS.LOW_SIGNAL.length > 0);
});

test('BANNED_TAG_COMBINATIONS is properly defined', () => {
  assert.ok(Array.isArray(BANNED_TAG_COMBINATIONS));
  assert.ok(BANNED_TAG_COMBINATIONS.length > 0);

  // Each combination should be a tuple of two tags
  for (const combo of BANNED_TAG_COMBINATIONS) {
    assert.strictEqual(combo.length, 2);
    assert.ok(TAG_TAXONOMY.includes(combo[0]));
    assert.ok(TAG_TAXONOMY.includes(combo[1]));
  }
});

test('All tags in TAG_TIERS are in TAG_TAXONOMY', () => {
  const allTierTags = [
    ...TAG_TIERS.HIGH_SIGNAL,
    ...TAG_TIERS.ARCHITECTURE,
    ...TAG_TIERS.LOW_SIGNAL,
  ];

  for (const tag of allTierTags) {
    assert.ok(
      TAG_TAXONOMY.includes(tag),
      `Tag "${tag}" in TAG_TIERS is not in TAG_TAXONOMY`
    );
  }
});
