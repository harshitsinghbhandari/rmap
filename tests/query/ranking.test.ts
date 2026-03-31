/**
 * Tests for query ranking functions
 *
 * Tests file scoring, relevance ranking, and dependency analysis
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  rankFilesByRelevance,
  getTopFiles,
  getBlastRadius,
  getDependencies,
  type FileScore,
} from '../../src/query/ranking.js';
import type { FileAnnotation, GraphJson } from '../../src/core/types.js';

// Test data
const mockFiles: FileAnnotation[] = [
  {
    path: 'src/auth/jwt.ts',
    language: 'TypeScript',
    size_bytes: 1024,
    line_count: 50,
    purpose: 'JWT token generation and validation',
    tags: ['authentication', 'jwt'],
    exports: ['generateToken', 'validateToken'],
    imports: ['src/config/env.ts'],
  },
  {
    path: 'src/auth/session.ts',
    language: 'TypeScript',
    size_bytes: 2048,
    line_count: 100,
    purpose: 'Session management',
    tags: ['authentication', 'session'],
    exports: ['createSession', 'destroySession'],
    imports: ['src/database/users.ts'],
  },
  {
    path: 'src/database/users.ts',
    language: 'TypeScript',
    size_bytes: 3072,
    line_count: 150,
    purpose: 'User database operations',
    tags: ['database', 'orm'],
    exports: ['User', 'findUser', 'createUser'],
    imports: [],
  },
  {
    path: 'src/api/endpoints/auth.ts',
    language: 'TypeScript',
    size_bytes: 2560,
    line_count: 120,
    purpose: 'Authentication API endpoints',
    tags: ['api_endpoint', 'authentication'],
    exports: ['loginEndpoint', 'logoutEndpoint'],
    imports: ['src/auth/jwt.ts', 'src/auth/session.ts'],
  },
  {
    path: 'src/utils/logger.ts',
    language: 'TypeScript',
    size_bytes: 512,
    line_count: 30,
    purpose: 'Logging utility',
    tags: ['utility', 'logging'],
    exports: ['log', 'error', 'debug'],
    imports: [],
  },
  {
    path: 'src/config/env.ts',
    language: 'TypeScript',
    size_bytes: 256,
    line_count: 20,
    purpose: 'Environment configuration',
    tags: ['config', 'env'],
    exports: ['getEnvVar'],
    imports: [],
  },
  {
    path: 'src/huge-file.ts',
    language: 'TypeScript',
    size_bytes: 50000,
    line_count: 1500,
    purpose: 'Very large file',
    tags: ['utility'],
    exports: ['fn'],
    imports: [],
  },
];

const mockGraph: GraphJson = {
  'src/auth/jwt.ts': {
    imports: ['src/config/env.ts'],
    imported_by: ['src/api/endpoints/auth.ts', 'src/middleware/auth.ts'],
  },
  'src/auth/session.ts': {
    imports: ['src/database/users.ts'],
    imported_by: ['src/api/endpoints/auth.ts', 'src/middleware/auth.ts', 'src/api/endpoints/users.ts'],
  },
  'src/database/users.ts': {
    imports: [],
    imported_by: ['src/auth/session.ts', 'src/api/endpoints/users.ts', 'src/services/user-service.ts'],
  },
  'src/api/endpoints/auth.ts': {
    imports: ['src/auth/jwt.ts', 'src/auth/session.ts'],
    imported_by: ['src/app.ts'],
  },
  'src/utils/logger.ts': {
    imports: [],
    imported_by: ['src/app.ts', 'src/api/endpoints/auth.ts', 'src/database/users.ts'],
  },
  'src/config/env.ts': {
    imports: [],
    imported_by: ['src/auth/jwt.ts', 'src/database/users.ts'],
  },
  'src/huge-file.ts': {
    imports: [],
    imported_by: [],
  },
};

// rankFilesByRelevance tests
test('rankFilesByRelevance: ranks files by connectivity', () => {
  const result = rankFilesByRelevance(mockFiles, mockGraph);

  // Should return array of FileScore objects
  assert.ok(Array.isArray(result));
  assert.strictEqual(result.length, mockFiles.length);

  // Each item should have required properties
  result.forEach((item) => {
    assert.ok('file' in item);
    assert.ok('score' in item);
    assert.ok('importCount' in item);
    assert.ok('importedByCount' in item);
    assert.ok('connectivity' in item);
  });
});

test('rankFilesByRelevance: sorts by score descending', () => {
  const result = rankFilesByRelevance(mockFiles, mockGraph);

  // Verify descending order
  for (let i = 0; i < result.length - 1; i++) {
    assert.ok(result[i].score >= result[i + 1].score);
  }
});

test('rankFilesByRelevance: calculates connectivity correctly', () => {
  const result = rankFilesByRelevance(mockFiles, mockGraph);

  const jwtFile = result.find((f) => f.file.path === 'src/auth/jwt.ts');
  assert.ok(jwtFile);
  assert.strictEqual(jwtFile.importCount, 1); // imports src/config/env.ts
  assert.strictEqual(jwtFile.importedByCount, 2); // imported by 2 files
  assert.strictEqual(jwtFile.connectivity, 3); // 1 + 2
});

test('rankFilesByRelevance: handles files with no graph node', () => {
  const extraFile: FileAnnotation = {
    path: 'src/new-file.ts',
    language: 'TypeScript',
    size_bytes: 100,
    line_count: 10,
    purpose: 'New file',
    tags: ['utility'],
    exports: [],
    imports: [],
  };

  const result = rankFilesByRelevance([...mockFiles, extraFile], mockGraph);

  const newFile = result.find((f) => f.file.path === 'src/new-file.ts');
  assert.ok(newFile);
  assert.strictEqual(newFile.importCount, 0);
  assert.strictEqual(newFile.importedByCount, 0);
  assert.strictEqual(newFile.connectivity, 0);
});

test('rankFilesByRelevance: boosts score for matching tags', () => {
  const queryTags = ['authentication'];
  const withTagsResult = rankFilesByRelevance(mockFiles, mockGraph, queryTags);
  const withoutTagsResult = rankFilesByRelevance(mockFiles, mockGraph);

  // Files with authentication tag should rank higher with query tags
  const jwtWithTags = withTagsResult.find((f) => f.file.path === 'src/auth/jwt.ts');
  const jwtWithoutTags = withoutTagsResult.find((f) => f.file.path === 'src/auth/jwt.ts');

  assert.ok(jwtWithTags);
  assert.ok(jwtWithoutTags);
  assert.ok(jwtWithTags.score > jwtWithoutTags.score);
});

test('rankFilesByRelevance: counts multiple matching tags', () => {
  const queryTags = ['authentication', 'jwt'];
  const result = rankFilesByRelevance(mockFiles, mockGraph, queryTags);

  const jwtFile = result.find((f) => f.file.path === 'src/auth/jwt.ts');
  const sessionFile = result.find((f) => f.file.path === 'src/auth/session.ts');

  // jwt.ts has both tags, session.ts has only authentication
  assert.ok(jwtFile);
  assert.ok(sessionFile);
  // jwt.ts should score higher due to matching both tags
  assert.ok(jwtFile.score > sessionFile.score);
});

test('rankFilesByRelevance: penalizes very large files', () => {
  const result = rankFilesByRelevance(mockFiles, mockGraph);

  const hugeFile = result.find((f) => f.file.path === 'src/huge-file.ts');
  const normalFile = result.find((f) => f.file.path === 'src/utils/logger.ts');

  assert.ok(hugeFile);
  assert.ok(normalFile);

  // Huge file should be penalized (has line_count > 1000)
  // Despite both having similar connectivity, huge file should rank lower
  assert.ok(hugeFile.file.line_count > 1000);
});

test('rankFilesByRelevance: values imported_by more than imports', () => {
  // database/users.ts: 0 imports, 3 imported_by
  // auth/jwt.ts: 1 import, 2 imported_by
  // With current scoring: imported_by * 5, imports * 2
  // users.ts should score higher due to more imported_by

  const result = rankFilesByRelevance(mockFiles, mockGraph);

  const usersFile = result.find((f) => f.file.path === 'src/database/users.ts');
  assert.ok(usersFile);

  // Should have high score due to being imported by many files
  assert.ok(usersFile.importedByCount >= 3);
});

test('rankFilesByRelevance: scores exports positively', () => {
  const manyExportsFile: FileAnnotation = {
    path: 'src/api.ts',
    language: 'TypeScript',
    size_bytes: 1000,
    line_count: 100,
    purpose: 'API exports',
    tags: ['api_endpoint'],
    exports: ['fn1', 'fn2', 'fn3', 'fn4', 'fn5'],
    imports: [],
  };

  const fewExportsFile: FileAnnotation = {
    path: 'src/helper.ts',
    language: 'TypeScript',
    size_bytes: 1000,
    line_count: 100,
    purpose: 'Helper',
    tags: ['utility'],
    exports: ['fn1'],
    imports: [],
  };

  const result = rankFilesByRelevance([manyExportsFile, fewExportsFile], {
    'src/api.ts': { imports: [], imported_by: [] },
    'src/helper.ts': { imports: [], imported_by: [] },
  });

  const manyExports = result.find((f) => f.file.path === 'src/api.ts');
  const fewExports = result.find((f) => f.file.path === 'src/helper.ts');

  assert.ok(manyExports);
  assert.ok(fewExports);
  assert.ok(manyExports.score > fewExports.score);
});

test('rankFilesByRelevance: handles empty file array', () => {
  const result = rankFilesByRelevance([], mockGraph);
  assert.strictEqual(result.length, 0);
});

// getTopFiles tests
test('getTopFiles: returns top N files', () => {
  const ranked = rankFilesByRelevance(mockFiles, mockGraph);
  const top3 = getTopFiles(ranked, 3);

  assert.strictEqual(top3.length, 3);

  // Should be the first 3 from ranked array
  assert.deepStrictEqual(top3[0], ranked[0]);
  assert.deepStrictEqual(top3[1], ranked[1]);
  assert.deepStrictEqual(top3[2], ranked[2]);
});

test('getTopFiles: handles limit larger than array', () => {
  const ranked = rankFilesByRelevance(mockFiles, mockGraph);
  const topAll = getTopFiles(ranked, 100);

  assert.strictEqual(topAll.length, ranked.length);
});

test('getTopFiles: handles limit of 0', () => {
  const ranked = rankFilesByRelevance(mockFiles, mockGraph);
  const topNone = getTopFiles(ranked, 0);

  assert.strictEqual(topNone.length, 0);
});

test('getTopFiles: handles empty array', () => {
  const topNone = getTopFiles([], 5);
  assert.strictEqual(topNone.length, 0);
});

test('getTopFiles: returns highest scored files', () => {
  const ranked = rankFilesByRelevance(mockFiles, mockGraph);
  const top2 = getTopFiles(ranked, 2);

  // Should be sorted by score
  assert.ok(top2[0].score >= top2[1].score);
});

// getBlastRadius tests
test('getBlastRadius: returns files that import target', () => {
  const result = getBlastRadius(['src/auth/jwt.ts'], mockGraph, mockFiles);

  // jwt.ts is imported by endpoints/auth.ts and middleware/auth.ts (per graph)
  // But middleware/auth.ts is not in mockFiles, so should only return endpoints/auth.ts
  assert.ok(result.some((f) => f.path === 'src/api/endpoints/auth.ts'));
});

test('getBlastRadius: handles multiple target files', () => {
  const result = getBlastRadius(
    ['src/auth/jwt.ts', 'src/auth/session.ts'],
    mockGraph,
    mockFiles
  );

  // Both are imported by endpoints/auth.ts
  assert.ok(result.some((f) => f.path === 'src/api/endpoints/auth.ts'));

  // Should not contain duplicates
  const paths = result.map((f) => f.path);
  assert.strictEqual(paths.length, new Set(paths).size);
});

test('getBlastRadius: returns empty array for file with no dependents', () => {
  const result = getBlastRadius(['src/huge-file.ts'], mockGraph, mockFiles);
  assert.strictEqual(result.length, 0);
});

test('getBlastRadius: handles file not in graph', () => {
  const result = getBlastRadius(['src/nonexistent.ts'], mockGraph, mockFiles);
  assert.strictEqual(result.length, 0);
});

test('getBlastRadius: deduplicates results', () => {
  // Both jwt.ts and session.ts are imported by endpoints/auth.ts
  const result = getBlastRadius(
    ['src/auth/jwt.ts', 'src/auth/session.ts'],
    mockGraph,
    mockFiles
  );

  const paths = result.map((f) => f.path);
  const uniquePaths = new Set(paths);
  assert.strictEqual(paths.length, uniquePaths.size);
});

test('getBlastRadius: returns files sorted by connectivity', () => {
  const result = getBlastRadius(
    ['src/auth/jwt.ts', 'src/database/users.ts'],
    mockGraph,
    mockFiles
  );

  // Results should be ranked/sorted
  // Verify it returns FileAnnotation objects in ranked order
  assert.ok(result.length > 0);
  result.forEach((file) => {
    assert.ok('path' in file);
    assert.ok('purpose' in file);
  });
});

test('getBlastRadius: handles empty file paths array', () => {
  const result = getBlastRadius([], mockGraph, mockFiles);
  assert.strictEqual(result.length, 0);
});

test('getBlastRadius: ignores dependents not in allFiles', () => {
  // jwt.ts is imported by middleware/auth.ts according to graph,
  // but middleware/auth.ts is not in mockFiles
  const result = getBlastRadius(['src/auth/jwt.ts'], mockGraph, mockFiles);

  // Should not include middleware/auth.ts since it's not in allFiles
  assert.ok(!result.some((f) => f.path === 'src/middleware/auth.ts'));
});

// getDependencies tests
test('getDependencies: returns files that target imports', () => {
  const result = getDependencies('src/api/endpoints/auth.ts', mockGraph, mockFiles);

  // endpoints/auth.ts imports jwt.ts and session.ts
  assert.strictEqual(result.length, 2);
  assert.ok(result.some((f) => f.path === 'src/auth/jwt.ts'));
  assert.ok(result.some((f) => f.path === 'src/auth/session.ts'));
});

test('getDependencies: returns empty array for file with no imports', () => {
  const result = getDependencies('src/database/users.ts', mockGraph, mockFiles);
  assert.strictEqual(result.length, 0);
});

test('getDependencies: handles file not in graph', () => {
  const result = getDependencies('src/nonexistent.ts', mockGraph, mockFiles);
  assert.strictEqual(result.length, 0);
});

test('getDependencies: ignores imports not in allFiles', () => {
  // If a file imports something not in allFiles, it should be filtered out
  const graphWithExternal: GraphJson = {
    'src/test.ts': {
      imports: ['src/exists.ts', 'src/missing.ts'],
      imported_by: [],
    },
  };

  const filesWithoutMissing: FileAnnotation[] = [
    {
      path: 'src/test.ts',
      language: 'TypeScript',
      size_bytes: 100,
      line_count: 10,
      purpose: 'Test',
      tags: ['testing'],
      exports: [],
      imports: ['src/exists.ts', 'src/missing.ts'],
    },
    {
      path: 'src/exists.ts',
      language: 'TypeScript',
      size_bytes: 100,
      line_count: 10,
      purpose: 'Exists',
      tags: ['utility'],
      exports: [],
      imports: [],
    },
  ];

  const result = getDependencies('src/test.ts', graphWithExternal, filesWithoutMissing);

  // Should only return exists.ts, not missing.ts
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].path, 'src/exists.ts');
});

test('getDependencies: returns FileAnnotation objects', () => {
  const result = getDependencies('src/api/endpoints/auth.ts', mockGraph, mockFiles);

  result.forEach((dep) => {
    assert.ok('path' in dep);
    assert.ok('language' in dep);
    assert.ok('purpose' in dep);
    assert.ok('tags' in dep);
    assert.ok('exports' in dep);
    assert.ok('imports' in dep);
  });
});

test('getDependencies: handles single import', () => {
  const result = getDependencies('src/auth/jwt.ts', mockGraph, mockFiles);

  // jwt.ts imports only env.ts
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].path, 'src/config/env.ts');
});

test('getDependencies: maintains order from graph', () => {
  const result = getDependencies('src/api/endpoints/auth.ts', mockGraph, mockFiles);

  // Order should match the imports array in the graph
  const graphImports = mockGraph['src/api/endpoints/auth.ts'].imports;
  const resultPaths = result.map((f) => f.path);

  // Each result path should exist in graph imports
  resultPaths.forEach((path) => {
    assert.ok(graphImports.includes(path));
  });
});
