/**
 * Tests for Level 4 - Orphan File Detection
 *
 * Tests orphan file detection, entry point exclusion,
 * circular dependency detection, and edge cases
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  findOrphanFiles,
  findCircularDependencies,
  findFilesWithNoExports,
  runOrphanChecks,
} from '../../../src/levels/level4/orphans.js';
import type { FileAnnotation, GraphJson, MetaJson } from '../../../src/core/types.js';

// Mock metadata
const mockMeta: MetaJson = {
  schema_version: '1.0',
  map_version: 1,
  git_commit: 'abc123',
  created_at: '2024-01-01T00:00:00Z',
  last_updated: '2024-01-01T00:00:00Z',
  parent_version: null,
  update_type: 'full',
  files_changed: null,
  repo_name: 'test-repo',
  purpose: 'Test repository',
  stack: 'TypeScript',
  languages: ['TypeScript'],
  entrypoints: ['src/index'],
  modules: [],
  config_files: ['package.json', 'tsconfig.json'],
  conventions: [],
};

const mockAnnotations: FileAnnotation[] = [
  {
    path: 'src/index',
    language: 'TypeScript',
    size_bytes: 1024,
    line_count: 50,
    purpose: 'Main entry point',
    exports: ['main'],
    imports: ['src/app'],
  },
  {
    path: 'src/app',
    language: 'TypeScript',
    size_bytes: 2048,
    line_count: 100,
    purpose: 'Application logic',
    exports: ['App'],
    imports: ['src/utils'],
  },
  {
    path: 'src/utils',
    language: 'TypeScript',
    size_bytes: 512,
    line_count: 30,
    purpose: 'Utility functions',
    exports: ['formatDate'],
    imports: [],
  },
  {
    path: 'src/orphan',
    language: 'TypeScript',
    size_bytes: 256,
    line_count: 20,
    purpose: 'Orphaned file',
    exports: ['unusedFn'],
    imports: [],
  },
];

const mockGraph: GraphJson = {
  'src/index': {
    imports: ['src/app'],
    imported_by: [],
  },
  'src/app': {
    imports: ['src/utils'],
    imported_by: ['src/index'],
  },
  'src/utils': {
    imports: [],
    imported_by: ['src/app'],
  },
  'src/orphan': {
    imports: [],
    imported_by: [],
  },
};

// Test: findOrphanFiles
test('findOrphanFiles: detects orphan files with no importers', () => {
  const issues = findOrphanFiles(mockAnnotations, mockGraph, mockMeta);

  assert.ok(issues.length > 0);
  assert.ok(issues.some(i => i.file === 'src/orphan'));
  assert.ok(issues.some(i => i.type === 'orphan_file'));
  assert.ok(issues.some(i => i.severity === 'warning'));
});

test('findOrphanFiles: excludes entry points from orphan detection', () => {
  const issues = findOrphanFiles(mockAnnotations, mockGraph, mockMeta);

  // Entry point should not be marked as orphan
  assert.ok(!issues.some(i => i.file === 'src/index'));
});

test('findOrphanFiles: excludes config files from orphan detection', () => {
  const annotations: FileAnnotation[] = [
    {
      path: 'package.json',
      language: 'JSON',
      size_bytes: 1024,
      line_count: 50,
      purpose: 'Package configuration',
      exports: [],
      imports: [],
    },
  ];

  const graph: GraphJson = {
    'package.json': {
      imports: [],
      imported_by: [],
    },
  };

  const issues = findOrphanFiles(annotations, graph, mockMeta);

  // Config file should not be marked as orphan
  assert.ok(!issues.some(i => i.file === 'package.json'));
});

test('findOrphanFiles: returns no issues for files with importers', () => {
  const issues = findOrphanFiles(mockAnnotations, mockGraph, mockMeta);

  // Files with importers should not be orphans
  assert.ok(!issues.some(i => i.file === 'src/app'));
  assert.ok(!issues.some(i => i.file === 'src/utils'));
});

test('findOrphanFiles: handles empty graph gracefully', () => {
  const annotations: FileAnnotation[] = [
    {
      path: 'src/test',
      language: 'TypeScript',
      size_bytes: 100,
      line_count: 10,
      purpose: 'Test file',
      exports: [],
      imports: [],
    },
  ];

  const graph: GraphJson = {};

  const issues = findOrphanFiles(annotations, graph, mockMeta);

  // Should not crash, file is not in graph so skip it
  assert.ok(true);
});

test('findOrphanFiles: handles files not in graph', () => {
  const annotations: FileAnnotation[] = [
    ...mockAnnotations,
    {
      path: 'src/new',
      language: 'TypeScript',
      size_bytes: 100,
      line_count: 10,
      purpose: 'New file',
      exports: [],
      imports: [],
    },
  ];

  const issues = findOrphanFiles(annotations, mockGraph, mockMeta);

  // Should not include the file that's not in the graph
  assert.ok(!issues.some(i => i.file === 'src/new'));
});

// Test: findCircularDependencies
test('findCircularDependencies: detects simple circular dependency', () => {
  const graph: GraphJson = {
    'src/a': {
      imports: ['src/b'],
      imported_by: ['src/b'],
    },
    'src/b': {
      imports: ['src/a'],
      imported_by: ['src/a'],
    },
  };

  const issues = findCircularDependencies(graph);

  assert.ok(issues.length > 0);
  assert.ok(issues.some(i => i.type === 'circular_dependency'));
  assert.ok(issues.some(i => i.severity === 'info'));
  assert.ok(issues.some(i => i.message.includes('src/a')));
  assert.ok(issues.some(i => i.message.includes('src/b')));
});

test('findCircularDependencies: detects three-way circular dependency', () => {
  const graph: GraphJson = {
    'src/a': {
      imports: ['src/b'],
      imported_by: ['src/c'],
    },
    'src/b': {
      imports: ['src/c'],
      imported_by: ['src/a'],
    },
    'src/c': {
      imports: ['src/a'],
      imported_by: ['src/b'],
    },
  };

  const issues = findCircularDependencies(graph);

  assert.ok(issues.length > 0);
  assert.ok(issues.some(i => i.type === 'circular_dependency'));
  assert.ok(issues.some(i => i.message.includes('src/a')));
  assert.ok(issues.some(i => i.message.includes('src/b')));
  assert.ok(issues.some(i => i.message.includes('src/c')));
});

test('findCircularDependencies: returns no issues for acyclic graph', () => {
  const issues = findCircularDependencies(mockGraph);

  assert.strictEqual(issues.length, 0);
});

test('findCircularDependencies: handles empty graph', () => {
  const graph: GraphJson = {};

  const issues = findCircularDependencies(graph);

  assert.strictEqual(issues.length, 0);
});

test('findCircularDependencies: handles single node graph', () => {
  const graph: GraphJson = {
    'src/a': {
      imports: [],
      imported_by: [],
    },
  };

  const issues = findCircularDependencies(graph);

  assert.strictEqual(issues.length, 0);
});

test('findCircularDependencies: handles self-referencing file', () => {
  const graph: GraphJson = {
    'src/a': {
      imports: ['src/a'],
      imported_by: ['src/a'],
    },
  };

  const issues = findCircularDependencies(graph);

  // Should detect the cycle
  assert.ok(issues.length > 0);
  assert.ok(issues.some(i => i.type === 'circular_dependency'));
});

test('findCircularDependencies: avoids duplicate cycle reporting', () => {
  const graph: GraphJson = {
    'src/a': {
      imports: ['src/b'],
      imported_by: ['src/b'],
    },
    'src/b': {
      imports: ['src/a'],
      imported_by: ['src/a'],
    },
  };

  const issues = findCircularDependencies(graph);

  // Should only report the cycle once, not twice
  const cyclicIssues = issues.filter(i => i.type === 'circular_dependency');
  assert.strictEqual(cyclicIssues.length, 1);
});

// Test: findFilesWithNoExports
test('findFilesWithNoExports: detects files with no exports but has imports', () => {
  const annotations: FileAnnotation[] = [
    {
      path: 'src/side-effect.ts',
      language: 'TypeScript',
      size_bytes: 256,
      line_count: 20,
      purpose: 'Side effect file',
      exports: [],
      imports: ['src/app'],
    },
  ];

  const issues = findFilesWithNoExports(annotations, mockMeta);

  assert.ok(issues.length > 0);
  assert.ok(issues.some(i => i.file === 'src/side-effect.ts'));
  assert.ok(issues.some(i => i.type === 'no_exports'));
  assert.ok(issues.some(i => i.severity === 'info'));
});

test('findFilesWithNoExports: excludes entry points', () => {
  const annotations: FileAnnotation[] = [
    {
      path: 'src/index',
      language: 'TypeScript',
      size_bytes: 256,
      line_count: 20,
      purpose: 'Entry point',
      exports: [],
      imports: ['src/app'],
    },
  ];

  const issues = findFilesWithNoExports(annotations, mockMeta);

  // Entry points should be excluded
  assert.strictEqual(issues.length, 0);
});

test('findFilesWithNoExports: excludes test files', () => {
  const annotations: FileAnnotation[] = [
    {
      path: 'src/test.spec.ts',
      language: 'TypeScript',
      size_bytes: 256,
      line_count: 20,
      purpose: 'Test file',
      exports: [],
      imports: ['src/app'],
    },
  ];

  const issues = findFilesWithNoExports(annotations, mockMeta);

  // Test files should be excluded
  assert.strictEqual(issues.length, 0);
});

test('findFilesWithNoExports: excludes files with no imports either', () => {
  const annotations: FileAnnotation[] = [
    {
      path: 'src/empty.ts',
      language: 'TypeScript',
      size_bytes: 256,
      line_count: 20,
      purpose: 'Empty file',
      exports: [],
      imports: [],
    },
  ];

  const issues = findFilesWithNoExports(annotations, mockMeta);

  // Files with no imports and no exports are excluded
  assert.strictEqual(issues.length, 0);
});

test('findFilesWithNoExports: handles files with exports normally', () => {
  const annotations: FileAnnotation[] = [
    {
      path: 'src/normal.ts',
      language: 'TypeScript',
      size_bytes: 256,
      line_count: 20,
      purpose: 'Normal file',
      exports: ['fn'],
      imports: ['src/app'],
    },
  ];

  const issues = findFilesWithNoExports(annotations, mockMeta);

  assert.strictEqual(issues.length, 0);
});

// Test: runOrphanChecks
test('runOrphanChecks: aggregates all orphan-related checks', () => {
  const annotations: FileAnnotation[] = [
    ...mockAnnotations,
    {
      path: 'src/side-effect.ts',
      language: 'TypeScript',
      size_bytes: 256,
      line_count: 20,
      purpose: 'Side effect file',
      exports: [],
      imports: ['src/app'],
    },
  ];

  const graph: GraphJson = {
    ...mockGraph,
    'src/side-effect.ts': {
      imports: ['src/app'],
      imported_by: [],
    },
  };

  const issues = runOrphanChecks(annotations, graph, mockMeta);

  // Should include orphan detection, circular deps (none), and no-exports
  assert.ok(issues.length > 0);
  assert.ok(issues.some(i => i.type === 'orphan_file'));
  assert.ok(issues.some(i => i.type === 'no_exports'));
});

test('runOrphanChecks: returns empty array for clean codebase', () => {
  const annotations: FileAnnotation[] = [
    {
      path: 'src/index',
      language: 'TypeScript',
      size_bytes: 1024,
      line_count: 50,
      purpose: 'Entry point',
      exports: ['main'],
      imports: ['src/app'],
    },
    {
      path: 'src/app',
      language: 'TypeScript',
      size_bytes: 2048,
      line_count: 100,
      purpose: 'Application',
      exports: ['App'],
      imports: [],
    },
  ];

  const graph: GraphJson = {
    'src/index': {
      imports: ['src/app'],
      imported_by: [],
    },
    'src/app': {
      imports: [],
      imported_by: ['src/index'],
    },
  };

  const issues = runOrphanChecks(annotations, graph, mockMeta);

  assert.strictEqual(issues.length, 0);
});

test('runOrphanChecks: handles empty inputs', () => {
  const emptyMeta: MetaJson = {
    ...mockMeta,
    entrypoints: [],
    config_files: [],
  };

  const issues = runOrphanChecks([], {}, emptyMeta);

  assert.strictEqual(issues.length, 0);
});
