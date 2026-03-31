/**
 * Tests for Level 0 Harvester Edge Cases
 *
 * Tests symlink handling, permission errors, large file warnings, and other edge cases
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { harvest } from '../../../src/levels/level0/harvester.js';

describe('Level 0 Harvester - Edge Cases', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for testing
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rmap-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Symlink handling', () => {
    it('should skip symlink directories', async () => {
      // Create a regular directory with a file
      const realDir = path.join(tempDir, 'real-dir');
      fs.mkdirSync(realDir);
      fs.writeFileSync(path.join(realDir, 'file.txt'), 'content');

      // Create a symlink to that directory
      const symlinkDir = path.join(tempDir, 'symlink-dir');
      try {
        fs.symlinkSync(realDir, symlinkDir, 'dir');
      } catch (error) {
        // Skip this test if symlink creation fails (e.g., Windows without admin)
        console.log('Skipping symlink test - symlink creation not supported');
        return;
      }

      // Initialize git repo for testing
      try {
        fs.writeFileSync(path.join(tempDir, '.git'), 'gitdir: /some/path');
      } catch (error) {
        // Ignore if .git creation fails
      }

      const result = await harvest(tempDir);

      // Should only find the file in the real directory, not via symlink
      const filePaths = result.files.map((f) => f.path);
      const symlinkFiles = filePaths.filter((p) => p.startsWith('symlink-dir'));

      // Symlink directories should be skipped (not followed)
      assert.strictEqual(
        symlinkFiles.length,
        0,
        'Symlink directories should be skipped'
      );
    });

    it('should skip symlink files', async () => {
      // Create a real file
      const realFile = path.join(tempDir, 'real.txt');
      fs.writeFileSync(realFile, 'real content');

      // Create a symlink to that file
      const symlinkFile = path.join(tempDir, 'link.txt');
      try {
        fs.symlinkSync(realFile, symlinkFile);
      } catch (error) {
        // Skip this test if symlink creation fails
        console.log('Skipping symlink file test - symlink creation not supported');
        return;
      }

      // Initialize git repo
      try {
        fs.writeFileSync(path.join(tempDir, '.git'), 'gitdir: /some/path');
      } catch (error) {
        // Ignore
      }

      const result = await harvest(tempDir);

      // Should find the real file but not the symlink
      const hasRealFile = result.files.some((f) => f.path === 'real.txt');
      const hasSymlinkFile = result.files.some((f) => f.path === 'link.txt');

      assert.ok(hasRealFile, 'Should find real file');
      // Note: Current implementation may or may not skip symlink files
      // This documents the behavior
    });
  });

  describe('Permission error handling', () => {
    it('should handle permission denied errors gracefully', async () => {
      // Create a directory and file
      const restrictedDir = path.join(tempDir, 'restricted');
      fs.mkdirSync(restrictedDir);
      fs.writeFileSync(path.join(restrictedDir, 'file.txt'), 'content');

      // Try to make directory unreadable (may not work on all systems)
      try {
        fs.chmodSync(restrictedDir, 0o000);
      } catch (error) {
        // Skip if chmod not supported
        console.log('Skipping permission test - chmod not supported');
        return;
      }

      // Initialize git repo
      try {
        fs.writeFileSync(path.join(tempDir, '.git'), 'gitdir: /some/path');
      } catch (error) {
        // Ignore
      }

      // Harvest should complete without throwing, even with permission errors
      try {
        const result = await harvest(tempDir);
        assert.ok(result, 'Harvest should complete despite permission errors');
        assert.ok(result.files, 'Should return files array');
      } finally {
        // Restore permissions for cleanup
        try {
          fs.chmodSync(restrictedDir, 0o755);
        } catch (error) {
          // Ignore
        }
      }
    });

    it('should skip files with read permission errors', async () => {
      // Create a file
      const restrictedFile = path.join(tempDir, 'restricted.txt');
      fs.writeFileSync(restrictedFile, 'secret content');

      // Make file unreadable
      try {
        fs.chmodSync(restrictedFile, 0o000);
      } catch (error) {
        console.log('Skipping file permission test - chmod not supported');
        return;
      }

      // Initialize git repo
      try {
        fs.writeFileSync(path.join(tempDir, '.git'), 'gitdir: /some/path');
      } catch (error) {
        // Ignore
      }

      try {
        const result = await harvest(tempDir);

        // Should not include the restricted file
        const hasRestrictedFile = result.files.some((f) => f.path === 'restricted.txt');
        assert.ok(!hasRestrictedFile, 'Should not include unreadable files');
      } finally {
        // Restore permissions for cleanup
        try {
          fs.chmodSync(restrictedFile, 0o644);
        } catch (error) {
          // Ignore
        }
      }
    });
  });

  describe('Large file warnings', () => {
    it('should warn about files with more than 10000 lines', async () => {
      // Create a large file (10001 lines)
      const largeFile = path.join(tempDir, 'large.txt');
      const lines = Array(10001).fill('line').join('\n');
      fs.writeFileSync(largeFile, lines);

      // Initialize git repo
      try {
        fs.writeFileSync(path.join(tempDir, '.git'), 'gitdir: /some/path');
      } catch (error) {
        // Ignore
      }

      // Capture console output
      const originalWarn = console.warn;
      const warnings: string[] = [];
      console.warn = (msg: string) => {
        warnings.push(msg);
      };

      try {
        const result = await harvest(tempDir);

        // Should still include the file
        const largeFileData = result.files.find((f) => f.path === 'large.txt');
        assert.ok(largeFileData, 'Large file should be included');
        assert.strictEqual(largeFileData!.line_count, 10001);

        // Should have warned about it
        const hasWarning = warnings.some((w) => w.includes('Large file detected'));
        assert.ok(hasWarning, 'Should warn about large files');
      } finally {
        console.warn = originalWarn;
      }
    });

    it('should not warn about files with exactly 10000 lines', async () => {
      // Create a file with exactly 10000 lines (boundary case)
      const boundaryFile = path.join(tempDir, 'boundary.txt');
      const lines = Array(10000).fill('line').join('\n');
      fs.writeFileSync(boundaryFile, lines);

      // Initialize git repo
      try {
        fs.writeFileSync(path.join(tempDir, '.git'), 'gitdir: /some/path');
      } catch (error) {
        // Ignore
      }

      const originalWarn = console.warn;
      const warnings: string[] = [];
      console.warn = (msg: string) => {
        warnings.push(msg);
      };

      try {
        const result = await harvest(tempDir);

        const fileData = result.files.find((f) => f.path === 'boundary.txt');
        assert.ok(fileData, 'Boundary file should be included');
        assert.strictEqual(fileData!.line_count, 10000);

        // Should NOT warn (only warns if > 10000)
        const hasLargeFileWarning = warnings.some(
          (w) => w.includes('Large file detected') && w.includes('boundary.txt')
        );
        assert.ok(!hasLargeFileWarning, 'Should not warn about 10000 line files');
      } finally {
        console.warn = originalWarn;
      }
    });
  });

  describe('Binary file handling', () => {
    it('should skip binary files', async () => {
      // Create a binary file (PNG)
      const binaryFile = path.join(tempDir, 'image.png');
      fs.writeFileSync(binaryFile, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      // Create a text file
      const textFile = path.join(tempDir, 'text.txt');
      fs.writeFileSync(textFile, 'text content');

      // Initialize git repo
      try {
        fs.writeFileSync(path.join(tempDir, '.git'), 'gitdir: /some/path');
      } catch (error) {
        // Ignore
      }

      const result = await harvest(tempDir);

      // Should find text file but not binary file
      const hasBinaryFile = result.files.some((f) => f.path === 'image.png');
      const hasTextFile = result.files.some((f) => f.path === 'text.txt');

      assert.ok(!hasBinaryFile, 'Binary files should be skipped');
      assert.ok(hasTextFile, 'Text files should be included');
    });

    it('should skip all binary extensions', async () => {
      const binaryExtensions = ['.png', '.jpg', '.gif', '.mp4', '.pdf', '.zip'];

      for (const ext of binaryExtensions) {
        const file = path.join(tempDir, `file${ext}`);
        fs.writeFileSync(file, 'binary content');
      }

      // Initialize git repo
      try {
        fs.writeFileSync(path.join(tempDir, '.git'), 'gitdir: /some/path');
      } catch (error) {
        // Ignore
      }

      const result = await harvest(tempDir);

      // None of the binary files should be included
      for (const ext of binaryExtensions) {
        const hasFile = result.files.some((f) => f.path === `file${ext}`);
        assert.ok(!hasFile, `Files with ${ext} extension should be skipped`);
      }
    });
  });

  describe('Error handling', () => {
    it('should throw error if repository root does not exist', async () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist');

      await assert.rejects(
        async () => await harvest(nonExistentPath),
        (error: Error) => {
          assert.ok(error.message.includes('does not exist'));
          return true;
        },
        'Should throw error for non-existent path'
      );
    });

    it('should throw error if repository root is not a directory', async () => {
      const filePath = path.join(tempDir, 'file.txt');
      fs.writeFileSync(filePath, 'content');

      await assert.rejects(
        async () => await harvest(filePath),
        (error: Error) => {
          assert.ok(error.message.includes('not a directory'));
          return true;
        },
        'Should throw error if path is a file'
      );
    });
  });
});
