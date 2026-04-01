/**
 * Tests for standardized error classes
 */

import { describe, it, expect } from 'vitest';
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

describe('RmapError', () => {
  it('should create error with message and code', () => {
    const error = new RmapError('Test error', 'TEST_ERROR');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RmapError);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.name).toBe('RmapError');
    expect(error.cause).toBeUndefined();
  });

  it('should create error with cause', () => {
    const cause = new Error('Original error');
    const error = new RmapError('Wrapped error', 'TEST_ERROR', cause);

    expect(error.message).toBe('Wrapped error');
    expect(error.code).toBe('TEST_ERROR');
    expect(error.cause).toBe(cause);
  });

  it('should provide full message including cause', () => {
    const cause = new Error('Original error');
    const error = new RmapError('Wrapped error', 'TEST_ERROR', cause);

    expect(error.getFullMessage()).toBe('Wrapped error\nCaused by: Original error');
  });

  it('should provide message without cause if no cause exists', () => {
    const error = new RmapError('Simple error', 'TEST_ERROR');

    expect(error.getFullMessage()).toBe('Simple error');
  });
});

describe('ConfigError', () => {
  it('should create config error', () => {
    const error = new ConfigError('Missing API key');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RmapError);
    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toBe('Missing API key');
    expect(error.code).toBe('CONFIG_ERROR');
    expect(error.name).toBe('ConfigError');
  });

  it('should create config error with cause', () => {
    const cause = new Error('Invalid JSON');
    const error = new ConfigError('Failed to load config', cause);

    expect(error.message).toBe('Failed to load config');
    expect(error.cause).toBe(cause);
  });
});

describe('GitError', () => {
  it('should create git error', () => {
    const error = new GitError('Not a git repository');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RmapError);
    expect(error).toBeInstanceOf(GitError);
    expect(error.message).toBe('Not a git repository');
    expect(error.code).toBe('GIT_ERROR');
    expect(error.name).toBe('GitError');
  });

  it('should create git error with cause', () => {
    const cause = new Error('git command failed');
    const error = new GitError('Failed to get commit hash', cause);

    expect(error.message).toBe('Failed to get commit hash');
    expect(error.cause).toBe(cause);
  });
});

describe('LLMError', () => {
  it('should create LLM error', () => {
    const error = new LLMError('API rate limit exceeded');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RmapError);
    expect(error).toBeInstanceOf(LLMError);
    expect(error.message).toBe('API rate limit exceeded');
    expect(error.code).toBe('LLM_ERROR');
    expect(error.name).toBe('LLMError');
  });

  it('should create LLM error with cause', () => {
    const cause = new Error('Network timeout');
    const error = new LLMError('Failed to call LLM API', cause);

    expect(error.message).toBe('Failed to call LLM API');
    expect(error.cause).toBe(cause);
  });
});

describe('ParseError', () => {
  it('should create parse error with file path', () => {
    const error = new ParseError('Invalid syntax', 'src/index.ts');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RmapError);
    expect(error).toBeInstanceOf(ParseError);
    expect(error.message).toBe('Invalid syntax in src/index.ts');
    expect(error.code).toBe('PARSE_ERROR');
    expect(error.name).toBe('ParseError');
    expect(error.file).toBe('src/index.ts');
  });

  it('should create parse error with cause', () => {
    const cause = new Error('Unexpected token');
    const error = new ParseError('Failed to parse file', 'src/bad.js', cause);

    expect(error.message).toBe('Failed to parse file in src/bad.js');
    expect(error.file).toBe('src/bad.js');
    expect(error.cause).toBe(cause);
  });
});

describe('ValidationError', () => {
  it('should create validation error', () => {
    const error = new ValidationError('Missing required field: name');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RmapError);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.message).toBe('Missing required field: name');
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.name).toBe('ValidationError');
  });

  it('should create validation error with cause', () => {
    const cause = new Error('Invalid type');
    const error = new ValidationError('Schema validation failed', cause);

    expect(error.message).toBe('Schema validation failed');
    expect(error.cause).toBe(cause);
  });
});

describe('FileSystemError', () => {
  it('should create filesystem error with path', () => {
    const error = new FileSystemError('File not found', '/path/to/file.txt');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RmapError);
    expect(error).toBeInstanceOf(FileSystemError);
    expect(error.message).toBe('File not found: /path/to/file.txt');
    expect(error.code).toBe('FILESYSTEM_ERROR');
    expect(error.name).toBe('FileSystemError');
    expect(error.path).toBe('/path/to/file.txt');
  });

  it('should create filesystem error with cause', () => {
    const cause = new Error('ENOENT');
    const error = new FileSystemError('Cannot read directory', '/some/dir', cause);

    expect(error.message).toBe('Cannot read directory: /some/dir');
    expect(error.path).toBe('/some/dir');
    expect(error.cause).toBe(cause);
  });
});

describe('CheckpointError', () => {
  it('should create checkpoint error', () => {
    const error = new CheckpointError('Corrupted checkpoint file');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(RmapError);
    expect(error).toBeInstanceOf(CheckpointError);
    expect(error.message).toBe('Corrupted checkpoint file');
    expect(error.code).toBe('CHECKPOINT_ERROR');
    expect(error.name).toBe('CheckpointError');
  });

  it('should create checkpoint error with cause', () => {
    const cause = new Error('Invalid JSON');
    const error = new CheckpointError('Failed to load checkpoint', cause);

    expect(error.message).toBe('Failed to load checkpoint');
    expect(error.cause).toBe(cause);
  });
});

describe('Error inheritance chain', () => {
  it('should maintain proper instanceof checks', () => {
    const configError = new ConfigError('test');
    const gitError = new GitError('test');
    const llmError = new LLMError('test');
    const parseError = new ParseError('test', 'file.ts');
    const validationError = new ValidationError('test');
    const fsError = new FileSystemError('test', '/path');
    const checkpointError = new CheckpointError('test');

    // All should be instances of RmapError
    expect(configError).toBeInstanceOf(RmapError);
    expect(gitError).toBeInstanceOf(RmapError);
    expect(llmError).toBeInstanceOf(RmapError);
    expect(parseError).toBeInstanceOf(RmapError);
    expect(validationError).toBeInstanceOf(RmapError);
    expect(fsError).toBeInstanceOf(RmapError);
    expect(checkpointError).toBeInstanceOf(RmapError);

    // All should be instances of Error
    expect(configError).toBeInstanceOf(Error);
    expect(gitError).toBeInstanceOf(Error);
    expect(llmError).toBeInstanceOf(Error);
    expect(parseError).toBeInstanceOf(Error);
    expect(validationError).toBeInstanceOf(Error);
    expect(fsError).toBeInstanceOf(Error);
    expect(checkpointError).toBeInstanceOf(Error);
  });

  it('should not cross-pollute instanceof checks', () => {
    const configError = new ConfigError('test');

    expect(configError).toBeInstanceOf(ConfigError);
    expect(configError).not.toBeInstanceOf(GitError);
    expect(configError).not.toBeInstanceOf(LLMError);
    expect(configError).not.toBeInstanceOf(ParseError);
    expect(configError).not.toBeInstanceOf(ValidationError);
    expect(configError).not.toBeInstanceOf(FileSystemError);
    expect(configError).not.toBeInstanceOf(CheckpointError);
  });
});

describe('Error handling patterns', () => {
  it('should support try-catch with specific error types', () => {
    const throwConfigError = () => {
      throw new ConfigError('Missing config');
    };

    try {
      throwConfigError();
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      if (error instanceof ConfigError) {
        expect(error.code).toBe('CONFIG_ERROR');
      }
    }
  });

  it('should support error chaining', () => {
    try {
      throw new Error('Original error');
    } catch (originalError) {
      const wrappedError = new GitError(
        'Failed git operation',
        originalError instanceof Error ? originalError : undefined
      );

      expect(wrappedError.cause).toBe(originalError);
      expect(wrappedError.getFullMessage()).toContain('Original error');
    }
  });

  it('should allow filtering errors by code', () => {
    const errors: RmapError[] = [
      new ConfigError('test1'),
      new GitError('test2'),
      new ConfigError('test3'),
    ];

    const configErrors = errors.filter(e => e.code === 'CONFIG_ERROR');
    expect(configErrors).toHaveLength(2);
  });
});
