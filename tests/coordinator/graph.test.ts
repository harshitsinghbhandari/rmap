/**
 * Tests for Dependency Graph Builder
 *
 * Tests imported_by graph building, circular dependency handling,
 * graph.json structure, and graph update operations.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import type { FileAnnotation, GraphJson } from '../../src/core/types.js';
import { buildGraph, updateGraph, getGraphStats } from '../../src/coordinator/graph.js';

// Mock file annotations for testing
const mockAnnotations: FileAnnotation[] = [
  {
    path: 'src/index.ts',
    language: 'TypeScript',
    size_bytes: 1024,
    purpose: 'Main entry point',
    tags: ['entrypoint'],
    exports: ['main'],
    imports: ['src/auth.ts', 'src/utils.ts'],
  },
  {
    path: 'src/auth.ts',
    language: 'TypeScript',
    size_bytes: 2048,
    purpose: 'Authentication',
    tags: ['authentication'],
    exports: ['login', 'logout'],
    imports: ['src/utils.ts'],
  },
  {
    path: 'src/utils.ts',
    language: 'TypeScript',
    size_bytes: 512,
    purpose: 'Utilities',
    tags: ['utilities'],
    exports: ['format', 'validate'],
    imports: [],
  },
];

// Test: Basic graph building
test('buildGraph: creates correct graph structure', () => {
  const graph = buildGraph(mockAnnotations);

  // All files should be in the graph
  assert.ok(graph['src/index.ts']);
  assert.ok(graph['src/auth.ts']);
  assert.ok(graph['src/utils.ts']);

  // Check imports
  assert.deepStrictEqual(graph['src/index.ts'].imports, ['src/auth.ts', 'src/utils.ts']);
  assert.deepStrictEqual(graph['src/auth.ts'].imports, ['src/utils.ts']);
  assert.deepStrictEqual(graph['src/utils.ts'].imports, []);

  // Check imported_by (reverse edges)
  assert.deepStrictEqual(graph['src/index.ts'].imported_by, []);
  assert.deepStrictEqual(graph['src/auth.ts'].imported_by, ['src/index.ts']);
  assert.deepStrictEqual(graph['src/utils.ts'].imported_by, ['src/auth.ts', 'src/index.ts']);
});

// Test: Graph node structure
test('buildGraph: nodes have correct structure', () => {
  const graph = buildGraph(mockAnnotations);

  for (const [path, node] of Object.entries(graph)) {
    // Each node must have imports and imported_by arrays
    assert.ok(Array.isArray(node.imports), `${path} should have imports array`);
    assert.ok(Array.isArray(node.imported_by), `${path} should have imported_by array`);
  }
});

// Test: Empty annotations
test('buildGraph: handles empty annotations array', () => {
  const graph = buildGraph([]);
  assert.deepStrictEqual(graph, {});
});

// Test: Single file with no imports
test('buildGraph: handles single file with no imports', () => {
  const singleFile: FileAnnotation[] = [
    {
      path: 'src/standalone.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Standalone module',
      tags: ['utilities'],
      exports: ['helper'],
      imports: [],
    },
  ];

  const graph = buildGraph(singleFile);

  assert.ok(graph['src/standalone.ts']);
  assert.deepStrictEqual(graph['src/standalone.ts'].imports, []);
  assert.deepStrictEqual(graph['src/standalone.ts'].imported_by, []);
});

// Test: Circular dependencies
test('buildGraph: handles circular dependencies correctly', () => {
  const circularAnnotations: FileAnnotation[] = [
    {
      path: 'src/a.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Module A',
      tags: [],
      exports: ['funcA'],
      imports: ['src/b.ts'],
    },
    {
      path: 'src/b.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Module B',
      tags: [],
      exports: ['funcB'],
      imports: ['src/c.ts'],
    },
    {
      path: 'src/c.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Module C',
      tags: [],
      exports: ['funcC'],
      imports: ['src/a.ts'],
    },
  ];

  const graph = buildGraph(circularAnnotations);

  // Verify circular structure
  assert.deepStrictEqual(graph['src/a.ts'].imports, ['src/b.ts']);
  assert.deepStrictEqual(graph['src/b.ts'].imports, ['src/c.ts']);
  assert.deepStrictEqual(graph['src/c.ts'].imports, ['src/a.ts']);

  // Verify reverse edges
  assert.deepStrictEqual(graph['src/a.ts'].imported_by, ['src/c.ts']);
  assert.deepStrictEqual(graph['src/b.ts'].imported_by, ['src/a.ts']);
  assert.deepStrictEqual(graph['src/c.ts'].imported_by, ['src/b.ts']);
});

// Test: Self-referencing imports (edge case)
test('buildGraph: handles self-referencing imports', () => {
  const selfRefAnnotations: FileAnnotation[] = [
    {
      path: 'src/recursive.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Recursive module',
      tags: [],
      exports: ['recursive'],
      imports: ['src/recursive.ts'], // Self-reference
    },
  ];

  const graph = buildGraph(selfRefAnnotations);

  // Should create the node but handle self-reference
  assert.ok(graph['src/recursive.ts']);
  assert.deepStrictEqual(graph['src/recursive.ts'].imports, ['src/recursive.ts']);
  assert.deepStrictEqual(graph['src/recursive.ts'].imported_by, ['src/recursive.ts']);
});

// Test: Missing imported files
test('buildGraph: handles imports to non-existent files', () => {
  const annotationsWithMissing: FileAnnotation[] = [
    {
      path: 'src/importer.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Imports missing file',
      tags: [],
      exports: ['func'],
      imports: ['src/missing.ts', 'src/utils.ts'],
    },
    {
      path: 'src/utils.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Utilities',
      tags: [],
      exports: ['util'],
      imports: [],
    },
  ];

  const graph = buildGraph(annotationsWithMissing);

  // Importer should list the missing import
  assert.ok(graph['src/importer.ts'].imports.includes('src/missing.ts'));

  // Missing file shouldn't have a node in the graph
  assert.strictEqual(graph['src/missing.ts'], undefined);

  // Utils should show importer in its imported_by
  assert.deepStrictEqual(graph['src/utils.ts'].imported_by, ['src/importer.ts']);
});

// Test: Duplicate imports (should be deduplicated)
test('buildGraph: deduplicates multiple imports of same file', () => {
  const annotationsWithDupes: FileAnnotation[] = [
    {
      path: 'src/importer.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Imports same file multiple times',
      tags: [],
      exports: ['func'],
      imports: ['src/utils.ts', 'src/utils.ts', 'src/utils.ts'], // Duplicates
    },
    {
      path: 'src/utils.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Utilities',
      tags: [],
      exports: ['util'],
      imports: [],
    },
  ];

  const graph = buildGraph(annotationsWithDupes);

  // Imports should be as-is (deduplication happens in imported_by)
  assert.deepStrictEqual(graph['src/importer.ts'].imports, [
    'src/utils.ts',
    'src/utils.ts',
    'src/utils.ts',
  ]);

  // imported_by should not have duplicates
  assert.deepStrictEqual(graph['src/utils.ts'].imported_by, ['src/importer.ts']);
});

// Test: Arrays are sorted
test('buildGraph: sorts imports and imported_by arrays', () => {
  const unsortedAnnotations: FileAnnotation[] = [
    {
      path: 'src/index.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Entry point',
      tags: [],
      exports: ['main'],
      imports: ['src/z.ts', 'src/a.ts', 'src/m.ts'], // Unsorted
    },
    {
      path: 'src/a.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Module A',
      tags: [],
      exports: [],
      imports: [],
    },
    {
      path: 'src/m.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Module M',
      tags: [],
      exports: [],
      imports: [],
    },
    {
      path: 'src/z.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Module Z',
      tags: [],
      exports: [],
      imports: [],
    },
  ];

  const graph = buildGraph(unsortedAnnotations);

  // Imports should be sorted
  assert.deepStrictEqual(graph['src/index.ts'].imports, ['src/a.ts', 'src/m.ts', 'src/z.ts']);

  // imported_by should be sorted (all point to index)
  for (const path of ['src/a.ts', 'src/m.ts', 'src/z.ts']) {
    assert.deepStrictEqual(graph[path].imported_by, ['src/index.ts']);
  }
});

// Test: Update graph - add new file
test('updateGraph: adds new files correctly', () => {
  const initialGraph = buildGraph(mockAnnotations);

  const newAnnotation: FileAnnotation = {
    path: 'src/new.ts',
    language: 'TypeScript',
    size_bytes: 512,
    purpose: 'New module',
    tags: [],
    exports: ['newFunc'],
    imports: ['src/utils.ts'],
  };

  const updatedGraph = updateGraph(initialGraph, [newAnnotation]);

  // New file should be in graph
  assert.ok(updatedGraph['src/new.ts']);
  assert.deepStrictEqual(updatedGraph['src/new.ts'].imports, ['src/utils.ts']);

  // Utils should have new file in imported_by
  assert.ok(updatedGraph['src/utils.ts'].imported_by.includes('src/new.ts'));
});

// Test: Update graph - modify existing file
test('updateGraph: updates existing files correctly', () => {
  const initialGraph = buildGraph(mockAnnotations);

  // Modify auth.ts to import index.ts (creating circular dependency)
  const modifiedAnnotation: FileAnnotation = {
    path: 'src/auth.ts',
    language: 'TypeScript',
    size_bytes: 2048,
    purpose: 'Authentication (modified)',
    tags: ['authentication'],
    exports: ['login', 'logout'],
    imports: ['src/utils.ts', 'src/index.ts'], // Added index.ts
  };

  const updatedGraph = updateGraph(initialGraph, [modifiedAnnotation]);

  // auth.ts should have new imports
  assert.deepStrictEqual(updatedGraph['src/auth.ts'].imports, ['src/index.ts', 'src/utils.ts']);

  // index.ts should now be imported by auth.ts
  assert.ok(updatedGraph['src/index.ts'].imported_by.includes('src/auth.ts'));
});

// Test: Update graph - delete files
test('updateGraph: removes deleted files correctly', () => {
  const initialGraph = buildGraph(mockAnnotations);

  const updatedGraph = updateGraph(initialGraph, [], ['src/auth.ts']);

  // auth.ts should be removed
  assert.strictEqual(updatedGraph['src/auth.ts'], undefined);

  // index.ts should no longer import auth.ts
  assert.strictEqual(updatedGraph['src/index.ts'].imports.includes('src/auth.ts'), false);
});

// Test: Update graph - multiple changes at once
test('updateGraph: handles multiple changes atomically', () => {
  const initialGraph = buildGraph(mockAnnotations);

  const updatedAnnotation: FileAnnotation = {
    path: 'src/index.ts',
    language: 'TypeScript',
    size_bytes: 1024,
    purpose: 'Main entry point (updated)',
    tags: ['entrypoint'],
    exports: ['main'],
    imports: ['src/utils.ts'], // Removed auth.ts import
  };

  const newAnnotation: FileAnnotation = {
    path: 'src/new.ts',
    language: 'TypeScript',
    size_bytes: 512,
    purpose: 'New module',
    tags: [],
    exports: ['newFunc'],
    imports: ['src/auth.ts'],
  };

  const updatedGraph = updateGraph(initialGraph, [updatedAnnotation, newAnnotation], []);

  // index.ts should have updated imports
  assert.deepStrictEqual(updatedGraph['src/index.ts'].imports, ['src/utils.ts']);

  // auth.ts should be imported by new.ts (not index.ts anymore)
  assert.deepStrictEqual(updatedGraph['src/auth.ts'].imported_by, ['src/new.ts']);

  // new.ts should exist
  assert.ok(updatedGraph['src/new.ts']);
});

// Test: Update graph - clear old reverse edges
test('updateGraph: clears old reverse edges when updating', () => {
  const initialGraph = buildGraph(mockAnnotations);

  // Change index.ts to not import anything
  const updatedAnnotation: FileAnnotation = {
    path: 'src/index.ts',
    language: 'TypeScript',
    size_bytes: 1024,
    purpose: 'Main entry point (isolated)',
    tags: ['entrypoint'],
    exports: ['main'],
    imports: [], // No imports
  };

  const updatedGraph = updateGraph(initialGraph, [updatedAnnotation]);

  // auth.ts and utils.ts should no longer be imported by index.ts
  assert.strictEqual(updatedGraph['src/auth.ts'].imported_by.includes('src/index.ts'), false);
  assert.strictEqual(updatedGraph['src/utils.ts'].imported_by.includes('src/index.ts'), false);
});

// Test: Graph statistics
test('getGraphStats: calculates correct statistics', () => {
  const graph = buildGraph(mockAnnotations);
  const stats = getGraphStats(graph);

  assert.strictEqual(stats.totalFiles, 3);
  assert.strictEqual(stats.totalImports, 3); // index: 2, auth: 1, utils: 0
  assert.strictEqual(stats.avgImportsPerFile, 1); // 3 imports / 3 files
  assert.strictEqual(stats.maxImports, 2); // index.ts has 2 imports
  assert.strictEqual(stats.maxImportedBy, 2); // utils.ts is imported by 2 files
});

// Test: Graph statistics - orphan count
test('getGraphStats: counts orphan files correctly', () => {
  const annotationsWithOrphan: FileAnnotation[] = [
    {
      path: 'src/index.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Entry point',
      tags: [],
      exports: ['main'],
      imports: ['src/utils.ts'],
    },
    {
      path: 'src/utils.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Utilities',
      tags: [],
      exports: ['util'],
      imports: [],
    },
    {
      path: 'src/orphan.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Orphan file',
      tags: [],
      exports: [],
      imports: [], // No imports and not imported by anyone
    },
  ];

  const graph = buildGraph(annotationsWithOrphan);
  const stats = getGraphStats(graph);

  assert.strictEqual(stats.orphanCount, 1); // orphan.ts
});

// Test: Graph statistics - complex graph
test('getGraphStats: handles complex graph correctly', () => {
  const complexAnnotations: FileAnnotation[] = [
    {
      path: 'src/a.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Module A',
      tags: [],
      exports: [],
      imports: ['src/b.ts', 'src/c.ts', 'src/d.ts'],
    },
    {
      path: 'src/b.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Module B',
      tags: [],
      exports: [],
      imports: ['src/d.ts'],
    },
    {
      path: 'src/c.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Module C',
      tags: [],
      exports: [],
      imports: ['src/d.ts'],
    },
    {
      path: 'src/d.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Module D',
      tags: [],
      exports: [],
      imports: [],
    },
  ];

  const graph = buildGraph(complexAnnotations);
  const stats = getGraphStats(graph);

  assert.strictEqual(stats.totalFiles, 4);
  assert.strictEqual(stats.totalImports, 5); // a:3, b:1, c:1, d:0
  assert.strictEqual(stats.maxImports, 3); // a.ts
  assert.strictEqual(stats.maxImportedBy, 3); // d.ts is imported by a, b, c
  assert.strictEqual(stats.orphanCount, 0); // No orphans
});

// Test: Graph immutability
test('buildGraph: does not mutate input annotations', () => {
  const annotations: FileAnnotation[] = [
    {
      path: 'src/test.ts',
      language: 'TypeScript',
      size_bytes: 512,
      purpose: 'Test',
      tags: [],
      exports: [],
      imports: ['src/utils.ts'],
    },
  ];

  const originalImports = [...annotations[0].imports];
  buildGraph(annotations);

  // Original imports should not be mutated
  assert.deepStrictEqual(annotations[0].imports, originalImports);
});

// Test: Large graph performance
test('buildGraph: handles large graphs efficiently', () => {
  const largeAnnotations: FileAnnotation[] = Array.from({ length: 1000 }, (_, i) => ({
    path: `src/file${i}.ts`,
    language: 'TypeScript',
    size_bytes: 512,
    purpose: `File ${i}`,
    tags: [],
    exports: [`func${i}`],
    imports: i > 0 ? [`src/file${i - 1}.ts`] : [], // Linear chain
  }));

  const startTime = Date.now();
  const graph = buildGraph(largeAnnotations);
  const duration = Date.now() - startTime;

  // Should complete in reasonable time (< 1 second)
  assert.ok(duration < 1000, `Graph building took ${duration}ms`);
  assert.strictEqual(Object.keys(graph).length, 1000);
});

// Test: Graph JSON structure compliance
test('buildGraph: output matches GraphJson type structure', () => {
  const graph = buildGraph(mockAnnotations);

  // Verify it matches GraphJson structure
  for (const [path, node] of Object.entries(graph)) {
    assert.ok(typeof path === 'string');
    assert.ok(Array.isArray(node.imports));
    assert.ok(Array.isArray(node.imported_by));

    // All array elements should be strings
    for (const imp of node.imports) {
      assert.ok(typeof imp === 'string');
    }
    for (const importedBy of node.imported_by) {
      assert.ok(typeof importedBy === 'string');
    }
  }
});
