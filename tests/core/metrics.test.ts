/**
 * Tests for MetricsCollector
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { MetricsCollector, MODEL_PRICING } from '../../src/core/metrics.js';

describe('MetricsCollector', () => {
  it('should initialize with correct start time', () => {
    const metrics = new MetricsCollector();
    const startTime = metrics.getStartTime();
    assert.ok(startTime instanceof Date);
    assert.ok(startTime.getTime() <= Date.now());
  });

  it('should track level start and end', () => {
    const metrics = new MetricsCollector();

    metrics.startLevel(1, 'Test Level');
    metrics.endLevel(1);

    const summary = metrics.getSummary();
    assert.strictEqual(summary.levels.length, 1);
    assert.strictEqual(summary.levels[0].level, 1);
    assert.strictEqual(summary.levels[0].name, 'Test Level');
    assert.ok(summary.levels[0].durationMs !== undefined);
    assert.ok(summary.levels[0].durationMs! >= 0);
  });

  it('should record LLM calls with token usage', () => {
    const metrics = new MetricsCollector();

    metrics.startLevel(1, 'Test Level');
    metrics.recordLLMCall({
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 1000,
      outputTokens: 200,
    });
    metrics.endLevel(1);

    const summary = metrics.getSummary();
    assert.strictEqual(summary.totalInputTokens, 1000);
    assert.strictEqual(summary.totalOutputTokens, 200);
    assert.strictEqual(summary.totalApiCalls, 1);
  });

  it('should calculate costs correctly for Haiku', () => {
    const metrics = new MetricsCollector();

    metrics.startLevel(1, 'Test Level');
    metrics.recordLLMCall({
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 1_000_000, // 1M tokens
      outputTokens: 1_000_000, // 1M tokens
    });
    metrics.endLevel(1);

    const summary = metrics.getSummary();
    // Cost = (1M * $0.25 / 1M) + (1M * $1.25 / 1M) = $0.25 + $1.25 = $1.50
    assert.strictEqual(summary.totalEstimatedCost, 1.5);
  });

  it('should calculate costs correctly for Sonnet', () => {
    const metrics = new MetricsCollector();

    metrics.startLevel(2, 'Test Level');
    metrics.recordLLMCall({
      model: 'claude-sonnet-4-5-20250929',
      inputTokens: 1_000_000, // 1M tokens
      outputTokens: 1_000_000, // 1M tokens
    });
    metrics.endLevel(2);

    const summary = metrics.getSummary();
    // Cost = (1M * $3.00 / 1M) + (1M * $15.00 / 1M) = $3.00 + $15.00 = $18.00
    assert.strictEqual(summary.totalEstimatedCost, 18.0);
  });

  it('should track multiple LLM calls in same level', () => {
    const metrics = new MetricsCollector();

    metrics.startLevel(3, 'Level 3');
    metrics.recordLLMCall({
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 500,
      outputTokens: 100,
    });
    metrics.recordLLMCall({
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 300,
      outputTokens: 50,
    });
    metrics.endLevel(3);

    const summary = metrics.getSummary();
    assert.strictEqual(summary.totalInputTokens, 800);
    assert.strictEqual(summary.totalOutputTokens, 150);
    assert.strictEqual(summary.totalApiCalls, 2);
  });

  it('should track files processed', () => {
    const metrics = new MetricsCollector();

    metrics.startLevel(3, 'Level 3');
    metrics.recordFilesProcessed(3, 100);
    metrics.endLevel(3);

    const summary = metrics.getSummary();
    assert.strictEqual(summary.totalFilesProcessed, 100);
    assert.strictEqual(summary.levels[0].filesProcessed, 100);
  });

  it('should track multiple levels', () => {
    const metrics = new MetricsCollector();

    // Level 1
    metrics.startLevel(1, 'Level 1');
    metrics.recordLLMCall({
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 1000,
      outputTokens: 200,
    });
    metrics.endLevel(1);

    // Level 2
    metrics.startLevel(2, 'Level 2');
    metrics.recordLLMCall({
      model: 'claude-sonnet-4-5-20250929',
      inputTokens: 2000,
      outputTokens: 500,
    });
    metrics.endLevel(2);

    // Level 3
    metrics.startLevel(3, 'Level 3');
    metrics.recordLLMCall({
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 5000,
      outputTokens: 1000,
    });
    metrics.recordFilesProcessed(3, 50);
    metrics.endLevel(3);

    const summary = metrics.getSummary();
    assert.strictEqual(summary.levels.length, 3);
    assert.strictEqual(summary.totalInputTokens, 8000);
    assert.strictEqual(summary.totalOutputTokens, 1700);
    assert.strictEqual(summary.totalApiCalls, 3);
    assert.strictEqual(summary.totalFilesProcessed, 50);
  });

  it('should calculate cost by model correctly', () => {
    const metrics = new MetricsCollector();

    metrics.startLevel(1, 'Level 1');
    metrics.recordLLMCall({
      model: 'claude-haiku-4-5-20251001',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    metrics.endLevel(1);

    metrics.startLevel(2, 'Level 2');
    metrics.recordLLMCall({
      model: 'claude-sonnet-4-5-20250929',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });
    metrics.endLevel(2);

    const summary = metrics.getSummary();
    assert.strictEqual(summary.costByModel['claude-haiku-4-5-20251001'], 1.5);
    assert.strictEqual(summary.costByModel['claude-sonnet-4-5-20250929'], 18.0);
  });

  it('should complete and set end time', () => {
    const metrics = new MetricsCollector();

    metrics.startLevel(1, 'Level 1');
    metrics.endLevel(1);

    let summary = metrics.getSummary();
    assert.strictEqual(summary.completedAt, undefined);

    metrics.complete();

    summary = metrics.getSummary();
    assert.ok(summary.completedAt !== undefined);
    assert.ok(summary.totalDurationMs !== undefined);
    assert.ok(summary.totalDurationMin !== undefined);
  });

  it('should round duration minutes to 1 decimal place', () => {
    const metrics = new MetricsCollector();

    metrics.startLevel(1, 'Level 1');
    metrics.endLevel(1);

    // Wait a bit
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    wait(100).then(() => {
      metrics.complete();
      const summary = metrics.getSummary();

      // Should have a duration in minutes
      assert.ok(summary.totalDurationMin !== undefined);

      // Should be rounded to 1 decimal place
      const rounded = Math.round(summary.totalDurationMin! * 10) / 10;
      assert.strictEqual(summary.totalDurationMin, rounded);
    });
  });

  it('should handle levels without metrics gracefully', () => {
    const metrics = new MetricsCollector();

    metrics.startLevel(0, 'Level 0');
    // No LLM calls or file processing
    metrics.endLevel(0);

    const summary = metrics.getSummary();
    assert.strictEqual(summary.levels[0].inputTokens, 0);
    assert.strictEqual(summary.levels[0].outputTokens, 0);
    assert.strictEqual(summary.levels[0].apiCalls, 0);
    assert.strictEqual(summary.levels[0].estimatedCost, 0);
  });
});
