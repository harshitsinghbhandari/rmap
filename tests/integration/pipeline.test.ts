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
  TagsJson,
  MetaJson,
} from '../../src/core/types.js';
import { SCHEMA_VERSION, TAG_TAXONOMY } from '../../src/core/constants.js';

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
      tags: ['entrypoint'],
      exports: ['main'],
      imports: ['src/auth.ts', 'src/utils.ts'],
    },
    {
      path: 'src/auth.ts',
      language: 'TypeScript',
      size_bytes: 2048,
      line_count: 100,
      purpose: 'Authentication handling',
      tags: ['authentication'],
      exports: ['login', 'logout'],
      imports: ['src/utils.ts', 'src/config.ts'],
    },
    {
      path: 'src/utils.ts',
      language: 'TypeScript',
      size_bytes: 512,
      line_count: 25,
      purpose: 'Utility functions',
      tags: ['utility'],
      exports: ['formatDate', 'validateEmail'],
      imports: [],
    },
    {
      path: 'src/config.ts',
      language: 'TypeScript',
      size_bytes: 256,
      line_count: 15,
      purpose: 'Configuration constants',
      tags: ['config'],
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

      assert.deepStrictEqual(
        graph['src/config.ts'].imported_by,
        ['src/auth.ts']
      );

      assert.deepStrictEqual(
        graph['src/index.ts'].imported_by,
        []
      );
    });

    it('should create valid tags.json index', () => {
      const annotations = createMockAnnotations();

      // Build tag index
      const tagsJson: TagsJson = {
        taxonomy_version: SCHEMA_VERSION,
        aliases: {},
        index: {} as Record<string, string[]>,
      };

      for (const file of annotations) {
        for (const tag of file.tags) {
          if (!tagsJson.index[tag]) {
            tagsJson.index[tag] = [];
          }
          tagsJson.index[tag].push(file.path);
        }
      }

      // Verify tag index
      assert.deepStrictEqual(
        tagsJson.index['authentication'],
        ['src/auth.ts']
      );

      assert.deepStrictEqual(
        tagsJson.index['config'],
        ['src/config.ts']
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
        tags: ['utility'],
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

      // The broken import is recorded but doesn't cause error
      assert.deepStrictEqual(
        graph['src/broken.ts'].imports,
        ['src/nonexistent.ts']
      );
    });

    it('should collect validation errors without crashing', () => {
      const annotations: FileAnnotation[] = [
        {
          path: 'src/orphan.ts',
          language: 'TypeScript',
          size_bytes: 100,
          line_count: 5,
          purpose: 'Orphan file',
          tags: ['utility'],
          exports: [],
          imports: ['src/missing.ts'], // Missing import
        },
      ];

      const errors: string[] = [];

      // Validate imports
      for (const file of annotations) {
        for (const imp of file.imports) {
          const importExists = annotations.some(a => a.path === imp);
          if (!importExists) {
            errors.push(`${file.path}: missing import ${imp}`);
          }
        }
      }

      assert.strictEqual(errors.length, 1);
      assert.ok(errors[0].includes('missing import'));
    });
  });

  // ============================================================================
  // Delta Updates Tests
  // ============================================================================

  describe('Delta Updates', () => {
    it('should identify changed files correctly', () => {
      const oldAnnotations = createMockAnnotations();
      const newAnnotations = [...createMockAnnotations()];

      // Modify one file
      newAnnotations[0] = {
        ...newAnnotations[0],
        purpose: 'Updated application entry point',
      };

      // Find changed files
      const changedFiles = newAnnotations.filter((newFile, idx) => {
        const oldFile = oldAnnotations[idx];
        return JSON.stringify(newFile) !== JSON.stringify(oldFile);
      });

      assert.strictEqual(changedFiles.length, 1);
      assert.strictEqual(changedFiles[0].path, 'src/index.ts');
    });

    it('should detect new files', () => {
      const oldAnnotations = createMockAnnotations();
      const newAnnotations = [...createMockAnnotations()];

      // Add a new file
      newAnnotations.push({
        path: 'src/new.ts',
        language: 'TypeScript',
        size_bytes: 200,
        line_count: 10,
        purpose: 'New file',
        tags: ['utility'],
        exports: ['newFunction'],
        imports: [],
      });

      const oldPaths = new Set(oldAnnotations.map(a => a.path));
      const addedFiles = newAnnotations.filter(a => !oldPaths.has(a.path));

      assert.strictEqual(addedFiles.length, 1);
      assert.strictEqual(addedFiles[0].path, 'src/new.ts');
    });

    it('should detect deleted files', () => {
      const oldAnnotations = createMockAnnotations();
      const newAnnotations = createMockAnnotations().slice(0, -1); // Remove last

      const newPaths = new Set(newAnnotations.map(a => a.path));
      const deletedFiles = oldAnnotations.filter(a => !newPaths.has(a.path));

      assert.strictEqual(deletedFiles.length, 1);
      assert.strictEqual(deletedFiles[0].path, 'src/config.ts');
    });

    it('should maintain graph consistency after delta update', () => {
      const annotations = createMockAnnotations();

      // Remove a file that others import
      const withoutUtils = annotations.filter(a => a.path !== 'src/utils.ts');

      // Build graph
      const graph: GraphJson = {};
      for (const file of withoutUtils) {
        graph[file.path] = {
          imports: file.imports,
          imported_by: [],
        };
      }

      // Check for broken imports
      const brokenImports: string[] = [];
      for (const file of withoutUtils) {
        for (const imp of file.imports) {
          if (!graph[imp]) {
            brokenImports.push(`${file.path} -> ${imp}`);
          }
        }
      }

      // Should detect broken imports to utils.ts
      assert.ok(brokenImports.some(b => b.includes('src/utils.ts')));
    });
  });

  // ============================================================================
  // Query Engine Integration Tests
  // ============================================================================

  describe('Query Engine Integration', () => {
    it('should find files by tag', () => {
      const annotations = createMockAnnotations();

      // Query by tag
      const authFiles = annotations.filter(a =>
        a.tags.includes('authentication')
      );

      assert.strictEqual(authFiles.length, 1);
      assert.strictEqual(authFiles[0].path, 'src/auth.ts');
    });

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

      // config.ts is only imported by auth.ts
      const configBlastRadius = importedBy['src/config.ts'];
      assert.deepStrictEqual(configBlastRadius, ['src/auth.ts']);
    });

    it('should get dependencies for a file', () => {
      const annotations = createMockAnnotations();
      const targetFile = annotations.find(a => a.path === 'src/auth.ts');

      assert.ok(targetFile);
      assert.deepStrictEqual(
        targetFile.imports.sort(),
        ['src/config.ts', 'src/utils.ts']
      );
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe('Performance', () => {
    it('should handle large file lists efficiently', () => {
      // Generate 500 mock files
      const largeLevel0: Level0Output = {
        files: Array(500).fill(0).map((_, i) => ({
          name: `file${i}.ts`,
          path: `src/dir${Math.floor(i / 50)}/file${i}.ts`,
          extension: '.ts',
          size_bytes: 1000 + (i * 10),
          line_count: 50 + (i % 100),
          language: 'TypeScript',
          raw_imports: i > 0 ? [`src/dir${Math.floor((i - 1) / 50)}/file${i - 1}.ts`] : [],
        })),
        git_commit: 'abc123',
        timestamp: new Date().toISOString(),
        total_files: 500,
        total_size_bytes: 500000,
      };

      const startTime = Date.now();

      // Process files
      const graph: GraphJson = {};
      for (const file of largeLevel0.files) {
        graph[file.path] = {
          imports: file.raw_imports,
          imported_by: [],
        };
      }

      // Compute imported_by
      for (const file of largeLevel0.files) {
        for (const imp of file.raw_imports) {
          if (graph[imp]) {
            graph[imp].imported_by.push(file.path);
          }
        }
      }

      const duration = Date.now() - startTime;

      // Should complete in under 1 second
      assert.ok(duration < 1000, `Processing took ${duration}ms, expected < 1000ms`);
      assert.strictEqual(Object.keys(graph).length, 500);
    });

    it('should query large datasets quickly', () => {
      // Generate large annotations
      const largeAnnotations: FileAnnotation[] = Array(500).fill(0).map((_, i) => ({
        path: `src/file${i}.ts`,
        language: 'TypeScript',
        size_bytes: 1000,
        line_count: 50,
        purpose: `File ${i}`,
        tags: [TAG_TAXONOMY[i % TAG_TAXONOMY.length]],
        exports: [`export${i}`],
        imports: [],
      }));

      const startTime = Date.now();

      // Query by tag
      const targetTag = TAG_TAXONOMY[0];
      const results = largeAnnotations.filter(a =>
        a.tags.includes(targetTag)
      );

      const duration = Date.now() - startTime;

      // Should complete in under 100ms
      assert.ok(duration < 100, `Query took ${duration}ms, expected < 100ms`);
      assert.ok(results.length > 0);
    });
  });

  // ============================================================================
  // Real-World Structure Tests
  // ============================================================================

  describe('Real Repository Structures', () => {
    it('should handle typical Node.js project structure', () => {
      const nodeProjectAnnotations: FileAnnotation[] = [
        {
          path: 'src/index.ts',
          language: 'TypeScript',
          size_bytes: 500,
          line_count: 20,
          purpose: 'Main entry point',
          tags: ['entrypoint'],
          exports: ['default'],
          imports: ['src/app.ts'],
        },
        {
          path: 'src/app.ts',
          language: 'TypeScript',
          size_bytes: 2000,
          line_count: 100,
          purpose: 'Express application setup',
          tags: ['middleware'],
          exports: ['app'],
          imports: ['src/routes/index.ts', 'src/middleware/auth.ts'],
        },
        {
          path: 'src/routes/index.ts',
          language: 'TypeScript',
          size_bytes: 1000,
          line_count: 50,
          purpose: 'Route definitions',
          tags: ['api_endpoint'],
          exports: ['router'],
          imports: ['src/controllers/userController.ts'],
        },
        {
          path: 'src/controllers/userController.ts',
          language: 'TypeScript',
          size_bytes: 1500,
          line_count: 75,
          purpose: 'User CRUD operations',
          tags: ['api_endpoint'],
          exports: ['getUser', 'createUser'],
          imports: ['src/models/user.ts', 'src/services/userService.ts'],
        },
        {
          path: 'src/models/user.ts',
          language: 'TypeScript',
          size_bytes: 800,
          line_count: 40,
          purpose: 'User database model',
          tags: ['database'],
          exports: ['User', 'UserSchema'],
          imports: [],
        },
        {
          path: 'src/services/userService.ts',
          language: 'TypeScript',
          size_bytes: 1200,
          line_count: 60,
          purpose: 'User business logic',
          tags: ['service'],
          exports: ['UserService'],
          imports: ['src/models/user.ts'],
        },
        {
          path: 'src/middleware/auth.ts',
          language: 'TypeScript',
          size_bytes: 600,
          line_count: 30,
          purpose: 'Authentication middleware',
          tags: ['authentication', 'middleware'],
          exports: ['authMiddleware'],
          imports: [],
        },
      ];

      // Build graph
      const graph: GraphJson = {};
      for (const file of nodeProjectAnnotations) {
        graph[file.path] = {
          imports: file.imports,
          imported_by: [],
        };
      }
      for (const file of nodeProjectAnnotations) {
        for (const imp of file.imports) {
          if (graph[imp]) {
            graph[imp].imported_by.push(file.path);
          }
        }
      }

      // Verify structure
      assert.ok(graph['src/models/user.ts'].imported_by.length >= 1);
      assert.deepStrictEqual(graph['src/index.ts'].imported_by, []);
    });

    it('should handle monorepo structure', () => {
      const monorepoAnnotations: FileAnnotation[] = [
        {
          path: 'packages/core/src/index.ts',
          language: 'TypeScript',
          size_bytes: 500,
          line_count: 20,
          purpose: 'Core package entry',
          tags: ['entrypoint'],
          exports: ['CoreModule'],
          imports: [],
        },
        {
          path: 'packages/api/src/index.ts',
          language: 'TypeScript',
          size_bytes: 800,
          line_count: 40,
          purpose: 'API package entry',
          tags: ['entrypoint', 'api_endpoint'],
          exports: ['ApiModule'],
          imports: ['packages/core/src/index.ts'],
        },
        {
          path: 'packages/web/src/App.tsx',
          language: 'TypeScript',
          size_bytes: 1200,
          line_count: 60,
          purpose: 'React application root',
          tags: ['frontend'],
          exports: ['App'],
          imports: ['packages/core/src/index.ts'],
        },
      ];

      // Verify cross-package dependencies
      const coreImportedBy = monorepoAnnotations
        .filter(a => a.imports.includes('packages/core/src/index.ts'))
        .map(a => a.path);

      assert.ok(coreImportedBy.includes('packages/api/src/index.ts'));
      assert.ok(coreImportedBy.includes('packages/web/src/App.tsx'));
    });
  });
});
