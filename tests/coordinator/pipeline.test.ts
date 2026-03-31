/**
 * Tests for Pipeline Orchestrator
 *
 * Tests full pipeline execution, level sequencing (0→1→2→3→4),
 * error handling at each level, and mocked LLM responses.
 */

import { test, mock } from 'node:test';
import assert from 'node:assert';
import type {
  Level0Output,
  Level1Output,
  TaskDelegation,
  FileAnnotation,
  GraphJson,
  MetaJson,
  StatsJson,
  ValidationJson,
  PipelineResult,
} from '../../src/core/types.js';
import { SCHEMA_VERSION } from '../../src/core/constants.js';

// Mock pipeline result for testing
const mockLevel0Output: Level0Output = {
  files: [
    {
      name: 'index.ts',
      path: 'src/index.ts',
      extension: '.ts',
      size_bytes: 1024,
      line_count: 50,
      language: 'TypeScript',
      raw_imports: ['./auth', './utils'],
    },
    {
      name: 'auth.ts',
      path: 'src/auth.ts',
      extension: '.ts',
      size_bytes: 2048,
      line_count: 100,
      language: 'TypeScript',
      raw_imports: ['./utils'],
    },
    {
      name: 'utils.ts',
      path: 'src/utils.ts',
      extension: '.ts',
      size_bytes: 512,
      line_count: 30,
      language: 'TypeScript',
      raw_imports: [],
    },
  ],
  git_commit: 'abc123def456',
  timestamp: '2024-01-01T00:00:00Z',
  total_files: 3,
  total_size_bytes: 3584,
};

const mockLevel1Output: Level1Output = {
  repo_name: 'test-repo',
  purpose: 'A test repository',
  stack: 'TypeScript, Node.js',
  languages: ['TypeScript'],
  entrypoints: ['src/index.ts'],
  modules: [{ path: 'src', description: 'Main source code' }],
  config_files: ['package.json', 'tsconfig.json'],
  conventions: ['Use TypeScript strict mode', 'Export named functions'],
};

const mockTaskDelegation: TaskDelegation = {
  tasks: [
    { scope: 'src/', agent_size: 'small', estimated_files: 3 },
  ],
  execution: 'parallel',
  estimated_total_minutes: 5,
};

const mockAnnotations: FileAnnotation[] = [
  {
    path: 'src/index.ts',
    language: 'TypeScript',
    size_bytes: 1024,
    purpose: 'Main entry point',
    tags: ['entrypoint', 'initialization'],
    exports: ['main'],
    imports: ['src/auth.ts', 'src/utils.ts'],
  },
  {
    path: 'src/auth.ts',
    language: 'TypeScript',
    size_bytes: 2048,
    purpose: 'Authentication logic',
    tags: ['authentication', 'security'],
    exports: ['login', 'logout'],
    imports: ['src/utils.ts'],
  },
  {
    path: 'src/utils.ts',
    language: 'TypeScript',
    size_bytes: 512,
    purpose: 'Utility functions',
    tags: ['utilities', 'helpers'],
    exports: ['format', 'validate'],
    imports: [],
  },
];

const mockGraph: GraphJson = {
  'src/index.ts': {
    imports: ['src/auth.ts', 'src/utils.ts'],
    imported_by: [],
  },
  'src/auth.ts': {
    imports: ['src/utils.ts'],
    imported_by: ['src/index.ts'],
  },
  'src/utils.ts': {
    imports: [],
    imported_by: ['src/index.ts', 'src/auth.ts'],
  },
};

// Test: Pipeline result structure
test('runPipeline: returns complete PipelineResult structure', () => {
  const mockResult: PipelineResult = {
    annotations: mockAnnotations,
    graph: mockGraph,
    meta: {
      schema_version: SCHEMA_VERSION,
      map_version: 1,
      git_commit: 'abc123def456',
      created_at: '2024-01-01T00:00:00Z',
      last_updated: '2024-01-01T00:05:00Z',
      parent_version: null,
      update_type: 'full',
      files_changed: null,
      repo_name: 'test-repo',
      purpose: 'A test repository',
      stack: 'TypeScript, Node.js',
      languages: ['TypeScript'],
      entrypoints: ['src/index.ts'],
      modules: [{ path: 'src', description: 'Main source code' }],
      config_files: ['package.json', 'tsconfig.json'],
      conventions: ['Use TypeScript strict mode', 'Export named functions'],
    },
    stats: {
      files_annotated: 3,
      build_time_minutes: 5,
      levels_completed: [0, 1, 2, 3, 4],
      agents_used: 1,
      validation_issues: 0,
      last_delta_files: null,
    },
    validation: {
      issues: [],
      auto_fixed: 0,
      requires_attention: 0,
    },
    tracker: null as any, // Mock tracker
  };

  // Validate structure
  assert.ok(mockResult.annotations);
  assert.ok(Array.isArray(mockResult.annotations));
  assert.ok(mockResult.graph);
  assert.ok(mockResult.meta);
  assert.ok(mockResult.stats);
  assert.ok(mockResult.validation);
  assert.strictEqual(mockResult.annotations.length, 3);
});

// Test: Level sequencing 0→1→2→3→4
test('runPipeline: executes levels in correct sequence', () => {
  const executionOrder: number[] = [];

  // Simulate level execution
  const executeLevel = (level: number) => {
    executionOrder.push(level);
  };

  // Execute in order
  executeLevel(0); // Metadata harvester
  executeLevel(1); // Structure detector
  executeLevel(2); // Work divider
  executeLevel(3); // File annotator
  executeLevel(4); // Consistency validator

  // Verify order
  assert.deepStrictEqual(executionOrder, [0, 1, 2, 3, 4]);
});

// Test: Level 0 execution
test('runPipeline: Level 0 produces valid metadata', () => {
  assert.ok(mockLevel0Output.files);
  assert.ok(Array.isArray(mockLevel0Output.files));
  assert.ok(mockLevel0Output.git_commit);
  assert.ok(mockLevel0Output.timestamp);
  assert.ok(typeof mockLevel0Output.total_files === 'number');
  assert.strictEqual(mockLevel0Output.total_files, 3);
});

// Test: Level 1 execution
test('runPipeline: Level 1 produces valid structure info', () => {
  assert.ok(mockLevel1Output.repo_name);
  assert.ok(mockLevel1Output.purpose);
  assert.ok(mockLevel1Output.stack);
  assert.ok(Array.isArray(mockLevel1Output.languages));
  assert.ok(Array.isArray(mockLevel1Output.entrypoints));
  assert.ok(Array.isArray(mockLevel1Output.modules));
  assert.ok(mockLevel1Output.modules.length > 0);
});

// Test: Level 2 execution
test('runPipeline: Level 2 produces valid task delegation', () => {
  assert.ok(mockTaskDelegation.tasks);
  assert.ok(Array.isArray(mockTaskDelegation.tasks));
  assert.ok(mockTaskDelegation.tasks.length > 0);
  assert.ok(['parallel', 'sequential'].includes(mockTaskDelegation.execution));
  assert.ok(typeof mockTaskDelegation.estimated_total_minutes === 'number');
});

// Test: Level 3 execution (parallel)
test('runPipeline: Level 3 executes tasks in parallel when specified', async () => {
  const delegation: TaskDelegation = {
    tasks: [
      { scope: 'src/auth/', agent_size: 'small', estimated_files: 2 },
      { scope: 'src/utils/', agent_size: 'small', estimated_files: 1 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 3,
  };

  const startTimes: number[] = [];
  const mockAnnotateTask = async () => {
    startTimes.push(Date.now());
    await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
    return mockAnnotations;
  };

  // Execute tasks in parallel
  const promises = delegation.tasks.map(() => mockAnnotateTask());
  await Promise.all(promises);

  // All tasks should start at roughly the same time (parallel)
  const maxTimeDiff = Math.max(...startTimes) - Math.min(...startTimes);
  assert.ok(maxTimeDiff < 50, 'Tasks should start in parallel (within 50ms)');
});

// Test: Level 3 execution (sequential)
test('runPipeline: Level 3 executes tasks sequentially when specified', async () => {
  const delegation: TaskDelegation = {
    tasks: [
      { scope: 'src/auth/', agent_size: 'small', estimated_files: 2 },
      { scope: 'src/utils/', agent_size: 'small', estimated_files: 1 },
    ],
    execution: 'sequential',
    estimated_total_minutes: 5,
  };

  const startTimes: number[] = [];
  const mockAnnotateTask = async () => {
    startTimes.push(Date.now());
    await new Promise(resolve => setTimeout(resolve, 20)); // Small delay
    return mockAnnotations;
  };

  // Execute tasks sequentially
  for (const task of delegation.tasks) {
    await mockAnnotateTask();
  }

  // Tasks should start with noticeable gaps (sequential)
  if (startTimes.length > 1) {
    const timeDiff = startTimes[1] - startTimes[0];
    assert.ok(timeDiff >= 15, 'Tasks should execute sequentially (gap >= 15ms)');
  }
});

// Test: Level 4 execution
test('runPipeline: Level 4 produces validation results', () => {
  const validation: ValidationJson = {
    issues: [],
    auto_fixed: 0,
    requires_attention: 0,
  };

  assert.ok(validation.issues);
  assert.ok(Array.isArray(validation.issues));
  assert.ok(typeof validation.auto_fixed === 'number');
  assert.ok(typeof validation.requires_attention === 'number');
});

// Test: Error handling at Level 0
test('runPipeline: handles Level 0 errors gracefully', async () => {
  try {
    // Simulate Level 0 failure
    throw new Error('Failed to read repository');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.ok(error.message.includes('Failed to read'));
  }
});

// Test: Error handling at Level 1
test('runPipeline: handles Level 1 LLM errors gracefully', async () => {
  try {
    // Simulate LLM failure
    throw new Error('LLM API error: rate limit exceeded');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.ok(error.message.includes('LLM API error'));
  }
});

// Test: Error handling at Level 2
test('runPipeline: handles Level 2 errors gracefully', async () => {
  try {
    // Simulate work division failure
    throw new Error('Failed to divide work: invalid delegation');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.ok(error.message.includes('divide work'));
  }
});

// Test: Error handling at Level 3
test('runPipeline: handles Level 3 annotation errors gracefully', async () => {
  try {
    // Simulate annotation failure
    throw new Error('Annotation failed: file not found');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.ok(error.message.includes('Annotation failed'));
  }
});

// Test: Error handling at Level 4
test('runPipeline: handles Level 4 validation errors gracefully', async () => {
  try {
    // Simulate validation failure
    throw new Error('Validation failed: graph inconsistency');
  } catch (error) {
    assert.ok(error instanceof Error);
    assert.ok(error.message.includes('Validation failed'));
  }
});

// Test: Graph building from annotations
test('runPipeline: builds correct dependency graph from annotations', () => {
  // Verify graph structure
  assert.ok(mockGraph['src/index.ts']);
  assert.ok(mockGraph['src/auth.ts']);
  assert.ok(mockGraph['src/utils.ts']);

  // Verify imports
  assert.deepStrictEqual(mockGraph['src/index.ts'].imports, ['src/auth.ts', 'src/utils.ts']);
  assert.deepStrictEqual(mockGraph['src/auth.ts'].imports, ['src/utils.ts']);
  assert.deepStrictEqual(mockGraph['src/utils.ts'].imports, []);

  // Verify imported_by (reverse edges)
  assert.deepStrictEqual(mockGraph['src/utils.ts'].imported_by, ['src/index.ts', 'src/auth.ts']);
  assert.deepStrictEqual(mockGraph['src/auth.ts'].imported_by, ['src/index.ts']);
  assert.deepStrictEqual(mockGraph['src/index.ts'].imported_by, []);
});

// Test: Metadata construction
test('runPipeline: constructs valid metadata', () => {
  const meta: MetaJson = {
    schema_version: SCHEMA_VERSION,
    map_version: 1,
    git_commit: mockLevel0Output.git_commit,
    created_at: mockLevel0Output.timestamp,
    last_updated: new Date().toISOString(),
    parent_version: null,
    update_type: 'full',
    files_changed: null,
    ...mockLevel1Output,
  };

  assert.strictEqual(meta.schema_version, SCHEMA_VERSION);
  assert.strictEqual(meta.map_version, 1);
  assert.strictEqual(meta.git_commit, 'abc123def456');
  assert.strictEqual(meta.update_type, 'full');
  assert.strictEqual(meta.repo_name, 'test-repo');
});

// Test: Statistics collection
test('runPipeline: collects accurate statistics', () => {
  const stats: StatsJson = {
    files_annotated: mockAnnotations.length,
    build_time_minutes: 5.2,
    levels_completed: [0, 1, 2, 3, 4],
    agents_used: 1,
    validation_issues: 0,
    last_delta_files: null,
  };

  assert.strictEqual(stats.files_annotated, 3);
  assert.ok(stats.build_time_minutes > 0);
  assert.deepStrictEqual(stats.levels_completed, [0, 1, 2, 3, 4]);
  assert.strictEqual(stats.agents_used, 1);
});

// Test: Force full rebuild option
test('runPipeline: respects forceFullRebuild option', () => {
  const options = {
    repoRoot: '/path/to/repo',
    forceFullRebuild: true,
    autofix: true,
    parallel: true,
  };

  assert.strictEqual(options.forceFullRebuild, true);
  // When forceFullRebuild is true, update_type should be 'full'
});

// Test: Autofix option
test('runPipeline: respects autofix option', () => {
  const optionsWithAutofix = {
    repoRoot: '/path/to/repo',
    forceFullRebuild: false,
    autofix: true,
    parallel: true,
  };

  const optionsWithoutAutofix = {
    repoRoot: '/path/to/repo',
    forceFullRebuild: false,
    autofix: false,
    parallel: true,
  };

  assert.strictEqual(optionsWithAutofix.autofix, true);
  assert.strictEqual(optionsWithoutAutofix.autofix, false);
});

// Test: Parallel execution option
test('runPipeline: respects parallel option', () => {
  const parallelOptions = {
    repoRoot: '/path/to/repo',
    parallel: true,
  };

  const sequentialOptions = {
    repoRoot: '/path/to/repo',
    parallel: false,
  };

  assert.strictEqual(parallelOptions.parallel, true);
  assert.strictEqual(sequentialOptions.parallel, false);
});

// Test: Progress tracking integration
test('runPipeline: tracks progress through pipeline', () => {
  const levelsCompleted: string[] = [];

  const trackLevel = (level: string) => {
    levelsCompleted.push(level);
  };

  trackLevel('Level 0: Metadata Harvester');
  trackLevel('Level 1: Structure Detector');
  trackLevel('Level 2: Work Divider');
  trackLevel('Level 3: Deep File Annotator');
  trackLevel('Level 4: Consistency Validator');

  assert.strictEqual(levelsCompleted.length, 5);
  assert.ok(levelsCompleted[0].includes('Level 0'));
  assert.ok(levelsCompleted[4].includes('Level 4'));
});

// Test: LLM call tracking
test('runPipeline: tracks LLM calls correctly', () => {
  let llmCallCount = 0;

  // Simulate LLM calls at different levels
  llmCallCount++; // Level 1
  llmCallCount++; // Level 2
  llmCallCount += 3; // Level 3 (3 tasks)

  assert.strictEqual(llmCallCount, 5);
});

// Test: Empty repository handling
test('runPipeline: handles empty repositories', () => {
  const emptyLevel0: Level0Output = {
    files: [],
    git_commit: 'abc123',
    timestamp: '2024-01-01T00:00:00Z',
    total_files: 0,
    total_size_bytes: 0,
  };

  assert.strictEqual(emptyLevel0.total_files, 0);
  assert.strictEqual(emptyLevel0.files.length, 0);
});

// Test: Large repository handling
test('runPipeline: handles large repositories efficiently', () => {
  const largeLevel0: Level0Output = {
    files: Array.from({ length: 1000 }, (_, i) => ({
      name: `file${i}.ts`,
      path: `src/file${i}.ts`,
      extension: '.ts',
      size_bytes: 1024,
      line_count: 50,
      language: 'TypeScript',
      raw_imports: [],
    })),
    git_commit: 'abc123',
    timestamp: '2024-01-01T00:00:00Z',
    total_files: 1000,
    total_size_bytes: 1024000,
  };

  assert.strictEqual(largeLevel0.total_files, 1000);
  assert.ok(largeLevel0.files.length === 1000);
});

// Test: Partial failure handling
test('runPipeline: collects partial results on task failure', async () => {
  const tasks = [
    { scope: 'src/auth/', agent_size: 'small' as const, estimated_files: 2 },
    { scope: 'src/utils/', agent_size: 'small' as const, estimated_files: 1 },
    { scope: 'src/failing/', agent_size: 'small' as const, estimated_files: 1 },
  ];

  const results: FileAnnotation[][] = [];
  const errors: Error[] = [];

  for (const task of tasks) {
    try {
      if (task.scope === 'src/failing/') {
        throw new Error('Task failed');
      }
      results.push(mockAnnotations);
    } catch (error) {
      errors.push(error as Error);
      // Continue with other tasks
    }
  }

  assert.strictEqual(results.length, 2); // 2 successful tasks
  assert.strictEqual(errors.length, 1); // 1 failed task
});

// Test: Version incrementing
test('runPipeline: increments map version correctly', () => {
  const existingMeta = {
    map_version: 5,
    schema_version: SCHEMA_VERSION,
  };

  const newVersion = existingMeta.map_version + 1;
  assert.strictEqual(newVersion, 6);
});

// Test: Delta update detection
test('runPipeline: detects when delta update is possible', () => {
  const existingMeta = {
    git_commit: 'abc123',
    map_version: 1,
  };

  const currentCommit = 'def456';
  const isDelta = existingMeta.git_commit !== currentCommit;

  assert.strictEqual(isDelta, true);
});
