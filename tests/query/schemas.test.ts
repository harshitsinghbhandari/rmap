/**
 * Tests for query/schemas.ts
 *
 * Tests Zod validation schemas for .repo_map/*.json files.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  MetaJsonSchema,
  GraphJsonSchema,
  TagsJsonSchema,
  AnnotationsJsonSchema,
} from '../../src/query/schemas.js';
import type {
  ValidatedMetaJson,
  ValidatedGraphJson,
  ValidatedTagsJson,
  ValidatedAnnotationsJson,
} from '../../src/query/schemas.js';
import { SCHEMA_VERSION, TAG_TAXONOMY } from '../../src/core/constants.js';

// ============================================================================
// MetaJsonSchema Tests
// ============================================================================

test('MetaJsonSchema: validates correct meta.json', () => {
  const validMeta = {
    schema_version: SCHEMA_VERSION,
    map_version: 1,
    git_commit: 'abc123def456',
    created_at: '2024-01-01T00:00:00.000Z',
    last_updated: '2024-01-01T00:00:00.000Z',
    parent_version: null,
    update_type: 'full',
    files_changed: null,
    repo_name: 'test-repo',
    purpose: 'A test repository',
    stack: 'Node.js',
    languages: ['TypeScript'],
    entrypoints: ['src/index.ts'],
    modules: [{ path: 'src/', description: 'Source code' }],
    config_files: ['package.json'],
    conventions: ['ESM modules'],
  };

  const result = MetaJsonSchema.parse(validMeta);
  assert.strictEqual(result.schema_version, SCHEMA_VERSION);
  assert.strictEqual(result.map_version, 1);
});

test('MetaJsonSchema: validates delta update meta', () => {
  const deltaMeta = {
    schema_version: SCHEMA_VERSION,
    map_version: 2,
    git_commit: 'def456789abc',
    created_at: '2024-01-01T00:00:00.000Z',
    last_updated: '2024-01-02T00:00:00.000Z',
    parent_version: 1,
    update_type: 'delta',
    files_changed: 5,
    repo_name: 'test-repo',
    purpose: 'A test repository',
    stack: 'Node.js',
    languages: ['TypeScript'],
    entrypoints: [],
    modules: [],
    config_files: [],
    conventions: [],
  };

  const result = MetaJsonSchema.parse(deltaMeta);
  assert.strictEqual(result.update_type, 'delta');
  assert.strictEqual(result.files_changed, 5);
  assert.strictEqual(result.parent_version, 1);
});

test('MetaJsonSchema: rejects invalid update_type', () => {
  const invalidMeta = {
    schema_version: SCHEMA_VERSION,
    map_version: 1,
    git_commit: 'abc123',
    created_at: '2024-01-01T00:00:00.000Z',
    last_updated: '2024-01-01T00:00:00.000Z',
    parent_version: null,
    update_type: 'partial', // Invalid
    files_changed: null,
    repo_name: 'test',
    purpose: 'Test',
    stack: 'Node.js',
    languages: ['TypeScript'],
    entrypoints: [],
    modules: [],
    config_files: [],
    conventions: [],
  };

  assert.throws(
    () => MetaJsonSchema.parse(invalidMeta),
    /Invalid option|Invalid enum/
  );
});

test('MetaJsonSchema: rejects negative map_version', () => {
  const invalidMeta = {
    schema_version: SCHEMA_VERSION,
    map_version: -1, // Invalid
    git_commit: 'abc123',
    created_at: '2024-01-01T00:00:00.000Z',
    last_updated: '2024-01-01T00:00:00.000Z',
    parent_version: null,
    update_type: 'full',
    files_changed: null,
    repo_name: 'test',
    purpose: 'Test',
    stack: 'Node.js',
    languages: ['TypeScript'],
    entrypoints: [],
    modules: [],
    config_files: [],
    conventions: [],
  };

  assert.throws(
    () => MetaJsonSchema.parse(invalidMeta),
    /Number must be|too_small/
  );
});

test('MetaJsonSchema: rejects invalid datetime format', () => {
  const invalidMeta = {
    schema_version: SCHEMA_VERSION,
    map_version: 1,
    git_commit: 'abc123',
    created_at: 'not-a-date', // Invalid
    last_updated: '2024-01-01T00:00:00.000Z',
    parent_version: null,
    update_type: 'full',
    files_changed: null,
    repo_name: 'test',
    purpose: 'Test',
    stack: 'Node.js',
    languages: ['TypeScript'],
    entrypoints: [],
    modules: [],
    config_files: [],
    conventions: [],
  };

  assert.throws(
    () => MetaJsonSchema.parse(invalidMeta),
    Error
  );
});

test('MetaJsonSchema: rejects missing required fields', () => {
  const incompleteMeta = {
    schema_version: SCHEMA_VERSION,
    map_version: 1,
    // Missing most required fields
  };

  assert.throws(
    () => MetaJsonSchema.parse(incompleteMeta)
  );
});

// ============================================================================
// GraphJsonSchema Tests
// ============================================================================

test('GraphJsonSchema: validates correct graph.json', () => {
  const validGraph = {
    'src/index.ts': {
      imports: ['src/utils.ts', 'src/config.ts'],
      imported_by: [],
    },
    'src/utils.ts': {
      imports: [],
      imported_by: ['src/index.ts'],
    },
    'src/config.ts': {
      imports: [],
      imported_by: ['src/index.ts'],
    },
  };

  const result = GraphJsonSchema.parse(validGraph);
  assert.deepStrictEqual(result['src/index.ts'].imports, ['src/utils.ts', 'src/config.ts']);
  assert.deepStrictEqual(result['src/utils.ts'].imported_by, ['src/index.ts']);
});

test('GraphJsonSchema: validates empty graph', () => {
  const emptyGraph = {};

  const result = GraphJsonSchema.parse(emptyGraph);
  assert.deepStrictEqual(result, {});
});

test('GraphJsonSchema: validates node with empty arrays', () => {
  const graph = {
    'src/standalone.ts': {
      imports: [],
      imported_by: [],
    },
  };

  const result = GraphJsonSchema.parse(graph);
  assert.deepStrictEqual(result['src/standalone.ts'].imports, []);
  assert.deepStrictEqual(result['src/standalone.ts'].imported_by, []);
});

test('GraphJsonSchema: rejects missing imports field', () => {
  const invalidGraph = {
    'src/test.ts': {
      // imports missing
      imported_by: [],
    },
  };

  assert.throws(
    () => GraphJsonSchema.parse(invalidGraph)
  );
});

test('GraphJsonSchema: rejects missing imported_by field', () => {
  const invalidGraph = {
    'src/test.ts': {
      imports: [],
      // imported_by missing
    },
  };

  assert.throws(
    () => GraphJsonSchema.parse(invalidGraph)
  );
});

test('GraphJsonSchema: rejects non-string imports', () => {
  const invalidGraph = {
    'src/test.ts': {
      imports: [123], // Should be strings
      imported_by: [],
    },
  };

  assert.throws(
    () => GraphJsonSchema.parse(invalidGraph)
  );
});

// ============================================================================
// TagsJsonSchema Tests
// ============================================================================

test('TagsJsonSchema: validates correct tags.json', () => {
  const validTags = {
    taxonomy_version: '1.0',
    aliases: {
      auth: ['authentication', 'authorization'],
      db: ['database'],
    },
    index: {
      authentication: ['src/auth/login.ts', 'src/auth/jwt.ts'],
      database: ['src/db/connection.ts'],
    },
  };

  const result = TagsJsonSchema.parse(validTags);
  assert.strictEqual(result.taxonomy_version, '1.0');
  assert.ok(Array.isArray(result.aliases.auth));
});

test('TagsJsonSchema: validates empty index', () => {
  const validTags = {
    taxonomy_version: '1.0',
    aliases: {},
    index: {},
  };

  const result = TagsJsonSchema.parse(validTags);
  assert.deepStrictEqual(result.index, {});
});

test('TagsJsonSchema: rejects missing taxonomy_version', () => {
  const invalidTags = {
    // taxonomy_version missing
    aliases: {},
    index: {},
  };

  assert.throws(
    () => TagsJsonSchema.parse(invalidTags)
  );
});

// ============================================================================
// AnnotationsJsonSchema Tests
// ============================================================================

test('AnnotationsJsonSchema: validates correct annotations', () => {
  // Use a valid tag from the taxonomy
  const validTag = TAG_TAXONOMY[0];

  const validAnnotations = [
    {
      path: 'src/auth/login.ts',
      language: 'TypeScript',
      size_bytes: 2048,
      line_count: 100,
      purpose: 'Handles user login flow',
      tags: [validTag],
      exports: ['login', 'LoginResult'],
      imports: ['src/auth/jwt.ts'],
    },
  ];

  const result = AnnotationsJsonSchema.parse(validAnnotations);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].path, 'src/auth/login.ts');
});

test('AnnotationsJsonSchema: validates empty annotations array', () => {
  const result = AnnotationsJsonSchema.parse([]);
  assert.deepStrictEqual(result, []);
});

test('AnnotationsJsonSchema: validates multiple annotations', () => {
  const validTag = TAG_TAXONOMY[0];

  const annotations = [
    {
      path: 'src/a.ts',
      language: 'TypeScript',
      size_bytes: 1000,
      line_count: 50,
      purpose: 'File A',
      tags: [validTag],
      exports: [],
      imports: [],
    },
    {
      path: 'src/b.ts',
      language: 'TypeScript',
      size_bytes: 2000,
      line_count: 100,
      purpose: 'File B',
      tags: [validTag],
      exports: [],
      imports: [],
    },
  ];

  const result = AnnotationsJsonSchema.parse(annotations);
  assert.strictEqual(result.length, 2);
});

test('AnnotationsJsonSchema: rejects negative size_bytes', () => {
  const validTag = TAG_TAXONOMY[0];

  const invalidAnnotations = [
    {
      path: 'src/test.ts',
      language: 'TypeScript',
      size_bytes: -100, // Invalid
      line_count: 50,
      purpose: 'Test file',
      tags: [validTag],
      exports: [],
      imports: [],
    },
  ];

  assert.throws(
    () => AnnotationsJsonSchema.parse(invalidAnnotations),
    /Number must be|too_small/
  );
});

test('AnnotationsJsonSchema: rejects negative line_count', () => {
  const validTag = TAG_TAXONOMY[0];

  const invalidAnnotations = [
    {
      path: 'src/test.ts',
      language: 'TypeScript',
      size_bytes: 1000,
      line_count: -10, // Invalid
      purpose: 'Test file',
      tags: [validTag],
      exports: [],
      imports: [],
    },
  ];

  assert.throws(
    () => AnnotationsJsonSchema.parse(invalidAnnotations),
    /Number must be|too_small/
  );
});

test('AnnotationsJsonSchema: rejects invalid tag not in taxonomy', () => {
  const invalidAnnotations = [
    {
      path: 'src/test.ts',
      language: 'TypeScript',
      size_bytes: 1000,
      line_count: 50,
      purpose: 'Test file',
      tags: ['not_a_valid_tag'], // Invalid tag
      exports: [],
      imports: [],
    },
  ];

  assert.throws(
    () => AnnotationsJsonSchema.parse(invalidAnnotations),
    /Invalid option|Invalid enum/
  );
});

test('AnnotationsJsonSchema: rejects non-array at root', () => {
  const invalidAnnotations = {
    path: 'src/test.ts',
    language: 'TypeScript',
  };

  assert.throws(
    () => AnnotationsJsonSchema.parse(invalidAnnotations)
  );
});

test('AnnotationsJsonSchema: rejects missing required fields', () => {
  const invalidAnnotations = [
    {
      path: 'src/test.ts',
      // Missing most required fields
    },
  ];

  assert.throws(
    () => AnnotationsJsonSchema.parse(invalidAnnotations)
  );
});

// ============================================================================
// Type Inference Tests
// ============================================================================

test('ValidatedMetaJson type matches schema output', () => {
  const validMeta = {
    schema_version: SCHEMA_VERSION,
    map_version: 1,
    git_commit: 'abc123',
    created_at: '2024-01-01T00:00:00.000Z',
    last_updated: '2024-01-01T00:00:00.000Z',
    parent_version: null,
    update_type: 'full' as const,
    files_changed: null,
    repo_name: 'test',
    purpose: 'Test',
    stack: 'Node.js',
    languages: ['TypeScript'],
    entrypoints: [],
    modules: [],
    config_files: [],
    conventions: [],
  };

  const result: ValidatedMetaJson = MetaJsonSchema.parse(validMeta);
  assert.strictEqual(typeof result.map_version, 'number');
  assert.ok(Array.isArray(result.languages));
});

test('ValidatedGraphJson type matches schema output', () => {
  const graph: ValidatedGraphJson = GraphJsonSchema.parse({
    'file.ts': { imports: [], imported_by: [] },
  });

  assert.ok('file.ts' in graph);
  assert.ok(Array.isArray(graph['file.ts'].imports));
});

test('ValidatedTagsJson type matches schema output', () => {
  const tags: ValidatedTagsJson = TagsJsonSchema.parse({
    taxonomy_version: '1.0',
    aliases: {},
    index: {},
  });

  assert.strictEqual(typeof tags.taxonomy_version, 'string');
  assert.strictEqual(typeof tags.aliases, 'object');
});

test('ValidatedAnnotationsJson type matches schema output', () => {
  const annotations: ValidatedAnnotationsJson = AnnotationsJsonSchema.parse([]);

  assert.ok(Array.isArray(annotations));
});

// ============================================================================
// Edge Cases
// ============================================================================

test('MetaJsonSchema: handles long arrays', () => {
  const manyLanguages = Array(50).fill('Language').map((l, i) => `${l}${i}`);
  const manyModules = Array(100).fill(0).map((_, i) => ({
    path: `src/module${i}/`,
    description: `Module ${i}`,
  }));

  const validMeta = {
    schema_version: SCHEMA_VERSION,
    map_version: 1,
    git_commit: 'abc123',
    created_at: '2024-01-01T00:00:00.000Z',
    last_updated: '2024-01-01T00:00:00.000Z',
    parent_version: null,
    update_type: 'full',
    files_changed: null,
    repo_name: 'test',
    purpose: 'Test',
    stack: 'Various',
    languages: manyLanguages,
    entrypoints: [],
    modules: manyModules,
    config_files: [],
    conventions: [],
  };

  const result = MetaJsonSchema.parse(validMeta);
  assert.strictEqual(result.languages.length, 50);
  assert.strictEqual(result.modules.length, 100);
});

test('GraphJsonSchema: handles large graphs', () => {
  const largeGraph: Record<string, { imports: string[]; imported_by: string[] }> = {};

  for (let i = 0; i < 100; i++) {
    largeGraph[`src/file${i}.ts`] = {
      imports: i > 0 ? [`src/file${i - 1}.ts`] : [],
      imported_by: i < 99 ? [`src/file${i + 1}.ts`] : [],
    };
  }

  const result = GraphJsonSchema.parse(largeGraph);
  assert.strictEqual(Object.keys(result).length, 100);
});
