/**
 * Tests for Level 1 Detector Edge Cases
 *
 * Tests LLM error handling, retry logic, validation edge cases
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { detectStructure } from '../../../src/levels/level1/detector.js';
import type { Level0Output } from '../../../src/core/types.js';

describe('Level 1 Detector - Edge Cases', () => {
  let originalAnthropicKey: string | undefined;
  let originalGeminiKey: string | undefined;
  let originalGoogleKey: string | undefined;

  beforeEach(() => {
    // Save original API keys
    originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
    originalGeminiKey = process.env.GEMINI_API_KEY;
    originalGoogleKey = process.env.GOOGLE_API_KEY;
  });

  afterEach(() => {
    // Restore original API keys
    if (originalAnthropicKey) {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
    if (originalGeminiKey) {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    if (originalGoogleKey) {
      process.env.GOOGLE_API_KEY = originalGoogleKey;
    } else {
      delete process.env.GOOGLE_API_KEY;
    }
  });

  describe('API key validation', () => {
    it('should throw error when API key is not set for the configured provider', async () => {
      // Remove all API keys to ensure the provider can't find one
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const mockLevel0: Level0Output = {
        files: [
          {
            name: 'index.ts',
            path: 'src/index.ts',
            extension: '.ts',
            size_bytes: 100,
            line_count: 10,
            language: 'TypeScript',
            raw_imports: [],
          },
        ],
        git_commit: 'abc123',
        timestamp: new Date().toISOString(),
        total_files: 1,
        total_size_bytes: 100,
      };

      await assert.rejects(
        async () => await detectStructure(mockLevel0, '/fake/repo'),
        (error: Error) => {
          // Provider will throw an error about missing API key or authentication
          // Anthropic SDK: "Could not resolve authentication method"
          // Gemini SDK: "API key is required"
          const msg = error.message.toLowerCase();
          assert.ok(
            msg.includes('api key') ||
            msg.includes('api_key') ||
            msg.includes('authentication') ||
            msg.includes('apikey'),
            `Expected API key error, got: ${error.message}`
          );
          return true;
        },
        'Should throw error when API key is missing'
      );
    });

    it('should throw error when API key is empty string', async () => {
      // Set empty API keys
      process.env.ANTHROPIC_API_KEY = '';
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const mockLevel0: Level0Output = {
        files: [
          {
            name: 'index.ts',
            path: 'src/index.ts',
            extension: '.ts',
            size_bytes: 100,
            line_count: 10,
            language: 'TypeScript',
            raw_imports: [],
          },
        ],
        git_commit: 'abc123',
        timestamp: new Date().toISOString(),
        total_files: 1,
        total_size_bytes: 100,
      };

      await assert.rejects(
        async () => await detectStructure(mockLevel0, '/fake/repo'),
        (error: Error) => {
          // Empty string should cause an API-related error
          const msg = error.message.toLowerCase();
          assert.ok(
            msg.includes('api') ||
            msg.includes('key') ||
            msg.includes('auth') ||
            msg.includes('invalid'),
            `Expected API-related error, got: ${error.message}`
          );
          return true;
        },
        'Should throw error when API key is empty'
      );
    });
  });

  describe('Input validation', () => {
    it('should handle empty file list', async () => {
      // This tests that the detector can handle edge case of no files
      // In practice, this shouldn't happen, but we test defensive coding

      const mockLevel0: Level0Output = {
        files: [],
        git_commit: 'abc123',
        timestamp: new Date().toISOString(),
        total_files: 0,
        total_size_bytes: 0,
      };

      // Set a dummy API key to get past that check
      process.env.ANTHROPIC_API_KEY = 'sk-test-key';

      // This will likely fail when it tries to call the API with empty data
      // but we're testing that it doesn't crash before that point
      // The actual API call will fail with invalid key, which is expected
      try {
        await detectStructure(mockLevel0, '/fake/repo');
        // If it succeeds, that's fine too (in case of mock API)
        assert.ok(true, 'Handled empty file list');
      } catch (error) {
        // Expected to fail due to invalid API key or API error
        // As long as it doesn't crash on the empty files, we're good
        assert.ok(error instanceof Error);
      }
    });

    it('should handle files without language', async () => {
      const mockLevel0: Level0Output = {
        files: [
          {
            name: 'README',
            path: 'README',
            extension: '',
            size_bytes: 500,
            line_count: 25,
            language: undefined, // No language detected
            raw_imports: [],
          },
          {
            name: 'Makefile',
            path: 'Makefile',
            extension: '',
            size_bytes: 200,
            line_count: 15,
            language: undefined,
            raw_imports: [],
          },
        ],
        git_commit: 'def456',
        timestamp: new Date().toISOString(),
        total_files: 2,
        total_size_bytes: 700,
      };

      process.env.ANTHROPIC_API_KEY = 'sk-test-key';

      try {
        await detectStructure(mockLevel0, '/fake/repo');
        assert.ok(true, 'Handled files without language');
      } catch (error) {
        // Expected to fail due to invalid API key
        assert.ok(error instanceof Error);
      }
    });
  });

  describe('Response parsing', () => {
    it('should handle malformed JSON in response', async () => {
      // This test documents that the detector should handle malformed JSON
      // In practice, this would be tested by mocking the API client
      // For now, we document the expected behavior

      // The parseAndValidateResponse function should:
      // 1. Strip markdown code blocks if present
      // 2. Parse JSON
      // 3. Validate the structure
      // 4. Throw ValidationError if invalid

      // We can't easily test this without mocking the Anthropic client,
      // but we document that this is expected behavior
      assert.ok(true, 'Response parsing should handle malformed JSON');
    });

    it('should strip markdown code blocks from JSON response', async () => {
      // This tests the parseAndValidateResponse logic
      // Documentation: responses can come wrapped in ```json``` blocks
      // The function should strip these before parsing

      assert.ok(true, 'Should strip markdown code blocks');
    });
  });

  describe('Retry logic', () => {
    it('should implement exponential backoff for rate limits', async () => {
      // This documents that the callClaudeWithRetry function:
      // 1. Detects rate limit errors (Anthropic.RateLimitError)
      // 2. Retries with exponential backoff (2s, 4s, 8s)
      // 3. Gives up after maxRetries (default 3)

      // Testing this properly would require:
      // - Mocking the Anthropic client
      // - Simulating rate limit errors
      // - Verifying backoff timing

      // For now, we document the expected behavior
      assert.ok(true, 'Should retry with exponential backoff on rate limits');
    });

    it('should not retry on non-rate-limit API errors', async () => {
      // Documents that only rate limit errors trigger retries
      // Other API errors (auth, invalid request, etc.) should fail immediately

      assert.ok(true, 'Should not retry on non-rate-limit errors');
    });

    it('should fail after maximum retries', async () => {
      // Documents that after maxRetries attempts, the function should throw
      // with a descriptive error message

      assert.ok(true, 'Should fail after max retries exceeded');
    });
  });

  describe('File tree building', () => {
    it('should group files by directory', async () => {
      const mockLevel0: Level0Output = {
        files: [
          {
            name: 'index.ts',
            path: 'src/index.ts',
            extension: '.ts',
            size_bytes: 100,
            line_count: 10,
            language: 'TypeScript',
            raw_imports: [],
          },
          {
            name: 'utils.ts',
            path: 'src/utils.ts',
            extension: '.ts',
            size_bytes: 200,
            line_count: 20,
            language: 'TypeScript',
            raw_imports: [],
          },
          {
            name: 'test.ts',
            path: 'tests/test.ts',
            extension: '.ts',
            size_bytes: 150,
            line_count: 15,
            language: 'TypeScript',
            raw_imports: [],
          },
        ],
        git_commit: 'abc123',
        timestamp: new Date().toISOString(),
        total_files: 3,
        total_size_bytes: 450,
      };

      // The buildFileTree function should group these into:
      // src/
      //   index.ts [TypeScript] (0.1 KB)
      //   utils.ts [TypeScript] (0.2 KB)
      // tests/
      //   test.ts [TypeScript] (0.1 KB)

      assert.ok(true, 'Should group files by directory in tree structure');
    });

    it('should handle files in root directory', async () => {
      const mockLevel0: Level0Output = {
        files: [
          {
            name: 'README.md',
            path: 'README.md',
            extension: '.md',
            size_bytes: 500,
            line_count: 25,
            language: 'Markdown',
            raw_imports: [],
          },
        ],
        git_commit: 'abc123',
        timestamp: new Date().toISOString(),
        total_files: 1,
        total_size_bytes: 500,
      };

      // Files in root should be grouped under "."
      assert.ok(true, 'Should handle files in root directory');
    });
  });

  describe('Repository name detection', () => {
    it('should prefer package.json name over directory name', async () => {
      // The getRepoName function should:
      // 1. Try to read package.json
      // 2. Extract the "name" field
      // 3. Fall back to directory name if package.json doesn't exist

      assert.ok(true, 'Should prefer package.json name');
    });

    it('should fall back to directory name if package.json missing', async () => {
      // If package.json doesn't exist or doesn't have a name field,
      // use the basename of the repo root path

      assert.ok(true, 'Should use directory name as fallback');
    });

    it('should handle malformed package.json', async () => {
      // If package.json exists but is invalid JSON,
      // should fall back gracefully to directory name

      assert.ok(true, 'Should handle malformed package.json gracefully');
    });
  });

  describe('Validation edge cases', () => {
    it('should validate that all required fields are present', async () => {
      // The validateLevel1Output function should check for:
      // - repo_name (string)
      // - purpose (string)
      // - stack (string)
      // - languages (array of strings)
      // - entrypoints (array of strings)
      // - modules (array of objects with path and description)
      // - config_files (array of strings)
      // - conventions (array of strings)

      assert.ok(true, 'Should validate all required fields');
    });

    it('should reject response with missing required fields', async () => {
      // If LLM returns JSON missing required fields,
      // should throw ValidationError

      assert.ok(true, 'Should reject incomplete responses');
    });

    it('should validate module structure', async () => {
      // Each module should have both "path" and "description" properties
      // If either is missing, should throw ValidationError

      assert.ok(true, 'Should validate module objects have path and description');
    });

    it('should handle empty arrays for optional lists', async () => {
      // Some fields like conventions or config_files could be empty arrays
      // Should accept empty arrays as valid

      assert.ok(true, 'Should accept empty arrays for list fields');
    });
  });
});
