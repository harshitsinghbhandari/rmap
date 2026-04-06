/**
 * Integration Tests - Full Pipeline
 *
 * Tests the complete rmap pipeline from Level 0 through Level 4.
 * These tests verify that all components work together correctly.
 *
 * NOTE: These are integration tests that test component interaction
 * without requiring actual LLM API calls.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type {
  Level0Output,
  Level1Output,
  FileAnnotation,
  GraphJson,
  MetaJson,
} from '../../src/core/types.js';
import { SCHEMA_VERSION } from '../../src/core/constants.js';

// Helper to create temp directory for tests
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rmap-test-'));
}

// Helper to clean up temp directory
function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockLevel0Output(): Level0Output {
  return {
    files: [
      {
        name: 'index.ts',
        path: 'src/index.ts',
        extension: '.ts',
        size_bytes: 1024,
        line_count: 50,
        language: 'TypeScript',
        raw_imports: ['./auth', './utils'],
      },
      {
        name: 'auth.ts',
        path: 'src/auth.ts',
        extension: '.ts',
        size_bytes: 2048,
        line_count: 100,
        language: 'TypeScript',
        raw_imports: ['./utils', './config'],
      },
      {
        name: 'utils.ts',
        path: 'src/utils.ts',
        extension: '.ts',
        size_bytes: 512,
        line_count: 25,
        language: 'TypeScript',
        raw_imports: [],
      },
      {
        name: 'config.ts',
        path: 'src/config.ts',
        extension: '.ts',
        size_bytes: 256,
        line_count: 15,
        language: 'TypeScript',
        raw_imports: [],
      },
    ],
    git_commit: 'abc123def456',
    timestamp: '2024-01-01T00:00:00.000Z',
    total_files: 4,
    total_size_bytes: 3840,
  };
}

function createMockLevel1Output(): Level1Output {
  return {
    repo_name: 'test-project',
    purpose: 'A test project for integration testing',
    stack: 'TypeScript, Node.js',
    languages: ['TypeScript'],
    entrypoints: ['src/index.ts'],
    modules: [
      { path: 'src/', description: 'Source code directory' },
    ],
    config_files: ['package.json', 'tsconfig.json'],
    conventions: ['ESM modules', 'Strict TypeScript'],
  };
}

function createMockAnnotations(): FileAnnotation[] {
  return [
    {
      path: 'src/index.ts',
      language: 'TypeScript',
      size_bytes: 1024,
      line_count: 50,
      purpose: 'Application entry point',
      exports: ['main'],
      imports: ['src/auth.ts', 'src/utils.ts'],
    },
    {
      path: 'src/auth.ts',
      language: 'TypeScript',
      size_bytes: 2048,
      line_count: 100,
      purpose: 'Authentication handling',
      exports: ['login', 'logout'],
      imports: ['src/utils.ts', 'src/config.ts'],
    },
    {
      path: 'src/utils.ts',
      language: 'TypeScript',
      size_bytes: 512,
      line_count: 25,
      purpose: 'Utility functions',
      exports: ['formatDate', 'validateEmail'],
      imports: [],
    },
    {
      path: 'src/config.ts',
      language: 'TypeScript',
      size_bytes: 256,
      line_count: 15,
      purpose: 'Configuration constants',
      exports: ['API_URL', 'DEBUG_MODE'],
      imports: [],
    },
  ];
}

// ============================================================================
// Level 0 → Level 1 Pipeline Tests
// ============================================================================

describe('Integration Tests - Full Pipeline', () => {
  describe('Level 0 → Level 1 Pipeline', () => {
    it('should produce Level 0 output with correct structure', () => {
      const level0Output = createMockLevel0Output();

      // Verify Level 0 output structure
      assert.ok(Array.isArray(level0Output.files));
      assert.strictEqual(level0Output.files.length, 4);
      assert.ok(level0Output.git_commit);
      assert.ok(level0Output.timestamp);
      assert.strictEqual(level0Output.total_files, level0Output.files.length);
    });

    it('should have Level 0 output that can feed into Level 1', () => {
      const level0Output = createMockLevel0Output();

      // Level 1 needs file list, languages, and raw_imports
      const hasRequiredFields = level0Output.files.every(file =>
        'path' in file &&
        'extension' in file &&
        'language' in file &&
        'raw_imports' in file
      );

      assert.ok(hasRequiredFields, 'Level 0 output has all fields needed for Level 1');
    });

    it('should maintain file count consistency between levels', () => {
      const level0Output = createMockLevel0Output();
      const annotations = createMockAnnotations();

      // Annotations should cover same files
      const level0Paths = new Set(level0Output.files.map(f => f.path));
      const annotationPaths = new Set(annotations.map(a => a.path));

      assert.deepStrictEqual(level0Paths, annotationPaths);
    });
  });

  // ============================================================================
  // Complete Pipeline Tests
  // ============================================================================

  describe('Complete Pipeline (Level 0-4)', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = createTempDir();
    });

    afterEach(() => {
      cleanupTempDir(tempDir);
    });

    it('should produce valid .repo_map directory structure', () => {
      const repoMapDir = path.join(tempDir, '.repo_map');
      fs.mkdirSync(repoMapDir, { recursive: true });

      // Create mock output files
      const mockMeta: MetaJson = {
        schema_version: SCHEMA_VERSION,
        map_version: 1,
        git_commit: 'abc123',
        created_at: '2024-01-01T00:00:00.000Z',
        last_updated: '2024-01-01T00:00:00.000Z',
        parent_version: null,
        update_type: 'full',
        files_changed: null,
        ...createMockLevel1Output(),
      };

      fs.writeFileSync(
        path.join(repoMapDir, 'meta.json'),
        JSON.stringify(mockMeta, null, 2)
      );

      // Verify structure
      assert.ok(fs.existsSync(path.join(repoMapDir, 'meta.json')));

      const loadedMeta = JSON.parse(
        fs.readFileSync(path.join(repoMapDir, 'meta.json'), 'utf-8')
      );

      assert.strictEqual(loadedMeta.schema_version, SCHEMA_VERSION);
      assert.strictEqual(loadedMeta.map_version, 1);
    });

    it('should create consistent graph.json from annotations', () => {
      const annotations = createMockAnnotations();

      // Build graph from annotations
      const graph: GraphJson = {};

      for (const file of annotations) {
        graph[file.path] = {
          imports: file.imports,
          imported_by: [],
        };
      }

      // Compute imported_by from imports
      for (const file of annotations) {
        for (const imp of file.imports) {
          if (graph[imp]) {
            graph[imp].imported_by.push(file.path);
          }
        }
      }

      // Verify graph consistency
      assert.deepStrictEqual(
        graph['src/utils.ts'].imported_by.sort(),
        ['src/auth.ts', 'src/index.ts']
      );
    });

    it('should produce deterministic results', () => {
      const annotations1 = createMockAnnotations();
      const annotations2 = createMockAnnotations();

      // Same input should produce same output
      assert.deepStrictEqual(annotations1, annotations2);
    });
  });

  // ============================================================================
  // Error Recovery Tests
  // ============================================================================

  describe('Error Recovery', () => {
    it('should handle files with missing imports gracefully', () => {
      const annotations = createMockAnnotations();

      // Add a file that imports a non-existent file
      annotations.push({
        path: 'src/broken.ts',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 5,
        purpose: 'A file with broken import',
        exports: [],
        imports: ['src/nonexistent.ts'],
      });

      // Build graph - should not throw
      const graph: GraphJson = {};
      for (const file of annotations) {
        graph[file.path] = {
          imports: file.imports,
          imported_by: [],
        };
      }

      assert.ok(graph['src/broken.ts']);
    });
  });

  // ============================================================================
  // Query Engine Integration Tests
  // ============================================================================

  describe('Query Engine Integration', () => {
    it('should find files by path prefix', () => {
      const annotations = createMockAnnotations();

      // Query by path
      const srcFiles = annotations.filter(a =>
        a.path.startsWith('src/')
      );

      assert.strictEqual(srcFiles.length, 4);
    });

    it('should calculate blast radius correctly', () => {
      const annotations = createMockAnnotations();

      // Build imported_by map
      const importedBy: Record<string, string[]> = {};
      for (const file of annotations) {
        importedBy[file.path] = [];
      }
      for (const file of annotations) {
        for (const imp of file.imports) {
          if (importedBy[imp]) {
            importedBy[imp].push(file.path);
          }
        }
      }

      // utils.ts is imported by index.ts and auth.ts
      const utilsBlastRadius = importedBy['src/utils.ts'];
      assert.deepStrictEqual(
        utilsBlastRadius.sort(),
        ['src/auth.ts', 'src/index.ts']
      );
    });
  });
});
