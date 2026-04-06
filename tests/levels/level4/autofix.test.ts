/**
 * Tests for Level 4 - Auto-fix Capabilities
 *
 * Tests deleted file removal, imported_by repair,
 * broken import fixes, and fix reporting
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import {
  removeDeletedFiles,
  fixBrokenImportedBy,
  fixBrokenImports,
  runAutofix,
} from '../../../src/levels/level4/autofix.js';
import type { FileAnnotation, GraphJson } from '../../../src/core/types.js';

// Helper to create a temp directory for testing
function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'rmap-test-'));
}

// Helper to safely write a file (creates parent directories)
function safeWriteFile(filePath: string, content: string): void {
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, content);
}

// Mock data
const mockAnnotations: FileAnnotation[] = [
  {
    path: 'src/auth/jwt',
    language: 'TypeScript',
    size_bytes: 2048,
    line_count: 100,
    purpose: 'JWT token generation',
    exports: ['generateToken'],
    imports: ['src/config/env'],
  },
  {
    path: 'src/config/env',
    language: 'TypeScript',
    size_bytes: 512,
    line_count: 20,
    purpose: 'Environment configuration',
    exports: ['getEnv'],
    imports: [],
  },
];

const mockGraph: GraphJson = {
  'src/auth/jwt': {
    imports: ['src/config/env'],
    imported_by: [],
  },
  'src/config/env': {
    imports: [],
    imported_by: ['src/auth/jwt'],
  },
};

// Test: removeDeletedFiles
test('removeDeletedFiles: removes annotations for deleted files', () => {
  const tempDir = createTempDir();

  try {
    // Only create one file, not the other
    safeWriteFile(join(tempDir, 'src', 'config', 'env'), 'content');

    const result = removeDeletedFiles(mockAnnotations, mockGraph, tempDir);

    assert.strictEqual(result.annotations.length, 1);
    assert.strictEqual(result.annotations[0].path, 'src/config/env');
    assert.strictEqual(result.fixCount, 1);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('removeDeletedFiles: removes graph entries for deleted files', () => {
  const tempDir = createTempDir();

  try {
    safeWriteFile(join(tempDir, 'src', 'config', 'env'), 'content');

    const result = removeDeletedFiles(mockAnnotations, mockGraph, tempDir);

    assert.ok(result.graph['src/config/env']);
    assert.ok(!result.graph['src/auth/jwt']);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('removeDeletedFiles: reports fixed issues', () => {
  const tempDir = createTempDir();

  try {
    safeWriteFile(join(tempDir, 'src', 'config', 'env'), 'content');

    const result = removeDeletedFiles(mockAnnotations, mockGraph, tempDir);

    assert.strictEqual(result.fixed.length, 1);
    assert.strictEqual(result.fixed[0].severity, 'error');
    assert.strictEqual(result.fixed[0].type, 'deleted_file');
    assert.strictEqual(result.fixed[0].file, 'src/auth/jwt');
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('removeDeletedFiles: returns unchanged data when no files deleted', () => {
  const tempDir = createTempDir();

  try {
    // Create all files
    safeWriteFile(join(tempDir, 'src', 'auth', 'jwt'), 'content');
    safeWriteFile(join(tempDir, 'src', 'config', 'env'), 'content');

    const result = removeDeletedFiles(mockAnnotations, mockGraph, tempDir);

    assert.strictEqual(result.annotations.length, 2);
    assert.strictEqual(result.fixCount, 0);
    assert.strictEqual(result.fixed.length, 0);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('removeDeletedFiles: handles multiple deleted files', () => {
  const tempDir = createTempDir();

  try {
    const annotations: FileAnnotation[] = [
      ...mockAnnotations,
      {
        path: 'src/deleted1.ts',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'Deleted 1',
        exports: [],
        imports: [],
      },
      {
        path: 'src/deleted2.ts',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'Deleted 2',
        exports: [],
        imports: [],
      },
    ];

    const result = removeDeletedFiles(annotations, mockGraph, tempDir);

    // All files are deleted
    assert.strictEqual(result.annotations.length, 0);
    assert.strictEqual(result.fixCount, 4);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

// Test: fixBrokenImportedBy
test('fixBrokenImportedBy: adds missing imported_by references', () => {
  const graph: GraphJson = {
    'src/a': {
      imports: ['src/b'],
      imported_by: [],
    },
    'src/b': {
      imports: [],
      imported_by: [], // Missing 'src/a'
    },
  };

  const result = fixBrokenImportedBy(mockAnnotations, graph);

  assert.ok(result.graph['src/b'].imported_by.includes('src/a'));
  assert.ok(result.fixCount > 0);
});

test('fixBrokenImportedBy: removes incorrect imported_by references', () => {
  const graph: GraphJson = {
    'src/a': {
      imports: [],
      imported_by: [],
    },
    'src/b': {
      imports: [],
      imported_by: ['src/a'], // Incorrect
    },
  };

  const result = fixBrokenImportedBy(mockAnnotations, graph);

  assert.strictEqual(result.graph['src/b'].imported_by.length, 0);
  assert.ok(result.fixCount > 0);
});

test('fixBrokenImportedBy: reports all fixes', () => {
  const graph: GraphJson = {
    'src/a': {
      imports: ['src/b'],
      imported_by: [],
    },
    'src/b': {
      imports: [],
      imported_by: ['src/c.ts'], // Wrong reference
    },
  };

  const result = fixBrokenImportedBy(mockAnnotations, graph);

  assert.ok(result.fixed.length > 0);
  assert.ok(result.fixed.every(f => f.type === 'asymmetric_graph'));
  assert.ok(result.fixed.every(f => f.severity === 'error'));
});

test('fixBrokenImportedBy: maintains symmetry in complex graph', () => {
  const graph: GraphJson = {
    'src/a': {
      imports: ['src/b', 'src/c.ts'],
      imported_by: ['src/d.ts'],
    },
    'src/b': {
      imports: ['src/c.ts'],
      imported_by: [],
    },
    'src/c.ts': {
      imports: [],
      imported_by: [],
    },
    'src/d.ts': {
      imports: ['src/a'],
      imported_by: [],
    },
  };

  const result = fixBrokenImportedBy(mockAnnotations, graph);

  // Check symmetry
  assert.ok(result.graph['src/b'].imported_by.includes('src/a'));
  assert.ok(result.graph['src/c.ts'].imported_by.includes('src/a'));
  assert.ok(result.graph['src/c.ts'].imported_by.includes('src/b'));
  assert.ok(result.graph['src/a'].imported_by.includes('src/d.ts'));
});

test('fixBrokenImportedBy: returns unchanged graph when already symmetric', () => {
  const result = fixBrokenImportedBy(mockAnnotations, mockGraph);

  assert.strictEqual(result.fixCount, 0);
  assert.strictEqual(result.fixed.length, 0);
  assert.deepStrictEqual(result.graph, mockGraph);
});

test('fixBrokenImportedBy: handles empty graph', () => {
  const result = fixBrokenImportedBy([], {});

  assert.strictEqual(result.fixCount, 0);
  assert.strictEqual(result.fixed.length, 0);
});

test('fixBrokenImportedBy: sorts imported_by arrays', () => {
  const graph: GraphJson = {
    'src/a': {
      imports: ['src/target.ts'],
      imported_by: [],
    },
    'src/b': {
      imports: ['src/target.ts'],
      imported_by: [],
    },
    'src/target.ts': {
      imports: [],
      imported_by: [],
    },
  };

  const result = fixBrokenImportedBy(mockAnnotations, graph);

  // Should be sorted
  const importedBy = result.graph['src/target.ts'].imported_by;
  assert.deepStrictEqual(importedBy, [...importedBy].sort());
});

// Test: fixBrokenImports
test('fixBrokenImports: removes imports to non-existent files from annotations', () => {
  const annotations: FileAnnotation[] = [
    {
      path: 'src/a',
      language: 'TypeScript',
      size_bytes: 100,
      line_count: 10,
      purpose: 'Test file',
      exports: [],
      imports: ['src/nonexistent', 'src/b'],
    },
    {
      path: 'src/b',
      language: 'TypeScript',
      size_bytes: 100,
      line_count: 10,
      purpose: 'Valid file',
      exports: [],
      imports: [],
    },
  ];

  const graph: GraphJson = {
    'src/a': {
      imports: ['src/nonexistent', 'src/b'],
      imported_by: [],
    },
    'src/b': {
      imports: [],
      imported_by: ['src/a'],
    },
  };

  const result = fixBrokenImports(annotations, graph);

  assert.strictEqual(result.annotations[0].imports.length, 1);
  assert.strictEqual(result.annotations[0].imports[0], 'src/b');
  assert.ok(result.fixCount > 0);
});

test('fixBrokenImports: removes imports to non-existent files from graph', () => {
  const annotations: FileAnnotation[] = [
    {
      path: 'src/a',
      language: 'TypeScript',
      size_bytes: 100,
      line_count: 10,
      purpose: 'Test file',
      exports: [],
      imports: [],
    },
  ];

  const graph: GraphJson = {
    'src/a': {
      imports: ['src/nonexistent'],
      imported_by: ['src/nonexistent'],
    },
  };

  const result = fixBrokenImports(annotations, graph);

  assert.strictEqual(result.graph['src/a'].imports.length, 0);
  assert.strictEqual(result.graph['src/a'].imported_by.length, 0);
});

test('fixBrokenImports: reports all fixes', () => {
  const annotations: FileAnnotation[] = [
    {
      path: 'src/a',
      language: 'TypeScript',
      size_bytes: 100,
      line_count: 10,
      purpose: 'Test file',
      exports: [],
      imports: ['src/missing1.ts', 'src/missing2.ts'],
    },
  ];

  const graph: GraphJson = {
    'src/a': {
      imports: ['src/missing1.ts', 'src/missing2.ts'],
      imported_by: [],
    },
  };

  const result = fixBrokenImports(annotations, graph);

  assert.strictEqual(result.fixed.length, 2);
  assert.ok(result.fixed.every(f => f.type === 'missing_import'));
  assert.ok(result.fixed.every(f => f.severity === 'error'));
});

test('fixBrokenImports: preserves valid imports', () => {
  const result = fixBrokenImports(mockAnnotations, mockGraph);

  assert.strictEqual(result.annotations[0].imports[0], 'src/config/env');
  assert.strictEqual(result.fixCount, 0);
});

test('fixBrokenImports: handles empty inputs', () => {
  const result = fixBrokenImports([], {});

  assert.strictEqual(result.annotations.length, 0);
  assert.strictEqual(result.fixCount, 0);
});

// Test: runAutofix
test('runAutofix: applies all fixes in sequence', () => {
  const tempDir = createTempDir();

  try {
    // Create only one file
    safeWriteFile(join(tempDir, 'src', 'valid'), 'content');

    const annotations: FileAnnotation[] = [
      {
        path: 'src/deleted',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'Deleted file',
        exports: [],
        imports: ['src/nonexistent'],
      },
      {
        path: 'src/valid',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'Valid file',
        exports: [],
        imports: [],
      },
    ];

    const graph: GraphJson = {
      'src/deleted': {
        imports: ['src/nonexistent'],
        imported_by: [],
      },
      'src/valid': {
        imports: [],
        imported_by: ['src/deleted'],
      },
    };

    const result = runAutofix(annotations, graph, tempDir);

    // Should remove deleted file, fix broken imports, and fix imported_by
    assert.ok(result.fixCount > 0);
    assert.ok(result.fixed.length > 0);
    assert.strictEqual(result.annotations.length, 1);
    assert.strictEqual(result.annotations[0].path, 'src/valid');
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('runAutofix: aggregates all fix results', () => {
  const tempDir = createTempDir();

  try {
    // Create the files on disk
    safeWriteFile(join(tempDir, 'src', 'a'), 'content');
    safeWriteFile(join(tempDir, 'src', 'b'), 'content');

    const annotations: FileAnnotation[] = [
      {
        path: 'src/a',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'File A',
        exports: [],
        imports: ['src/b'],
      },
      {
        path: 'src/b',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'File B',
        exports: [],
        imports: [],
      },
    ];

    const graph: GraphJson = {
      'src/a': {
        imports: ['src/b'],
        imported_by: [],
      },
      'src/b': {
        imports: [],
        imported_by: [], // Missing 'src/a'
      },
    };

    const result = runAutofix(annotations, graph, tempDir);

    // Should fix the asymmetric imported_by
    assert.ok(result.fixCount > 0);
    assert.ok(result.fixed.some(f => f.type === 'asymmetric_graph'));
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('runAutofix: returns zero fixes for clean data', () => {
  const tempDir = createTempDir();

  try {
    safeWriteFile(join(tempDir, 'src', 'auth', 'jwt'), 'content');
    safeWriteFile(join(tempDir, 'src', 'config', 'env'), 'content');

    const result = runAutofix(mockAnnotations, mockGraph, tempDir);

    assert.strictEqual(result.fixCount, 0);
    assert.strictEqual(result.fixed.length, 0);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('runAutofix: handles empty inputs', () => {
  const tempDir = createTempDir();

  try {
    const result = runAutofix([], {}, tempDir);

    assert.strictEqual(result.annotations.length, 0);
    assert.strictEqual(result.fixCount, 0);
    assert.strictEqual(result.fixed.length, 0);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('runAutofix: maintains graph consistency after fixes', () => {
  const tempDir = createTempDir();

  try {
    safeWriteFile(join(tempDir, 'src', 'a'), 'content');
    safeWriteFile(join(tempDir, 'src', 'b'), 'content');

    const annotations: FileAnnotation[] = [
      {
        path: 'src/a',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'File A',
        exports: [],
        imports: ['src/b'],
      },
      {
        path: 'src/b',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'File B',
        exports: [],
        imports: ['src/a'],
      },
    ];

    const graph: GraphJson = {
      'src/a': {
        imports: ['src/b'],
        imported_by: [],
      },
      'src/b': {
        imports: ['src/a'],
        imported_by: [],
      },
    };

    const result = runAutofix(annotations, graph, tempDir);

    // After fixes, graph should be symmetric
    assert.ok(result.graph['src/a'].imported_by.includes('src/b'));
    assert.ok(result.graph['src/b'].imported_by.includes('src/a'));
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});
