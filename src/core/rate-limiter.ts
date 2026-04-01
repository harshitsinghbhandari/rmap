/**
 * Global Rate Limiter using Token Bucket Algorithm
 *
 * Prevents hitting API rate limits by throttling concurrent requests.
 * Uses two separate buckets:
 * - Request bucket: limits requests per minute
 * - Token bucket: limits input tokens per minute
 *
 * This is a global singleton shared across all Level 3 tasks to prevent
 * overwhelming the API with parallel processing (25 tasks × 10 concurrent = 250 potential requests).
 */

import { RATE_LIMIT } from '../config/index.js';

/**
 * Token bucket for rate limiting with continuous refill
 *
 * Implements a token bucket algorithm where:
 * - Tokens refill continuously at a constant rate (not reset every minute)
 * - Requests wait if insufficient tokens available
 * - Prevents bursts while allowing smooth throughput
 * - Allows requests larger than capacity by going into debt
 *
 * @example
 * ```typescript
 * const bucket = new TokenBucket(30, 30); // 30 tokens, 30 per minute
 * await bucket.acquire(1); // Acquires 1 token, waits if needed
 * await bucket.acquire(40); // Waits ~1.3 minutes for 40 tokens
 * ```
 */
export class TokenBucket {
  private tokens: number;
  private readonly capacity: number;
  private readonly refillRatePerMs: number;
  private lastRefillTime: number;
  private pendingQueue: Array<{
    tokensNeeded: number;
    resolve: () => void;
  }> = [];
  private refillTimer: NodeJS.Timeout | null = null;

  /**
   * Create a new token bucket
   *
   * @param capacity - Maximum number of tokens the bucket can hold
   * @param refillRatePerMinute - Rate at which tokens are added per minute
   */
  constructor(capacity: number, refillRatePerMinute: number) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRatePerMs = refillRatePerMinute / 60_000; // Convert to per-millisecond
    this.lastRefillTime = Date.now();
  }

  /**
   * Refill the bucket based on elapsed time
   *
   * Tokens are added continuously based on time elapsed since last refill.
   * When there's a pending queue, we don't cap at capacity to allow
   * large requests to be fulfilled.
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    const tokensToAdd = elapsed * this.refillRatePerMs;

    // If there's a queue, allow exceeding capacity to fulfill large requests
    if (this.pendingQueue.length > 0) {
      this.tokens += tokensToAdd;
    } else {
      // Otherwise, cap at capacity
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    }
    this.lastRefillTime = now;
  }

  /**
   * Process the pending queue and resolve any requests that can now proceed
   */
  private processPendingQueue(): void {
    while (this.pendingQueue.length > 0) {
      const next = this.pendingQueue[0];
      if (this.tokens >= next.tokensNeeded) {
        this.tokens -= next.tokensNeeded;
        this.pendingQueue.shift();
        next.resolve();
      } else {
        break;
      }
    }

    // Clear timer if queue is empty
    if (this.pendingQueue.length === 0 && this.refillTimer !== null) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
      // Cap tokens at capacity now that queue is empty
      this.tokens = Math.min(this.capacity, this.tokens);
    }
  }

  /**
   * Start the shared refill timer if not already running
   */
  private ensureRefillTimer(): void {
    if (this.refillTimer === null && this.pendingQueue.length > 0) {
      this.refillTimer = setInterval(() => {
        this.refill();
        this.processPendingQueue();
      }, 100); // Check every 100ms
    }
  }

  /**
   * Acquire tokens from the bucket
   *
   * If insufficient tokens available, waits until enough tokens refill.
   * Implements fair FIFO queuing for waiting requests.
   *
   * Large requests (exceeding capacity) are allowed and will wait across
   * multiple refill windows. The bucket temporarily exceeds capacity while
   * processing such requests.
   *
   * @param tokensNeeded - Number of tokens to acquire
   * @returns Promise that resolves when tokens are acquired
   */
  async acquire(tokensNeeded: number): Promise<void> {
    this.refill();

    // Fast path: if enough tokens and no queue, proceed immediately
    if (this.tokens >= tokensNeeded && this.pendingQueue.length === 0) {
      this.tokens -= tokensNeeded;
      return;
    }

    // Otherwise, join the queue and wait
    return new Promise<void>((resolve) => {
      this.pendingQueue.push({ tokensNeeded, resolve });
      this.ensureRefillTimer();
    });
  }

  /**
   * Get current token count (for testing/debugging)
   */
  getCurrentTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Get bucket capacity (for testing/debugging)
   */
  getCapacity(): number {
    return this.capacity;
  }
}

/**
 * Configuration for rate limiter
 */
export interface RateLimiterConfig {
  /** Maximum requests per minute */
  requestsPerMinute: number;
  /** Maximum input tokens per minute */
  inputTokensPerMinute: number;
}

/**
 * Global rate limiter with dual token buckets
 *
 * Enforces both request-per-minute and token-per-minute limits simultaneously.
 * Both limits must be satisfied before a request can proceed.
 *
 * @example
 * ```typescript
 * const limiter = new RateLimiter({
 *   requestsPerMinute: 30,
 *   inputTokensPerMinute: 18000
 * });
 *
 * // Before API call:
 * const estimatedTokens = estimateTokens(prompt);
 * await limiter.acquire(estimatedTokens);
 * // Now make the API call
 * ```
 */
export class RateLimiter {
  private requestBucket: TokenBucket;
  private tokenBucket: TokenBucket;

  constructor(config: RateLimiterConfig) {
    this.requestBucket = new TokenBucket(
      config.requestsPerMinute,
      config.requestsPerMinute
    );
    this.tokenBucket = new TokenBucket(
      config.inputTokensPerMinute,
      config.inputTokensPerMinute
    );
  }

  /**
   * Acquire capacity for both request count and token count
   *
   * Waits until both buckets have sufficient capacity.
   * Acquires from both buckets atomically - if token acquisition would fail,
   * the request token is not consumed.
   *
   * @param estimatedInputTokens - Estimated number of input tokens for this request
   */
  async acquire(estimatedInputTokens: number): Promise<void> {
    // Acquire token capacity first (may wait across multiple windows for large prompts)
    await this.tokenBucket.acquire(estimatedInputTokens);

    // Then acquire request capacity (guaranteed to succeed since capacity >= 1)
    await this.requestBucket.acquire(1);
  }

  /**
   * Get current state of buckets (for testing/debugging)
   */
  getState(): {
    requests: { current: number; capacity: number };
    tokens: { current: number; capacity: number };
  } {
    return {
      requests: {
        current: this.requestBucket.getCurrentTokens(),
        capacity: this.requestBucket.getCapacity(),
      },
      tokens: {
        current: this.tokenBucket.getCurrentTokens(),
        capacity: this.tokenBucket.getCapacity(),
      },
    };
  }
}

/**
 * Estimate token count from text
 *
 * Uses a simple heuristic: ~4 characters per token (conservative estimate).
 * This is an approximation; actual token count may vary.
 *
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Global rate limiter instance
 *
 * Singleton shared across all LLM API calls to enforce global rate limits.
 * This prevents parallel Level 3 tasks from overwhelming the API.
 */
export const globalRateLimiter = new RateLimiter({
  requestsPerMinute: RATE_LIMIT.REQUESTS_PER_MINUTE,
  inputTokensPerMinute: RATE_LIMIT.INPUT_TOKENS_PER_MINUTE,
});
