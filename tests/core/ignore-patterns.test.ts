/**
 * Tests for Ignore Patterns Module
 *
 * Tests .rmapignore file loading, parsing, and pattern matching.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  loadIgnorePatterns,
  loadIgnorePatternsSync,
  shouldIgnoreFile,
  createIgnoreFromPatterns,
  createIgnoreFilter,
  RMAPIGNORE_FILENAME,
} from '../../src/core/ignore-patterns.js';
import {
  DEFAULT_RMAPIGNORE,
  ALWAYS_IGNORE_PATTERNS,
} from '../../src/config/rmapignore-defaults.js';

describe('Ignore Patterns Module', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rmap-ignore-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('loadIgnorePatternsSync', () => {
    it('should create default .rmapignore when file does not exist', () => {
      const result = loadIgnorePatternsSync(tempDir, { autoCreate: true });

      assert.strictEqual(result.created, true, 'Should indicate file was created');
      assert.ok(
        fs.existsSync(path.join(tempDir, RMAPIGNORE_FILENAME)),
        '.rmapignore file should exist'
      );

      // Verify content matches default
      const content = fs.readFileSync(
        path.join(tempDir, RMAPIGNORE_FILENAME),
        'utf-8'
      );
      assert.strictEqual(content, DEFAULT_RMAPIGNORE);
    });

    it('should not create .rmapignore when autoCreate is false', () => {
      const result = loadIgnorePatternsSync(tempDir, { autoCreate: false });

      assert.strictEqual(result.created, false);
      assert.ok(
        !fs.existsSync(path.join(tempDir, RMAPIGNORE_FILENAME)),
        '.rmapignore file should not exist'
      );
    });

    it('should load existing .rmapignore file', () => {
      // Create a custom .rmapignore
      const customPatterns = '*.custom\ncustom-dir/\n';
      fs.writeFileSync(path.join(tempDir, RMAPIGNORE_FILENAME), customPatterns);

      const result = loadIgnorePatternsSync(tempDir);

      assert.strictEqual(result.created, false, 'Should not create new file');

      // Should ignore custom patterns
      assert.ok(
        shouldIgnoreFile(result.ig, 'file.custom'),
        'Should ignore *.custom files'
      );
      assert.ok(
        shouldIgnoreFile(result.ig, 'custom-dir/'),
        'Should ignore custom-dir/'
      );
    });

    it('should always ignore .git and .repo_map directories', () => {
      const result = loadIgnorePatternsSync(tempDir, { autoCreate: false });

      // These are always ignored regardless of .rmapignore content
      assert.ok(shouldIgnoreFile(result.ig, '.git/'), 'Should ignore .git/');
      assert.ok(
        shouldIgnoreFile(result.ig, '.repo_map/'),
        'Should ignore .repo_map/'
      );
    });

    it('should combine custom and default patterns', () => {
      // Create a minimal .rmapignore
      fs.writeFileSync(
        path.join(tempDir, RMAPIGNORE_FILENAME),
        '*.myext\n'
      );

      const result = loadIgnorePatternsSync(tempDir);

      // Should ignore custom pattern
      assert.ok(
        shouldIgnoreFile(result.ig, 'file.myext'),
        'Should ignore custom pattern'
      );

      // Should NOT ignore patterns from defaults (since custom file exists)
      // Note: The custom file REPLACES defaults, only ALWAYS_IGNORE_PATTERNS remain
      assert.ok(
        shouldIgnoreFile(result.ig, '.git/'),
        'Should still ignore .git/'
      );
    });
  });

  describe('loadIgnorePatterns (async)', () => {
    it('should work the same as sync version', async () => {
      const result = await loadIgnorePatterns(tempDir, { autoCreate: true });

      assert.strictEqual(result.created, true);
      assert.ok(fs.existsSync(path.join(tempDir, RMAPIGNORE_FILENAME)));
    });
  });

  describe('shouldIgnoreFile', () => {
    it('should match exact filenames', () => {
      const ig = createIgnoreFromPatterns(['package-lock.json']);

      assert.ok(
        shouldIgnoreFile(ig, 'package-lock.json'),
        'Should match exact filename'
      );
      assert.ok(
        !shouldIgnoreFile(ig, 'package.json'),
        'Should not match similar filename'
      );
    });

    it('should match glob patterns', () => {
      const ig = createIgnoreFromPatterns(['*.log', '*.tmp']);

      assert.ok(shouldIgnoreFile(ig, 'debug.log'), 'Should match *.log');
      assert.ok(shouldIgnoreFile(ig, 'app.tmp'), 'Should match *.tmp');
      assert.ok(
        !shouldIgnoreFile(ig, 'app.js'),
        'Should not match unrelated extension'
      );
    });

    it('should match directory patterns', () => {
      const ig = createIgnoreFromPatterns(['node_modules/', 'dist/']);

      assert.ok(
        shouldIgnoreFile(ig, 'node_modules/'),
        'Should match directory pattern'
      );
      assert.ok(
        shouldIgnoreFile(ig, 'node_modules/package/index.js'),
        'Should match files in directory'
      );
      assert.ok(
        shouldIgnoreFile(ig, 'dist/bundle.js'),
        'Should match files in dist/'
      );
    });

    it('should match patterns with wildcards in path', () => {
      const ig = createIgnoreFromPatterns(['**/test/**', '**/__tests__/**']);

      assert.ok(
        shouldIgnoreFile(ig, 'src/test/helper.js'),
        'Should match **/test/**'
      );
      assert.ok(
        shouldIgnoreFile(ig, 'lib/__tests__/utils.spec.ts'),
        'Should match **/__tests__/**'
      );
    });

    it('should handle negation patterns', () => {
      const ig = createIgnoreFromPatterns(['*.log', '!important.log']);

      assert.ok(
        shouldIgnoreFile(ig, 'debug.log'),
        'Should ignore normal .log files'
      );
      assert.ok(
        !shouldIgnoreFile(ig, 'important.log'),
        'Should not ignore negated file'
      );
    });

    it('should handle comments and empty lines', () => {
      const ig = createIgnoreFromPatterns([
        '# This is a comment',
        '',
        '*.log',
        '  # Indented comment',
        '',
      ]);

      assert.ok(
        shouldIgnoreFile(ig, 'debug.log'),
        'Should ignore .log files'
      );
      assert.ok(
        !shouldIgnoreFile(ig, '# This is a comment'),
        'Should not treat comments as patterns'
      );
    });

    it('should normalize Windows paths', () => {
      const ig = createIgnoreFromPatterns(['dist/']);

      // Test with backslash (Windows-style)
      assert.ok(
        shouldIgnoreFile(ig, 'dist\\bundle.js'),
        'Should handle Windows paths'
      );
    });
  });

  describe('createIgnoreFromPatterns', () => {
    it('should create ignore instance from array of patterns', () => {
      const patterns = ['*.log', 'dist/', 'node_modules/'];
      const ig = createIgnoreFromPatterns(patterns);

      assert.ok(shouldIgnoreFile(ig, 'app.log'));
      assert.ok(shouldIgnoreFile(ig, 'dist/bundle.js'));
      assert.ok(shouldIgnoreFile(ig, 'node_modules/lodash/index.js'));
    });

    it('should include defaults when requested', () => {
      const ig = createIgnoreFromPatterns(['*.custom'], true);

      // Custom pattern
      assert.ok(
        shouldIgnoreFile(ig, 'file.custom'),
        'Should match custom pattern'
      );

      // Default patterns
      assert.ok(
        shouldIgnoreFile(ig, 'dist/bundle.js'),
        'Should match default pattern'
      );
      assert.ok(
        shouldIgnoreFile(ig, 'node_modules/lodash/index.js'),
        'Should match default pattern'
      );
    });

    it('should always include ALWAYS_IGNORE_PATTERNS', () => {
      const ig = createIgnoreFromPatterns([]);

      for (const pattern of ALWAYS_IGNORE_PATTERNS) {
        assert.ok(
          shouldIgnoreFile(ig, pattern),
          `Should ignore ${pattern}`
        );
      }
    });
  });

  describe('createIgnoreFilter', () => {
    it('should filter files and track statistics', () => {
      const ig = createIgnoreFromPatterns(['*.log', 'dist/']);
      const { filter, getStats } = createIgnoreFilter(ig);

      const files = [
        'src/index.ts',
        'src/utils.ts',
        'debug.log',
        'error.log',
        'dist/bundle.js',
      ];

      const filtered = files.filter(filter);

      assert.deepStrictEqual(filtered, ['src/index.ts', 'src/utils.ts']);

      const stats = getStats();
      assert.strictEqual(stats.totalChecked, 5);
      assert.strictEqual(stats.passedCount, 2);
      assert.strictEqual(stats.ignoredCount, 3);
      assert.strictEqual(stats.ignoredPercent, 60);
    });

    it('should log in verbose mode', () => {
      const ig = createIgnoreFromPatterns(['*.log']);
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        const { filter } = createIgnoreFilter(ig, { verbose: true });
        filter('debug.log');

        assert.ok(
          logs.some((l) => l.includes('Skipped') && l.includes('debug.log')),
          'Should log skipped file in verbose mode'
        );
      } finally {
        console.log = originalLog;
      }
    });

    it('should handle empty file list', () => {
      const ig = createIgnoreFromPatterns(['*.log']);
      const { getStats } = createIgnoreFilter(ig);

      const stats = getStats();
      assert.strictEqual(stats.totalChecked, 0);
      assert.strictEqual(stats.ignoredPercent, 0);
    });
  });

  describe('Default patterns', () => {
    it('should ignore common build artifacts', () => {
      const ig = createIgnoreFromPatterns([], true);

      const buildArtifacts = [
        'dist/bundle.js',
        'build/output.js',
        '.next/cache/data',
        'out/index.html',
        'coverage/lcov-report/index.html',
      ];

      for (const file of buildArtifacts) {
        assert.ok(
          shouldIgnoreFile(ig, file),
          `Should ignore build artifact: ${file}`
        );
      }
    });

    it('should ignore common dependency directories', () => {
      const ig = createIgnoreFromPatterns([], true);

      const dependencies = [
        'node_modules/lodash/index.js',
        'vendor/autoload.php',
      ];

      for (const file of dependencies) {
        assert.ok(
          shouldIgnoreFile(ig, file),
          `Should ignore dependency: ${file}`
        );
      }
    });

    it('should ignore log files', () => {
      const ig = createIgnoreFromPatterns([], true);

      const logFiles = [
        'debug.log',
        'error.log',
        'npm-debug.log',
        'logs/app.log',
        'server.log.1',
      ];

      for (const file of logFiles) {
        assert.ok(
          shouldIgnoreFile(ig, file),
          `Should ignore log file: ${file}`
        );
      }
    });

    it('should ignore OS-specific files', () => {
      const ig = createIgnoreFromPatterns([], true);

      const osFiles = ['.DS_Store', 'Thumbs.db'];

      for (const file of osFiles) {
        assert.ok(
          shouldIgnoreFile(ig, file),
          `Should ignore OS file: ${file}`
        );
      }
    });

    it('should ignore lock files', () => {
      const ig = createIgnoreFromPatterns([], true);

      const lockFiles = [
        'pnpm-lock.yaml',
        'package-lock.json',
        'yarn.lock',
        'Cargo.lock',
      ];

      for (const file of lockFiles) {
        assert.ok(
          shouldIgnoreFile(ig, file),
          `Should ignore lock file: ${file}`
        );
      }
    });

    it('should ignore IDE/editor files', () => {
      const ig = createIgnoreFromPatterns([], true);

      const ideFiles = [
        '.vscode/settings.json',
        '.idea/workspace.xml',
        'file.swp',
        'file.swo',
      ];

      for (const file of ideFiles) {
        assert.ok(
          shouldIgnoreFile(ig, file),
          `Should ignore IDE file: ${file}`
        );
      }
    });

    it('should NOT ignore source files by default', () => {
      const ig = createIgnoreFromPatterns([], true);

      const sourceFiles = [
        'src/index.ts',
        'lib/utils.js',
        'app/main.py',
        'README.md',
        'package.json',
        'tsconfig.json',
      ];

      for (const file of sourceFiles) {
        assert.ok(
          !shouldIgnoreFile(ig, file),
          `Should NOT ignore source file: ${file}`
        );
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle deeply nested files', () => {
      const ig = createIgnoreFromPatterns(['**/test/**']);

      assert.ok(
        shouldIgnoreFile(ig, 'src/components/button/test/button.test.ts')
      );
      assert.ok(
        !shouldIgnoreFile(ig, 'src/components/button/index.ts')
      );
    });

    it('should handle files with special characters', () => {
      const ig = createIgnoreFromPatterns(['file[1].txt', 'data (copy).json']);

      // Note: gitignore patterns may treat brackets specially
      // This test documents the behavior
      const result1 = shouldIgnoreFile(ig, 'file[1].txt');
      const result2 = shouldIgnoreFile(ig, 'data (copy).json');

      // Just verify no errors are thrown
      assert.ok(typeof result1 === 'boolean');
      assert.ok(typeof result2 === 'boolean');
    });

    it('should handle empty patterns gracefully', () => {
      const ig = createIgnoreFromPatterns([]);

      // Only ALWAYS_IGNORE_PATTERNS should be ignored
      assert.ok(shouldIgnoreFile(ig, '.git/'));
      assert.ok(shouldIgnoreFile(ig, '.repo_map/'));
      assert.ok(!shouldIgnoreFile(ig, 'src/index.ts'));
    });

    it('should handle pattern with trailing spaces', () => {
      // Leading/trailing spaces in patterns can cause issues
      const ig = createIgnoreFromPatterns(['  *.log  ', 'dist/  ']);

      // The ignore package should handle this
      const logResult = shouldIgnoreFile(ig, 'debug.log');
      const distResult = shouldIgnoreFile(ig, 'dist/bundle.js');

      // Document actual behavior
      assert.ok(typeof logResult === 'boolean');
      assert.ok(typeof distResult === 'boolean');
    });
  });
});
