/**
 * Tests for Metrics Logger
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  writeMetricsLog,
  formatMetricsSummary,
  printCompactSummary,
  getLatestMetrics,
  printLatencyAnalysis,
  writeLatencyLog,
} from '../../src/core/metrics-logger.js';
import { globalLatencyTracker } from '../../src/core/latency-tracker.js';

describe('Metrics Logger', () => {
  let tempDir: string;

  const dummySummary = {
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    totalDurationMs: 1000,
    totalDurationMin: 0.02,
    levels: [],
    totalInputTokens: 100,
    totalOutputTokens: 50,
    totalApiCalls: 2,
    totalFilesProcessed: 5,
    totalEstimatedCost: 0.05,
    costByModel: { 'claude-haiku': 0.05 },
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rmap-metrics-test-'));
    globalLatencyTracker.reset();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    if (mock && typeof mock.restoreAll === 'function') {
      mock.restoreAll();
    }
  });

  describe('writeMetricsLog', () => {
    it('should create logs directory and write log files', () => {
      const logPath = writeMetricsLog(tempDir, dummySummary);

      const logsDir = path.join(tempDir, '.repo_map', 'logs');
      assert.ok(fs.existsSync(logsDir), 'Logs directory should be created');
      assert.ok(fs.existsSync(logPath), 'Timestamped log file should be created');

      const latestPath = path.join(logsDir, 'latest.json');
      assert.ok(fs.existsSync(latestPath), 'latest.json should be created');

      const latestContent = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
      assert.strictEqual(latestContent.totalInputTokens, dummySummary.totalInputTokens);
    });

    it('should include latency data by default', () => {
      globalLatencyTracker.recordCall({
        startedAt: new Date().toISOString(),
        latencyMs: 100,
        inputTokens: 10,
        outputTokens: 5,
        tokensPerSecond: 50,
        model: 'test-model',
        level: 1
      });

      const logPath = writeMetricsLog(tempDir, dummySummary);
      const content = JSON.parse(fs.readFileSync(logPath, 'utf-8'));

      assert.ok(content.latency, 'Latency data should be included');
      assert.strictEqual(content.latency.totalCalls, 1);
    });

    it('should exclude latency data when includeLatency is false', () => {
      const logPath = writeMetricsLog(tempDir, dummySummary, false);
      const content = JSON.parse(fs.readFileSync(logPath, 'utf-8'));

      assert.strictEqual(content.latency, undefined, 'Latency data should be excluded');
    });
  });

  describe('formatMetricsSummary', () => {
    it('should format summary string with expected metrics', () => {
      const summaryString = formatMetricsSummary(dummySummary, 'test-log.json');

      assert.ok(summaryString.includes('Duration:'), 'Should include Duration');
      assert.ok(summaryString.includes('Files:        5 processed'), 'Should include files processed');
      assert.ok(summaryString.includes('API Calls:    2'), 'Should include API calls');
      assert.ok(summaryString.includes('Tokens:       150'), 'Should include total tokens');
      assert.ok(summaryString.includes('Est. Cost:    $0.05'), 'Should include estimated cost');
    });

    it('should include cost breakdown for multiple models', () => {
      const multiModelSummary = {
        ...dummySummary,
        costByModel: {
          'claude-haiku': 0.05,
          'claude-sonnet': 0.15
        }
      };

      const summaryString = formatMetricsSummary(multiModelSummary, 'test-log.json');
      assert.ok(summaryString.includes('Cost Breakdown:'), 'Should include Cost Breakdown section');
      assert.ok(summaryString.includes('Haiku: $0.05'), 'Should include Haiku cost');
      assert.ok(summaryString.includes('Sonnet: $0.15'), 'Should include Sonnet cost');
    });
  });

  describe('getLatestMetrics', () => {
    it('should return parsed content of latest.json', () => {
      writeMetricsLog(tempDir, dummySummary);
      const latest = getLatestMetrics(tempDir);

      assert.notStrictEqual(latest, null);
      assert.strictEqual(latest?.totalInputTokens, dummySummary.totalInputTokens);
    });

    it('should return null if latest.json does not exist', () => {
      const latest = getLatestMetrics(tempDir);
      assert.strictEqual(latest, null);
    });
  });

  describe('printCompactSummary', () => {
    it('should log expected summary information', () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));

      try {
        printCompactSummary(dummySummary, 5, 'test-log.json');

        assert.ok(logs.length >= 1);
        const allLogs = logs.join('\n');
        assert.ok(allLogs.includes('Map created successfully'));
        assert.ok(allLogs.includes('Files: 5 processed'));
        assert.ok(allLogs.includes('Cost: $0.05'));
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('printLatencyAnalysis', () => {
    it('should print analysis when calls are recorded', () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));

      try {
        globalLatencyTracker.recordCall({
          startedAt: new Date().toISOString(),
          latencyMs: 100,
          inputTokens: 10,
          outputTokens: 5,
          tokensPerSecond: 50,
          model: 'test-model',
          level: 1
        });

        printLatencyAnalysis();

        const allLogs = logs.join('\n');
        assert.ok(allLogs.includes('LLM LATENCY ANALYSIS'));
        assert.ok(allLogs.includes('Level 1'));
      } finally {
        console.log = originalLog;
      }
    });

    it('should return early if no calls recorded', () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (...args) => logs.push(args.join(' '));

      try {
        printLatencyAnalysis();
        assert.strictEqual(logs.length, 0);
      } finally {
        console.log = originalLog;
      }
    });
  });

  describe('writeLatencyLog', () => {
    it('should create latency log files', () => {
      const logPath = writeLatencyLog(tempDir);

      assert.ok(fs.existsSync(logPath));
      assert.ok(fs.existsSync(path.join(tempDir, '.repo_map', 'logs', 'latency-latest.json')));
    });
  });
});
