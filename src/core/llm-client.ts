/**
 * LLM Client with Built-in Retry Logic
 *
 * Centralized client for making LLM API calls with exponential backoff and retry handling.
 * Supports multiple LLM providers through the provider abstraction layer.
 */

import Anthropic from '@anthropic-ai/sdk';
import { RETRY_CONFIG } from '../config/models.js';
import { RETRY } from '../config/index.js';
import { globalRateLimiter, estimateTokens } from './rate-limiter.js';
import { logPromptResponse, type PromptLogContext } from './prompt-logger.js';
import { globalLatencyTracker, extractTaskIdFromPurpose } from './latency-tracker.js';
import type { LLMProvider, ProviderType } from './providers/types.js';
import { ClaudeProvider } from './providers/claude-provider.js';
import { createProvider } from './providers/factory.js';

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 5) */
  maxRetries?: number;
  /** Base delay in milliseconds for exponential backoff (default: 2000) */
  baseDelayMs?: number;
  /** Maximum delay in milliseconds to cap exponential backoff (default: 60000) */
  maxDelayMs?: number;
  /** Initial delay in milliseconds specifically for rate limit (429) errors (default: 15000) */
  initialRateLimitDelayMs?: number;
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
  /** Logging context (level and purpose) for prompt/response logging */
  logContext?: PromptLogContext;
}

/**
 * Response from LLM API call including usage metrics
 */
export interface LLMResponse {
  /** Text content of the response */
  text: string;
  /** Number of input tokens consumed */
  inputTokens: number;
  /** Number of output tokens generated */
  outputTokens: number;
  /** Model used for this call */
  model: string;
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
 * Calculate delay for rate limit (429) errors
 *
 * Starts with a higher initial delay (default 15s) since Anthropic rate limits
 * often reset every 60 seconds. Waiting 1-2s and retrying immediately just
 * hits the limit again, wasting retry attempts.
 *
 * @param attempt - Current retry attempt (1-indexed)
 * @param initialDelayMs - Initial delay for first retry (default: 15000)
 * @param maxDelayMs - Maximum delay to cap at (default: 60000)
 * @param useJitter - Whether to add random jitter
 * @returns Delay in milliseconds
 */
function calculateRateLimitBackoff(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  useJitter: boolean
): number {
  // For rate limits, use initial delay as starting point with linear growth
  // attempt 1: initialDelayMs (15s)
  // attempt 2: initialDelayMs * 2 (30s)
  // attempt 3: initialDelayMs * 3 (45s)
  // etc., capped at maxDelayMs
  const linearDelay = initialDelayMs * attempt;

  // Cap at max delay
  const cappedDelay = Math.min(linearDelay, maxDelayMs);

  // Add jitter: ±10% to prevent thundering herd
  if (useJitter) {
    const jitter = cappedDelay * 0.1 * (Math.random() * 2 - 1); // -10% to +10%
    return Math.max(1000, cappedDelay + jitter); // Never go below 1s
  }

  return cappedDelay;
}

/**
 * LLM Client with built-in retry logic
 *
 * Wraps an LLM provider and provides automatic retry handling
 * with exponential backoff for rate limit errors.
 *
 * Supports two initialization modes:
 * 1. Legacy mode: Pass an Anthropic client directly (backward compatible)
 * 2. Provider mode: Use static factory to create with provider type
 *
 * @example Legacy mode (backward compatible)
 * ```typescript
 * const anthropicClient = new Anthropic({ apiKey });
 * const client = new LLMClient(anthropicClient);
 * ```
 *
 * @example Provider mode
 * ```typescript
 * const client = LLMClient.withProvider('anthropic');
 * const response = await client.sendMessage(prompt, {
 *   model: 'claude-haiku-4-5-20251001',
 *   maxTokens: 2000
 * });
 * ```
 */
export class LLMClient {
  private provider: LLMProvider;
  private legacyClient: Anthropic | null = null;
  private defaultRetryConfig: Required<RetryConfig>;

  /**
   * Create an LLMClient with an Anthropic client (legacy/backward compatible)
   *
   * @param client - Anthropic SDK client instance
   * @param retryConfig - Optional retry configuration
   */
  constructor(client: Anthropic, retryConfig?: RetryConfig);

  /**
   * Create an LLMClient with an LLM provider
   *
   * @param provider - LLM provider instance
   * @param retryConfig - Optional retry configuration
   */
  constructor(provider: LLMProvider, retryConfig?: RetryConfig);

  constructor(clientOrProvider: Anthropic | LLMProvider, retryConfig?: RetryConfig) {
    // Determine if we received an Anthropic client or a provider
    if (this.isAnthropicClient(clientOrProvider)) {
      // Legacy mode: wrap Anthropic client in ClaudeProvider
      this.legacyClient = clientOrProvider;
      this.provider = new ClaudeProvider(undefined, clientOrProvider);
    } else {
      // Provider mode: use the provider directly
      this.provider = clientOrProvider;
    }

    this.defaultRetryConfig = {
      maxRetries: retryConfig?.maxRetries ?? RETRY_CONFIG.MAX_RETRIES,
      baseDelayMs: retryConfig?.baseDelayMs ?? RETRY_CONFIG.BASE_BACKOFF_MS,
      maxDelayMs: retryConfig?.maxDelayMs ?? RETRY.MAX_BACKOFF_MS,
      initialRateLimitDelayMs: retryConfig?.initialRateLimitDelayMs ?? RETRY.INITIAL_RATE_LIMIT_DELAY_MS,
      useJitter: retryConfig?.useJitter ?? true,
    };
  }

  /**
   * Create an LLMClient with a specific provider type
   *
   * Static factory method for creating clients with a provider abstraction.
   * This is the recommended approach for new code.
   *
   * @param providerType - Type of provider to use ('anthropic', 'gemini', 'openai')
   * @param apiKey - Optional API key (uses environment variable if not provided)
   * @param retryConfig - Optional retry configuration
   * @returns Configured LLMClient instance
   *
   * @example
   * ```typescript
   * const client = LLMClient.withProvider('anthropic');
   * ```
   */
  static withProvider(
    providerType: ProviderType = 'anthropic',
    apiKey?: string,
    retryConfig?: RetryConfig
  ): LLMClient {
    const provider = createProvider(providerType, apiKey);
    return new LLMClient(provider, retryConfig);
  }

  /**
   * Type guard to check if a value is an Anthropic client
   */
  private isAnthropicClient(value: unknown): value is Anthropic {
    // Check if it has the messages.create method (Anthropic SDK signature)
    return (
      value !== null &&
      typeof value === 'object' &&
      'messages' in value &&
      typeof (value as Anthropic).messages?.create === 'function'
    );
  }

  /**
   * Send a message to the LLM with automatic retry handling
   *
   * @param prompt - The user prompt to send
   * @param options - LLM call options (model, maxTokens, etc.)
   * @returns LLM response with text and usage metrics
   * @throws Error if all retries are exhausted or non-retryable error occurs
   */
  async sendMessage(prompt: string, options: LLMCallOptions): Promise<LLMResponse> {
    const config = {
      ...this.defaultRetryConfig,
      ...(options.retryConfig || {}),
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
      try {
        // Acquire rate limit capacity before making the API call
        const estimatedTokens = estimateTokens(prompt);
        await globalRateLimiter.acquire(estimatedTokens);

        // Track latency: record start time
        const startTime = Date.now();
        const startedAt = new Date().toISOString();

        // Make the API call through the provider
        const response = await this.provider.call({
          prompt,
          model: options.model,
          maxTokens: options.maxTokens,
          temperature: options.temperature ?? 0,
        });

        // Track latency: calculate duration
        const latencyMs = Date.now() - startTime;

        const result = {
          text: response.content,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          model: options.model,
        };

        // Record latency metrics to global tracker
        if (options.logContext) {
          const levelMatch = options.logContext.level.match(/level(\d+)/i);
          const levelNum = levelMatch ? parseInt(levelMatch[1], 10) : 0;
          const taskId = extractTaskIdFromPurpose(options.logContext.purpose);
          const tokensPerSecond =
            latencyMs > 0 ? (result.outputTokens / latencyMs) * 1000 : 0;

          globalLatencyTracker.recordCall({
            startedAt,
            latencyMs,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            tokensPerSecond,
            model: result.model,
            level: levelNum,
            taskId,
          });
        }

        // Log prompt and response if logging is enabled
        if (options.logContext) {
          logPromptResponse(
            options.logContext,
            prompt,
            result.text,
            result.inputTokens,
            result.outputTokens
          );
        }

        // Return response with usage metrics
        return result;
      } catch (error) {
        lastError = error as Error;

        // Check if it's a rate limit error
        if (error instanceof Anthropic.RateLimitError) {
          if (attempt < config.maxRetries) {
            // Use rate limit specific backoff (starts at 15s by default)
            const waitTime = calculateRateLimitBackoff(
              attempt,
              config.initialRateLimitDelayMs,
              config.maxDelayMs,
              config.useJitter
            );
            console.log(
              `Rate limit hit (429). Waiting ${(waitTime / 1000).toFixed(1)}s before retry... (attempt ${attempt}/${config.maxRetries})`
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
   * Get the underlying Anthropic client (legacy compatibility)
   *
   * Useful for direct API access when retry logic is not needed.
   * Only works when the client was created with an Anthropic client.
   *
   * @returns The Anthropic SDK client instance
   * @throws Error if the client was created with a non-Anthropic provider
   */
  getClient(): Anthropic {
    if (this.legacyClient) {
      return this.legacyClient;
    }

    // Try to get client from ClaudeProvider
    if (this.provider instanceof ClaudeProvider) {
      return this.provider.getClient();
    }

    throw new Error(
      'getClient() is only available when using Anthropic/Claude provider. ' +
      'Use getProvider() instead for provider-agnostic access.'
    );
  }

  /**
   * Get the underlying LLM provider
   *
   * @returns The LLM provider instance
   */
  getProvider(): LLMProvider {
    return this.provider;
  }

  /**
   * Get the name of the current provider
   *
   * @returns Provider name string (e.g., "anthropic")
   */
  getProviderName(): string {
    return this.provider.getName();
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
    maxDelayMs: retryConfig?.maxDelayMs ?? RETRY.MAX_BACKOFF_MS,
    initialRateLimitDelayMs: retryConfig?.initialRateLimitDelayMs ?? RETRY.INITIAL_RATE_LIMIT_DELAY_MS,
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
          // Use rate limit specific backoff (starts at 15s by default)
          const waitTime = calculateRateLimitBackoff(
            attempt,
            config.initialRateLimitDelayMs,
            config.maxDelayMs,
            config.useJitter
          );
          console.log(
            `Rate limit hit (429). Waiting ${(waitTime / 1000).toFixed(1)}s before retry... (attempt ${attempt}/${config.maxRetries})`
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
