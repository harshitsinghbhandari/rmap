/**
 * Tests for standardized error classes
 */

import { test } from 'node:test';
import * as assert from 'node:assert';
import {
  RmapError,
  ConfigError,
  GitError,
  LLMError,
  ParseError,
  ValidationError,
  FileSystemError,
  CheckpointError,
} from '../../src/core/errors.js';

test('RmapError: should create error with message and code', () => {
  const error = new RmapError('Test error', 'TEST_ERROR');

  assert.ok(error instanceof Error);
  assert.ok(error instanceof RmapError);
  assert.strictEqual(error.message, 'Test error');
  assert.strictEqual(error.code, 'TEST_ERROR');
  assert.strictEqual(error.name, 'RmapError');
  assert.strictEqual(error.cause, undefined);
});

test('RmapError: should create error with cause', () => {
  const cause = new Error('Original error');
  const error = new RmapError('Wrapped error', 'TEST_ERROR', cause);

  assert.strictEqual(error.message, 'Wrapped error');
  assert.strictEqual(error.code, 'TEST_ERROR');
  assert.strictEqual(error.cause, cause);
});

test('RmapError: should provide full message including cause', () => {
  const cause = new Error('Original error');
  const error = new RmapError('Wrapped error', 'TEST_ERROR', cause);

  assert.strictEqual(error.getFullMessage(), 'Wrapped error\nCaused by: Original error');
});

test('RmapError: should provide message without cause if no cause exists', () => {
  const error = new RmapError('Simple error', 'TEST_ERROR');

  assert.strictEqual(error.getFullMessage(), 'Simple error');
});

test('ConfigError: should create config error', () => {
  const error = new ConfigError('Missing API key');

  assert.ok(error instanceof Error);
  assert.ok(error instanceof RmapError);
  assert.ok(error instanceof ConfigError);
  assert.strictEqual(error.message, 'Missing API key');
  assert.strictEqual(error.code, 'CONFIG_ERROR');
  assert.strictEqual(error.name, 'ConfigError');
});

test('ConfigError: should create config error with cause', () => {
  const cause = new Error('Invalid JSON');
  const error = new ConfigError('Failed to load config', cause);

  assert.strictEqual(error.message, 'Failed to load config');
  assert.strictEqual(error.cause, cause);
});

test('GitError: should create git error', () => {
  const error = new GitError('Not a git repository');

  assert.ok(error instanceof Error);
  assert.ok(error instanceof RmapError);
  assert.ok(error instanceof GitError);
  assert.strictEqual(error.message, 'Not a git repository');
  assert.strictEqual(error.code, 'GIT_ERROR');
  assert.strictEqual(error.name, 'GitError');
});

test('GitError: should create git error with cause', () => {
  const cause = new Error('git command failed');
  const error = new GitError('Failed to get commit hash', cause);

  assert.strictEqual(error.message, 'Failed to get commit hash');
  assert.strictEqual(error.cause, cause);
});

test('LLMError: should create LLM error', () => {
  const error = new LLMError('API rate limit exceeded');

  assert.ok(error instanceof Error);
  assert.ok(error instanceof RmapError);
  assert.ok(error instanceof LLMError);
  assert.strictEqual(error.message, 'API rate limit exceeded');
  assert.strictEqual(error.code, 'LLM_ERROR');
  assert.strictEqual(error.name, 'LLMError');
});

test('LLMError: should create LLM error with cause', () => {
  const cause = new Error('Network timeout');
  const error = new LLMError('Failed to call LLM API', cause);

  assert.strictEqual(error.message, 'Failed to call LLM API');
  assert.strictEqual(error.cause, cause);
});

test('ParseError: should create parse error with file path', () => {
  const error = new ParseError('Invalid syntax', 'src/index.ts');

  assert.ok(error instanceof Error);
  assert.ok(error instanceof RmapError);
  assert.ok(error instanceof ParseError);
  assert.strictEqual(error.message, 'Invalid syntax in src/index.ts');
  assert.strictEqual(error.code, 'PARSE_ERROR');
  assert.strictEqual(error.name, 'ParseError');
  assert.strictEqual(error.file, 'src/index.ts');
});

test('ParseError: should create parse error with cause', () => {
  const cause = new Error('Unexpected token');
  const error = new ParseError('Failed to parse file', 'src/bad.js', cause);

  assert.strictEqual(error.message, 'Failed to parse file in src/bad.js');
  assert.strictEqual(error.file, 'src/bad.js');
  assert.strictEqual(error.cause, cause);
});

test('ValidationError: should create validation error', () => {
  const error = new ValidationError('Missing required field: name');

  assert.ok(error instanceof Error);
  assert.ok(error instanceof RmapError);
  assert.ok(error instanceof ValidationError);
  assert.strictEqual(error.message, 'Missing required field: name');
  assert.strictEqual(error.code, 'VALIDATION_ERROR');
  assert.strictEqual(error.name, 'ValidationError');
});

test('ValidationError: should create validation error with cause', () => {
  const cause = new Error('Invalid type');
  const error = new ValidationError('Schema validation failed', cause);

  assert.strictEqual(error.message, 'Schema validation failed');
  assert.strictEqual(error.cause, cause);
});

test('FileSystemError: should create filesystem error with path', () => {
  const error = new FileSystemError('File not found', '/path/to/file.txt');

  assert.ok(error instanceof Error);
  assert.ok(error instanceof RmapError);
  assert.ok(error instanceof FileSystemError);
  assert.strictEqual(error.message, 'File not found: /path/to/file.txt');
  assert.strictEqual(error.code, 'FILESYSTEM_ERROR');
  assert.strictEqual(error.name, 'FileSystemError');
  assert.strictEqual(error.path, '/path/to/file.txt');
});

test('FileSystemError: should create filesystem error with cause', () => {
  const cause = new Error('ENOENT');
  const error = new FileSystemError('Cannot read directory', '/some/dir', cause);

  assert.strictEqual(error.message, 'Cannot read directory: /some/dir');
  assert.strictEqual(error.path, '/some/dir');
  assert.strictEqual(error.cause, cause);
});

test('CheckpointError: should create checkpoint error', () => {
  const error = new CheckpointError('Corrupted checkpoint file');

  assert.ok(error instanceof Error);
  assert.ok(error instanceof RmapError);
  assert.ok(error instanceof CheckpointError);
  assert.strictEqual(error.message, 'Corrupted checkpoint file');
  assert.strictEqual(error.code, 'CHECKPOINT_ERROR');
  assert.strictEqual(error.name, 'CheckpointError');
});

test('CheckpointError: should create checkpoint error with cause', () => {
  const cause = new Error('Invalid JSON');
  const error = new CheckpointError('Failed to load checkpoint', cause);

  assert.strictEqual(error.message, 'Failed to load checkpoint');
  assert.strictEqual(error.cause, cause);
});

test('Error inheritance: should maintain proper instanceof checks', () => {
  const configError = new ConfigError('test');
  const gitError = new GitError('test');
  const llmError = new LLMError('test');
  const parseError = new ParseError('test', 'file.ts');
  const validationError = new ValidationError('test');
  const fsError = new FileSystemError('test', '/path');
  const checkpointError = new CheckpointError('test');

  // All should be instances of RmapError
  assert.ok(configError instanceof RmapError);
  assert.ok(gitError instanceof RmapError);
  assert.ok(llmError instanceof RmapError);
  assert.ok(parseError instanceof RmapError);
  assert.ok(validationError instanceof RmapError);
  assert.ok(fsError instanceof RmapError);
  assert.ok(checkpointError instanceof RmapError);

  // All should be instances of Error
  assert.ok(configError instanceof Error);
  assert.ok(gitError instanceof Error);
  assert.ok(llmError instanceof Error);
  assert.ok(parseError instanceof Error);
  assert.ok(validationError instanceof Error);
  assert.ok(fsError instanceof Error);
  assert.ok(checkpointError instanceof Error);
});

test('Error inheritance: should not cross-pollute instanceof checks', () => {
  const configError = new ConfigError('test');

  assert.ok(configError instanceof ConfigError);
  assert.ok(!(configError instanceof GitError));
  assert.ok(!(configError instanceof LLMError));
  assert.ok(!(configError instanceof ParseError));
  assert.ok(!(configError instanceof ValidationError));
  assert.ok(!(configError instanceof FileSystemError));
  assert.ok(!(configError instanceof CheckpointError));
});

test('Error handling patterns: should support try-catch with specific error types', () => {
  const throwConfigError = () => {
    throw new ConfigError('Missing config');
  };

  try {
    throwConfigError();
    assert.fail('Should have thrown');
  } catch (error) {
    assert.ok(error instanceof ConfigError);
    if (error instanceof ConfigError) {
      assert.strictEqual(error.code, 'CONFIG_ERROR');
    }
  }
});

test('Error handling patterns: should support error chaining', () => {
  try {
    throw new Error('Original error');
  } catch (originalError) {
    const wrappedError = new GitError(
      'Failed git operation',
      originalError instanceof Error ? originalError : undefined
    );

    assert.strictEqual(wrappedError.cause, originalError);
    assert.ok(wrappedError.getFullMessage().includes('Original error'));
  }
});

test('Error handling patterns: should allow filtering errors by code', () => {
  const errors: RmapError[] = [
    new ConfigError('test1'),
    new GitError('test2'),
    new ConfigError('test3'),
  ];

  const configErrors = errors.filter(e => e.code === 'CONFIG_ERROR');
  assert.strictEqual(configErrors.length, 2);
});
