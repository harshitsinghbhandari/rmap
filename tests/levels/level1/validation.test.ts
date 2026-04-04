/**
 * Tests for levels/level1/validation.ts
 *
 * Tests Level 1 LLM response validation.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  validateLevel1Output,
  ValidationError,
} from '../../../src/levels/level1/validation.js';
import type { Level1Output } from '../../../src/core/types.js';

// ============================================================================
// Valid Input Tests
// ============================================================================

test('validateLevel1Output: accepts valid complete output', () => {
  const validInput = {
    repo_name: 'my-project',
    purpose: 'A web application for managing tasks',
    stack: 'Node.js with React frontend',
    languages: ['TypeScript', 'JavaScript', 'CSS'],
    entrypoints: ['src/index.ts', 'src/server.ts'],
    modules: [
      { path: 'src/components/', description: 'React components' },
      { path: 'src/services/', description: 'Business logic' },
    ],
    config_files: ['package.json', 'tsconfig.json', '.env.example'],
    conventions: ['ESM modules', 'Prettier formatting'],
  };

  const result = validateLevel1Output(validInput);

  assert.strictEqual(result.repo_name, 'my-project');
  assert.strictEqual(result.purpose, 'A web application for managing tasks');
  assert.deepStrictEqual(result.languages, ['TypeScript', 'JavaScript', 'CSS']);
});

test('validateLevel1Output: accepts minimal valid output', () => {
  const minimalInput = {
    repo_name: 'test',
    purpose: 'Test project',
    stack: 'Node.js',
    languages: ['JavaScript'],
    entrypoints: [],
    modules: [],
    config_files: [],
    conventions: [],
  };

  const result = validateLevel1Output(minimalInput);

  assert.strictEqual(result.repo_name, 'test');
  assert.deepStrictEqual(result.entrypoints, []);
  assert.deepStrictEqual(result.modules, []);
});

// ============================================================================
// Invalid Input - Not Object Tests
// ============================================================================

test('validateLevel1Output: rejects null', () => {
  assert.throws(
    () => validateLevel1Output(null),
    ValidationError,
    'Should reject null input'
  );
});

test('validateLevel1Output: rejects undefined', () => {
  assert.throws(
    () => validateLevel1Output(undefined),
    ValidationError,
    'Should reject undefined input'
  );
});

test('validateLevel1Output: rejects string', () => {
  assert.throws(
    () => validateLevel1Output('not an object'),
    ValidationError,
    'Should reject string input'
  );
});

test('validateLevel1Output: rejects array', () => {
  assert.throws(
    () => validateLevel1Output([]),
    ValidationError,
    'Should reject array input'
  );
});

test('validateLevel1Output: rejects number', () => {
  assert.throws(
    () => validateLevel1Output(42),
    ValidationError,
    'Should reject number input'
  );
});

// ============================================================================
// Invalid Input - Missing Required Fields Tests
// ============================================================================

test('validateLevel1Output: rejects missing repo_name', () => {
  const input = {
    purpose: 'Test',
    stack: 'Node.js',
    languages: ['JavaScript'],
    entrypoints: [],
    modules: [],
    config_files: [],
    conventions: [],
  };

  assert.throws(
    () => validateLevel1Output(input),
    (error: Error) => {
      assert.ok(error instanceof ValidationError);
      assert.ok(error.message.includes('repo_name'));
      return true;
    }
  );
});

test('validateLevel1Output: rejects missing purpose', () => {
  const input = {
    repo_name: 'test',
    stack: 'Node.js',
    languages: ['JavaScript'],
    entrypoints: [],
    modules: [],
    config_files: [],
    conventions: [],
  };

  assert.throws(
    () => validateLevel1Output(input),
    (error: Error) => {
      assert.ok(error instanceof ValidationError);
      assert.ok(error.message.includes('purpose'));
      return true;
    }
  );
});

test('validateLevel1Output: rejects missing stack', () => {
  const input = {
    repo_name: 'test',
    purpose: 'Test',
    languages: ['JavaScript'],
    entrypoints: [],
    modules: [],
    config_files: [],
    conventions: [],
  };

  assert.throws(
    () => validateLevel1Output(input),
    (error: Error) => {
      assert.ok(error instanceof ValidationError);
      assert.ok(error.message.includes('stack'));
      return true;
    }
  );
});

test('validateLevel1Output: rejects missing languages', () => {
  const input = {
    repo_name: 'test',
    purpose: 'Test',
    stack: 'Node.js',
    entrypoints: [],
    modules: [],
    config_files: [],
    conventions: [],
  };

  assert.throws(
    () => validateLevel1Output(input),
    (error: Error) => {
      assert.ok(error instanceof ValidationError);
      assert.ok(error.message.includes('languages'));
      return true;
    }
  );
});

// ============================================================================
// Invalid Input - Empty Strings Tests
// ============================================================================

test('validateLevel1Output: rejects empty repo_name', () => {
  const input = {
    repo_name: '',
    purpose: 'Test',
    stack: 'Node.js',
    languages: ['JavaScript'],
    entrypoints: [],
    modules: [],
    config_files: [],
    conventions: [],
  };

  assert.throws(
    () => validateLevel1Output(input),
    ValidationError,
    'Should reject empty repo_name'
  );
});

test('validateLevel1Output: rejects whitespace-only repo_name', () => {
  const input = {
    repo_name: '   ',
    purpose: 'Test',
    stack: 'Node.js',
    languages: ['JavaScript'],
    entrypoints: [],
    modules: [],
    config_files: [],
    conventions: [],
  };

  assert.throws(
    () => validateLevel1Output(input),
    ValidationError,
    'Should reject whitespace-only repo_name'
  );
});

// ============================================================================
// Invalid Input - Languages Array Tests
// ============================================================================

test('validateLevel1Output: rejects empty languages array', () => {
  const input = {
    repo_name: 'test',
    purpose: 'Test',
    stack: 'Node.js',
    languages: [],
    entrypoints: [],
    modules: [],
    config_files: [],
    conventions: [],
  };

  assert.throws(
    () => validateLevel1Output(input),
    (error: Error) => {
      assert.ok(error instanceof ValidationError);
      assert.ok(error.message.includes('at least one language'));
      return true;
    }
  );
});

test('validateLevel1Output: rejects non-array languages', () => {
  const input = {
    repo_name: 'test',
    purpose: 'Test',
    stack: 'Node.js',
    languages: 'JavaScript',
    entrypoints: [],
    modules: [],
    config_files: [],
    conventions: [],
  };

  assert.throws(
    () => validateLevel1Output(input),
    (error: Error) => {
      assert.ok(error instanceof ValidationError);
      assert.ok(error.message.includes('languages'));
      return true;
    }
  );
});

test('validateLevel1Output: rejects languages with non-string elements', () => {
  const input = {
    repo_name: 'test',
    purpose: 'Test',
    stack: 'Node.js',
    languages: ['JavaScript', 123],
    entrypoints: [],
    modules: [],
    config_files: [],
    conventions: [],
  };

  assert.throws(
    () => validateLevel1Output(input),
    ValidationError,
    'Should reject languages with non-string elements'
  );
});

// ============================================================================
// Invalid Input - Modules Array Tests
// ============================================================================

test('validateLevel1Output: rejects non-array modules', () => {
  const input = {
    repo_name: 'test',
    purpose: 'Test',
    stack: 'Node.js',
    languages: ['JavaScript'],
    entrypoints: [],
    modules: 'not an array',
    config_files: [],
    conventions: [],
  };

  assert.throws(
    () => validateLevel1Output(input),
    (error: Error) => {
      assert.ok(error instanceof ValidationError);
      assert.ok(error.message.includes('modules'));
      return true;
    }
  );
});

test('validateLevel1Output: rejects modules with missing path', () => {
  const input = {
    repo_name: 'test',
    purpose: 'Test',
    stack: 'Node.js',
    languages: ['JavaScript'],
    entrypoints: [],
    modules: [{ description: 'missing path' }],
    config_files: [],
    conventions: [],
  };

  assert.throws(
    () => validateLevel1Output(input),
    ValidationError,
    'Should reject module without path'
  );
});

test('validateLevel1Output: rejects modules with missing description', () => {
  const input = {
    repo_name: 'test',
    purpose: 'Test',
    stack: 'Node.js',
    languages: ['JavaScript'],
    entrypoints: [],
    modules: [{ path: 'src/' }],
    config_files: [],
    conventions: [],
  };

  assert.throws(
    () => validateLevel1Output(input),
    ValidationError,
    'Should reject module without description'
  );
});

test('validateLevel1Output: rejects modules with empty path', () => {
  const input = {
    repo_name: 'test',
    purpose: 'Test',
    stack: 'Node.js',
    languages: ['JavaScript'],
    entrypoints: [],
    modules: [{ path: '', description: 'Empty path' }],
    config_files: [],
    conventions: [],
  };

  assert.throws(
    () => validateLevel1Output(input),
    ValidationError,
    'Should reject module with empty path'
  );
});

// ============================================================================
// Invalid Input - Other Arrays Tests
// ============================================================================

test('validateLevel1Output: rejects non-array entrypoints', () => {
  const input = {
    repo_name: 'test',
    purpose: 'Test',
    stack: 'Node.js',
    languages: ['JavaScript'],
    entrypoints: 'not an array',
    modules: [],
    config_files: [],
    conventions: [],
  };

  assert.throws(
    () => validateLevel1Output(input),
    (error: Error) => {
      assert.ok(error instanceof ValidationError);
      assert.ok(error.message.includes('entrypoints'));
      return true;
    }
  );
});

test('validateLevel1Output: rejects non-array config_files', () => {
  const input = {
    repo_name: 'test',
    purpose: 'Test',
    stack: 'Node.js',
    languages: ['JavaScript'],
    entrypoints: [],
    modules: [],
    config_files: 'package.json',
    conventions: [],
  };

  assert.throws(
    () => validateLevel1Output(input),
    (error: Error) => {
      assert.ok(error instanceof ValidationError);
      assert.ok(error.message.includes('config_files'));
      return true;
    }
  );
});

test('validateLevel1Output: rejects non-array conventions', () => {
  const input = {
    repo_name: 'test',
    purpose: 'Test',
    stack: 'Node.js',
    languages: ['JavaScript'],
    entrypoints: [],
    modules: [],
    config_files: [],
    conventions: 'ESM',
  };

  assert.throws(
    () => validateLevel1Output(input),
    (error: Error) => {
      assert.ok(error instanceof ValidationError);
      assert.ok(error.message.includes('conventions'));
      return true;
    }
  );
});

// ============================================================================
// ValidationError Tests
// ============================================================================

test('ValidationError is an Error', () => {
  const error = new ValidationError('Test error');
  assert.ok(error instanceof Error);
  assert.ok(error instanceof ValidationError);
});

test('ValidationError has correct message', () => {
  const error = new ValidationError('Custom message');
  assert.strictEqual(error.message, 'Custom message');
});

test('ValidationError has correct name', () => {
  const error = new ValidationError('Test');
  assert.strictEqual(error.name, 'ValidationError');
});

// ============================================================================
// Edge Cases
// ============================================================================

test('validateLevel1Output: handles extra properties gracefully', () => {
  const input = {
    repo_name: 'test',
    purpose: 'Test',
    stack: 'Node.js',
    languages: ['JavaScript'],
    entrypoints: [],
    modules: [],
    config_files: [],
    conventions: [],
    extra_property: 'should be ignored',
  };

  const result = validateLevel1Output(input);
  assert.strictEqual(result.repo_name, 'test');
  // Extra property should not be in result
  assert.ok(!('extra_property' in result));
});

test('validateLevel1Output: returns clean Level1Output type', () => {
  const input = {
    repo_name: 'test',
    purpose: 'Test project',
    stack: 'Node.js',
    languages: ['TypeScript'],
    entrypoints: ['index.ts'],
    modules: [{ path: 'src/', description: 'Source' }],
    config_files: ['package.json'],
    conventions: ['ESM'],
  };

  const result: Level1Output = validateLevel1Output(input);

  // Verify all expected properties exist
  assert.ok('repo_name' in result);
  assert.ok('purpose' in result);
  assert.ok('stack' in result);
  assert.ok('languages' in result);
  assert.ok('entrypoints' in result);
  assert.ok('modules' in result);
  assert.ok('config_files' in result);
  assert.ok('conventions' in result);
});
