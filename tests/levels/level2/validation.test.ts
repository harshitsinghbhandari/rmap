/**
 * Tests for Level 2 Task Delegation Validation
 *
 * Tests TaskDelegation validation, edge cases, and division rule enforcement
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  validateDivisionRules,
  applyDivisionHeuristics,
  DivisionRuleError,
} from '../../../src/levels/level2/validation.js';
import type { TaskDelegation, Level0Output } from '../../../src/core/types.js';
import { MAX_FILES_PER_TASK } from '../../../src/core/constants.js';

// Mock Level 0 output
const mockLevel0: Level0Output = {
  files: Array.from({ length: 50 }, (_, i) => ({
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
  total_files: 50,
  total_size_bytes: 51200,
};

// Test: Valid delegation passes validation
test('validateDivisionRules: accepts valid delegation', () => {
  const validDelegation: TaskDelegation = {
    tasks: [
      { scope: 'src/auth/', agent_size: 'medium', estimated_files: 20 },
      { scope: 'src/utils/', agent_size: 'small', estimated_files: 15 },
      { scope: 'src/database/', agent_size: 'medium', estimated_files: 15 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 20,
  };

  // Should not throw
  assert.doesNotThrow(() => {
    validateDivisionRules(validDelegation, mockLevel0);
  });
});

// Test: Rejects task exceeding max files
test('validateDivisionRules: rejects task exceeding MAX_FILES_PER_TASK', () => {
  const invalidDelegation: TaskDelegation = {
    tasks: [
      { scope: 'src/', agent_size: 'medium', estimated_files: MAX_FILES_PER_TASK + 1 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 20,
  };

  assert.throws(
    () => validateDivisionRules(invalidDelegation, mockLevel0),
    DivisionRuleError
  );
});

// Test: Rejects task with negative files
test('validateDivisionRules: rejects task with negative estimated_files', () => {
  const invalidDelegation: TaskDelegation = {
    tasks: [
      { scope: 'src/auth/', agent_size: 'medium', estimated_files: -5 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 10,
  };

  assert.throws(
    () => validateDivisionRules(invalidDelegation, mockLevel0),
    DivisionRuleError
  );
});

// Test: Rejects task with zero files
test('validateDivisionRules: rejects task with zero estimated_files', () => {
  const invalidDelegation: TaskDelegation = {
    tasks: [
      { scope: 'src/empty/', agent_size: 'small', estimated_files: 0 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 0,
  };

  assert.throws(
    () => validateDivisionRules(invalidDelegation, mockLevel0),
    DivisionRuleError
  );
});

// Test: Rejects large deviation in total files
test('validateDivisionRules: rejects large deviation in total estimated files', () => {
  const invalidDelegation: TaskDelegation = {
    tasks: [
      { scope: 'src/auth/', agent_size: 'medium', estimated_files: 10 },
      { scope: 'src/utils/', agent_size: 'small', estimated_files: 5 },
      // Total = 15, but actual is 50 (70% deviation)
    ],
    execution: 'parallel',
    estimated_total_minutes: 10,
  };

  assert.throws(
    () => validateDivisionRules(invalidDelegation, mockLevel0),
    DivisionRuleError
  );
});

// Test: Accepts small deviation in total files
test('validateDivisionRules: accepts small deviation in total files (<15%)', () => {
  const validDelegation: TaskDelegation = {
    tasks: [
      { scope: 'src/auth/', agent_size: 'medium', estimated_files: 25 },
      { scope: 'src/utils/', agent_size: 'small', estimated_files: 20 },
      // Total = 45, actual = 50 (10% deviation)
    ],
    execution: 'parallel',
    estimated_total_minutes: 15,
  };

  assert.doesNotThrow(() => {
    validateDivisionRules(validDelegation, mockLevel0);
  });
});

// Test: Rejects duplicate scopes
test('validateDivisionRules: rejects duplicate task scopes', () => {
  const invalidDelegation: TaskDelegation = {
    tasks: [
      { scope: 'src/auth/', agent_size: 'medium', estimated_files: 15 },
      { scope: 'src/auth/', agent_size: 'small', estimated_files: 10 },
      { scope: 'src/utils/', agent_size: 'small', estimated_files: 25 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 20,
  };

  assert.throws(
    () => validateDivisionRules(invalidDelegation, mockLevel0),
    DivisionRuleError
  );
});

// Test: Validates execution strategy
test('validateDivisionRules: accepts valid execution strategies', () => {
  const parallelDelegation: TaskDelegation = {
    tasks: [{ scope: 'src/', agent_size: 'medium', estimated_files: 50 }],
    execution: 'parallel',
    estimated_total_minutes: 15,
  };

  const sequentialDelegation: TaskDelegation = {
    tasks: [{ scope: 'src/', agent_size: 'medium', estimated_files: 50 }],
    execution: 'sequential',
    estimated_total_minutes: 20,
  };

  assert.doesNotThrow(() => validateDivisionRules(parallelDelegation, mockLevel0));
  assert.doesNotThrow(() => validateDivisionRules(sequentialDelegation, mockLevel0));
});

// Test: Rejects invalid execution strategy
test('validateDivisionRules: rejects invalid execution strategy', () => {
  const invalidDelegation = {
    tasks: [{ scope: 'src/', agent_size: 'medium', estimated_files: 50 }],
    execution: 'invalid' as any,
    estimated_total_minutes: 15,
  };

  assert.throws(
    () => validateDivisionRules(invalidDelegation, mockLevel0),
    DivisionRuleError
  );
});

// Test: Rejects negative estimated time
test('validateDivisionRules: rejects negative estimated_total_minutes', () => {
  const invalidDelegation: TaskDelegation = {
    tasks: [{ scope: 'src/', agent_size: 'medium', estimated_files: 50 }],
    execution: 'parallel',
    estimated_total_minutes: -5,
  };

  assert.throws(
    () => validateDivisionRules(invalidDelegation, mockLevel0),
    DivisionRuleError
  );
});

// Test: Rejects zero estimated time
test('validateDivisionRules: rejects zero estimated_total_minutes', () => {
  const invalidDelegation: TaskDelegation = {
    tasks: [{ scope: 'src/', agent_size: 'medium', estimated_files: 50 }],
    execution: 'parallel',
    estimated_total_minutes: 0,
  };

  assert.throws(
    () => validateDivisionRules(invalidDelegation, mockLevel0),
    DivisionRuleError
  );
});

// Test: applyDivisionHeuristics - task balance
test('applyDivisionHeuristics: warns about imbalanced tasks', () => {
  const imbalancedDelegation: TaskDelegation = {
    tasks: [
      { scope: 'src/small/', agent_size: 'small', estimated_files: 5 },
      { scope: 'src/large/', agent_size: 'medium', estimated_files: 45 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 20,
  };

  const result = applyDivisionHeuristics(imbalancedDelegation, mockLevel0);

  // Should have warnings about imbalance
  assert.ok(result.warnings.length > 0 || result.suggestions.length > 0);
});

// Test: applyDivisionHeuristics - sequential execution warning
test('applyDivisionHeuristics: warns about sequential with many tasks', () => {
  const sequentialDelegation: TaskDelegation = {
    tasks: [
      { scope: 'src/a/', agent_size: 'small', estimated_files: 10 },
      { scope: 'src/b/', agent_size: 'small', estimated_files: 10 },
      { scope: 'src/c/', agent_size: 'small', estimated_files: 10 },
      { scope: 'src/d/', agent_size: 'small', estimated_files: 10 },
      { scope: 'src/e/', agent_size: 'small', estimated_files: 10 },
    ],
    execution: 'sequential',
    estimated_total_minutes: 40,
  };

  const result = applyDivisionHeuristics(sequentialDelegation, mockLevel0);

  // Should warn about sequential execution with many tasks
  const hasSequentialWarning = result.warnings.some(
    w => w.toLowerCase().includes('sequential')
  );
  assert.ok(hasSequentialWarning);
});

// Test: applyDivisionHeuristics - too few tasks
test('applyDivisionHeuristics: suggests more granular division for large repos', () => {
  const largeMockLevel0: Level0Output = {
    ...mockLevel0,
    total_files: 150,
  };

  const fewTasksDelegation: TaskDelegation = {
    tasks: [
      { scope: 'src/', agent_size: 'medium', estimated_files: 150 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 60,
  };

  const result = applyDivisionHeuristics(fewTasksDelegation, largeMockLevel0);

  // Should suggest more granular division
  const hasGranularitySuggestion = result.suggestions.some(
    s => s.toLowerCase().includes('granular') || s.toLowerCase().includes('tasks')
  );
  assert.ok(hasGranularitySuggestion);
});

// Test: applyDivisionHeuristics - too many tasks
test('applyDivisionHeuristics: warns about too many tasks', () => {
  const manyTasksDelegation: TaskDelegation = {
    tasks: Array.from({ length: 25 }, (_, i) => ({
      scope: `src/module${i}/`,
      agent_size: 'small' as const,
      estimated_files: 2,
    })),
    execution: 'parallel',
    estimated_total_minutes: 20,
  };

  const result = applyDivisionHeuristics(manyTasksDelegation, mockLevel0);

  // Should warn about coordination overhead
  const hasOverheadSuggestion = result.suggestions.some(
    s => s.toLowerCase().includes('overhead') || s.toLowerCase().includes('grouping')
  );
  assert.ok(hasOverheadSuggestion);
});

// Test: applyDivisionHeuristics - agent size distribution
test('applyDivisionHeuristics: suggests using small agents', () => {
  const largeMockLevel0: Level0Output = {
    ...mockLevel0,
    total_files: 100,
  };

  const allMediumDelegation: TaskDelegation = {
    tasks: [
      { scope: 'src/a/', agent_size: 'medium', estimated_files: 30 },
      { scope: 'src/b/', agent_size: 'medium', estimated_files: 35 },
      { scope: 'src/c/', agent_size: 'medium', estimated_files: 35 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 40,
  };

  const result = applyDivisionHeuristics(allMediumDelegation, largeMockLevel0);

  // Should suggest using small agents for cost reduction
  const hasSmallAgentSuggestion = result.suggestions.some(
    s => s.toLowerCase().includes('small') && s.toLowerCase().includes('agent')
  );
  assert.ok(hasSmallAgentSuggestion);
});

// Test: applyDivisionHeuristics - large agent warning
test('applyDivisionHeuristics: warns about excessive large agents', () => {
  const largeAgentDelegation: TaskDelegation = {
    tasks: [
      { scope: 'src/a/', agent_size: 'large', estimated_files: 15 },
      { scope: 'src/b/', agent_size: 'large', estimated_files: 15 },
      { scope: 'src/c/', agent_size: 'large', estimated_files: 20 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 30,
  };

  const result = applyDivisionHeuristics(largeAgentDelegation, mockLevel0);

  // Should warn about expensive large agents
  const hasLargeAgentWarning = result.warnings.some(
    w => w.toLowerCase().includes('large') || w.toLowerCase().includes('expensive')
  );
  assert.ok(hasLargeAgentWarning);
});

// Test: applyDivisionHeuristics - returns both warnings and suggestions
test('applyDivisionHeuristics: returns object with warnings and suggestions', () => {
  const delegation: TaskDelegation = {
    tasks: [{ scope: 'src/', agent_size: 'medium', estimated_files: 50 }],
    execution: 'parallel',
    estimated_total_minutes: 15,
  };

  const result = applyDivisionHeuristics(delegation, mockLevel0);

  // Should have the expected structure
  assert.ok('warnings' in result);
  assert.ok('suggestions' in result);
  assert.ok(Array.isArray(result.warnings));
  assert.ok(Array.isArray(result.suggestions));
});

// Test: Edge case - empty tasks array
test('validateDivisionRules: handles empty tasks array', () => {
  const emptyDelegation: TaskDelegation = {
    tasks: [],
    execution: 'parallel',
    estimated_total_minutes: 0,
  };

  // Empty tasks should fail validation (caught by total files check)
  assert.throws(
    () => validateDivisionRules(emptyDelegation, mockLevel0),
    DivisionRuleError
  );
});

// Test: Edge case - single task
test('validateDivisionRules: accepts single task delegation', () => {
  const singleTaskDelegation: TaskDelegation = {
    tasks: [{ scope: 'src/', agent_size: 'medium', estimated_files: 50 }],
    execution: 'parallel',
    estimated_total_minutes: 20,
  };

  assert.doesNotThrow(() => {
    validateDivisionRules(singleTaskDelegation, mockLevel0);
  });
});

// Test: Edge case - many small tasks
test('validateDivisionRules: accepts many small tasks', () => {
  const manySmallTasks: TaskDelegation = {
    tasks: Array.from({ length: 10 }, (_, i) => ({
      scope: `src/module${i}/`,
      agent_size: 'small' as const,
      estimated_files: 5,
    })),
    execution: 'parallel',
    estimated_total_minutes: 15,
  };

  assert.doesNotThrow(() => {
    validateDivisionRules(manySmallTasks, mockLevel0);
  });
});

// Test: Edge case - mixed agent sizes
test('validateDivisionRules: accepts mixed agent sizes', () => {
  const mixedSizes: TaskDelegation = {
    tasks: [
      { scope: 'src/auth/', agent_size: 'large', estimated_files: 15 },
      { scope: 'src/utils/', agent_size: 'medium', estimated_files: 20 },
      { scope: 'tests/', agent_size: 'small', estimated_files: 15 },
    ],
    execution: 'parallel',
    estimated_total_minutes: 25,
  };

  assert.doesNotThrow(() => {
    validateDivisionRules(mixedSizes, mockLevel0);
  });
});

// Test: DivisionRuleError type
test('DivisionRuleError: is an instance of Error', () => {
  const error = new DivisionRuleError('Test error');

  assert.ok(error instanceof Error);
  assert.strictEqual(error.name, 'DivisionRuleError');
  assert.strictEqual(error.message, 'Test error');
});
