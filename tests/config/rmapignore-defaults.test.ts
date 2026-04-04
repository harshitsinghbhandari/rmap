/**
 * Tests for config/rmapignore-defaults.ts
 *
 * Tests default .rmapignore patterns for file exclusion.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  DEFAULT_RMAPIGNORE,
  ALWAYS_IGNORE_PATTERNS,
} from '../../src/config/rmapignore-defaults.js';

// ============================================================================
// DEFAULT_RMAPIGNORE Tests
// ============================================================================

test('DEFAULT_RMAPIGNORE is a non-empty string', () => {
  assert.strictEqual(typeof DEFAULT_RMAPIGNORE, 'string');
  assert.ok(DEFAULT_RMAPIGNORE.length > 0);
});

test('DEFAULT_RMAPIGNORE contains build artifact patterns', () => {
  assert.ok(DEFAULT_RMAPIGNORE.includes('dist/'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('build/'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('.next/'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('.nuxt/'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('out/'));
});

test('DEFAULT_RMAPIGNORE contains dependency patterns', () => {
  assert.ok(DEFAULT_RMAPIGNORE.includes('node_modules/'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('vendor/'));
});

test('DEFAULT_RMAPIGNORE contains log patterns', () => {
  assert.ok(DEFAULT_RMAPIGNORE.includes('*.log'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('logs/'));
});

test('DEFAULT_RMAPIGNORE contains OS file patterns', () => {
  assert.ok(DEFAULT_RMAPIGNORE.includes('.DS_Store'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('Thumbs.db'));
});

test('DEFAULT_RMAPIGNORE contains IDE/editor patterns', () => {
  assert.ok(DEFAULT_RMAPIGNORE.includes('.vscode/'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('.idea/'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('*.swp'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('*.swo'));
});

test('DEFAULT_RMAPIGNORE contains lock file patterns', () => {
  assert.ok(DEFAULT_RMAPIGNORE.includes('pnpm-lock.yaml'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('package-lock.json'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('yarn.lock'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('Cargo.lock'));
});

test('DEFAULT_RMAPIGNORE contains generated/compiled file patterns', () => {
  assert.ok(DEFAULT_RMAPIGNORE.includes('*.min.js'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('*.bundle.js'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('*.map'));
});

test('DEFAULT_RMAPIGNORE contains test coverage patterns', () => {
  assert.ok(DEFAULT_RMAPIGNORE.includes('coverage/'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('.nyc_output/'));
});

test('DEFAULT_RMAPIGNORE contains temporary file patterns', () => {
  assert.ok(DEFAULT_RMAPIGNORE.includes('*.tmp'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('*.temp'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('.cache/'));
});

test('DEFAULT_RMAPIGNORE contains Python patterns', () => {
  assert.ok(DEFAULT_RMAPIGNORE.includes('__pycache__/'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('.pytest_cache/'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('.mypy_cache/'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('venv/'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('.venv/'));
});

test('DEFAULT_RMAPIGNORE contains build output patterns', () => {
  assert.ok(DEFAULT_RMAPIGNORE.includes('target/'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('bin/'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('obj/'));
});

test('DEFAULT_RMAPIGNORE has proper comment sections', () => {
  // Should have comments for organization
  assert.ok(DEFAULT_RMAPIGNORE.includes('# Build artifacts'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('# Dependencies'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('# Logs'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('# OS files'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('# IDE/Editor'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('# Lock files'));
  assert.ok(DEFAULT_RMAPIGNORE.includes('# Python'));
});

test('DEFAULT_RMAPIGNORE patterns are properly formatted', () => {
  const lines = DEFAULT_RMAPIGNORE.split('\n');

  for (const line of lines) {
    // Skip empty lines and comments
    if (line.trim() === '' || line.trim().startsWith('#')) {
      continue;
    }

    // Each non-empty, non-comment line should be a valid pattern
    // Patterns typically start with *, ., or alphanumeric
    assert.ok(
      /^[\w.*_-]/.test(line.trim()),
      `Invalid pattern format: "${line}"`
    );
  }
});

// ============================================================================
// ALWAYS_IGNORE_PATTERNS Tests
// ============================================================================

test('ALWAYS_IGNORE_PATTERNS is a non-empty array', () => {
  assert.ok(Array.isArray(ALWAYS_IGNORE_PATTERNS));
  assert.ok(ALWAYS_IGNORE_PATTERNS.length > 0);
});

test('ALWAYS_IGNORE_PATTERNS contains .git/', () => {
  assert.ok(ALWAYS_IGNORE_PATTERNS.includes('.git/'));
});

test('ALWAYS_IGNORE_PATTERNS contains .repo_map/', () => {
  assert.ok(ALWAYS_IGNORE_PATTERNS.includes('.repo_map/'));
});

test('ALWAYS_IGNORE_PATTERNS has exactly 2 patterns', () => {
  assert.strictEqual(ALWAYS_IGNORE_PATTERNS.length, 2);
});

test('ALWAYS_IGNORE_PATTERNS are all strings', () => {
  for (const pattern of ALWAYS_IGNORE_PATTERNS) {
    assert.strictEqual(typeof pattern, 'string');
  }
});

test('ALWAYS_IGNORE_PATTERNS all end with /', () => {
  // These should be directory patterns
  for (const pattern of ALWAYS_IGNORE_PATTERNS) {
    assert.ok(
      pattern.endsWith('/'),
      `Pattern "${pattern}" should end with / for directory matching`
    );
  }
});

// ============================================================================
// Pattern Uniqueness Tests
// ============================================================================

test('DEFAULT_RMAPIGNORE has no duplicate patterns', () => {
  const lines = DEFAULT_RMAPIGNORE.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));

  const uniqueLines = new Set(lines);
  assert.strictEqual(
    uniqueLines.size,
    lines.length,
    'DEFAULT_RMAPIGNORE contains duplicate patterns'
  );
});

test('ALWAYS_IGNORE_PATTERNS has no duplicates', () => {
  const unique = new Set(ALWAYS_IGNORE_PATTERNS);
  assert.strictEqual(
    unique.size,
    ALWAYS_IGNORE_PATTERNS.length,
    'ALWAYS_IGNORE_PATTERNS contains duplicates'
  );
});

// ============================================================================
// Pattern Consistency Tests
// ============================================================================

test('DEFAULT_RMAPIGNORE does not duplicate ALWAYS_IGNORE_PATTERNS', () => {
  for (const alwaysPattern of ALWAYS_IGNORE_PATTERNS) {
    assert.ok(
      !DEFAULT_RMAPIGNORE.includes(alwaysPattern),
      `DEFAULT_RMAPIGNORE should not include "${alwaysPattern}" as it's in ALWAYS_IGNORE_PATTERNS`
    );
  }
});

test('All patterns are non-empty strings', () => {
  const defaultPatterns = DEFAULT_RMAPIGNORE.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));

  const allPatterns = [...defaultPatterns, ...ALWAYS_IGNORE_PATTERNS];

  for (const pattern of allPatterns) {
    assert.ok(pattern.length > 0, 'Found empty pattern');
  }
});
