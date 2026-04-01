/**
 * LLM Client with Built-in Retry Logic
 *
 * Centralized client for making LLM API calls with exponential backoff and retry handling.
 * Eliminates duplicate retry logic across level processors.
 */

import Anthropic from '@anthropic-ai/sdk';
import { RETRY_CONFIG } from '../config/models.js';

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 5) */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff (default: 2000) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds to cap exponential backoff (default: 32000) */
  maxDelayMs?: number;
  /** Whether to add jitter to prevent thundering herd (default: true) */
  useJitter?: boolean;
}

/**
 * Options for LLM API calls
 */
export interface LLMCallOptions {
  /** Claude model to use */
  model: string;
  /** Maximum tokens in response */
  maxTokens: number;
  /** Temperature for response (0 = deterministic) */
  temperature?: number;
  /** Override retry configuration for this call */
  retryConfig?: RetryConfig;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and optional jitter
 *
 * @param attempt - Current retry attempt (1-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @param maxDelayMs - Maximum delay to cap at
 * @param useJitter - Whether to add random jitter
 * @returns Delay in milliseconds
 */
function calculateBackoff(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  useJitter: boolean
): number {
  // Exponential backoff: 2^attempt * baseDelay
  const exponentialDelay = Math.pow(2, attempt) * baseDelayMs;

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add jitter: random value between 0 and delay
  // This prevents thundering herd when multiple requests retry simultaneously
  if (useJitter) {
    return Math.random() * cappedDelay;
  }

  return cappedDelay;
}

/**
 * LLM Client with built-in retry logic
 *
 * Wraps the Anthropic SDK client and provides automatic retry handling
 * with exponential backoff for rate limit errors.
 *
 * @example
 * ```typescript
 * const client = new LLMClient(anthropicClient);
 * const response = await client.sendMessage(prompt, {
 *   model: 'claude-haiku-4-5-20251001',
 *   maxTokens: 2000
 * });
 * ```
 */
export class LLMClient {
  private client: Anthropic;
  private defaultRetryConfig: Required<RetryConfig>;

  constructor(client: Anthropic, retryConfig?: RetryConfig) {
    this.client = client;
    this.defaultRetryConfig = {
      maxRetries: retryConfig?.maxRetries ?? RETRY_CONFIG.MAX_RETRIES,
      baseDelayMs: retryConfig?.baseDelayMs ?? RETRY_CONFIG.BASE_BACKOFF_MS,
      maxDelayMs: retryConfig?.maxDelayMs ?? 32000,
      useJitter: retryConfig?.useJitter ?? true,
    };
  }

  /**
   * Send a message to the LLM with automatic retry handling
   *
   * @param prompt - The user prompt to send
   * @param options - LLM call options (model, maxTokens, etc.)
   * @returns The text response from the LLM
   * @throws Error if all retries are exhausted or non-retryable error occurs
   */
  async sendMessage(prompt: string, options: LLMCallOptions): Promise<string> {
    const config = {
      ...this.defaultRetryConfig,
      ...(options.retryConfig || {}),
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: options.model,
          max_tokens: options.maxTokens,
          temperature: options.temperature ?? 0,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        });

        // Extract text from response
        const content = response.content[0];
        if (content.type !== 'text') {
          throw new Error('Unexpected response type from Claude');
        }

        return content.text;
      } catch (error) {
        lastError = error as Error;

        // Check if it's a rate limit error
        if (error instanceof Anthropic.RateLimitError) {
          if (attempt < config.maxRetries) {
            const waitTime = calculateBackoff(
              attempt,
              config.baseDelayMs,
              config.maxDelayMs,
              config.useJitter
            );
            console.log(
              `Rate limit hit. Retrying in ${(waitTime / 1000).toFixed(1)}s... (attempt ${attempt}/${config.maxRetries})`
            );
            await sleep(waitTime);
            continue;
          }
        }

        // For other API errors, don't retry
        if (error instanceof Anthropic.APIError) {
          throw new Error(`Claude API error: ${error.message}`);
        }

        // For non-API errors, throw immediately
        throw error;
      }
    }

    throw new Error(`Failed after ${config.maxRetries} retries: ${lastError?.message}`);
  }

  /**
   * Get the underlying Anthropic client
   *
   * Useful for direct API access when retry logic is not needed
   */
  getClient(): Anthropic {
    return this.client;
  }
}

/**
 * Standalone retry wrapper function
 *
 * Alternative to LLMClient class for cases where you want to wrap
 * an existing async function with retry logic.
 *
 * @example
 * ```typescript
 * const result = await withRetry(
 *   async () => client.messages.create({...}),
 *   { maxRetries: 3 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retryConfig?: RetryConfig
): Promise<T> {
  const config: Required<RetryConfig> = {
    maxRetries: retryConfig?.maxRetries ?? RETRY_CONFIG.MAX_RETRIES,
    baseDelayMs: retryConfig?.baseDelayMs ?? RETRY_CONFIG.BASE_BACKOFF_MS,
    maxDelayMs: retryConfig?.maxDelayMs ?? 32000,
    useJitter: retryConfig?.useJitter ?? true,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if it's a rate limit error
      if (error instanceof Anthropic.RateLimitError) {
        if (attempt < config.maxRetries) {
          const waitTime = calculateBackoff(
            attempt,
            config.baseDelayMs,
            config.maxDelayMs,
            config.useJitter
          );
          console.log(
            `Rate limit hit. Retrying in ${(waitTime / 1000).toFixed(1)}s... (attempt ${attempt}/${config.maxRetries})`
          );
          await sleep(waitTime);
          continue;
        }
      }

      // For other API errors, don't retry
      if (error instanceof Anthropic.APIError) {
        throw new Error(`Claude API error: ${error.message}`);
      }

      // For non-API errors, throw immediately
      throw error;
    }
  }

  throw new Error(`Failed after ${config.maxRetries} retries: ${lastError?.message}`);
}
