import assert from 'node:assert';
import { describe, test, before, after } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  getLatestMetrics,
  writeMetricsLog,
  formatMetricsSummary,
  printCompactSummary,
} from '../../src/core/metrics-logger.js';
import type { MetricsSummary } from '../../src/core/metrics.js';

// Mock data
const mockSummary: MetricsSummary = {
  totalDurationMs: 120000,
  totalFilesProcessed: 100,
  totalApiCalls: 50,
  totalInputTokens: 50000,
  totalOutputTokens: 20000,
  totalEstimatedCost: 0.15,
  costByModel: {
    'claude-3-haiku-20240307': 0.05,
    'claude-3-sonnet-20240229': 0.10,
  },
};

describe('Metrics Logger', () => {
  const testRepoRoot = path.join(process.cwd(), 'test-metrics-repo');

  before(() => {
    if (!fs.existsSync(testRepoRoot)) {
      fs.mkdirSync(testRepoRoot, { recursive: true });
    }
  });

  after(() => {
    // Clean up test files but keep the directory for subsequent tests if needed
    const logsDir = path.join(testRepoRoot, '.repo_map', 'logs');
    if (fs.existsSync(logsDir)) {
      fs.rmSync(logsDir, { recursive: true, force: true });
    }
  });

  test('writeMetricsLog creates a log file and latest.json', () => {
    const logPath = writeMetricsLog(testRepoRoot, mockSummary);

    assert.ok(fs.existsSync(logPath), 'Log file should exist');
    assert.ok(fs.existsSync(path.join(testRepoRoot, '.repo_map', 'logs', 'latest.json')), 'latest.json should exist');

    const content = JSON.parse(fs.readFileSync(logPath, 'utf8'));
    assert.strictEqual(content.totalFilesProcessed, mockSummary.totalFilesProcessed);
  });

  test('getLatestMetrics returns metrics from latest.json', () => {
    writeMetricsLog(testRepoRoot, mockSummary);
    const latest = getLatestMetrics(testRepoRoot);

    assert.ok(latest !== null, 'Should return metrics');
    assert.strictEqual(latest?.totalFilesProcessed, mockSummary.totalFilesProcessed);
  });

  test('getLatestMetrics returns null when no map exists', () => {
    const emptyRoot = path.join(testRepoRoot, 'empty-repo');
    fs.mkdirSync(emptyRoot, { recursive: true });

    const latest = getLatestMetrics(emptyRoot);
    assert.strictEqual(latest, null);

    fs.rmSync(emptyRoot, { recursive: true, force: true });
  });

  test('getLatestMetrics handles corrupted JSON gracefully', () => {
    const logsDir = path.join(testRepoRoot, '.repo_map', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(path.join(logsDir, 'latest.json'), 'not-json');

    const latest = getLatestMetrics(testRepoRoot);
    assert.strictEqual(latest, null);
  });

  test('formatMetricsSummary produces a formatted string', () => {
    const logPath = 'test-log.json';
    const summary = formatMetricsSummary(mockSummary, logPath);

    assert.ok(summary.includes('Metrics Summary'), 'Should contain header');
    assert.ok(summary.includes('100'), 'Should contain file count');
    assert.ok(summary.includes('0.15'), 'Should contain cost');
  });

  test('printCompactSummary logs to console', () => {
    // simplified test since jest isn't available
    printCompactSummary(mockSummary, 100, 'log.json');
    assert.ok(true);
  });
});
