/**
 * Tests for LatencyTracker
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  LatencyTracker,
  extractTaskIdFromPurpose,
  globalLatencyTracker,
  type LLMCallRecord,
} from '../../src/core/latency-tracker.js';

describe('LatencyTracker', () => {
  let tracker: LatencyTracker;

  beforeEach(() => {
    tracker = new LatencyTracker();
  });

  describe('basic recording', () => {
    it('should record a single call', () => {
      const record: LLMCallRecord = {
        startedAt: '2024-01-01T00:00:00.000Z',
        latencyMs: 1200,
        inputTokens: 5000,
        outputTokens: 800,
        tokensPerSecond: 666.67,
        model: 'claude-haiku-4-5-20251001',
        level: 1,
      };

      tracker.recordCall(record);
      const calls = tracker.getCalls();

      assert.strictEqual(calls.length, 1);
      assert.deepStrictEqual(calls[0], record);
    });

    it('should record multiple calls', () => {
      tracker.recordCall({
        startedAt: '2024-01-01T00:00:00.000Z',
        latencyMs: 1000,
        inputTokens: 100,
        outputTokens: 50,
        tokensPerSecond: 50,
        model: 'claude-haiku-4-5-20251001',
        level: 1,
      });

      tracker.recordCall({
        startedAt: '2024-01-01T00:00:01.000Z',
        latencyMs: 2000,
        inputTokens: 200,
        outputTokens: 100,
        tokensPerSecond: 50,
        model: 'claude-sonnet-4-5-20250929',
        level: 2,
      });

      const calls = tracker.getCalls();
      assert.strictEqual(calls.length, 2);
    });

    it('should not record when disabled', () => {
      tracker.setEnabled(false);

      tracker.recordCall({
        startedAt: '2024-01-01T00:00:00.000Z',
        latencyMs: 1000,
        inputTokens: 100,
        outputTokens: 50,
        tokensPerSecond: 50,
        model: 'claude-haiku-4-5-20251001',
        level: 1,
      });

      const calls = tracker.getCalls();
      assert.strictEqual(calls.length, 0);
    });

    it('should reset all data', () => {
      tracker.recordCall({
        startedAt: '2024-01-01T00:00:00.000Z',
        latencyMs: 1000,
        inputTokens: 100,
        outputTokens: 50,
        tokensPerSecond: 50,
        model: 'claude-haiku-4-5-20251001',
        level: 1,
      });

      tracker.reset();
      const calls = tracker.getCalls();
      assert.strictEqual(calls.length, 0);
    });
  });

  describe('getLevelMetrics', () => {
    it('should aggregate metrics by level', () => {
      // Level 1 calls
      tracker.recordCall({
        startedAt: '2024-01-01T00:00:00.000Z',
        latencyMs: 1000,
        inputTokens: 5000,
        outputTokens: 800,
        tokensPerSecond: 800,
        model: 'claude-haiku-4-5-20251001',
        level: 1,
      });
      tracker.recordCall({
        startedAt: '2024-01-01T00:00:02.000Z',
        latencyMs: 1500,
        inputTokens: 4000,
        outputTokens: 700,
        tokensPerSecond: 466.67,
        model: 'claude-haiku-4-5-20251001',
        level: 1,
      });

      // Level 2 call
      tracker.recordCall({
        startedAt: '2024-01-01T00:00:04.000Z',
        latencyMs: 2000,
        inputTokens: 8000,
        outputTokens: 1200,
        tokensPerSecond: 600,
        model: 'claude-sonnet-4-5-20250929',
        level: 2,
      });

      const levelMetrics = tracker.getLevelMetrics();

      assert.strictEqual(levelMetrics.length, 2);

      // Level 1
      const level1 = levelMetrics.find((m) => m.level === 1);
      assert.ok(level1);
      assert.strictEqual(level1.callCount, 2);
      assert.strictEqual(level1.totalInputTokens, 9000);
      assert.strictEqual(level1.totalOutputTokens, 1500);
      assert.strictEqual(level1.totalLatencyMs, 2500);
      assert.strictEqual(level1.avgLatencyMs, 1250);
      assert.strictEqual(level1.name, 'Detection');

      // Level 2
      const level2 = levelMetrics.find((m) => m.level === 2);
      assert.ok(level2);
      assert.strictEqual(level2.callCount, 1);
      assert.strictEqual(level2.totalInputTokens, 8000);
      assert.strictEqual(level2.totalOutputTokens, 1200);
      assert.strictEqual(level2.name, 'Division');
    });

    it('should sort levels by level number', () => {
      // Add in reverse order
      tracker.recordCall({
        startedAt: '2024-01-01T00:00:00.000Z',
        latencyMs: 1000,
        inputTokens: 100,
        outputTokens: 50,
        tokensPerSecond: 50,
        model: 'claude-haiku-4-5-20251001',
        level: 3,
      });
      tracker.recordCall({
        startedAt: '2024-01-01T00:00:01.000Z',
        latencyMs: 1000,
        inputTokens: 100,
        outputTokens: 50,
        tokensPerSecond: 50,
        model: 'claude-sonnet-4-5-20250929',
        level: 1,
      });

      const levelMetrics = tracker.getLevelMetrics();

      assert.strictEqual(levelMetrics[0].level, 1);
      assert.strictEqual(levelMetrics[1].level, 3);
    });

    it('should calculate correct tokens per second', () => {
      tracker.recordCall({
        startedAt: '2024-01-01T00:00:00.000Z',
        latencyMs: 2000, // 2 seconds
        inputTokens: 1000,
        outputTokens: 1000, // 1000 tokens in 2 seconds = 500 tok/s
        tokensPerSecond: 500,
        model: 'claude-haiku-4-5-20251001',
        level: 1,
      });

      const levelMetrics = tracker.getLevelMetrics();
      assert.strictEqual(levelMetrics[0].avgTokensPerSecond, 500);
    });
  });

  describe('getLevel3TaskMetrics', () => {
    it('should aggregate Level 3 metrics by task', () => {
      // Task 1: src/core/file.ts
      tracker.recordCall({
        startedAt: '2024-01-01T00:00:00.000Z',
        latencyMs: 1800,
        inputTokens: 2100,
        outputTokens: 890,
        tokensPerSecond: 494.44,
        model: 'claude-haiku-4-5-20251001',
        level: 3,
        taskId: 'src/core/file.ts',
      });

      // Task 2: src/query/engine.ts
      tracker.recordCall({
        startedAt: '2024-01-01T00:00:02.000Z',
        latencyMs: 1500,
        inputTokens: 1800,
        outputTokens: 720,
        tokensPerSecond: 480,
        model: 'claude-haiku-4-5-20251001',
        level: 3,
        taskId: 'src/query/engine.ts',
      });

      // Another call for Task 1 (retry)
      tracker.recordCall({
        startedAt: '2024-01-01T00:00:04.000Z',
        latencyMs: 800,
        inputTokens: 500,
        outputTokens: 200,
        tokensPerSecond: 250,
        model: 'claude-haiku-4-5-20251001',
        level: 3,
        taskId: 'src/core/file.ts',
      });

      const taskMetrics = tracker.getLevel3TaskMetrics();

      assert.strictEqual(taskMetrics.length, 2);

      // Task 1 should have aggregated metrics from 2 calls
      // Sorted by slowest first, so task 1 should be first (2600ms total)
      const task1 = taskMetrics.find((t) => t.taskId === 'src/core/file.ts');
      assert.ok(task1);
      assert.strictEqual(task1.callCount, 2);
      assert.strictEqual(task1.inputTokens, 2600);
      assert.strictEqual(task1.outputTokens, 1090);
      assert.strictEqual(task1.totalLatencyMs, 2600);

      // Task 2
      const task2 = taskMetrics.find((t) => t.taskId === 'src/query/engine.ts');
      assert.ok(task2);
      assert.strictEqual(task2.callCount, 1);
      assert.strictEqual(task2.totalLatencyMs, 1500);
    });

    it('should not include non-Level-3 calls', () => {
      tracker.recordCall({
        startedAt: '2024-01-01T00:00:00.000Z',
        latencyMs: 1000,
        inputTokens: 100,
        outputTokens: 50,
        tokensPerSecond: 50,
        model: 'claude-haiku-4-5-20251001',
        level: 1, // Not Level 3
        taskId: 'some-task',
      });

      const taskMetrics = tracker.getLevel3TaskMetrics();
      assert.strictEqual(taskMetrics.length, 0);
    });

    it('should sort by total latency (slowest first)', () => {
      tracker.recordCall({
        startedAt: '2024-01-01T00:00:00.000Z',
        latencyMs: 1000, // Faster
        inputTokens: 100,
        outputTokens: 50,
        tokensPerSecond: 50,
        model: 'claude-haiku-4-5-20251001',
        level: 3,
        taskId: 'fast-task.ts',
      });

      tracker.recordCall({
        startedAt: '2024-01-01T00:00:01.000Z',
        latencyMs: 3000, // Slower
        inputTokens: 100,
        outputTokens: 50,
        tokensPerSecond: 16.67,
        model: 'claude-haiku-4-5-20251001',
        level: 3,
        taskId: 'slow-task.ts',
      });

      const taskMetrics = tracker.getLevel3TaskMetrics();

      assert.strictEqual(taskMetrics[0].taskId, 'slow-task.ts');
      assert.strictEqual(taskMetrics[1].taskId, 'fast-task.ts');
    });
  });

  describe('getSlowestTasks', () => {
    it('should return top N slowest tasks', () => {
      for (let i = 1; i <= 10; i++) {
        tracker.recordCall({
          startedAt: `2024-01-01T00:00:0${i}.000Z`,
          latencyMs: i * 100, // 100, 200, 300, ... 1000
          inputTokens: 100,
          outputTokens: 50,
          tokensPerSecond: 50,
          model: 'claude-haiku-4-5-20251001',
          level: 3,
          taskId: `task-${i}.ts`,
        });
      }

      const slowest5 = tracker.getSlowestTasks(5);

      assert.strictEqual(slowest5.length, 5);
      assert.strictEqual(slowest5[0].taskId, 'task-10.ts'); // Slowest
      assert.strictEqual(slowest5[1].taskId, 'task-9.ts');
      assert.strictEqual(slowest5[2].taskId, 'task-8.ts');
      assert.strictEqual(slowest5[3].taskId, 'task-7.ts');
      assert.strictEqual(slowest5[4].taskId, 'task-6.ts');
    });

    it('should default to 5 tasks', () => {
      for (let i = 1; i <= 10; i++) {
        tracker.recordCall({
          startedAt: `2024-01-01T00:00:0${i}.000Z`,
          latencyMs: i * 100,
          inputTokens: 100,
          outputTokens: 50,
          tokensPerSecond: 50,
          model: 'claude-haiku-4-5-20251001',
          level: 3,
          taskId: `task-${i}.ts`,
        });
      }

      const slowest = tracker.getSlowestTasks();
      assert.strictEqual(slowest.length, 5);
    });
  });

  describe('getSummary', () => {
    it('should return complete summary', () => {
      // Level 1
      tracker.recordCall({
        startedAt: '2024-01-01T00:00:00.000Z',
        latencyMs: 1000,
        inputTokens: 5000,
        outputTokens: 800,
        tokensPerSecond: 800,
        model: 'claude-haiku-4-5-20251001',
        level: 1,
      });

      // Level 2
      tracker.recordCall({
        startedAt: '2024-01-01T00:00:02.000Z',
        latencyMs: 2000,
        inputTokens: 8000,
        outputTokens: 1200,
        tokensPerSecond: 600,
        model: 'claude-sonnet-4-5-20250929',
        level: 2,
      });

      // Level 3 (multiple tasks)
      tracker.recordCall({
        startedAt: '2024-01-01T00:00:04.000Z',
        latencyMs: 1500,
        inputTokens: 2000,
        outputTokens: 500,
        tokensPerSecond: 333.33,
        model: 'claude-haiku-4-5-20251001',
        level: 3,
        taskId: 'file1.ts',
      });
      tracker.recordCall({
        startedAt: '2024-01-01T00:00:06.000Z',
        latencyMs: 2000,
        inputTokens: 3000,
        outputTokens: 700,
        tokensPerSecond: 350,
        model: 'claude-haiku-4-5-20251001',
        level: 3,
        taskId: 'file2.ts',
      });

      const summary = tracker.getSummary();

      assert.strictEqual(summary.totalCalls, 4);
      assert.strictEqual(summary.totalInputTokens, 18000);
      assert.strictEqual(summary.totalOutputTokens, 3200);
      assert.strictEqual(summary.totalLatencyMs, 6500);
      assert.strictEqual(summary.levels.length, 3);
      assert.strictEqual(summary.level3Tasks.length, 2);
    });

    it('should handle empty tracker', () => {
      const summary = tracker.getSummary();

      assert.strictEqual(summary.totalCalls, 0);
      assert.strictEqual(summary.totalInputTokens, 0);
      assert.strictEqual(summary.totalOutputTokens, 0);
      assert.strictEqual(summary.totalLatencyMs, 0);
      assert.strictEqual(summary.levels.length, 0);
      assert.strictEqual(summary.level3Tasks.length, 0);
    });
  });
});

describe('extractTaskIdFromPurpose', () => {
  it('should extract file path from annotation purpose', () => {
    const purpose =
      'File annotation - extracts purpose, exports, and imports for: src/core/file.ts';
    const taskId = extractTaskIdFromPurpose(purpose);
    assert.strictEqual(taskId, 'src/core/file.ts');
  });

  it('should extract file path from correction retry purpose', () => {
    const purpose = 'Annotation correction retry 1/2 for: src/query/engine.ts';
    const taskId = extractTaskIdFromPurpose(purpose);
    assert.strictEqual(taskId, 'src/query/engine.ts');
  });

  it('should extract file path from structural validation retry purpose', () => {
    const purpose =
      'File annotation (retry after structural validation error) for: src/levels/level3.ts';
    const taskId = extractTaskIdFromPurpose(purpose);
    assert.strictEqual(taskId, 'src/levels/level3.ts');
  });

  it('should return undefined for non-matching purpose', () => {
    const purpose = 'Repository structure detection - identifies repo name, purpose, stack';
    const taskId = extractTaskIdFromPurpose(purpose);
    assert.strictEqual(taskId, undefined);
  });

  it('should handle paths with special characters', () => {
    const purpose = 'File annotation for: src/components/my-component.tsx';
    const taskId = extractTaskIdFromPurpose(purpose);
    assert.strictEqual(taskId, 'src/components/my-component.tsx');
  });
});

describe('globalLatencyTracker', () => {
  beforeEach(() => {
    globalLatencyTracker.reset();
  });

  it('should be a singleton instance', () => {
    globalLatencyTracker.recordCall({
      startedAt: '2024-01-01T00:00:00.000Z',
      latencyMs: 1000,
      inputTokens: 100,
      outputTokens: 50,
      tokensPerSecond: 50,
      model: 'claude-haiku-4-5-20251001',
      level: 1,
    });

    const calls = globalLatencyTracker.getCalls();
    assert.strictEqual(calls.length, 1);
  });
});
