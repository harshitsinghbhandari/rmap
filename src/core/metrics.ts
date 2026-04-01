/**
 * Metrics Collection for rmap Pipeline
 *
 * Tracks API usage, token consumption, costs, and performance metrics
 * across all levels of the map generation pipeline.
 */

/**
 * Model pricing in USD per million tokens
 * Based on Claude API pricing as of January 2025
 */
export const MODEL_PRICING = {
  'claude-haiku-4-5-20251001': {
    input: 0.25,  // $0.25 per 1M input tokens
    output: 1.25, // $1.25 per 1M output tokens
  },
  'claude-sonnet-4-5-20250929': {
    input: 3.0,   // $3.00 per 1M input tokens
    output: 15.0, // $15.00 per 1M output tokens
  },
} as const;

/**
 * Metrics for a single level
 */
export interface LevelMetrics {
  /** Level number (0-4) */
  level: number;
  /** Level name/description */
  name: string;
  /** Start timestamp (ISO 8601) */
  startedAt: string;
  /** End timestamp (ISO 8601) */
  completedAt?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Number of input tokens consumed */
  inputTokens: number;
  /** Number of output tokens generated */
  outputTokens: number;
  /** Number of API calls made */
  apiCalls: number;
  /** Model used for this level */
  model?: string;
  /** Number of files processed (for Level 3) */
  filesProcessed?: number;
  /** Estimated cost in USD */
  estimatedCost: number;
}

/**
 * Summary of all metrics across the pipeline
 */
export interface MetricsSummary {
  /** Start timestamp of entire pipeline (ISO 8601) */
  startedAt: string;
  /** End timestamp of entire pipeline (ISO 8601) */
  completedAt?: string;
  /** Total duration in milliseconds */
  totalDurationMs?: number;
  /** Total duration in minutes (formatted) */
  totalDurationMin?: number;
  /** Metrics for each level */
  levels: LevelMetrics[];
  /** Total input tokens across all levels */
  totalInputTokens: number;
  /** Total output tokens across all levels */
  totalOutputTokens: number;
  /** Total API calls across all levels */
  totalApiCalls: number;
  /** Total files processed */
  totalFilesProcessed: number;
  /** Total estimated cost in USD */
  totalEstimatedCost: number;
  /** Breakdown of cost by model */
  costByModel: Record<string, number>;
}

/**
 * LLM call details for tracking
 */
export interface LLMCallMetrics {
  /** Model used */
  model: string;
  /** Input tokens */
  inputTokens: number;
  /** Output tokens */
  outputTokens: number;
}

/**
 * MetricsCollector tracks all metrics during pipeline execution
 *
 * @example
 * ```typescript
 * const metrics = new MetricsCollector();
 * metrics.startLevel(1, 'Level 1: Structure Detector');
 * // ... do work ...
 * metrics.recordLLMCall({ model: 'claude-haiku-4-5-20251001', inputTokens: 1000, outputTokens: 200 });
 * metrics.endLevel(1);
 * const summary = metrics.getSummary();
 * ```
 */
export class MetricsCollector {
  private startTime: Date;
  private endTime?: Date;
  private levelMetrics: Map<number, LevelMetrics>;
  private currentLevel?: number;

  constructor() {
    this.startTime = new Date();
    this.levelMetrics = new Map();
  }

  /**
   * Start tracking a level
   *
   * @param level - Level number (0-4)
   * @param name - Level name/description
   */
  startLevel(level: number, name: string): void {
    this.currentLevel = level;
    this.levelMetrics.set(level, {
      level,
      name,
      startedAt: new Date().toISOString(),
      inputTokens: 0,
      outputTokens: 0,
      apiCalls: 0,
      estimatedCost: 0,
    });
  }

  /**
   * End tracking a level
   *
   * @param level - Level number (0-4)
   */
  endLevel(level: number): void {
    const metrics = this.levelMetrics.get(level);
    if (!metrics) {
      console.warn(`No metrics found for level ${level}`);
      return;
    }

    const completedAt = new Date();
    metrics.completedAt = completedAt.toISOString();
    metrics.durationMs = completedAt.getTime() - new Date(metrics.startedAt).getTime();

    // Clear current level if it matches
    if (this.currentLevel === level) {
      this.currentLevel = undefined;
    }
  }

  /**
   * Record an LLM API call
   *
   * @param callMetrics - Details of the LLM call
   */
  recordLLMCall(callMetrics: LLMCallMetrics): void {
    if (this.currentLevel === undefined) {
      console.warn('No current level set when recording LLM call');
      return;
    }

    const metrics = this.levelMetrics.get(this.currentLevel);
    if (!metrics) {
      console.warn(`No metrics found for current level ${this.currentLevel}`);
      return;
    }

    // Update token counts
    metrics.inputTokens += callMetrics.inputTokens;
    metrics.outputTokens += callMetrics.outputTokens;
    metrics.apiCalls += 1;

    // Update model (use the most recent one)
    metrics.model = callMetrics.model;

    // Calculate cost
    const pricing = MODEL_PRICING[callMetrics.model as keyof typeof MODEL_PRICING];
    if (pricing) {
      const inputCost = (callMetrics.inputTokens / 1_000_000) * pricing.input;
      const outputCost = (callMetrics.outputTokens / 1_000_000) * pricing.output;
      metrics.estimatedCost += inputCost + outputCost;
    }
  }

  /**
   * Record files processed for a level (mainly Level 3)
   *
   * @param level - Level number
   * @param fileCount - Number of files processed
   */
  recordFilesProcessed(level: number, fileCount: number): void {
    const metrics = this.levelMetrics.get(level);
    if (metrics) {
      metrics.filesProcessed = fileCount;
    }
  }

  /**
   * Mark the entire pipeline as complete
   */
  complete(): void {
    this.endTime = new Date();
  }

  /**
   * Get a summary of all metrics
   *
   * @returns Complete metrics summary
   */
  getSummary(): MetricsSummary {
    const endTime = this.endTime || new Date();
    const totalDurationMs = endTime.getTime() - this.startTime.getTime();

    // Sort levels by level number
    const levels = Array.from(this.levelMetrics.values()).sort((a, b) => a.level - b.level);

    // Calculate totals
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalApiCalls = 0;
    let totalFilesProcessed = 0;
    let totalEstimatedCost = 0;
    const costByModel: Record<string, number> = {};

    for (const level of levels) {
      totalInputTokens += level.inputTokens;
      totalOutputTokens += level.outputTokens;
      totalApiCalls += level.apiCalls;
      totalFilesProcessed += level.filesProcessed || 0;
      totalEstimatedCost += level.estimatedCost;

      // Track cost by model
      if (level.model && level.estimatedCost > 0) {
        costByModel[level.model] = (costByModel[level.model] || 0) + level.estimatedCost;
      }
    }

    return {
      startedAt: this.startTime.toISOString(),
      completedAt: this.endTime?.toISOString(),
      totalDurationMs,
      totalDurationMin: Math.round((totalDurationMs / 1000 / 60) * 10) / 10, // Round to 1 decimal
      levels,
      totalInputTokens,
      totalOutputTokens,
      totalApiCalls,
      totalFilesProcessed,
      totalEstimatedCost,
      costByModel,
    };
  }

  /**
   * Get the start time of the pipeline
   */
  getStartTime(): Date {
    return this.startTime;
  }
}
