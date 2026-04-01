/**
 * Concurrency Pool for Rate-Limited Parallel Processing
 *
 * Manages concurrent execution of async tasks with configurable limits.
 * Useful for processing multiple API calls while respecting rate limits.
 */

import { CONCURRENCY } from '../config/index.js';

/**
 * Result of a task execution — discriminated union on `success`
 */
export type TaskResult<T> =
  | { index: number; success: true; value: T }
  | { index: number; success: false; error: Error };

/**
 * Options for ConcurrencyPool
 */
export interface ConcurrencyPoolOptions {
  /** Maximum number of concurrent tasks (default: 10) */
  concurrency?: number;
  /** Delay in ms between starting each task (default: 0) */
  delayBetweenTasks?: number;
  /** Whether to stop on first error (default: false) */
  stopOnError?: boolean;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ConcurrencyPool manages parallel execution of async tasks with rate limiting
 *
 * @example
 * ```typescript
 * const pool = new ConcurrencyPool({ concurrency: 10, delayBetweenTasks: 100 });
 * const results = await pool.run(
 *   files,
 *   async (file, index) => await processFile(file)
 * );
 * ```
 */
export class ConcurrencyPool<T, R> {
  private concurrency: number;
  private delayBetweenTasks: number;
  private stopOnError: boolean;

  constructor(options: ConcurrencyPoolOptions = {}) {
    const defaultConcurrency = CONCURRENCY.MAX_PARALLEL_FILES;
    const configuredConcurrency =
      options.concurrency !== undefined ? Number(options.concurrency) : defaultConcurrency;
    this.concurrency = Number.isFinite(configuredConcurrency)
      ? Math.max(1, Math.floor(configuredConcurrency))
      : defaultConcurrency;
    this.delayBetweenTasks = options.delayBetweenTasks ?? 0;
    this.stopOnError = options.stopOnError ?? false;
  }

  /**
   * Run tasks concurrently with the configured limit
   *
   * @param items - Array of items to process
   * @param task - Async function that processes each item
   * @returns Array of TaskResult objects with success/error status
   */
  async run(
    items: T[],
    task: (item: T, index: number) => Promise<R>
  ): Promise<TaskResult<R>[]> {
    const resultMap = new Map<number, TaskResult<R>>();
    const executing = new Set<Promise<void>>();
    let stopped = false;

    for (let i = 0; i < items.length; i++) {
      if (stopped) break;

      // Create task wrapper that stores result and removes itself from executing set
      const taskPromise = (async (index: number) => {
        try {
          const value = await task(items[index], index);
          resultMap.set(index, { index, value, success: true });
        } catch (error) {
          resultMap.set(index, {
            index,
            error: error instanceof Error ? error : new Error(String(error)),
            success: false,
          });

          if (this.stopOnError) {
            stopped = true;
          }
        }
      })(i);

      // Add promise to executing set and ensure it removes itself when done
      const wrappedPromise = taskPromise.then(() => {
        executing.delete(wrappedPromise);
      }).catch(() => {
        executing.delete(wrappedPromise);
      });

      executing.add(wrappedPromise);

      // Wait if we've reached the concurrency limit
      if (executing.size >= this.concurrency) {
        await Promise.race(executing);
      }

      // Apply delay between task starts
      if (this.delayBetweenTasks > 0 && i < items.length - 1) {
        await sleep(this.delayBetweenTasks);
      }
    }

    // Wait for all remaining tasks to complete
    await Promise.all(Array.from(executing));

    // Return results in input order, omitting indices never started (stopOnError).
    const results: TaskResult<R>[] = [];
    for (let i = 0; i < items.length; i++) {
      const result = resultMap.get(i);
      if (result !== undefined) results.push(result);
    }
    return results;
  }

  /**
   * Run tasks and return only successful results, filtering out errors
   *
   * @param items - Array of items to process
   * @param task - Async function that processes each item
   * @returns Array of successful results only
   */
  async runAndFilter(
    items: T[],
    task: (item: T, index: number) => Promise<R>
  ): Promise<R[]> {
    const results = await this.run(items, task);
    return results
      .filter((r): r is Extract<TaskResult<R>, { success: true }> => r.success)
      .map((r) => r.value);
  }

  /**
   * Run tasks and collect both successes and failures separately
   *
   * @param items - Array of items to process
   * @param task - Async function that processes each item
   * @returns Object with successful results and errors
   */
  async runWithStats(
    items: T[],
    task: (item: T, index: number) => Promise<R>
  ): Promise<{
    successes: R[];
    failures: Array<{ item: T; index: number; error: Error }>;
    successCount: number;
    failureCount: number;
  }> {
    const results = await this.run(items, task);
    const successes: R[] = [];
    const failures: Array<{ item: T; index: number; error: Error }> = [];

    results.forEach((result) => {
      if (result.success) {
        successes.push(result.value);
      } else {
        failures.push({
          item: items[result.index],
          index: result.index,
          error: result.error,
        });
      }
    });

    return {
      successes,
      failures,
      successCount: successes.length,
      failureCount: failures.length,
    };
  }
}
