/**
 * Latency Tracker for LLM Calls
 *
 * Tracks detailed latency and token metrics for all LLM API calls,
 * providing per-call tracking and level/task aggregation.
 */

/**
 * Individual LLM call record
 */
export interface LLMCallRecord {
  /** Timestamp when call started (ISO 8601) */
  startedAt: string;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Input tokens sent */
  inputTokens: number;
  /** Output tokens received */
  outputTokens: number;
  /** Tokens per second (output tokens / latency) */
  tokensPerSecond: number;
  /** Model used */
  model: string;
  /** Level (1, 2, or 3) */
  level: number;
  /** Task/file ID (for Level 3) */
  taskId?: string;
}

/**
 * Aggregated metrics for a level
 */
export interface LevelLatencyMetrics {
  /** Level number */
  level: number;
  /** Level name */
  name: string;
  /** Total number of LLM calls */
  callCount: number;
  /** Total input tokens */
  totalInputTokens: number;
  /** Total output tokens */
  totalOutputTokens: number;
  /** Total latency in milliseconds */
  totalLatencyMs: number;
  /** Average latency per call in milliseconds */
  avgLatencyMs: number;
  /** Average tokens per second */
  avgTokensPerSecond: number;
  /** Individual call records */
  calls: LLMCallRecord[];
}

/**
 * Task-level metrics for Level 3
 */
export interface TaskLatencyMetrics {
  /** Task/file identifier */
  taskId: string;
  /** Number of LLM calls for this task */
  callCount: number;
  /** Total input tokens */
  inputTokens: number;
  /** Total output tokens */
  outputTokens: number;
  /** Total latency in milliseconds */
  totalLatencyMs: number;
  /** Average tokens per second */
  avgTokensPerSecond: number;
}

/**
 * Complete latency summary
 */
export interface LatencySummary {
  /** Metrics per level */
  levels: LevelLatencyMetrics[];
  /** Per-task breakdown for Level 3 */
  level3Tasks: TaskLatencyMetrics[];
  /** Total calls across all levels */
  totalCalls: number;
  /** Total input tokens */
  totalInputTokens: number;
  /** Total output tokens */
  totalOutputTokens: number;
  /** Total latency in milliseconds */
  totalLatencyMs: number;
  /** Overall average tokens per second */
  avgTokensPerSecond: number;
}

/**
 * Map level strings to numbers
 */
function parseLevelNumber(level: string): number {
  const match = level.match(/level(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Level names for display
 */
const LEVEL_NAMES: Record<number, string> = {
  1: 'Detection',
  2: 'Division',
  3: 'Annotation',
};

/**
 * LatencyTracker collects and aggregates LLM call latency data
 *
 * @example
 * ```typescript
 * const tracker = new LatencyTracker();
 *
 * // Record a call
 * tracker.recordCall({
 *   startedAt: new Date().toISOString(),
 *   latencyMs: 1200,
 *   inputTokens: 5000,
 *   outputTokens: 800,
 *   tokensPerSecond: 666.67,
 *   model: 'claude-haiku-4-5-20251001',
 *   level: 1
 * });
 *
 * // Get summary
 * const summary = tracker.getSummary();
 * ```
 */
export class LatencyTracker {
  private calls: LLMCallRecord[] = [];
  private enabled: boolean = true;

  /**
   * Enable or disable tracking
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if tracking is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Record an LLM call with latency data
   *
   * @param record - Call record with all metrics
   */
  recordCall(record: LLMCallRecord): void {
    if (!this.enabled) return;
    this.calls.push(record);
  }

  /**
   * Get all recorded calls
   */
  getCalls(): LLMCallRecord[] {
    return [...this.calls];
  }

  /**
   * Get metrics aggregated by level
   */
  getLevelMetrics(): LevelLatencyMetrics[] {
    const levelMap = new Map<number, LLMCallRecord[]>();

    // Group calls by level
    for (const call of this.calls) {
      const existing = levelMap.get(call.level) || [];
      existing.push(call);
      levelMap.set(call.level, existing);
    }

    // Build metrics for each level
    const metrics: LevelLatencyMetrics[] = [];
    for (const [level, calls] of levelMap.entries()) {
      const totalInputTokens = calls.reduce((sum, c) => sum + c.inputTokens, 0);
      const totalOutputTokens = calls.reduce((sum, c) => sum + c.outputTokens, 0);
      const totalLatencyMs = calls.reduce((sum, c) => sum + c.latencyMs, 0);
      const avgLatencyMs = calls.length > 0 ? totalLatencyMs / calls.length : 0;
      const avgTokensPerSecond =
        totalLatencyMs > 0 ? (totalOutputTokens / totalLatencyMs) * 1000 : 0;

      metrics.push({
        level,
        name: LEVEL_NAMES[level] || `Level ${level}`,
        callCount: calls.length,
        totalInputTokens,
        totalOutputTokens,
        totalLatencyMs,
        avgLatencyMs,
        avgTokensPerSecond,
        calls,
      });
    }

    // Sort by level number
    return metrics.sort((a, b) => a.level - b.level);
  }

  /**
   * Get per-task metrics for Level 3
   */
  getLevel3TaskMetrics(): TaskLatencyMetrics[] {
    const taskMap = new Map<string, LLMCallRecord[]>();

    // Group Level 3 calls by taskId
    for (const call of this.calls) {
      if (call.level === 3 && call.taskId) {
        const existing = taskMap.get(call.taskId) || [];
        existing.push(call);
        taskMap.set(call.taskId, existing);
      }
    }

    // Build metrics for each task
    const metrics: TaskLatencyMetrics[] = [];
    for (const [taskId, calls] of taskMap.entries()) {
      const inputTokens = calls.reduce((sum, c) => sum + c.inputTokens, 0);
      const outputTokens = calls.reduce((sum, c) => sum + c.outputTokens, 0);
      const totalLatencyMs = calls.reduce((sum, c) => sum + c.latencyMs, 0);
      const avgTokensPerSecond =
        totalLatencyMs > 0 ? (outputTokens / totalLatencyMs) * 1000 : 0;

      metrics.push({
        taskId,
        callCount: calls.length,
        inputTokens,
        outputTokens,
        totalLatencyMs,
        avgTokensPerSecond,
      });
    }

    // Sort by total latency (slowest first)
    return metrics.sort((a, b) => b.totalLatencyMs - a.totalLatencyMs);
  }

  /**
   * Get top N slowest tasks for Level 3
   *
   * @param n - Number of tasks to return (default: 5)
   */
  getSlowestTasks(n: number = 5): TaskLatencyMetrics[] {
    return this.getLevel3TaskMetrics().slice(0, n);
  }

  /**
   * Get complete latency summary
   */
  getSummary(): LatencySummary {
    const levels = this.getLevelMetrics();
    const level3Tasks = this.getLevel3TaskMetrics();

    const totalCalls = this.calls.length;
    const totalInputTokens = this.calls.reduce((sum, c) => sum + c.inputTokens, 0);
    const totalOutputTokens = this.calls.reduce((sum, c) => sum + c.outputTokens, 0);
    const totalLatencyMs = this.calls.reduce((sum, c) => sum + c.latencyMs, 0);
    const avgTokensPerSecond =
      totalLatencyMs > 0 ? (totalOutputTokens / totalLatencyMs) * 1000 : 0;

    return {
      levels,
      level3Tasks,
      totalCalls,
      totalInputTokens,
      totalOutputTokens,
      totalLatencyMs,
      avgTokensPerSecond,
    };
  }

  /**
   * Reset all recorded data
   */
  reset(): void {
    this.calls = [];
  }
}

/**
 * Global singleton instance for tracking across all LLM calls
 */
export const globalLatencyTracker = new LatencyTracker();

/**
 * Helper to extract taskId from log context purpose string
 *
 * Level 3 purposes are formatted as:
 * - "File annotation - extracts purpose, tags, exports, and imports for: src/core/file.ts"
 * - "Tag correction retry 1/2 for: src/core/file.ts"
 *
 * @param purpose - Purpose string from log context
 * @returns Task ID (file path) or undefined
 */
export function extractTaskIdFromPurpose(purpose: string): string | undefined {
  // Match "for: <path>" at end of purpose string
  const match = purpose.match(/for:\s*(.+)$/);
  return match ? match[1].trim() : undefined;
}
