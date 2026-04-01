/**
 * Safe Git Utilities
 *
 * Provides secure wrappers around git operations to prevent command injection.
 * All commit hashes and references are validated before being passed to shell commands.
 */

import { execFileSync } from 'node:child_process';

/**
 * Validates a git commit hash or reference
 *
 * Allows:
 * - Full SHA-1 hashes (40 hex chars)
 * - Short hashes (4-40 hex chars)
 * - HEAD reference
 * - Branch references (alphanumeric, hyphens, underscores, slashes)
 *
 * Rejects anything that could be used for command injection
 *
 * @param ref - Git reference to validate
 * @throws Error if reference is invalid or potentially malicious
 */
export function validateGitRef(ref: string): void {
  if (!ref || typeof ref !== 'string') {
    throw new Error('Git reference must be a non-empty string');
  }

  // Remove whitespace
  const trimmed = ref.trim();

  if (trimmed.length === 0) {
    throw new Error('Git reference cannot be empty');
  }

  // Reject references that contain shell metacharacters or command separators first
  // This catches $() before the general pattern check
  const dangerousEarlyPatterns = [
    /\$\(/,  // Command substitution like $(...)
    /\$\{/,  // Variable expansion like ${...}
  ];

  for (const pattern of dangerousEarlyPatterns) {
    if (pattern.test(trimmed)) {
      throw new Error(
        `Invalid git reference: potentially unsafe pattern detected. Got: ${JSON.stringify(ref)}`
      );
    }
  }

  // Check for dangerous characters that could be used for injection
  // Allow only: alphanumeric, hyphens, underscores, slashes, dots, carets, tildes
  const safePattern = /^[a-zA-Z0-9\-_/.^~]+$/;
  if (!safePattern.test(trimmed)) {
    throw new Error(
      `Invalid git reference: contains forbidden characters. Got: ${JSON.stringify(ref)}`
    );
  }

  // Reject references that contain shell metacharacters, command separators, or unsafe sequences
  const dangerousPatterns = [
    /[;&|`$(){}[\]<>'"\\!*?]/,  // Shell metacharacters
    /\.\./,                     // Disallow '..' to prevent path traversal and rev-range syntax
    /^-/,                       // Starts with dash (could be interpreted as flag)
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(trimmed)) {
      throw new Error(
        `Invalid git reference: potentially unsafe pattern detected. Got: ${JSON.stringify(ref)}`
      );
    }
  }

  // Additional validation: if it looks like a hash, verify it's valid hex
  if (/^[0-9a-f]+$/i.test(trimmed)) {
    // Must be at least 4 chars for short hash, max 40 for full SHA-1
    if (trimmed.length < 4 || trimmed.length > 40) {
      throw new Error(
        `Invalid commit hash length: must be 4-40 characters. Got: ${trimmed.length}`
      );
    }
  }
}

/**
 * Safely execute a git command with validated arguments
 *
 * Uses execFileSync to pass arguments directly to the git process without shell
 * interpretation, preventing command injection. Callers are responsible for
 * validating any git references before passing them in.
 *
 * @param args - Git command arguments (e.g., ['diff', '--name-status', commit1, commit2])
 * @param cwd - Working directory
 * @param options - Additional exec options
 * @returns Command output
 */
function safeGitExec(
  args: string[],
  cwd: string,
  options: { encoding?: BufferEncoding; stdio?: any } = {}
): string {
  if (!args || args.length === 0) {
    throw new Error('Git command arguments cannot be empty');
  }

  // Reject --upload-pack which can be used to execute arbitrary commands via git
  for (const arg of args) {
    if (arg.startsWith('--upload-pack')) {
      throw new Error(`Disallowed git argument: ${JSON.stringify(arg)}`);
    }
  }

  try {
    return execFileSync('git', args, {
      cwd,
      encoding: options.encoding || 'utf8',
      stdio: options.stdio || ['pipe', 'pipe', 'pipe'],
    }) as string;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Git command failed: ${message}`);
  }
}

/**
 * Get git diff between two commits (safe version)
 *
 * @param repoRoot - Repository root path
 * @param fromCommit - Start commit (validated)
 * @param toCommit - End commit (validated, defaults to HEAD)
 * @returns Git diff output
 */
export function getGitDiffSafe(
  repoRoot: string,
  fromCommit: string,
  toCommit: string = 'HEAD'
): string {
  // Validate both commit references
  validateGitRef(fromCommit);
  validateGitRef(toCommit);

  // Execute with validated inputs
  return safeGitExec(
    ['diff', '--name-status', fromCommit, toCommit],
    repoRoot
  ).trim();
}

/**
 * Get commit timestamp (safe version)
 *
 * @param repoRoot - Repository root path
 * @param commitHash - Commit hash (validated)
 * @returns Commit timestamp as string
 */
export function getCommitTimestampSafe(
  repoRoot: string,
  commitHash: string
): string {
  // Validate commit hash
  validateGitRef(commitHash);

  // Execute with validated input
  return safeGitExec(
    ['show', '-s', '--format=%ct', commitHash],
    repoRoot
  ).trim();
}

/**
 * Get commit count between two commits (safe version)
 *
 * @param repoRoot - Repository root path
 * @param fromCommit - Start commit (validated)
 * @param toCommit - End commit (validated, defaults to HEAD)
 * @returns Commit count as string
 */
export function getCommitCountSafe(
  repoRoot: string,
  fromCommit: string,
  toCommit: string = 'HEAD'
): string {
  // Validate both commit references
  validateGitRef(fromCommit);
  validateGitRef(toCommit);

  // Execute with validated inputs
  return safeGitExec(
    ['rev-list', '--count', `${fromCommit}..${toCommit}`],
    repoRoot
  ).trim();
}

/**
 * Get current HEAD commit hash (safe version)
 *
 * @param repoRoot - Repository root path
 * @returns Current HEAD commit hash
 */
export function getCurrentCommitSafe(repoRoot: string): string {
  return safeGitExec(['rev-parse', 'HEAD'], repoRoot).trim();
}
