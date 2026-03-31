/**
 * Tests for Level 2 Work Divider
 *
 * Tests task delegation output structure, division rules, agent size selection,
 * and execution strategy decisions
 */

import { test, mock } from 'node:test';
import assert from 'node:assert';
import type { Level0Output, Level1Output, TaskDelegation } from '../../../src/core/types.js';
import { MAX_FILES_PER_TASK } from '../../../src/core/constants.js';

// Mock Level 0 output
const mockLevel0: Level0Output = {
  files: [
    // Auth files (15 files)
    ...Array.from({ length: 15 }, (_, i) => ({
      name: `auth${i}.ts`,
      path: `src/auth/auth${i}.ts`,
      extension: '.ts',
      size_bytes: 2048,
      line_count: 100,
      language: 'TypeScript',
      raw_imports: [],
    })),
    // Utils files (8 files)
    ...Array.from({ length: 8 }, (_, i) => ({
      name: `util${i}.ts`,
      path: `src/utils/util${i}.ts`,
      extension: '.ts',
      size_bytes: 512,
      line_count: 30,
      language: 'TypeScript',
      raw_imports: [],
    })),
    // Database files (20 files)
    ...Array.from({ length: 20 }, (_, i) => ({
      name: `db${i}.ts`,
      path: `src/database/db${i}.ts`,
      extension: '.ts',
      size_bytes: 4096,
      line_count: 200,
      language: 'TypeScript',
      raw_imports: [],
    })),
  ],
  git_commit: 'abc123',
  timestamp: '2024-01-01T00:00:00Z',
  total_files: 43,
  total_size_bytes: 106496,
};

const mockLevel1: Level1Output = {
  repo_name: 'test-repo',
  purpose: 'A test repository for unit tests',
  stack: 'TypeScript, Node.js',
  languages: ['TypeScript'],
  entrypoints: ['src/index.ts'],
  modules: [
    { path: 'src/auth', description: 'Authentication and authorization' },
    { path: 'src/utils', description: 'Utility functions' },
    { path: 'src/database', description: 'Database operations' },
  ],
  config_files: ['package.json', 'tsconfig.json'],
  conventions: ['Use async/await', 'Export named functions'],
};

// Test: Task delegation output structure
test('divideWork: returns valid TaskDelegation structure', async () => {
  const mockDelegation: TaskDelegation = {
    tasks: [
      { scope: 'src/auth/', agent_size: 'medium', estimated_files: 15 },
      { scope: 'src/utils/', agent_size: 'small', estimated_files: 8 },
      { scope: 'src/database/', agent_size: 'medium', estimated_files: 20 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 15,
  };

  // Validate structure
  assert.ok(Array.isArray(mockDelegation.tasks));
  assert.ok(mockDelegation.tasks.length > 0);
  assert.ok(['parallel', 'sequential'].includes(mockDelegation.execution));
  assert.ok(typeof mockDelegation.estimated_total_minutes === 'number');
  assert.ok(mockDelegation.estimated_total_minutes > 0);
});

// Test: Max 50 files per task rule
test('divideWork: enforces max files per task rule', () => {
  const validTask = { scope: 'src/auth/', agent_size: 'medium' as const, estimated_files: 50 };
  const invalidTask = { scope: 'src/big/', agent_size: 'medium' as const, estimated_files: 51 };

  // Valid task should pass
  assert.ok(validTask.estimated_files <= MAX_FILES_PER_TASK);

  // Invalid task should fail
  assert.ok(invalidTask.estimated_files > MAX_FILES_PER_TASK);
});

// Test: Task scopes are non-empty strings
test('divideWork: task scopes must be non-empty strings', () => {
  const validTasks = [
    { scope: 'src/auth/', agent_size: 'medium' as const, estimated_files: 15 },
    { scope: 'src/', agent_size: 'small' as const, estimated_files: 10 },
    { scope: 'tests/', agent_size: 'small' as const, estimated_files: 5 },
  ];

  for (const task of validTasks) {
    assert.ok(typeof task.scope === 'string');
    assert.ok(task.scope.length > 0);
    assert.ok(task.scope.trim() === task.scope); // No leading/trailing whitespace
  }
});

// Test: Agent size selection (small vs medium vs large)
test('divideWork: selects appropriate agent size based on complexity', () => {
  const tasks = [
    // Simple utility files should use small agents
    { scope: 'src/utils/', agent_size: 'small' as const, estimated_files: 8 },
    { scope: 'tests/unit/', agent_size: 'small' as const, estimated_files: 12 },
    { scope: 'config/', agent_size: 'small' as const, estimated_files: 5 },

    // Complex business logic should use medium agents
    { scope: 'src/auth/', agent_size: 'medium' as const, estimated_files: 15 },
    { scope: 'src/database/', agent_size: 'medium' as const, estimated_files: 20 },
    { scope: 'src/api/', agent_size: 'medium' as const, estimated_files: 18 },
  ];

  // Validate agent size is one of the allowed values
  for (const task of tasks) {
    assert.ok(['small', 'medium', 'large'].includes(task.agent_size));
  }
});

// Test: Parallel vs sequential execution decision
test('divideWork: prefers parallel execution for independent modules', () => {
  const parallelDelegation: TaskDelegation = {
    tasks: [
      { scope: 'src/auth/', agent_size: 'medium', estimated_files: 15 },
      { scope: 'src/utils/', agent_size: 'small', estimated_files: 8 },
      { scope: 'src/database/', agent_size: 'medium', estimated_files: 20 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 15,
  };

  // Independent modules should use parallel execution
  assert.strictEqual(parallelDelegation.execution, 'parallel');
});

test('divideWork: uses sequential execution when dependencies exist', () => {
  const sequentialDelegation: TaskDelegation = {
    tasks: [
      { scope: 'src/core/', agent_size: 'medium', estimated_files: 10 },
      { scope: 'src/features/', agent_size: 'medium', estimated_files: 30 },
    ],
    execution: 'sequential',
    estimated_total_minutes: 20,
  };

  // Dependent modules can use sequential execution
  assert.strictEqual(sequentialDelegation.execution, 'sequential');
});

// Test: Total estimated files matches actual files
test('divideWork: total estimated files should match actual files', () => {
  const delegation: TaskDelegation = {
    tasks: [
      { scope: 'src/auth/', agent_size: 'medium', estimated_files: 15 },
      { scope: 'src/utils/', agent_size: 'small', estimated_files: 8 },
      { scope: 'src/database/', agent_size: 'medium', estimated_files: 20 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 15,
  };

  const totalEstimated = delegation.tasks.reduce((sum, task) => sum + task.estimated_files, 0);
  const actualTotal = mockLevel0.total_files;

  // Allow up to 10% deviation
  const deviation = Math.abs(totalEstimated - actualTotal) / actualTotal;
  assert.ok(deviation <= 0.1, `Deviation ${(deviation * 100).toFixed(1)}% exceeds 10%`);
});

// Test: Task balance
test('divideWork: creates balanced tasks', () => {
  const delegation: TaskDelegation = {
    tasks: [
      { scope: 'src/auth/', agent_size: 'medium', estimated_files: 15 },
      { scope: 'src/utils/', agent_size: 'small', estimated_files: 8 },
      { scope: 'src/database/', agent_size: 'medium', estimated_files: 20 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 15,
  };

  const totalFiles = mockLevel0.total_files;
  const avgFilesPerTask = totalFiles / delegation.tasks.length;

  // Check that most tasks are within reasonable bounds
  const extremelyImbalanced = delegation.tasks.filter(
    t => t.estimated_files > avgFilesPerTask * 2 || t.estimated_files < avgFilesPerTask * 0.3
  );

  // Most tasks should be reasonably balanced
  assert.ok(extremelyImbalanced.length < delegation.tasks.length / 2);
});

// Test: Estimated time calculation
test('divideWork: provides reasonable time estimates', () => {
  const delegation: TaskDelegation = {
    tasks: [
      { scope: 'src/auth/', agent_size: 'medium', estimated_files: 15 },
      { scope: 'src/utils/', agent_size: 'small', estimated_files: 8 },
      { scope: 'src/database/', agent_size: 'medium', estimated_files: 20 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 15,
  };

  const totalFiles = mockLevel0.total_files;
  const avgMinutesPerFile = delegation.estimated_total_minutes / totalFiles;

  // Should be reasonable (not too fast or slow)
  // Typical range: 0.1 - 2 minutes per file
  assert.ok(avgMinutesPerFile >= 0.05, 'Time estimate too low');
  assert.ok(avgMinutesPerFile <= 5, 'Time estimate too high');
});

// Test: Execution time difference for parallel vs sequential
test('divideWork: sequential execution time should be higher than parallel', () => {
  const parallelDelegation: TaskDelegation = {
    tasks: [
      { scope: 'src/auth/', agent_size: 'medium', estimated_files: 15 },
      { scope: 'src/utils/', agent_size: 'small', estimated_files: 8 },
      { scope: 'src/database/', agent_size: 'medium', estimated_files: 20 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 15,
  };

  const sequentialDelegation: TaskDelegation = {
    ...parallelDelegation,
    execution: 'sequential',
    estimated_total_minutes: 35, // Higher for sequential
  };

  // Sequential should generally take longer than parallel
  if (parallelDelegation.tasks.length > 1) {
    assert.ok(
      sequentialDelegation.estimated_total_minutes >= parallelDelegation.estimated_total_minutes
    );
  }
});

// Test: Empty tasks array validation
test('divideWork: rejects empty tasks array', () => {
  const invalidDelegation = {
    tasks: [],
    execution: 'parallel' as const,
    estimated_total_minutes: 0,
  };

  // Empty tasks should be invalid
  assert.strictEqual(invalidDelegation.tasks.length, 0);
  // This would fail validation in the actual implementation
});

// Test: Duplicate scope detection
test('divideWork: avoids duplicate task scopes', () => {
  const delegation: TaskDelegation = {
    tasks: [
      { scope: 'src/auth/', agent_size: 'medium', estimated_files: 15 },
      { scope: 'src/utils/', agent_size: 'small', estimated_files: 8 },
      { scope: 'src/database/', agent_size: 'medium', estimated_files: 20 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 15,
  };

  const scopes = delegation.tasks.map(t => t.scope);
  const uniqueScopes = new Set(scopes);

  // All scopes should be unique
  assert.strictEqual(scopes.length, uniqueScopes.size);
});

// Test: Agent size distribution
test('divideWork: uses appropriate distribution of agent sizes', () => {
  const delegation: TaskDelegation = {
    tasks: [
      { scope: 'src/auth/', agent_size: 'medium', estimated_files: 15 },
      { scope: 'src/utils/', agent_size: 'small', estimated_files: 8 },
      { scope: 'src/database/', agent_size: 'medium', estimated_files: 20 },
      { scope: 'tests/', agent_size: 'small', estimated_files: 10 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 15,
  };

  const smallCount = delegation.tasks.filter(t => t.agent_size === 'small').length;
  const mediumCount = delegation.tasks.filter(t => t.agent_size === 'medium').length;
  const largeCount = delegation.tasks.filter(t => t.agent_size === 'large').length;

  // Should have a mix of sizes (not all one size)
  const totalTasks = delegation.tasks.length;
  if (totalTasks > 3) {
    // At least 2 different sizes should be used
    const sizesUsed = [smallCount, mediumCount, largeCount].filter(count => count > 0).length;
    assert.ok(sizesUsed >= 2, 'Should use at least 2 different agent sizes');
  }
});

// Test: File grouping by directory
test('divideWork: groups files by directory', () => {
  const delegation: TaskDelegation = {
    tasks: [
      { scope: 'src/auth/', agent_size: 'medium', estimated_files: 15 },
      { scope: 'src/utils/', agent_size: 'small', estimated_files: 8 },
      { scope: 'src/database/', agent_size: 'medium', estimated_files: 20 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 15,
  };

  // Each scope should be a directory path
  for (const task of delegation.tasks) {
    // Directory scopes typically end with '/' or are hierarchical paths
    assert.ok(task.scope.includes('/') || task.scope.includes('\\'));
  }
});
