/**
 * Tests for Level 4 - Consistency Checks
 *
 * Tests import existence validation, imported_by consistency,
 * deleted file detection, and graph-annotation matching
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import {
  checkImportsExist,
  checkGraphSymmetry,
  checkFilesExist,
  checkGraphMatchesAnnotations,
  runConsistencyChecks,
} from '../../../src/levels/level4/checks.js';
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
  {
    path: 'src/api/users',
    language: 'TypeScript',
    size_bytes: 3072,
    line_count: 150,
    purpose: 'User API endpoints',
    exports: ['createUser'],
    imports: ['src/auth/jwt', 'src/database/users'],
  },
  {
    path: 'src/database/users',
    language: 'TypeScript',
    size_bytes: 1536,
    line_count: 80,
    purpose: 'User database operations',
    exports: ['findUser'],
    imports: [],
  },
];

const mockGraph: GraphJson = {
  'src/auth/jwt': {
    imports: ['src/config/env'],
    imported_by: ['src/api/users'],
  },
  'src/config/env': {
    imports: [],
    imported_by: ['src/auth/jwt'],
  },
  'src/api/users': {
    imports: ['src/auth/jwt', 'src/database/users'],
    imported_by: [],
  },
  'src/database/users': {
    imports: [],
    imported_by: ['src/api/users'],
  },
};

// Test: checkImportsExist
test('checkImportsExist: returns no issues when all imports exist', () => {
  const issues = checkImportsExist(mockAnnotations, '.');

  assert.strictEqual(issues.length, 0);
});

test('checkImportsExist: detects missing imports', () => {
  const annotations: FileAnnotation[] = [
    ...mockAnnotations,
    {
      path: 'src/test.ts',
      language: 'TypeScript',
      size_bytes: 100,
      line_count: 10,
      purpose: 'Test file',
      exports: [],
      imports: ['src/nonexistent.ts'],
    },
  ];

  const issues = checkImportsExist(annotations, '.');

  assert.strictEqual(issues.length, 1);
  assert.strictEqual(issues[0].severity, 'error');
  assert.strictEqual(issues[0].type, 'missing_import');
  assert.strictEqual(issues[0].file, 'src/test.ts');
  assert.ok(issues[0].message.includes('src/nonexistent.ts'));
});

test('checkImportsExist: detects multiple missing imports', () => {
  const annotations: FileAnnotation[] = [
    {
      path: 'src/test.ts',
      language: 'TypeScript',
      size_bytes: 100,
      line_count: 10,
      purpose: 'Test file',
      exports: [],
      imports: ['src/missing1.ts', 'src/missing2.ts'],
    },
  ];

  const issues = checkImportsExist(annotations, '.');

  assert.strictEqual(issues.length, 2);
  assert.ok(issues.every(i => i.severity === 'error'));
  assert.ok(issues.every(i => i.type === 'missing_import'));
});

// Test: checkGraphSymmetry
test('checkGraphSymmetry: returns no issues for symmetric graph', () => {
  const issues = checkGraphSymmetry(mockGraph, mockAnnotations);

  assert.strictEqual(issues.length, 0);
});

test('checkGraphSymmetry: detects asymmetric imports relationship', () => {
  const brokenGraph: GraphJson = {
    'src/a.ts': {
      imports: ['src/b.ts'],
      imported_by: [],
    },
    'src/b.ts': {
      imports: [],
      imported_by: [], // Missing 'src/a.ts'
    },
  };

  const issues = checkGraphSymmetry(brokenGraph, mockAnnotations);

  assert.ok(issues.length > 0);
  assert.ok(issues.some(i => i.type === 'asymmetric_graph'));
  assert.ok(issues.some(i => i.severity === 'error'));
});

test('checkGraphSymmetry: detects asymmetric imported_by relationship', () => {
  const brokenGraph: GraphJson = {
    'src/a.ts': {
      imports: [],
      imported_by: ['src/b.ts'],
    },
    'src/b.ts': {
      imports: [], // Missing 'src/a.ts'
      imported_by: [],
    },
  };

  const issues = checkGraphSymmetry(brokenGraph, mockAnnotations);

  assert.ok(issues.length > 0);
  assert.ok(issues.some(i => i.type === 'asymmetric_graph'));
});

test('checkGraphSymmetry: detects broken graph reference in imports', () => {
  const brokenGraph: GraphJson = {
    'src/a.ts': {
      imports: ['src/nonexistent.ts'],
      imported_by: [],
    },
  };

  const issues = checkGraphSymmetry(brokenGraph, mockAnnotations);

  assert.ok(issues.length > 0);
  assert.ok(issues.some(i => i.type === 'broken_graph_reference'));
  assert.ok(issues.some(i => i.message.includes('src/nonexistent.ts')));
});

test('checkGraphSymmetry: detects broken graph reference in imported_by', () => {
  const brokenGraph: GraphJson = {
    'src/a.ts': {
      imports: [],
      imported_by: ['src/nonexistent.ts'],
    },
  };

  const issues = checkGraphSymmetry(brokenGraph, mockAnnotations);

  assert.ok(issues.length > 0);
  assert.ok(issues.some(i => i.type === 'broken_graph_reference'));
});

// Test: checkFilesExist
test('checkFilesExist: returns no issues when all files exist', () => {
  const tempDir = createTempDir();

  try {
    // Create test files
    writeFileSync(join(tempDir, 'test.ts'), 'content');

    const annotations: FileAnnotation[] = [
      {
        path: 'test.ts',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'Test file',
        exports: [],
        imports: [],
      },
    ];

    const issues = checkFilesExist(annotations, tempDir);

    assert.strictEqual(issues.length, 0);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('checkFilesExist: detects deleted files', () => {
  const tempDir = createTempDir();

  try {
    const annotations: FileAnnotation[] = [
      {
        path: 'deleted.ts',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'Deleted file',
        exports: [],
        imports: [],
      },
    ];

    const issues = checkFilesExist(annotations, tempDir);

    assert.strictEqual(issues.length, 1);
    assert.strictEqual(issues[0].severity, 'error');
    assert.strictEqual(issues[0].type, 'deleted_file');
    assert.strictEqual(issues[0].file, 'deleted.ts');
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('checkFilesExist: detects multiple deleted files', () => {
  const tempDir = createTempDir();

  try {
    const annotations: FileAnnotation[] = [
      {
        path: 'deleted1.ts',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'Deleted file 1',
        exports: [],
        imports: [],
      },
      {
        path: 'deleted2.ts',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'Deleted file 2',
        exports: [],
        imports: [],
      },
    ];

    const issues = checkFilesExist(annotations, tempDir);

    assert.strictEqual(issues.length, 2);
    assert.ok(issues.every(i => i.type === 'deleted_file'));
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

// Test: checkGraphMatchesAnnotations
test('checkGraphMatchesAnnotations: returns no issues when graph matches annotations', () => {
  const issues = checkGraphMatchesAnnotations(mockGraph, mockAnnotations);

  assert.strictEqual(issues.length, 0);
});

test('checkGraphMatchesAnnotations: detects file in graph but not in annotations', () => {
  const graph: GraphJson = {
    ...mockGraph,
    'src/extra.ts': {
      imports: [],
      imported_by: [],
    },
  };

  const issues = checkGraphMatchesAnnotations(graph, mockAnnotations);

  assert.ok(issues.length > 0);
  assert.ok(issues.some(i => i.type === 'graph_annotation_mismatch'));
  assert.ok(issues.some(i => i.file === 'src/extra.ts'));
  assert.ok(issues.some(i => i.message.includes('exists in graph but not in annotations')));
});

test('checkGraphMatchesAnnotations: detects file in annotations but not in graph', () => {
  const annotations: FileAnnotation[] = [
    ...mockAnnotations,
    {
      path: 'src/extra.ts',
      language: 'TypeScript',
      size_bytes: 100,
      line_count: 10,
      purpose: 'Extra file',
      exports: [],
      imports: [],
    },
  ];

  const issues = checkGraphMatchesAnnotations(mockGraph, annotations);

  assert.ok(issues.length > 0);
  assert.ok(issues.some(i => i.severity === 'error'));
  assert.ok(issues.some(i => i.file === 'src/extra.ts'));
  assert.ok(issues.some(i => i.message.includes('exists in annotations but not in graph')));
});

test('checkGraphMatchesAnnotations: detects import mismatch between graph and annotations', () => {
  const graph: GraphJson = {
    'src/test.ts': {
      imports: ['src/a.ts', 'src/b.ts'],
      imported_by: [],
    },
  };

  const annotations: FileAnnotation[] = [
    {
      path: 'src/test.ts',
      language: 'TypeScript',
      size_bytes: 100,
      line_count: 10,
      purpose: 'Test file',
      exports: [],
      imports: ['src/a.ts'], // Missing 'src/b.ts'
    },
  ];

  const issues = checkGraphMatchesAnnotations(graph, annotations);

  assert.ok(issues.length > 0);
  assert.ok(issues.some(i => i.type === 'graph_annotation_mismatch'));
  assert.ok(issues.some(i => i.severity === 'warning'));
});

// Test: runConsistencyChecks
test('runConsistencyChecks: returns no issues for consistent data', () => {
  const tempDir = createTempDir();

  try {
    // Create all test files
    safeWriteFile(join(tempDir, 'src', 'auth', 'jwt'), 'content');
    safeWriteFile(join(tempDir, 'src', 'config', 'env'), 'content');
    safeWriteFile(join(tempDir, 'src', 'api', 'users'), 'content');
    safeWriteFile(join(tempDir, 'src', 'database', 'users'), 'content');

    const issues = runConsistencyChecks(mockAnnotations, mockGraph, tempDir);

    assert.strictEqual(issues.length, 0);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('runConsistencyChecks: aggregates all check results', () => {
  const tempDir = createTempDir();

  try {
    const brokenAnnotations: FileAnnotation[] = [
      {
        path: 'src/deleted.ts',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'Deleted file',
        exports: [],
        imports: ['src/nonexistent.ts'],
      },
    ];

    const brokenGraph: GraphJson = {
      'src/deleted.ts': {
        imports: ['src/nonexistent.ts'],
        imported_by: [],
      },
      'src/orphan.ts': {
        imports: [],
        imported_by: [],
      },
    };

    const issues = runConsistencyChecks(brokenAnnotations, brokenGraph, tempDir);

    // Should have issues from multiple checks
    assert.ok(issues.length > 0);
    assert.ok(issues.some(i => i.type === 'missing_import'));
    assert.ok(issues.some(i => i.type === 'deleted_file'));
    assert.ok(issues.some(i => i.type === 'graph_annotation_mismatch'));
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('runConsistencyChecks: returns empty array for empty inputs', () => {
  const tempDir = createTempDir();

  try {
    const issues = runConsistencyChecks([], {}, tempDir);

    assert.strictEqual(issues.length, 0);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});
