/**
 * Tests for Level 2 Work Division Prompt
 *
 * Tests prompt template generation, file tree formatting, and directory grouping
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { buildWorkDivisionPrompt, buildDirectoryGroups } from '../../../src/levels/level2/prompt.js';
import type { Level0Output, Level1Output } from '../../../src/core/types.js';
import { MAX_FILES_PER_TASK } from '../../../src/core/constants.js';

// Mock test data
const mockLevel0: Level0Output = {
  files: [
    {
      name: 'jwt.ts',
      path: 'src/auth/jwt.ts',
      extension: '.ts',
      size_bytes: 2048,
      line_count: 100,
      language: 'TypeScript',
      raw_imports: [],
    },
    {
      name: 'session.ts',
      path: 'src/auth/session.ts',
      extension: '.ts',
      size_bytes: 3072,
      line_count: 150,
      language: 'TypeScript',
      raw_imports: [],
    },
    {
      name: 'logger.ts',
      path: 'src/utils/logger.ts',
      extension: '.ts',
      size_bytes: 512,
      line_count: 30,
      language: 'TypeScript',
      raw_imports: [],
    },
    {
      name: 'users.ts',
      path: 'src/database/users.ts',
      extension: '.ts',
      size_bytes: 4096,
      line_count: 200,
      language: 'TypeScript',
      raw_imports: [],
    },
    {
      name: 'package.json',
      path: 'package.json',
      extension: '.json',
      size_bytes: 1024,
      line_count: 40,
      raw_imports: [],
    },
  ],
  git_commit: 'abc123',
  timestamp: '2024-01-01T00:00:00Z',
  total_files: 5,
  total_size_bytes: 10752,
};

const mockLevel1: Level1Output = {
  repo_name: 'test-repo',
  purpose: 'A test repository',
  stack: 'TypeScript, Node.js',
  languages: ['TypeScript', 'JavaScript'],
  entrypoints: ['src/index.ts'],
  modules: [
    { path: 'src/auth', description: 'Authentication module' },
    { path: 'src/utils', description: 'Utility functions' },
    { path: 'src/database', description: 'Database operations' },
  ],
  config_files: ['package.json', 'tsconfig.json'],
  conventions: ['Use async/await', 'Export named functions'],
};

// Test: buildDirectoryGroups function
test('buildDirectoryGroups: groups files by directory', () => {
  const groups = buildDirectoryGroups(mockLevel0);

  // Should create separate groups for each directory
  const paths = groups.map(g => g.path);
  assert.ok(paths.includes('src/auth'));
  assert.ok(paths.includes('src/utils'));
  assert.ok(paths.includes('src/database'));
  assert.ok(paths.includes('.')); // Root files
});

test('buildDirectoryGroups: calculates file counts correctly', () => {
  const groups = buildDirectoryGroups(mockLevel0);

  const authGroup = groups.find(g => g.path === 'src/auth');
  assert.ok(authGroup);
  assert.strictEqual(authGroup.totalFiles, 2); // jwt.ts and session.ts
});

test('buildDirectoryGroups: calculates total size correctly', () => {
  const groups = buildDirectoryGroups(mockLevel0);

  const authGroup = groups.find(g => g.path === 'src/auth');
  assert.ok(authGroup);
  // 2048 + 3072 = 5120 bytes = 5 KB
  assert.ok(authGroup.totalSizeKb >= 5 && authGroup.totalSizeKb <= 5.1);
});

test('buildDirectoryGroups: includes file details', () => {
  const groups = buildDirectoryGroups(mockLevel0);

  const authGroup = groups.find(g => g.path === 'src/auth');
  assert.ok(authGroup);
  assert.strictEqual(authGroup.files.length, 2);

  const jwtFile = authGroup.files.find(f => f.name === 'jwt.ts');
  assert.ok(jwtFile);
  assert.strictEqual(jwtFile.name, 'jwt.ts');
  assert.strictEqual(jwtFile.size, 2048);
  assert.strictEqual(jwtFile.language, 'TypeScript');
});

test('buildDirectoryGroups: sorts groups by path', () => {
  const groups = buildDirectoryGroups(mockLevel0);

  // Groups should be sorted alphabetically
  for (let i = 0; i < groups.length - 1; i++) {
    assert.ok(groups[i].path.localeCompare(groups[i + 1].path) <= 0);
  }
});

test('buildDirectoryGroups: handles root-level files', () => {
  const groups = buildDirectoryGroups(mockLevel0);

  const rootGroup = groups.find(g => g.path === '.');
  assert.ok(rootGroup);
  assert.strictEqual(rootGroup.totalFiles, 1); // package.json
});

test('buildDirectoryGroups: handles files without language', () => {
  const level0WithoutLang: Level0Output = {
    ...mockLevel0,
    files: [
      {
        name: 'data.txt',
        path: 'data/data.txt',
        extension: '.txt',
        size_bytes: 100,
        line_count: 10,
        raw_imports: [],
        // No language field
      },
    ],
    total_files: 1,
    total_size_bytes: 100,
  };

  const groups = buildDirectoryGroups(level0WithoutLang);
  const dataGroup = groups.find(g => g.path === 'data');
  assert.ok(dataGroup);
  assert.strictEqual(dataGroup.files[0].language, undefined);
});

// Test: buildWorkDivisionPrompt function
test('buildWorkDivisionPrompt: includes repository metadata', () => {
  const prompt = buildWorkDivisionPrompt(mockLevel0, mockLevel1);

  assert.ok(prompt.includes(mockLevel1.repo_name));
  assert.ok(prompt.includes(mockLevel1.purpose));
  assert.ok(prompt.includes(mockLevel1.stack));
  assert.ok(prompt.includes(mockLevel0.total_files.toString()));
});

test('buildWorkDivisionPrompt: includes entry points', () => {
  const prompt = buildWorkDivisionPrompt(mockLevel0, mockLevel1);

  for (const entrypoint of mockLevel1.entrypoints) {
    assert.ok(prompt.includes(entrypoint));
  }
});

test('buildWorkDivisionPrompt: includes module structure', () => {
  const prompt = buildWorkDivisionPrompt(mockLevel0, mockLevel1);

  for (const module of mockLevel1.modules) {
    assert.ok(prompt.includes(module.path));
    assert.ok(prompt.includes(module.description));
  }
});

test('buildWorkDivisionPrompt: includes directory structure', () => {
  const prompt = buildWorkDivisionPrompt(mockLevel0, mockLevel1);

  // Should include directory paths
  assert.ok(prompt.includes('src/auth'));
  assert.ok(prompt.includes('src/utils'));
  assert.ok(prompt.includes('src/database'));
});

test('buildWorkDivisionPrompt: includes max files per task rule', () => {
  const prompt = buildWorkDivisionPrompt(mockLevel0, mockLevel1);

  assert.ok(prompt.includes(MAX_FILES_PER_TASK.toString()));
  assert.ok(prompt.includes('Max'));
});

test('buildWorkDivisionPrompt: includes agent size guidelines', () => {
  const prompt = buildWorkDivisionPrompt(mockLevel0, mockLevel1);

  assert.ok(prompt.includes('small'));
  assert.ok(prompt.includes('medium'));
  // Should mention what each size is for
  assert.ok(prompt.includes('utility') || prompt.includes('simple'));
  assert.ok(prompt.includes('complex') || prompt.includes('business logic'));
});

test('buildWorkDivisionPrompt: includes execution strategy guidelines', () => {
  const prompt = buildWorkDivisionPrompt(mockLevel0, mockLevel1);

  assert.ok(prompt.includes('parallel'));
  assert.ok(prompt.includes('sequential'));
  assert.ok(prompt.includes('execution'));
});

test('buildWorkDivisionPrompt: includes JSON structure example', () => {
  const prompt = buildWorkDivisionPrompt(mockLevel0, mockLevel1);

  // Should have JSON structure template
  assert.ok(prompt.includes('tasks'));
  assert.ok(prompt.includes('scope'));
  assert.ok(prompt.includes('agent_size'));
  assert.ok(prompt.includes('estimated_files'));
  assert.ok(prompt.includes('estimated_total_minutes'));
});

test('buildWorkDivisionPrompt: specifies JSON-only response', () => {
  const prompt = buildWorkDivisionPrompt(mockLevel0, mockLevel1);

  // Should explicitly request JSON only
  assert.ok(
    prompt.toLowerCase().includes('json only') ||
    prompt.toLowerCase().includes('valid json') ||
    prompt.toLowerCase().includes('json response')
  );
  assert.ok(
    prompt.toLowerCase().includes('no markdown') ||
    prompt.toLowerCase().includes('no explanation')
  );
});

test('buildWorkDivisionPrompt: includes languages list', () => {
  const prompt = buildWorkDivisionPrompt(mockLevel0, mockLevel1);

  for (const lang of mockLevel1.languages) {
    assert.ok(prompt.includes(lang));
  }
});

test('buildWorkDivisionPrompt: includes total size in MB', () => {
  const prompt = buildWorkDivisionPrompt(mockLevel0, mockLevel1);

  // Should include size in MB
  assert.ok(prompt.includes('MB'));

  const expectedSizeMb = (mockLevel0.total_size_bytes / 1024 / 1024).toFixed(2);
  assert.ok(prompt.includes(expectedSizeMb));
});

test('buildWorkDivisionPrompt: includes division rules', () => {
  const prompt = buildWorkDivisionPrompt(mockLevel0, mockLevel1);

  // Should mention key division rules
  assert.ok(prompt.toLowerCase().includes('group related files'));
  assert.ok(prompt.toLowerCase().includes('balance') || prompt.includes('balanced'));
});

test('buildWorkDivisionPrompt: handles repositories with no modules', () => {
  const level1NoModules: Level1Output = {
    ...mockLevel1,
    modules: [],
  };

  const prompt = buildWorkDivisionPrompt(mockLevel0, level1NoModules);

  // Should handle missing modules gracefully
  assert.ok(prompt.includes('No modules identified') || prompt.includes('modules:'));
});

test('buildWorkDivisionPrompt: handles repositories with no entry points', () => {
  const level1NoEntrypoints: Level1Output = {
    ...mockLevel1,
    entrypoints: [],
  };

  const prompt = buildWorkDivisionPrompt(mockLevel0, level1NoEntrypoints);

  // Should handle missing entry points gracefully
  assert.ok(prompt.includes('None identified') || prompt.includes('entrypoints:'));
});

test('buildWorkDivisionPrompt: file tree shows limited files per directory', () => {
  // Create a level0 with many files in one directory
  const manyFiles: Level0Output = {
    files: Array.from({ length: 20 }, (_, i) => ({
      name: `file${i}.ts`,
      path: `src/many/file${i}.ts`,
      extension: '.ts',
      size_bytes: 100,
      line_count: 10,
      language: 'TypeScript',
      raw_imports: [],
    })),
    git_commit: 'abc123',
    timestamp: '2024-01-01T00:00:00Z',
    total_files: 20,
    total_size_bytes: 2000,
  };

  const prompt = buildWorkDivisionPrompt(manyFiles, mockLevel1);

  // Should show truncation message for large directories
  assert.ok(prompt.includes('more files') || prompt.includes('...'));
});

test('buildWorkDivisionPrompt: format is consistent', () => {
  const prompt1 = buildWorkDivisionPrompt(mockLevel0, mockLevel1);
  const prompt2 = buildWorkDivisionPrompt(mockLevel0, mockLevel1);

  // Same input should produce same prompt
  assert.strictEqual(prompt1, prompt2);
});

test('buildWorkDivisionPrompt: includes total files constraint', () => {
  const prompt = buildWorkDivisionPrompt(mockLevel0, mockLevel1);

  // Should mention that sum of estimated_files should equal total
  const totalFiles = mockLevel0.total_files;
  assert.ok(prompt.includes(`equal ${totalFiles}`) || prompt.includes(`should equal`));
});

test('buildWorkDivisionPrompt: mentions recommended task count', () => {
  const prompt = buildWorkDivisionPrompt(mockLevel0, mockLevel1);

  // Should provide guidance on number of tasks
  assert.ok(
    prompt.includes('8-12') ||
    prompt.includes('balanced tasks') ||
    /\d+-\d+.*tasks/i.test(prompt)
  );
});
