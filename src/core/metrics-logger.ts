/**
 * Metrics Logger
 *
 * Writes metrics to log files in .repo_map/logs/ directory
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MetricsSummary } from './metrics.js';

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
 * Write metrics summary to JSON log file
 *
 * Creates a timestamped log file in .repo_map/logs/ directory
 *
 * @param repoRoot - Repository root path
 * @param summary - Metrics summary to write
 * @returns Path to the written log file
 */
export function writeMetricsLog(repoRoot: string, summary: MetricsSummary): string {
  // Create logs directory if it doesn't exist
  const logsDir = path.join(repoRoot, '.repo_map', 'logs');
  fs.mkdirSync(logsDir, { recursive: true });

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
  const filename = `run-${timestamp}.json`;
  const filepath = path.join(logsDir, filename);

  // Write detailed JSON log
  fs.writeFileSync(filepath, JSON.stringify(summary, null, 2), 'utf-8');

  // Also write/overwrite latest.json for quick access
  const latestPath = path.join(logsDir, 'latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(summary, null, 2), 'utf-8');

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
