/**
 * Standardized error classes for rmap
 *
 * Defines a consistent error handling strategy across all modules.
 *
 * ## Error Handling Policy
 *
 * 1. **Throw** for unrecoverable errors:
 *    - Missing configuration or environment variables
 *    - Invalid input that cannot be handled
 *    - System-level failures (git not available, file system errors)
 *
 * 2. **Return null/undefined** for expected failures:
 *    - File not found in map (use null)
 *    - Optional data not available
 *
 * 3. **Log and continue** only for non-critical warnings:
 *    - Deprecation warnings
 *    - Performance hints
 *    - Informational messages
 *
 * 4. **Never swallow** errors silently:
 *    - Always log or throw
 *    - Include context and cause
 */

/**
 * Base error class for all rmap errors
 *
 * Extends the standard Error class with:
 * - Error codes for programmatic handling
 * - Cause chain for debugging
 * - Consistent naming
 */
export class RmapError extends Error {
  /**
   * Create a new RmapError
   *
   * @param message - Human-readable error message
   * @param code - Machine-readable error code (e.g., 'CONFIG_ERROR')
   * @param cause - Optional underlying error that caused this error
   */
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'RmapError';

    // Maintain proper stack trace for where our error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Get full error message including cause chain
   */
  getFullMessage(): string {
    if (this.cause) {
      return `${this.message}\nCaused by: ${this.cause.message}`;
    }
    return this.message;
  }
}

/**
 * Configuration error
 *
 * Thrown when configuration is missing, invalid, or inconsistent.
 *
 * Examples:
 * - Missing environment variables
 * - Invalid config file
 * - Conflicting configuration options
 */
export class ConfigError extends RmapError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONFIG_ERROR', cause);
    this.name = 'ConfigError';
  }
}

/**
 * Git operation error
 *
 * Thrown when git operations fail.
 *
 * Examples:
 * - Not a git repository
 * - Invalid commit hash
 * - Git command execution failed
 */
export class GitError extends RmapError {
  constructor(message: string, cause?: Error) {
    super(message, 'GIT_ERROR', cause);
    this.name = 'GitError';
  }
}

/**
 * LLM interaction error
 *
 * Thrown when LLM API calls fail or return invalid responses.
 *
 * Examples:
 * - API authentication failed
 * - Rate limit exceeded
 * - Malformed LLM response
 * - Network errors
 */
export class LLMError extends RmapError {
  constructor(message: string, cause?: Error) {
    super(message, 'LLM_ERROR', cause);
    this.name = 'LLMError';
  }
}

/**
 * File parsing error
 *
 * Thrown when parsing files fails.
 *
 * Includes the file path for better debugging.
 *
 * Examples:
 * - Invalid source code syntax
 * - Unsupported file format
 * - Encoding issues
 */
export class ParseError extends RmapError {
  /**
   * Create a new ParseError
   *
   * @param message - Error description
   * @param file - Path to the file that failed to parse
   * @param cause - Optional underlying error
   */
  constructor(
    message: string,
    public readonly file: string,
    cause?: Error
  ) {
    super(`${message} in ${file}`, 'PARSE_ERROR', cause);
    this.name = 'ParseError';
  }
}

/**
 * Validation error
 *
 * Thrown when data validation fails.
 *
 * Examples:
 * - Invalid JSON schema
 * - Missing required fields
 * - Type mismatches
 * - Constraint violations
 */
export class ValidationError extends RmapError {
  constructor(message: string, cause?: Error) {
    super(message, 'VALIDATION_ERROR', cause);
    this.name = 'ValidationError';
  }
}

/**
 * File system error
 *
 * Thrown when file system operations fail.
 *
 * Examples:
 * - File not found
 * - Permission denied
 * - Disk full
 * - Path too long
 */
export class FileSystemError extends RmapError {
  /**
   * Create a new FileSystemError
   *
   * @param message - Error description
   * @param path - File or directory path that caused the error
   * @param cause - Optional underlying error
   */
  constructor(
    message: string,
    public readonly path: string,
    cause?: Error
  ) {
    super(`${message}: ${path}`, 'FILESYSTEM_ERROR', cause);
    this.name = 'FileSystemError';
  }
}

/**
 * Checkpoint error
 *
 * Thrown when checkpoint operations fail.
 *
 * Examples:
 * - Corrupted checkpoint file
 * - Missing checkpoint data
 * - Incompatible checkpoint version
 */
export class CheckpointError extends RmapError {
  constructor(message: string, cause?: Error) {
    super(message, 'CHECKPOINT_ERROR', cause);
    this.name = 'CheckpointError';
  }
}
