/**
 * Tests for Level 4 - Consistency Validator
 *
 * Tests full validation pipeline, ValidationJson output structure,
 * severity levels, and integration with checks and autofix
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import {
  validateMap,
  getValidationSummary,
  groupIssuesByType,
  groupIssuesByFile,
} from '../../../src/levels/level4/validator.js';
import type { FileAnnotation, GraphJson, MetaJson } from '../../../src/core/types.js';

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
  config_files: ['package.json'],
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
    imports: [],
  },
];

const mockGraph: GraphJson = {
  'src/index': {
    imports: ['src/app'],
    imported_by: [],
  },
  'src/app': {
    imports: [],
    imported_by: ['src/index'],
  },
};

// Test: validateMap with clean data
test('validateMap: returns no issues for clean data', async () => {
  const tempDir = createTempDir();

  try {
    safeWriteFile(join(tempDir, 'src', 'index'), 'content');
    safeWriteFile(join(tempDir, 'src', 'app'), 'content');

    const result = await validateMap(mockAnnotations, mockGraph, mockMeta, {
      repoRoot: tempDir,
    });

    assert.strictEqual(result.validation.issues.length, 0);
    assert.strictEqual(result.validation.auto_fixed, 0);
    assert.strictEqual(result.validation.requires_attention, 0);
    assert.strictEqual(result.wasFixed, false);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

// Test: validateMap with autofix
test('validateMap: applies autofix by default', async () => {
  const tempDir = createTempDir();

  try {
    // Only create one file (other is deleted)
    safeWriteFile(join(tempDir, 'src', 'app'), 'content');

    const result = await validateMap(mockAnnotations, mockGraph, mockMeta, {
      repoRoot: tempDir,
    });

    assert.ok(result.validation.auto_fixed > 0);
    assert.ok(result.wasFixed);
    assert.ok(result.validation.issues.some(i => i.type === 'deleted_file'));
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('validateMap: skips autofix when disabled', async () => {
  const tempDir = createTempDir();

  try {
    safeWriteFile(join(tempDir, 'src', 'app'), 'content');

    const result = await validateMap(mockAnnotations, mockGraph, mockMeta, {
      repoRoot: tempDir,
      autofix: false,
    });

    assert.strictEqual(result.validation.auto_fixed, 0);
    assert.strictEqual(result.wasFixed, false);
    // But should still detect the issue
    assert.ok(result.validation.issues.some(i => i.type === 'deleted_file'));
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

// Test: ValidationJson structure
test('validateMap: produces valid ValidationJson structure', async () => {
  const tempDir = createTempDir();

  try {
    safeWriteFile(join(tempDir, 'src', 'index'), 'content');
    safeWriteFile(join(tempDir, 'src', 'app'), 'content');

    const result = await validateMap(mockAnnotations, mockGraph, mockMeta, {
      repoRoot: tempDir,
    });

    // Check structure
    assert.ok('issues' in result.validation);
    assert.ok('auto_fixed' in result.validation);
    assert.ok('requires_attention' in result.validation);
    assert.ok(Array.isArray(result.validation.issues));
    assert.strictEqual(typeof result.validation.auto_fixed, 'number');
    assert.strictEqual(typeof result.validation.requires_attention, 'number');
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('validateMap: includes all issue fields', async () => {
  const tempDir = createTempDir();

  try {
    const annotations: FileAnnotation[] = [
      {
        path: 'src/test',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'Test',
        exports: [],
        imports: ['src/missing'],
      },
    ];

    const graph: GraphJson = {
      'src/test': {
        imports: ['src/missing'],
        imported_by: [],
      },
    };

    const result = await validateMap(annotations, graph, mockMeta, {
      repoRoot: tempDir,
      autofix: false,
    });

    const issue = result.validation.issues[0];
    assert.ok('severity' in issue);
    assert.ok('type' in issue);
    assert.ok('file' in issue);
    assert.ok('message' in issue);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

// Test: Severity levels
test('validateMap: correctly assigns error severity', async () => {
  const tempDir = createTempDir();

  try {
    const annotations: FileAnnotation[] = [
      {
        path: 'src/broken',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'Broken file',
        exports: [],
        imports: ['src/missing'],
      },
    ];

    const graph: GraphJson = {
      'src/broken': {
        imports: ['src/missing'],
        imported_by: [],
      },
    };

    const result = await validateMap(annotations, graph, mockMeta, {
      repoRoot: tempDir,
      autofix: false,
    });

    const errors = result.validation.issues.filter(i => i.severity === 'error');
    assert.ok(errors.length > 0);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('validateMap: correctly assigns warning severity', async () => {
  const tempDir = createTempDir();

  try {
    safeWriteFile(join(tempDir, 'src', 'orphan'), 'content');

    const annotations: FileAnnotation[] = [
      {
        path: 'src/orphan',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'Orphan file',
        exports: ['fn'],
        imports: [],
      },
    ];

    const graph: GraphJson = {
      'src/orphan': {
        imports: [],
        imported_by: [],
      },
    };

    const result = await validateMap(annotations, graph, mockMeta, {
      repoRoot: tempDir,
    });

    const warnings = result.validation.issues.filter(i => i.severity === 'warning');
    assert.ok(warnings.length > 0);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('validateMap: filters info-level issues by default', async () => {
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
        imported_by: ['src/b'],
      },
      'src/b': {
        imports: ['src/a'],
        imported_by: ['src/a'],
      },
    };

    const result = await validateMap(annotations, graph, mockMeta, {
      repoRoot: tempDir,
      includeInfo: false,
    });

    const infoIssues = result.validation.issues.filter(i => i.severity === 'info');
    assert.strictEqual(infoIssues.length, 0);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('validateMap: includes info-level issues when requested', async () => {
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
        imported_by: ['src/b'],
      },
      'src/b': {
        imports: ['src/a'],
        imported_by: ['src/a'],
      },
    };

    const result = await validateMap(annotations, graph, mockMeta, {
      repoRoot: tempDir,
      includeInfo: true,
    });

    // Should detect circular dependency (info level)
    const infoIssues = result.validation.issues.filter(i => i.severity === 'info');
    assert.ok(infoIssues.some(i => i.type === 'circular_dependency'));
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

// Test: requires_attention calculation
test('validateMap: calculates requires_attention correctly', async () => {
  const tempDir = createTempDir();

  try {
    const annotations: FileAnnotation[] = [
      {
        path: 'src/broken',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'Broken',
        exports: [],
        imports: ['src/missing'],
      },
      {
        path: 'src/orphan',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'Orphan',
        exports: ['fn'],
        imports: [],
      },
    ];

    safeWriteFile(join(tempDir, 'src', 'orphan'), 'content');

    const graph: GraphJson = {
      'src/broken': {
        imports: ['src/missing'],
        imported_by: [],
      },
      'src/orphan': {
        imports: [],
        imported_by: [],
      },
    };

    const result = await validateMap(annotations, graph, mockMeta, {
      repoRoot: tempDir,
      autofix: false,
    });

    const errorCount = result.validation.issues.filter(i => i.severity === 'error').length;
    const warningCount = result.validation.issues.filter(i => i.severity === 'warning').length;

    assert.strictEqual(result.validation.requires_attention, errorCount + warningCount);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

// Test: getValidationSummary
test('getValidationSummary: provides correct summary statistics', () => {
  const validation = {
    issues: [
      { severity: 'error' as const, type: 'test', file: 'a.ts', message: 'Error 1' },
      { severity: 'error' as const, type: 'test', file: 'b.ts', message: 'Error 2' },
      { severity: 'warning' as const, type: 'test', file: 'c.ts', message: 'Warning 1' },
      { severity: 'info' as const, type: 'test', file: 'd.ts', message: 'Info 1' },
    ],
    auto_fixed: 5,
    requires_attention: 3,
  };

  const summary = getValidationSummary(validation);

  assert.strictEqual(summary.errors, 2);
  assert.strictEqual(summary.warnings, 1);
  assert.strictEqual(summary.info, 1);
  assert.strictEqual(summary.total, 4);
  assert.strictEqual(summary.autoFixed, 5);
  assert.strictEqual(summary.requiresAttention, 3);
});

test('getValidationSummary: handles empty validation', () => {
  const validation = {
    issues: [],
    auto_fixed: 0,
    requires_attention: 0,
  };

  const summary = getValidationSummary(validation);

  assert.strictEqual(summary.errors, 0);
  assert.strictEqual(summary.warnings, 0);
  assert.strictEqual(summary.info, 0);
  assert.strictEqual(summary.total, 0);
});

// Test: groupIssuesByType
test('groupIssuesByType: groups issues correctly', () => {
  const validation = {
    issues: [
      { severity: 'error' as const, type: 'missing_import', file: 'a.ts', message: 'Issue 1' },
      { severity: 'error' as const, type: 'missing_import', file: 'b.ts', message: 'Issue 2' },
      { severity: 'warning' as const, type: 'orphan_file', file: 'c.ts', message: 'Issue 3' },
    ],
    auto_fixed: 0,
    requires_attention: 3,
  };

  const grouped = groupIssuesByType(validation);

  assert.strictEqual(grouped.size, 2);
  assert.strictEqual(grouped.get('missing_import')?.length, 2);
  assert.strictEqual(grouped.get('orphan_file')?.length, 1);
});

test('groupIssuesByType: handles empty validation', () => {
  const validation = {
    issues: [],
    auto_fixed: 0,
    requires_attention: 0,
  };

  const grouped = groupIssuesByType(validation);

  assert.strictEqual(grouped.size, 0);
});

// Test: groupIssuesByFile
test('groupIssuesByFile: groups issues by file', () => {
  const validation = {
    issues: [
      { severity: 'error' as const, type: 'missing_import', file: 'a.ts', message: 'Issue 1' },
      { severity: 'warning' as const, type: 'orphan_file', file: 'a.ts', message: 'Issue 2' },
      { severity: 'error' as const, type: 'deleted_file', file: 'b.ts', message: 'Issue 3' },
    ],
    auto_fixed: 0,
    requires_attention: 3,
  };

  const grouped = groupIssuesByFile(validation);

  assert.strictEqual(grouped.size, 2);
  assert.strictEqual(grouped.get('a.ts')?.length, 2);
  assert.strictEqual(grouped.get('b.ts')?.length, 1);
});

test('groupIssuesByFile: handles empty validation', () => {
  const validation = {
    issues: [],
    auto_fixed: 0,
    requires_attention: 0,
  };

  const grouped = groupIssuesByFile(validation);

  assert.strictEqual(grouped.size, 0);
});

// Test: Integration - full validation pipeline
test('validateMap: runs full pipeline with all checks', async () => {
  const tempDir = createTempDir();

  try {
    safeWriteFile(join(tempDir, 'src', 'index'), 'content');
    safeWriteFile(join(tempDir, 'src', 'orphan'), 'content');

    const annotations: FileAnnotation[] = [
      {
        path: 'src/index',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'Entry',
        exports: ['main'],
        imports: ['src/missing'],
      },
      {
        path: 'src/orphan',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'Orphan',
        exports: ['fn'],
        imports: [],
      },
      {
        path: 'src/deleted',
        language: 'TypeScript',
        size_bytes: 100,
        line_count: 10,
        purpose: 'Deleted',
        exports: [],
        imports: [],
      },
    ];

    const graph: GraphJson = {
      'src/index': {
        imports: ['src/missing'],
        imported_by: [],
      },
      'src/orphan': {
        imports: [],
        imported_by: [],
      },
      'src/deleted': {
        imports: [],
        imported_by: [],
      },
    };

    const result = await validateMap(annotations, graph, mockMeta, {
      repoRoot: tempDir,
    });

    // Should detect multiple issue types
    const issueTypes = new Set(result.validation.issues.map(i => i.type));
    assert.ok(issueTypes.has('deleted_file')); // From deleted file
    assert.ok(issueTypes.has('orphan_file')); // From orphan
    assert.ok(result.validation.auto_fixed > 0); // Should fix deleted file
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});

test('validateMap: handles complex scenarios', async () => {
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
        imports: ['src/b', 'src/missing'],
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
        imports: ['src/b', 'src/missing'],
        imported_by: [],
      },
      'src/b': {
        imports: ['src/a'],
        imported_by: [],
      },
    };

    const result = await validateMap(annotations, graph, mockMeta, {
      repoRoot: tempDir,
      includeInfo: true,
    });

    // Should detect:
    // - Missing import
    // - Asymmetric graph (after fixing broken imports)
    // - Circular dependency (info)
    assert.ok(result.validation.issues.length > 0);
    assert.ok(result.validation.auto_fixed > 0);
  } finally {
    rmSync(tempDir, { recursive: true });
  }
});
