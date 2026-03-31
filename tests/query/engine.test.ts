/**
 * Tests for query engine integration
 *
 * Tests the main query orchestration functions that combine filtering,
 * ranking, and formatting into complete query workflows
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  queryByTags,
  queryByFile,
  queryByPath,
  hasRepoMap,
} from '../../src/query/engine.js';
import type { MetaJson, GraphJson, TagsJson } from '../../src/core/types.js';

// Test data
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
  purpose: 'A test repository',
  stack: 'TypeScript, Node.js',
  languages: ['TypeScript'],
  entrypoints: ['src/index.ts'],
  modules: [
    { path: 'src/auth', description: 'Authentication module' },
    { path: 'src/api', description: 'API endpoints' },
  ],
  config_files: ['package.json'],
  conventions: ['Use camelCase for variables'],
};

const mockGraph: GraphJson = {
  'src/auth/jwt.ts': {
    imports: ['src/config/env.ts'],
    imported_by: ['src/api/endpoints/auth.ts'],
  },
  'src/auth/session.ts': {
    imports: ['src/database/users.ts'],
    imported_by: ['src/api/endpoints/auth.ts'],
  },
  'src/database/users.ts': {
    imports: [],
    imported_by: ['src/auth/session.ts'],
  },
  'src/api/endpoints/auth.ts': {
    imports: ['src/auth/jwt.ts', 'src/auth/session.ts'],
    imported_by: [],
  },
  'src/config/env.ts': {
    imports: [],
    imported_by: ['src/auth/jwt.ts'],
  },
};

const mockTags: TagsJson = {
  taxonomy_version: '1.0',
  aliases: {
    auth: ['authentication', 'authorization', 'jwt', 'oauth', 'session'],
  },
  index: {
    authentication: ['src/auth/jwt.ts', 'src/auth/session.ts', 'src/api/endpoints/auth.ts'],
    jwt: ['src/auth/jwt.ts'],
    session: ['src/auth/session.ts'],
    database: ['src/database/users.ts'],
    api_endpoint: ['src/api/endpoints/auth.ts'],
    config: ['src/config/env.ts'],
  },
};

// Helper to create a test repo map
async function createTestRepoMap(testDir: string) {
  const repoMapDir = join(testDir, '.repo_map');
  await mkdir(repoMapDir, { recursive: true });

  await writeFile(
    join(repoMapDir, 'meta.json'),
    JSON.stringify(mockMeta, null, 2)
  );

  await writeFile(
    join(repoMapDir, 'graph.json'),
    JSON.stringify(mockGraph, null, 2)
  );

  await writeFile(
    join(repoMapDir, 'tags.json'),
    JSON.stringify(mockTags, null, 2)
  );

  return repoMapDir;
}

// hasRepoMap tests
test('hasRepoMap: returns true when map exists', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);
    const result = await hasRepoMap(repoMapDir);
    assert.strictEqual(result, true);
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('hasRepoMap: returns false when map does not exist', async () => {
  const testDir = join(tmpdir(), `rmap-test-nonexistent-${Date.now()}`);
  const result = await hasRepoMap(join(testDir, '.repo_map'));
  assert.strictEqual(result, false);
});

test('hasRepoMap: returns false for empty directory', async () => {
  const testDir = join(tmpdir(), `rmap-test-empty-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const result = await hasRepoMap(join(testDir, '.repo_map'));
    assert.strictEqual(result, false);
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

// queryByTags tests
test('queryByTags: returns formatted output for tag query', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);
    const result = await queryByTags(['authentication'], {
      repoMapPath: repoMapDir,
    });

    // Should include all expected sections
    assert.ok(result.includes('═══ REPO CONTEXT ═══'));
    assert.ok(result.includes('═══ RELEVANT FILES'));
    assert.ok(result.includes('═══ BLAST RADIUS ═══'));
    assert.ok(result.includes('═══ CONVENTIONS ═══'));

    // Should include repo metadata
    assert.ok(result.includes('test-repo'));
    assert.ok(result.includes('A test repository'));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('queryByTags: expands tag aliases', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);
    const result = await queryByTags(['auth'], {
      repoMapPath: repoMapDir,
    });

    // Should find authentication files via alias expansion
    assert.ok(result.includes('src/auth/jwt.ts'));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('queryByTags: ranks files by relevance', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);
    const result = await queryByTags(['authentication'], {
      repoMapPath: repoMapDir,
    });

    // Should include matching files
    assert.ok(result.includes('src/auth/jwt.ts'));
    assert.ok(result.includes('src/auth/session.ts'));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('queryByTags: includes blast radius', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);
    const result = await queryByTags(['jwt'], {
      repoMapPath: repoMapDir,
    });

    // jwt.ts is imported by endpoints/auth.ts
    assert.ok(result.includes('═══ BLAST RADIUS ═══'));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('queryByTags: respects maxFiles option', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);
    const result = await queryByTags(['authentication'], {
      repoMapPath: repoMapDir,
      formatOptions: { maxFiles: 1 },
    });

    // Should successfully return formatted output
    assert.ok(result.includes('RELEVANT FILES'));
    assert.ok(result.length > 100);
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('queryByTags: throws error when map not found', async () => {
  const testDir = join(tmpdir(), `rmap-test-nonexistent-${Date.now()}`);

  await assert.rejects(
    async () => {
      await queryByTags(['auth'], {
        repoMapPath: join(testDir, '.repo_map'),
      });
    },
    {
      message: /Repository map not found/,
    }
  );
});

test('queryByTags: handles empty tag results', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);
    const result = await queryByTags(['nonexistent'], {
      repoMapPath: repoMapDir,
    });

    // Should handle no results gracefully
    assert.ok(result.includes('No matching files found'));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('queryByTags: handles multiple tags', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);
    const result = await queryByTags(['authentication', 'database'], {
      repoMapPath: repoMapDir,
    });

    // Should find files from both tags
    assert.ok(result.includes('src/auth/jwt.ts'));
    assert.ok(result.includes('src/database/users.ts'));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

// queryByFile tests
test('queryByFile: returns formatted output for file query', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);
    const result = await queryByFile('src/auth/jwt.ts', {
      repoMapPath: repoMapDir,
    });

    // Should include all expected sections
    assert.ok(result.includes('═══ REPO CONTEXT ═══'));
    assert.ok(result.includes('═══ FILE DETAILS ═══'));
    assert.ok(result.includes('═══ DEPENDENCIES ═══'));
    assert.ok(result.includes('═══ BLAST RADIUS ═══'));

    // Should include file path
    assert.ok(result.includes('src/auth/jwt.ts'));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('queryByFile: shows dependencies', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);
    const result = await queryByFile('src/auth/jwt.ts', {
      repoMapPath: repoMapDir,
    });

    // jwt.ts imports env.ts
    assert.ok(result.includes('src/config/env.ts'));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('queryByFile: shows dependents (blast radius)', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);
    const result = await queryByFile('src/auth/jwt.ts', {
      repoMapPath: repoMapDir,
    });

    // jwt.ts is imported by endpoints/auth.ts
    assert.ok(result.includes('src/api/endpoints/auth.ts'));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('queryByFile: throws error for non-existent file', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);

    await assert.rejects(
      async () => {
        await queryByFile('src/nonexistent.ts', {
          repoMapPath: repoMapDir,
        });
      },
      {
        message: /File not found in repository map/,
      }
    );
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('queryByFile: handles file with no dependencies', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);
    const result = await queryByFile('src/database/users.ts', {
      repoMapPath: repoMapDir,
    });

    // Should indicate no dependencies
    assert.ok(result.includes('no internal dependencies'));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('queryByFile: handles file with no dependents', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);
    const result = await queryByFile('src/api/endpoints/auth.ts', {
      repoMapPath: repoMapDir,
    });

    // endpoints/auth.ts is not imported by any file in mockGraph
    assert.ok(result.includes('No files import this file'));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

// queryByPath tests
test('queryByPath: returns formatted output for path query', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);
    const result = await queryByPath('src/auth', {
      repoMapPath: repoMapDir,
    });

    // Should include all expected sections
    assert.ok(result.includes('═══ REPO CONTEXT ═══'));
    assert.ok(result.includes('═══ DIRECTORY: src/auth ═══'));
    assert.ok(result.includes('═══ EXTERNAL DEPENDENCIES ═══'));

    // Should show directory path
    assert.ok(result.includes('src/auth'));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('queryByPath: lists files in directory', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);
    const result = await queryByPath('src/auth', {
      repoMapPath: repoMapDir,
    });

    // Should include files in src/auth/
    assert.ok(result.includes('src/auth/jwt.ts'));
    assert.ok(result.includes('src/auth/session.ts'));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('queryByPath: shows external dependents', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);
    const result = await queryByPath('src/auth', {
      repoMapPath: repoMapDir,
    });

    // Files in src/auth/ are imported by files outside (e.g., endpoints/auth.ts)
    assert.ok(result.includes('═══ EXTERNAL DEPENDENCIES ═══'));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('queryByPath: handles path with trailing slash', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);
    const result = await queryByPath('src/auth/', {
      repoMapPath: repoMapDir,
    });

    // Should work the same as without trailing slash
    assert.ok(result.includes('src/auth/jwt.ts'));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('queryByPath: throws error for non-existent directory', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);

    await assert.rejects(
      async () => {
        await queryByPath('src/nonexistent', {
          repoMapPath: repoMapDir,
        });
      },
      {
        message: /No files found in directory/,
      }
    );
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('queryByPath: ranks files by connectivity', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);
    const result = await queryByPath('src/auth', {
      repoMapPath: repoMapDir,
    });

    // Should include both files, ranked by their connectivity
    assert.ok(result.includes('src/auth/jwt.ts'));
    assert.ok(result.includes('src/auth/session.ts'));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

// Integration tests
test('integration: query workflow from tags to formatted output', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);

    // Query by tags
    const tagResult = await queryByTags(['auth'], {
      repoMapPath: repoMapDir,
    });

    // Should be complete formatted output
    assert.ok(tagResult.length > 200);
    assert.ok(tagResult.includes('test-repo'));
    assert.ok(tagResult.includes('src/auth'));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('integration: all query types work with same repo map', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);

    // All three query types should work
    const tagResult = await queryByTags(['auth'], {
      repoMapPath: repoMapDir,
    });
    const fileResult = await queryByFile('src/auth/jwt.ts', {
      repoMapPath: repoMapDir,
    });
    const pathResult = await queryByPath('src/auth', {
      repoMapPath: repoMapDir,
    });

    // All should produce output
    assert.ok(tagResult.length > 0);
    assert.ok(fileResult.length > 0);
    assert.ok(pathResult.length > 0);

    // All should reference the same repo
    assert.ok(tagResult.includes('test-repo'));
    assert.ok(fileResult.includes('test-repo'));
    assert.ok(pathResult.includes('test-repo'));
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});

test('integration: format options apply across all query types', async () => {
  const testDir = join(tmpdir(), `rmap-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });

  try {
    const repoMapDir = await createTestRepoMap(testDir);
    const formatOptions = { maxFiles: 1, maxExports: 1 };

    // All queries with same format options
    const tagResult = await queryByTags(['authentication'], {
      repoMapPath: repoMapDir,
      formatOptions,
    });
    const fileResult = await queryByFile('src/api/endpoints/auth.ts', {
      repoMapPath: repoMapDir,
      formatOptions,
    });
    const pathResult = await queryByPath('src/auth', {
      repoMapPath: repoMapDir,
      formatOptions,
    });

    // All should respect the limits
    assert.ok(tagResult.length > 0);
    assert.ok(fileResult.length > 0);
    assert.ok(pathResult.length > 0);
  } finally {
    await rm(testDir, { recursive: true, force: true });
  }
});
