/**
 * Tests for Map File Assembler
 *
 * Tests .repo_map/ file generation, atomic writes,
 * file structure (meta.json, tree/, graph.json, etc.)
 */

import { test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type {
  FileAnnotation,
  GraphJson,
  MetaJson,
  StatsJson,
  ValidationJson,
} from '../../src/core/types.js';
import { assembleMap, readExistingMeta } from '../../src/coordinator/assembler.js';
import { SCHEMA_VERSION } from '../../src/core/constants.js';

// Helper to create temporary test directory
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rmap-test-'));
}

// Helper to clean up test directory
function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Mock data for testing
const mockAnnotations: FileAnnotation[] = [
  {
    path: 'src/index.ts',
    language: 'TypeScript',
    size_bytes: 1024,
    line_count: 50,
    purpose: 'Main entry point',
    exports: ['main'],
    imports: ['src/auth.ts', 'src/utils.ts'],
  },
  {
    path: 'src/auth.ts',
    language: 'TypeScript',
    size_bytes: 2048,
    line_count: 80,
    purpose: 'Authentication logic',
    exports: ['login', 'logout'],
    imports: ['src/utils.ts'],
  },
  {
    path: 'src/utils.ts',
    language: 'TypeScript',
    size_bytes: 512,
    line_count: 30,
    purpose: 'Utility functions',
    exports: ['format', 'validate'],
    imports: [],
  },
  {
    path: 'tests/auth.test.ts',
    language: 'TypeScript',
    size_bytes: 1024,
    line_count: 40,
    purpose: 'Auth tests',
    exports: [],
    imports: ['src/auth.ts'],
  },
];

const mockGraph: GraphJson = {
  'src/index.ts': {
    imports: ['src/auth.ts', 'src/utils.ts'],
    imported_by: [],
  },
  'src/auth.ts': {
    imports: ['src/utils.ts'],
    imported_by: ['src/index.ts', 'tests/auth.test.ts'],
  },
  'src/utils.ts': {
    imports: [],
    imported_by: ['src/auth.ts', 'src/index.ts'],
  },
  'tests/auth.test.ts': {
    imports: ['src/auth.ts'],
    imported_by: [],
  },
};

const mockMeta: MetaJson = {
  schema_version: SCHEMA_VERSION,
  map_version: 1,
  git_commit: 'abc123def456',
  created_at: '2024-01-01T00:00:00Z',
  last_updated: '2024-01-01T00:05:00Z',
  parent_version: null,
  update_type: 'full',
  files_changed: null,
  repo_name: 'test-repo',
  purpose: 'A test repository',
  stack: 'TypeScript, Node.js',
  languages: ['TypeScript'],
  entrypoints: ['src/index.ts'],
  modules: [{ path: 'src', description: 'Main source code' }],
  config_files: ['package.json', 'tsconfig.json'],
  conventions: ['Use TypeScript strict mode', 'Export named functions'],
};

const mockStats: StatsJson = {
  files_annotated: 4,
  build_time_minutes: 5.2,
  levels_completed: [0, 1, 2, 3, 4],
  agents_used: 1,
  validation_issues: 0,
  last_delta_files: null,
};

const mockValidation: ValidationJson = {
  issues: [],
  auto_fixed: 0,
  requires_attention: 0,
};

// Test: Directory structure creation
test('assembleMap: creates .repo_map directory structure', () => {
  const tempDir = createTempDir();

  try {
    const result = assembleMap(mockAnnotations, mockGraph, mockMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
      outputDir: '.repo_map',
    });

    const outputPath = path.join(tempDir, '.repo_map');

    // Main directory should exist
    assert.ok(fs.existsSync(outputPath));
    assert.ok(fs.statSync(outputPath).isDirectory());

    // Tree directory should exist
    const treeDir = path.join(outputPath, 'tree');
    assert.ok(fs.existsSync(treeDir));
    assert.ok(fs.statSync(treeDir).isDirectory());
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: meta.json creation
test('assembleMap: creates valid meta.json', () => {
  const tempDir = createTempDir();

  try {
    assembleMap(mockAnnotations, mockGraph, mockMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
    });

    const metaPath = path.join(tempDir, '.repo_map', 'meta.json');
    assert.ok(fs.existsSync(metaPath));

    const content = fs.readFileSync(metaPath, 'utf8');
    const meta = JSON.parse(content) as MetaJson;

    // Validate structure
    assert.strictEqual(meta.schema_version, SCHEMA_VERSION);
    assert.strictEqual(meta.map_version, 1);
    assert.strictEqual(meta.git_commit, 'abc123def456');
    assert.strictEqual(meta.repo_name, 'test-repo');
    assert.ok(Array.isArray(meta.entrypoints));
    assert.ok(Array.isArray(meta.modules));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: graph.json creation
test('assembleMap: creates valid graph.json', () => {
  const tempDir = createTempDir();

  try {
    assembleMap(mockAnnotations, mockGraph, mockMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
    });

    const graphPath = path.join(tempDir, '.repo_map', 'graph.json');
    assert.ok(fs.existsSync(graphPath));

    const content = fs.readFileSync(graphPath, 'utf8');
    const graph = JSON.parse(content) as GraphJson;

    // Validate structure
    assert.ok(graph['src/index.ts']);
    assert.ok(Array.isArray(graph['src/index.ts'].imports));
    assert.ok(Array.isArray(graph['src/index.ts'].imported_by));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: stats.json creation
test('assembleMap: creates valid stats.json', () => {
  const tempDir = createTempDir();

  try {
    assembleMap(mockAnnotations, mockGraph, mockMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
    });

    const statsPath = path.join(tempDir, '.repo_map', 'stats.json');
    assert.ok(fs.existsSync(statsPath));

    const content = fs.readFileSync(statsPath, 'utf8');
    const stats = JSON.parse(content) as StatsJson;

    // Validate structure
    assert.strictEqual(stats.files_annotated, 4);
    assert.ok(typeof stats.build_time_minutes === 'number');
    assert.ok(Array.isArray(stats.levels_completed));
    assert.strictEqual(stats.agents_used, 1);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: annotations.json creation
test('assembleMap: creates valid annotations.json', () => {
  const tempDir = createTempDir();

  try {
    assembleMap(mockAnnotations, mockGraph, mockMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
    });

    const annotationsPath = path.join(tempDir, '.repo_map', 'annotations.json');
    assert.ok(fs.existsSync(annotationsPath));

    const content = fs.readFileSync(annotationsPath, 'utf8');
    const annotations = JSON.parse(content) as FileAnnotation[];

    // Validate structure
    assert.ok(Array.isArray(annotations));
    assert.strictEqual(annotations.length, mockAnnotations.length);

    // Check first annotation
    const firstAnnotation = annotations.find(a => a.path === 'src/index.ts');
    assert.ok(firstAnnotation);
    assert.strictEqual(firstAnnotation.language, 'TypeScript');
    assert.strictEqual(firstAnnotation.purpose, 'Main entry point');
    assert.strictEqual(typeof firstAnnotation.line_count, 'number');
    assert.strictEqual(typeof firstAnnotation.size_bytes, 'number');
    assert.ok(Array.isArray(firstAnnotation.exports));
    assert.ok(Array.isArray(firstAnnotation.imports));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: validation.json creation
test('assembleMap: creates valid validation.json', () => {
  const tempDir = createTempDir();

  try {
    assembleMap(mockAnnotations, mockGraph, mockMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
    });

    const validationPath = path.join(tempDir, '.repo_map', 'validation.json');
    assert.ok(fs.existsSync(validationPath));

    const content = fs.readFileSync(validationPath, 'utf8');
    const validation = JSON.parse(content) as ValidationJson;

    // Validate structure
    assert.ok(Array.isArray(validation.issues));
    assert.ok(typeof validation.auto_fixed === 'number');
    assert.ok(typeof validation.requires_attention === 'number');
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: tree/*.json creation
test('assembleMap: creates tree files organized by directory', () => {
  const tempDir = createTempDir();

  try {
    assembleMap(mockAnnotations, mockGraph, mockMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
    });

    const treeDir = path.join(tempDir, '.repo_map', 'tree');

    // Should have separate files for src/ and tests/
    const srcFile = path.join(treeDir, 'src.json');
    const testsFile = path.join(treeDir, 'tests.json');

    assert.ok(fs.existsSync(srcFile), 'src.json should exist');
    assert.ok(fs.existsSync(testsFile), 'tests.json should exist');

    // Check src.json content
    const srcContent = JSON.parse(fs.readFileSync(srcFile, 'utf8')) as FileAnnotation[];
    assert.ok(Array.isArray(srcContent));
    assert.strictEqual(srcContent.length, 3); // index, auth, utils

    // Check tests.json content
    const testsContent = JSON.parse(fs.readFileSync(testsFile, 'utf8')) as FileAnnotation[];
    assert.ok(Array.isArray(testsContent));
    assert.strictEqual(testsContent.length, 1); // auth.test
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: Tree files are sorted
test('assembleMap: sorts annotations in tree files', () => {
  const tempDir = createTempDir();

  try {
    assembleMap(mockAnnotations, mockGraph, mockMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
    });

    const srcFile = path.join(tempDir, '.repo_map', 'tree', 'src.json');
    const srcContent = JSON.parse(fs.readFileSync(srcFile, 'utf8')) as FileAnnotation[];

    // Should be sorted alphabetically by path
    const paths = srcContent.map(a => a.path);
    const sortedPaths = [...paths].sort();
    assert.deepStrictEqual(paths, sortedPaths);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: Root-level files handling
test('assembleMap: handles root-level files correctly', () => {
  const tempDir = createTempDir();

  const annotationsWithRoot: FileAnnotation[] = [
    ...mockAnnotations,
    {
      path: 'README.md',
      language: 'Markdown',
      size_bytes: 512,
      line_count: 10,
      purpose: 'Documentation',
      exports: [],
      imports: [],
    },
  ];

  try {
    assembleMap(annotationsWithRoot, mockGraph, mockMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
    });

    const rootFile = path.join(tempDir, '.repo_map', 'tree', 'root.json');
    assert.ok(fs.existsSync(rootFile));

    const rootContent = JSON.parse(fs.readFileSync(rootFile, 'utf8')) as FileAnnotation[];
    assert.strictEqual(rootContent.length, 1);
    assert.strictEqual(rootContent[0].path, 'README.md');
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: Custom output directory
test('assembleMap: supports custom output directory', () => {
  const tempDir = createTempDir();

  try {
    assembleMap(mockAnnotations, mockGraph, mockMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
      outputDir: '.custom_map',
    });

    const customPath = path.join(tempDir, '.custom_map');
    assert.ok(fs.existsSync(customPath));

    const metaPath = path.join(customPath, 'meta.json');
    assert.ok(fs.existsSync(metaPath));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: Files written list
test('assembleMap: returns list of all written files', () => {
  const tempDir = createTempDir();

  try {
    const result = assembleMap(mockAnnotations, mockGraph, mockMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
    });

    // Should have all expected files
    assert.ok(Array.isArray(result.filesWritten));
    assert.ok(result.filesWritten.length > 0);

    // Check for key files
    const filenames = result.filesWritten.map(f => path.basename(f));
    assert.ok(filenames.includes('meta.json'));
    assert.ok(filenames.includes('annotations.json'));
    assert.ok(filenames.includes('graph.json'));
    assert.ok(filenames.includes('stats.json'));
    assert.ok(filenames.includes('validation.json'));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: JSON formatting (pretty print with newline)
test('assembleMap: writes JSON with pretty formatting', () => {
  const tempDir = createTempDir();

  try {
    assembleMap(mockAnnotations, mockGraph, mockMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
    });

    const metaPath = path.join(tempDir, '.repo_map', 'meta.json');
    const content = fs.readFileSync(metaPath, 'utf8');

    // Should have indentation (2 spaces)
    assert.ok(content.includes('  '));

    // Should end with newline
    assert.ok(content.endsWith('\n'));

    // Should be valid JSON
    assert.doesNotThrow(() => JSON.parse(content));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: Atomic writes (directory created before files)
test('assembleMap: creates directories before writing files', () => {
  const tempDir = createTempDir();

  try {
    // Should not throw even if directories don't exist
    assert.doesNotThrow(() => {
      assembleMap(mockAnnotations, mockGraph, mockMeta, mockStats, mockValidation, {
        repoRoot: tempDir,
        outputDir: '.repo_map',
      });
    });

    // All files should exist
    const metaPath = path.join(tempDir, '.repo_map', 'meta.json');
    assert.ok(fs.existsSync(metaPath));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: Overwrite existing files
test('assembleMap: overwrites existing map files', () => {
  const tempDir = createTempDir();

  try {
    // First write
    assembleMap(mockAnnotations, mockGraph, mockMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
    });

    // Modify meta and write again
    const updatedMeta = { ...mockMeta, map_version: 2 };
    assembleMap(mockAnnotations, mockGraph, updatedMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
    });

    // Should have new version
    const metaPath = path.join(tempDir, '.repo_map', 'meta.json');
    const content = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as MetaJson;
    assert.strictEqual(content.map_version, 2);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: Read existing meta
test('readExistingMeta: reads existing meta.json', () => {
  const tempDir = createTempDir();

  try {
    // First write
    assembleMap(mockAnnotations, mockGraph, mockMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
    });

    // Read back
    const existingMeta = readExistingMeta(tempDir);

    assert.ok(existingMeta);
    assert.strictEqual(existingMeta!.map_version, 1);
    assert.strictEqual(existingMeta!.git_commit, 'abc123def456');
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: Read existing meta - no file
test('readExistingMeta: returns null when no meta.json exists', () => {
  const tempDir = createTempDir();

  try {
    const existingMeta = readExistingMeta(tempDir);
    assert.strictEqual(existingMeta, null);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: Read existing meta - invalid JSON
test('readExistingMeta: returns null on invalid JSON', () => {
  const tempDir = createTempDir();

  try {
    // Create invalid JSON file
    const metaDir = path.join(tempDir, '.repo_map');
    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(path.join(metaDir, 'meta.json'), 'invalid json{', 'utf8');

    const existingMeta = readExistingMeta(tempDir);
    assert.strictEqual(existingMeta, null);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: Empty annotations
test('assembleMap: handles empty annotations array', () => {
  const tempDir = createTempDir();

  try {
    const result = assembleMap([], {}, mockMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
    });

    // Should still create all files
    assert.ok(fs.existsSync(path.join(tempDir, '.repo_map', 'meta.json')));
    assert.ok(fs.existsSync(path.join(tempDir, '.repo_map', 'graph.json')));

    // Graph should be empty
    const graphPath = path.join(tempDir, '.repo_map', 'graph.json');
    const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    assert.deepStrictEqual(graph, {});
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: Output path returned
test('assembleMap: returns correct output path', () => {
  const tempDir = createTempDir();

  try {
    const result = assembleMap(mockAnnotations, mockGraph, mockMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
      outputDir: '.repo_map',
    });

    const expectedPath = path.join(tempDir, '.repo_map');
    assert.strictEqual(result.outputPath, expectedPath);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: Large annotation set
test('assembleMap: handles large annotation sets efficiently', () => {
  const tempDir = createTempDir();

  const largeAnnotations: FileAnnotation[] = Array.from({ length: 1000 }, (_, i) => ({
    path: `src/file${i}.ts`,
    language: 'TypeScript',
    size_bytes: 512,
    line_count: 100,
    purpose: `File ${i}`,
    exports: [`func${i}`],
    imports: [],
  }));

  try {
    const startTime = Date.now();
    assembleMap(largeAnnotations, mockGraph, mockMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
    });
    const duration = Date.now() - startTime;

    // Should complete in reasonable time
    assert.ok(duration < 5000, `Assembly took ${duration}ms`);

    // All files should exist
    assert.ok(fs.existsSync(path.join(tempDir, '.repo_map', 'meta.json')));
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: Output path returned
test('assembleMap: returns correct output path', () => {
  const tempDir = createTempDir();

  try {
    const result = assembleMap(mockAnnotations, mockGraph, mockMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
      outputDir: '.repo_map',
    });

    const expectedPath = path.join(tempDir, '.repo_map');
    assert.strictEqual(result.outputPath, expectedPath);
  } finally {
    cleanupTempDir(tempDir);
  }
});

// Test: Large annotation set
test('assembleMap: handles large annotation sets efficiently', () => {
  const tempDir = createTempDir();

  const largeAnnotations: FileAnnotation[] = Array.from({ length: 1000 }, (_, i) => ({
    path: `src/file${i}.ts`,
    language: 'TypeScript',
    size_bytes: 512,
    line_count: 100,
    purpose: `File ${i}`,
    exports: [`func${i}`],
    imports: [],
  }));

  try {
    const startTime = Date.now();
    assembleMap(largeAnnotations, mockGraph, mockMeta, mockStats, mockValidation, {
      repoRoot: tempDir,
    });
    const duration = Date.now() - startTime;

    // Should complete in reasonable time
    assert.ok(duration < 5000, `Assembly took ${duration}ms`);

    // All files should exist
    assert.ok(fs.existsSync(path.join(tempDir, '.repo_map', 'meta.json')));
  } finally {
    cleanupTempDir(tempDir);
  }
});
