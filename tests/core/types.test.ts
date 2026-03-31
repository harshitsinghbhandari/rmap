/**
 * Tests for core types
 */

import { test } from 'node:test';
import assert from 'node:assert';
import type {
  FileAnnotation,
  Module,
  MetaJson,
  GraphNode,
  GraphJson,
  TagsJson,
  StatsJson,
  ValidationSeverity,
  ValidationIssue,
  ValidationJson,
  DelegationTask,
  TaskDelegation,
  RawFileMetadata,
  Tag,
} from '../../src/core/types.js';

test('FileAnnotation type can be used', () => {
  const annotation: FileAnnotation = {
    path: 'src/test.ts',
    language: 'TypeScript',
    size_bytes: 1024,
    line_count: 50,
    purpose: 'Test file',
    tags: ['testing'],
    exports: ['testFunction'],
    imports: ['src/utils'],
  };

  assert.strictEqual(annotation.path, 'src/test.ts');
  assert.strictEqual(annotation.language, 'TypeScript');
  assert.ok(Array.isArray(annotation.tags));
  assert.ok(Array.isArray(annotation.exports));
  assert.ok(Array.isArray(annotation.imports));
});

test('Module type can be used', () => {
  const module: Module = {
    path: 'src/auth',
    description: 'Authentication module',
  };

  assert.strictEqual(module.path, 'src/auth');
  assert.strictEqual(typeof module.description, 'string');
});

test('MetaJson type can be used', () => {
  const meta: MetaJson = {
    schema_version: '1.0',
    map_version: 1,
    git_commit: 'abc123',
    created_at: '2026-01-01T00:00:00Z',
    last_updated: '2026-01-01T00:00:00Z',
    parent_version: null,
    update_type: 'full',
    files_changed: null,
    repo_name: 'test-repo',
    purpose: 'Test repository',
    stack: 'TypeScript',
    languages: ['TypeScript'],
    entrypoints: ['src/index.ts'],
    modules: [],
    config_files: ['tsconfig.json'],
    conventions: [],
  };

  assert.strictEqual(meta.schema_version, '1.0');
  assert.strictEqual(meta.map_version, 1);
  assert.strictEqual(meta.update_type, 'full');
});

test('GraphNode and GraphJson types can be used', () => {
  const node: GraphNode = {
    imports: ['src/utils.ts'],
    imported_by: ['src/main.ts'],
  };

  const graph: GraphJson = {
    'src/test.ts': node,
  };

  assert.ok(Array.isArray(node.imports));
  assert.ok(Array.isArray(node.imported_by));
  assert.ok('src/test.ts' in graph);
});

test('TagsJson type can be used', () => {
  const tags: TagsJson = {
    taxonomy_version: '1.0',
    aliases: {
      auth: ['authentication', 'authorization'],
    },
    index: {
      authentication: ['src/auth.ts'],
    },
  };

  assert.strictEqual(tags.taxonomy_version, '1.0');
  assert.ok('auth' in tags.aliases);
  assert.ok('authentication' in tags.index);
});

test('StatsJson type can be used', () => {
  const stats: StatsJson = {
    files_annotated: 100,
    build_time_minutes: 5,
    levels_completed: [0, 1, 2, 3, 4],
    agents_used: 3,
    validation_issues: 0,
    last_delta_files: null,
  };

  assert.strictEqual(stats.files_annotated, 100);
  assert.ok(Array.isArray(stats.levels_completed));
});

test('ValidationSeverity type works', () => {
  const error: ValidationSeverity = 'error';
  const warning: ValidationSeverity = 'warning';
  const info: ValidationSeverity = 'info';

  assert.ok(['error', 'warning', 'info'].includes(error));
  assert.ok(['error', 'warning', 'info'].includes(warning));
  assert.ok(['error', 'warning', 'info'].includes(info));
});

test('ValidationIssue and ValidationJson types can be used', () => {
  const issue: ValidationIssue = {
    severity: 'error',
    type: 'missing_file',
    file: 'src/missing.ts',
    message: 'File not found',
  };

  const validation: ValidationJson = {
    issues: [issue],
    auto_fixed: 0,
    requires_attention: 1,
  };

  assert.strictEqual(issue.severity, 'error');
  assert.ok(Array.isArray(validation.issues));
  assert.strictEqual(validation.requires_attention, 1);
});

test('DelegationTask and TaskDelegation types can be used', () => {
  const task: DelegationTask = {
    scope: 'src/auth/',
    agent_size: 'medium',
    estimated_files: 10,
  };

  const delegation: TaskDelegation = {
    tasks: [task],
    execution: 'parallel',
    estimated_total_minutes: 5,
  };

  assert.strictEqual(task.agent_size, 'medium');
  assert.strictEqual(delegation.execution, 'parallel');
  assert.ok(Array.isArray(delegation.tasks));
});

test('RawFileMetadata type can be used', () => {
  const metadata: RawFileMetadata = {
    name: 'test.ts',
    path: 'src/test.ts',
    extension: '.ts',
    size_bytes: 1024,
    line_count: 50,
    language: 'TypeScript',
  };

  assert.strictEqual(metadata.name, 'test.ts');
  assert.strictEqual(metadata.extension, '.ts');
});

test('Tag type works with TAG_TAXONOMY values', () => {
  const tag: Tag = 'authentication';
  assert.strictEqual(tag, 'authentication');
});
