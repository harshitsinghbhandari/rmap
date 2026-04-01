/**
 * Tests for JSON schema validation in query engine
 *
 * Validates that malformed JSON files are caught with clear error messages
 * Reference: REF-004 from audit/REFACTORING-PLAN.md
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { queryByTags } from '../../src/query/engine.js';

/**
 * Helper to create a temporary .repo_map directory with test files
 */
async function createTempRepoMap(
  meta: unknown,
  graph: unknown,
  tags: unknown,
  annotations: unknown
): Promise<string> {
  const tempDir = join(tmpdir(), `rmap-validation-test-${Date.now()}`);
  const repoMapDir = join(tempDir, '.repo_map');

  await mkdir(repoMapDir, { recursive: true });

  await Promise.all([
    writeFile(join(repoMapDir, 'meta.json'), JSON.stringify(meta, null, 2)),
    writeFile(join(repoMapDir, 'graph.json'), JSON.stringify(graph, null, 2)),
    writeFile(join(repoMapDir, 'tags.json'), JSON.stringify(tags, null, 2)),
    writeFile(join(repoMapDir, 'annotations.json'), JSON.stringify(annotations, null, 2)),
  ]);

  return repoMapDir;
}

/**
 * Valid baseline data for tests
 */
const validMeta = {
  schema_version: '1.0',
  map_version: 1,
  git_commit: 'abc123',
  created_at: '2024-01-01T00:00:00Z',
  last_updated: '2024-01-01T00:00:00Z',
  parent_version: null,
  update_type: 'full',
  files_changed: null,
  repo_name: 'test-repo',
  purpose: 'A test repository',
  stack: 'TypeScript',
  languages: ['TypeScript'],
  entrypoints: ['src/index.ts'],
  modules: [],
  config_files: [],
  conventions: [],
};

const validGraph = {
  'src/index.ts': {
    imports: [],
    imported_by: [],
  },
};

const validTags = {
  taxonomy_version: '1.0',
  aliases: {},
  index: {
    api_endpoint: ['src/index.ts'],
  },
};

const validAnnotations = [
  {
    path: 'src/index.ts',
    language: 'TypeScript',
    size_bytes: 1024,
    line_count: 50,
    purpose: 'Main entry point',
    tags: ['api_endpoint'],
    exports: ['main'],
    imports: [],
  },
];

test('JSON schema validation - valid data passes', async () => {
  const repoMapPath = await createTempRepoMap(
    validMeta,
    validGraph,
    validTags,
    validAnnotations
  );

  try {
    // Should not throw
    await queryByTags(['api_endpoint'], { repoMapPath });
  } finally {
    await rm(repoMapPath, { recursive: true, force: true });
  }
});

test('JSON validation - malformed meta.json', async () => {
  const invalidMeta = { ...validMeta };
  delete (invalidMeta as any).schema_version; // Missing required field

  const repoMapPath = await createTempRepoMap(
    invalidMeta,
    validGraph,
    validTags,
    validAnnotations
  );

  try {
    await assert.rejects(
      async () => queryByTags(['api_endpoint'], { repoMapPath }),
      (error: Error) => {
        assert.match(error.message, /Invalid meta\.json schema/);
        assert.match(error.message, /schema_version/);
        return true;
      }
    );
  } finally {
    await rm(repoMapPath, { recursive: true, force: true });
  }
});

test('JSON validation - invalid map_version type', async () => {
  const invalidMeta = { ...validMeta, map_version: 'not-a-number' };

  const repoMapPath = await createTempRepoMap(
    invalidMeta,
    validGraph,
    validTags,
    validAnnotations
  );

  try {
    await assert.rejects(
      async () => queryByTags(['api_endpoint'], { repoMapPath }),
      (error: Error) => {
        assert.match(error.message, /Invalid meta\.json schema/);
        assert.match(error.message, /map_version/);
        return true;
      }
    );
  } finally {
    await rm(repoMapPath, { recursive: true, force: true });
  }
});

test('JSON validation - invalid update_type enum', async () => {
  const invalidMeta = { ...validMeta, update_type: 'invalid-type' };

  const repoMapPath = await createTempRepoMap(
    invalidMeta,
    validGraph,
    validTags,
    validAnnotations
  );

  try {
    await assert.rejects(
      async () => queryByTags(['api_endpoint'], { repoMapPath }),
      (error: Error) => {
        assert.match(error.message, /Invalid meta\.json schema/);
        assert.match(error.message, /update_type/);
        return true;
      }
    );
  } finally {
    await rm(repoMapPath, { recursive: true, force: true });
  }
});

test('JSON validation - malformed graph.json', async () => {
  const invalidGraph = {
    'src/index.ts': {
      imports: 'not-an-array', // Should be array
      imported_by: [],
    },
  };

  const repoMapPath = await createTempRepoMap(
    validMeta,
    invalidGraph,
    validTags,
    validAnnotations
  );

  try {
    await assert.rejects(
      async () => queryByTags(['api_endpoint'], { repoMapPath }),
      (error: Error) => {
        assert.match(error.message, /Invalid graph\.json schema/);
        return true;
      }
    );
  } finally {
    await rm(repoMapPath, { recursive: true, force: true });
  }
});

test('JSON validation - malformed tags.json', async () => {
  const invalidTags = {
    taxonomy_version: '1.0',
    aliases: {},
    // Missing required 'index' field
  };

  const repoMapPath = await createTempRepoMap(
    validMeta,
    validGraph,
    invalidTags,
    validAnnotations
  );

  try {
    await assert.rejects(
      async () => queryByTags(['api_endpoint'], { repoMapPath }),
      (error: Error) => {
        assert.match(error.message, /Invalid tags\.json schema/);
        assert.match(error.message, /index/);
        return true;
      }
    );
  } finally {
    await rm(repoMapPath, { recursive: true, force: true });
  }
});

test('JSON validation - invalid tag in annotations', async () => {
  const invalidAnnotations = [
    {
      ...validAnnotations[0],
      tags: ['invalid_tag_not_in_taxonomy'], // Tag not in TAG_TAXONOMY
    },
  ];

  const repoMapPath = await createTempRepoMap(
    validMeta,
    validGraph,
    validTags,
    invalidAnnotations
  );

  try {
    await assert.rejects(
      async () => queryByTags(['api_endpoint'], { repoMapPath }),
      (error: Error) => {
        assert.match(error.message, /Invalid annotations\.json schema/);
        return true;
      }
    );
  } finally {
    await rm(repoMapPath, { recursive: true, force: true });
  }
});

test('JSON validation - annotations not an array', async () => {
  const invalidAnnotations = { path: 'src/index.ts' }; // Should be array

  const repoMapPath = await createTempRepoMap(
    validMeta,
    validGraph,
    validTags,
    invalidAnnotations
  );

  try {
    await assert.rejects(
      async () => queryByTags(['api_endpoint'], { repoMapPath }),
      (error: Error) => {
        assert.match(error.message, /Invalid annotations\.json schema/);
        return true;
      }
    );
  } finally {
    await rm(repoMapPath, { recursive: true, force: true });
  }
});

test('JSON validation - missing required annotation fields', async () => {
  const invalidAnnotations = [
    {
      path: 'src/index.ts',
      // Missing required fields: language, size_bytes, line_count, purpose, tags, exports, imports
    },
  ];

  const repoMapPath = await createTempRepoMap(
    validMeta,
    validGraph,
    validTags,
    invalidAnnotations
  );

  try {
    await assert.rejects(
      async () => queryByTags(['api_endpoint'], { repoMapPath }),
      (error: Error) => {
        assert.match(error.message, /Invalid annotations\.json schema/);
        return true;
      }
    );
  } finally {
    await rm(repoMapPath, { recursive: true, force: true });
  }
});

test('JSON validation - negative size_bytes', async () => {
  const invalidAnnotations = [
    {
      ...validAnnotations[0],
      size_bytes: -100, // Should be nonnegative
    },
  ];

  const repoMapPath = await createTempRepoMap(
    validMeta,
    validGraph,
    validTags,
    invalidAnnotations
  );

  try {
    await assert.rejects(
      async () => queryByTags(['api_endpoint'], { repoMapPath }),
      (error: Error) => {
        assert.match(error.message, /Invalid annotations\.json schema/);
        assert.match(error.message, /size_bytes/);
        return true;
      }
    );
  } finally {
    await rm(repoMapPath, { recursive: true, force: true });
  }
});

test('JSON validation - helpful error message format', async () => {
  const invalidMeta = {
    ...validMeta,
    map_version: 'invalid',
    update_type: 'invalid-enum',
  };

  const repoMapPath = await createTempRepoMap(
    invalidMeta,
    validGraph,
    validTags,
    validAnnotations
  );

  try {
    await assert.rejects(
      async () => queryByTags(['api_endpoint'], { repoMapPath }),
      (error: Error) => {
        // Should contain helpful error format with field paths
        assert.match(error.message, /Invalid meta\.json schema/);
        // Should suggest rebuilding
        assert.match(error.message, /rmap map --full/);
        return true;
      }
    );
  } finally {
    await rm(repoMapPath, { recursive: true, force: true });
  }
});

test('JSON parsing - malformed JSON syntax', async () => {
  const tempDir = join(tmpdir(), `rmap-validation-test-${Date.now()}`);
  const repoMapDir = join(tempDir, '.repo_map');

  await mkdir(repoMapDir, { recursive: true });

  // Write invalid JSON syntax
  await Promise.all([
    writeFile(join(repoMapDir, 'meta.json'), '{invalid json}'),
    writeFile(join(repoMapDir, 'graph.json'), JSON.stringify(validGraph)),
    writeFile(join(repoMapDir, 'tags.json'), JSON.stringify(validTags)),
    writeFile(join(repoMapDir, 'annotations.json'), JSON.stringify(validAnnotations)),
  ]);

  try {
    await assert.rejects(
      async () => queryByTags(['api_endpoint'], { repoMapPath: repoMapDir }),
      (error: Error) => {
        assert.match(error.message, /Failed to parse meta\.json/);
        return true;
      }
    );
  } finally {
    await rm(repoMapDir, { recursive: true, force: true });
  }
});
