/**
 * Metrics Logger
 *
 * Writes metrics to log files in .repo_map/logs/ directory
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MetricsSummary } from './metrics.js';
import { globalLatencyTracker, type LatencySummary } from './latency-tracker.js';

/**
 * Format cost as USD string
 */
function formatCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

/**
 * Format duration in human-readable form
 */
function formatDuration(durationMs: number): string {
  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Format token count with commas
 */
function formatTokens(tokens: number): string {
  return tokens.toLocaleString();
}

/**
 * Format latency with appropriate units
 */
function formatLatency(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${Math.round(remainingSeconds)}s`;
}

/**
 * Format tokens per second
 */
function formatTokPerSec(tokPerSec: number): string {
  return `${Math.round(tokPerSec)} tok/s`;
}

/**
 * Extended metrics summary with latency data
 */
export interface ExtendedMetricsSummary extends MetricsSummary {
  latency?: LatencySummary;
}

/**
 * Write metrics summary to JSON log file
 *
 * Creates a timestamped log file in .repo_map/logs/ directory
 *
 * @param repoRoot - Repository root path
 * @param summary - Metrics summary to write
 * @param includeLatency - Whether to include latency tracking data (default: true)
 * @returns Path to the written log file
 */
export function writeMetricsLog(
  repoRoot: string,
  summary: MetricsSummary,
  includeLatency: boolean = true
): string {
  // Create logs directory if it doesn't exist
  const logsDir = path.join(repoRoot, '.repo_map', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(TIMESTAMP_REGEX, '-').split('.')[0];
  const filename = `run-${timestamp}.json`;
  const filepath = path.join(logsDir, filename);

  // Build extended summary with latency data
  const extendedSummary: ExtendedMetricsSummary = { ...summary };
  if (includeLatency) {
    extendedSummary.latency = globalLatencyTracker.getSummary();
  }

  // Write detailed JSON log
  fs.writeFileSync(filepath, JSON.stringify(extendedSummary, null, 2), 'utf-8');

  // Also write/overwrite latest.json for quick access
  const latestPath = path.join(logsDir, 'latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(extendedSummary, null, 2), 'utf-8');

  return filepath;
}

/**
 * Generate a human-readable summary string for CLI output
 *
 * @param summary - Metrics summary
 * @param logPath - Path to the detailed log file
 * @returns Formatted summary string
 */
export function formatMetricsSummary(summary: MetricsSummary, logPath: string): string {
  const duration = summary.totalDurationMs ? formatDuration(summary.totalDurationMs) : 'N/A';
  const totalTokens = summary.totalInputTokens + summary.totalOutputTokens;

  let output = '\n📊 Metrics Summary\n';
  output += '═'.repeat(60) + '\n';
  output += `Duration:     ${duration}\n`;
  output += `Files:        ${summary.totalFilesProcessed} processed\n`;
  output += `API Calls:    ${summary.totalApiCalls}\n`;
  output += `Tokens:       ${formatTokens(totalTokens)} (input: ${formatTokens(summary.totalInputTokens)}, output: ${formatTokens(summary.totalOutputTokens)})\n`;
  output += `Est. Cost:    ${formatCost(summary.totalEstimatedCost)}\n`;

  // Breakdown by model if multiple models used
  const modelCount = Object.keys(summary.costByModel).length;
  if (modelCount > 1) {
    output += '\nCost Breakdown:\n';
    for (const [model, cost] of Object.entries(summary.costByModel)) {
      const modelName = model.includes('haiku') ? 'Haiku' : 'Sonnet';
      output += `  ${modelName}: ${formatCost(cost)}\n`;
    }
  }

  output += `\nDetailed log: ${path.relative(process.cwd(), logPath)}\n`;

  return output;
}

/**
 * Print a compact metrics summary to console
 *
 * This is the minimal output shown at the end of `rmap map`
 *
 * @param summary - Metrics summary
 * @param filesAnnotated - Number of files successfully annotated
 * @param logPath - Path to the detailed log file
 */
export function printCompactSummary(
  summary: MetricsSummary,
  filesAnnotated: number,
  logPath: string
): void {
  const duration = summary.totalDurationMs ? formatDuration(summary.totalDurationMs) : 'N/A';
  const totalTokens = summary.totalInputTokens + summary.totalOutputTokens;

  console.log(`\nMap created successfully (${duration})`);
  console.log(`  Files: ${filesAnnotated} processed`);
  console.log(`  Tokens: ${formatTokens(totalTokens)} (input: ${formatTokens(summary.totalInputTokens)}, output: ${formatTokens(summary.totalOutputTokens)})`);
  console.log(`  Cost: ${formatCost(summary.totalEstimatedCost)}`);
  console.log(`  Log: ${path.relative(process.cwd(), logPath)}`);
}

/**
 * Get the latest metrics log
 *
 * @param repoRoot - Repository root path
 * @returns Metrics summary from latest run, or null if not found
 */
export function getLatestMetrics(repoRoot: string): MetricsSummary | null {
  try {
    const latestPath = path.join(repoRoot, '.repo_map', 'logs', 'latest.json');
    if (!fs.existsSync(latestPath)) {
      return null;
    }

    const content = fs.readFileSync(latestPath, 'utf-8');
    return JSON.parse(content) as MetricsSummary;
  } catch (error) {
    console.warn('Failed to read latest metrics:', error);
    return null;
  }
}

/**
 * Format and print the LLM latency analysis
 *
 * Displays a detailed breakdown of latency and token metrics
 * organized by level, with per-task details for Level 3.
 */
export function printLatencyAnalysis(): void {
  const summary = globalLatencyTracker.getSummary();

  if (summary.totalCalls === 0) {
    return; // No calls recorded
  }

  console.log('\n' + '═'.repeat(40));
  console.log('  LLM LATENCY ANALYSIS');
  console.log('═'.repeat(40));

  // Print metrics for each level
  for (const level of summary.levels) {
    console.log(`\nLevel ${level.level} (${level.name}):`);
    console.log(
      `  Calls: ${level.callCount} | ` +
        `Input: ${formatTokens(level.totalInputTokens)} tok | ` +
        `Output: ${formatTokens(level.totalOutputTokens)} tok`
    );
    console.log(
      `  Total: ${formatLatency(level.totalLatencyMs)} | ` +
        `Avg: ${formatLatency(level.avgLatencyMs)}/call | ` +
        `Speed: ${formatTokPerSec(level.avgTokensPerSecond)}`
    );

    // For Level 3, show slowest tasks
    if (level.level === 3) {
      const slowestTasks = globalLatencyTracker.getSlowestTasks(5);
      if (slowestTasks.length > 0) {
        console.log('\n  Slowest tasks:');
        for (const task of slowestTasks) {
          // Truncate long paths
          const displayPath =
            task.taskId.length > 45 ? '...' + task.taskId.slice(-42) : task.taskId;
          const paddedPath = displayPath.padEnd(45);
          console.log(
            `    ${paddedPath}  ${formatLatency(task.totalLatencyMs).padStart(6)} ` +
              `(${formatTokens(task.outputTokens)} out)`
          );
        }
      }
    }
  }

  // Print totals
  console.log('\n' + '─'.repeat(40));
  console.log(
    `Total: ${formatLatency(summary.totalLatencyMs)} | ` +
      `${formatTokens(summary.totalInputTokens)} input | ` +
      `${formatTokens(summary.totalOutputTokens)} output`
  );
  console.log('═'.repeat(40));
}

/**
 * Write detailed latency log to a separate JSON file
 *
 * @param repoRoot - Repository root path
 * @returns Path to the written log file
 */
export function writeLatencyLog(repoRoot: string): string {
  const logsDir = path.join(repoRoot, '.repo_map', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
  const filename = `latency-${timestamp}.json`;
  const filepath = path.join(logsDir, filename);

  const summary = globalLatencyTracker.getSummary();
  fs.writeFileSync(filepath, JSON.stringify(summary, null, 2), 'utf-8');

  // Also write latest latency log
  const latestPath = path.join(logsDir, 'latency-latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(summary, null, 2), 'utf-8');

  return filepath;
}
