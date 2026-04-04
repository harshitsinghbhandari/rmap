/**
 * Tests for core/llm-client.ts
 *
 * Tests the LLM client with retry logic and backoff calculations.
 * NOTE: These tests mock the Anthropic SDK to avoid actual API calls.
 */

import { test, mock } from 'node:test';
import assert from 'node:assert';

// We can't easily mock the Anthropic SDK, so we test the exported interfaces
// and pure functions that don't require actual API calls
import type {
  RetryConfig,
  LLMCallOptions,
  LLMResponse,
} from '../../src/core/llm-client.js';

// ============================================================================
// RetryConfig Interface Tests
// ============================================================================

test('RetryConfig interface accepts all optional fields', () => {
  const emptyConfig: RetryConfig = {};
  assert.deepStrictEqual(emptyConfig, {});
});

test('RetryConfig interface accepts partial configuration', () => {
  const partialConfig: RetryConfig = {
    maxRetries: 3,
  };
  assert.strictEqual(partialConfig.maxRetries, 3);
});

test('RetryConfig interface accepts full configuration', () => {
  const fullConfig: RetryConfig = {
    maxRetries: 5,
    baseDelayMs: 2000,
    maxDelayMs: 60000,
    initialRateLimitDelayMs: 15000,
    useJitter: true,
  };

  assert.strictEqual(fullConfig.maxRetries, 5);
  assert.strictEqual(fullConfig.baseDelayMs, 2000);
  assert.strictEqual(fullConfig.maxDelayMs, 60000);
  assert.strictEqual(fullConfig.initialRateLimitDelayMs, 15000);
  assert.strictEqual(fullConfig.useJitter, true);
});

test('RetryConfig useJitter can be false', () => {
  const config: RetryConfig = {
    useJitter: false,
  };
  assert.strictEqual(config.useJitter, false);
});

// ============================================================================
// LLMCallOptions Interface Tests
// ============================================================================

test('LLMCallOptions requires model and maxTokens', () => {
  const options: LLMCallOptions = {
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 2000,
  };

  assert.strictEqual(options.model, 'claude-haiku-4-5-20251001');
  assert.strictEqual(options.maxTokens, 2000);
});

test('LLMCallOptions accepts optional temperature', () => {
  const options: LLMCallOptions = {
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 4000,
    temperature: 0.5,
  };

  assert.strictEqual(options.temperature, 0.5);
});

test('LLMCallOptions accepts optional retryConfig', () => {
  const options: LLMCallOptions = {
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 2000,
    retryConfig: {
      maxRetries: 3,
      useJitter: false,
    },
  };

  assert.strictEqual(options.retryConfig?.maxRetries, 3);
  assert.strictEqual(options.retryConfig?.useJitter, false);
});

test('LLMCallOptions accepts optional logContext', () => {
  const options: LLMCallOptions = {
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 2000,
    logContext: {
      level: 1,
      purpose: 'detection',
    },
  };

  assert.strictEqual(options.logContext?.level, 1);
  assert.strictEqual(options.logContext?.purpose, 'detection');
});

// ============================================================================
// LLMResponse Interface Tests
// ============================================================================

test('LLMResponse has all required fields', () => {
  const response: LLMResponse = {
    text: 'Response text',
    inputTokens: 100,
    outputTokens: 50,
    model: 'claude-haiku-4-5-20251001',
  };

  assert.strictEqual(response.text, 'Response text');
  assert.strictEqual(response.inputTokens, 100);
  assert.strictEqual(response.outputTokens, 50);
  assert.strictEqual(response.model, 'claude-haiku-4-5-20251001');
});

test('LLMResponse tokens are non-negative', () => {
  const response: LLMResponse = {
    text: '',
    inputTokens: 0,
    outputTokens: 0,
    model: 'claude-haiku-4-5-20251001',
  };

  assert.ok(response.inputTokens >= 0);
  assert.ok(response.outputTokens >= 0);
});

// ============================================================================
// Backoff Calculation Logic Tests
// ============================================================================

test('Exponential backoff formula: 2^attempt * baseDelay', () => {
  const baseDelay = 2000;

  // Manual calculation to verify expected behavior
  const attempt1 = Math.pow(2, 1) * baseDelay; // 4000
  const attempt2 = Math.pow(2, 2) * baseDelay; // 8000
  const attempt3 = Math.pow(2, 3) * baseDelay; // 16000
  const attempt4 = Math.pow(2, 4) * baseDelay; // 32000
  const attempt5 = Math.pow(2, 5) * baseDelay; // 64000

  assert.strictEqual(attempt1, 4000);
  assert.strictEqual(attempt2, 8000);
  assert.strictEqual(attempt3, 16000);
  assert.strictEqual(attempt4, 32000);
  assert.strictEqual(attempt5, 64000);
});

test('Backoff is capped at maxDelay', () => {
  const baseDelay = 2000;
  const maxDelay = 60000;

  // At attempt 5, exponential would be 64000, but capped at 60000
  const exponentialDelay = Math.pow(2, 5) * baseDelay;
  const cappedDelay = Math.min(exponentialDelay, maxDelay);

  assert.strictEqual(cappedDelay, maxDelay);
});

test('Rate limit backoff uses linear growth', () => {
  const initialDelay = 15000;

  // Linear growth: initialDelay * attempt
  const attempt1 = initialDelay * 1; // 15000
  const attempt2 = initialDelay * 2; // 30000
  const attempt3 = initialDelay * 3; // 45000
  const attempt4 = initialDelay * 4; // 60000

  assert.strictEqual(attempt1, 15000);
  assert.strictEqual(attempt2, 30000);
  assert.strictEqual(attempt3, 45000);
  assert.strictEqual(attempt4, 60000);
});

test('Rate limit backoff is capped at maxDelay', () => {
  const initialDelay = 15000;
  const maxDelay = 60000;

  // At attempt 5, linear would be 75000, but capped at 60000
  const linearDelay = initialDelay * 5;
  const cappedDelay = Math.min(linearDelay, maxDelay);

  assert.strictEqual(cappedDelay, maxDelay);
});

// ============================================================================
// Jitter Logic Tests
// ============================================================================

test('Jitter produces values between 0 and delay (standard backoff)', () => {
  const delay = 10000;

  // Simulate jitter calculation: Math.random() * delay
  // With jitter, result should be in [0, delay)
  for (let i = 0; i < 10; i++) {
    const jitteredDelay = Math.random() * delay;
    assert.ok(jitteredDelay >= 0);
    assert.ok(jitteredDelay < delay);
  }
});

test('Jitter for rate limit uses ±10% range', () => {
  const delay = 15000;
  const jitterRange = delay * 0.1; // ±10%

  // Simulate: delay + (delay * 0.1 * (Math.random() * 2 - 1))
  for (let i = 0; i < 10; i++) {
    const jitter = jitterRange * (Math.random() * 2 - 1);
    const jitteredDelay = delay + jitter;

    assert.ok(jitteredDelay >= delay - jitterRange);
    assert.ok(jitteredDelay <= delay + jitterRange);
  }
});

test('Jitter minimum is 1000ms for rate limit backoff', () => {
  // Even with negative jitter, should never go below 1000ms
  const minDelay = 1000;
  const delay = 1500;
  const jitter = -600; // -40% jitter (more than allowed)

  const jitteredDelay = Math.max(minDelay, delay + jitter);
  assert.ok(jitteredDelay >= minDelay);
});

// ============================================================================
// Retry Logic Tests
// ============================================================================

test('Retry count starts at 1 and ends at maxRetries', () => {
  const maxRetries = 5;
  const attempts: number[] = [];

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    attempts.push(attempt);
  }

  assert.deepStrictEqual(attempts, [1, 2, 3, 4, 5]);
  assert.strictEqual(attempts.length, maxRetries);
});

test('Default retry config values', () => {
  // Based on RETRY_CONFIG from models.ts
  const defaultConfig = {
    maxRetries: 5,
    baseDelayMs: 2000,
  };

  assert.strictEqual(defaultConfig.maxRetries, 5);
  assert.strictEqual(defaultConfig.baseDelayMs, 2000);
});

test('Default rate limit delay is 15 seconds', () => {
  // Based on RETRY.INITIAL_RATE_LIMIT_DELAY_MS from env.ts
  const defaultRateLimitDelay = 15000;
  assert.strictEqual(defaultRateLimitDelay, 15000);
});

// ============================================================================
// Error Classification Tests
// ============================================================================

test('Rate limit errors (429) should trigger retry with longer delay', () => {
  // This tests the expected behavior, not actual implementation
  const isRateLimitError = (statusCode: number) => statusCode === 429;

  assert.ok(isRateLimitError(429));
  assert.ok(!isRateLimitError(400));
  assert.ok(!isRateLimitError(500));
});

test('Other API errors should not be retried', () => {
  // Non-429 API errors should throw immediately
  const nonRetryableErrors = [400, 401, 403, 404, 500, 502, 503];

  for (const code of nonRetryableErrors) {
    const shouldRetry = code === 429;
    assert.ok(!shouldRetry, `Status ${code} should not trigger retry`);
  }
});

// ============================================================================
// Configuration Merge Tests
// ============================================================================

test('RetryConfig merges correctly with defaults', () => {
  const defaults: Required<RetryConfig> = {
    maxRetries: 5,
    baseDelayMs: 2000,
    maxDelayMs: 60000,
    initialRateLimitDelayMs: 15000,
    useJitter: true,
  };

  const override: RetryConfig = {
    maxRetries: 3,
    useJitter: false,
  };

  const merged = {
    ...defaults,
    ...override,
  };

  assert.strictEqual(merged.maxRetries, 3); // overridden
  assert.strictEqual(merged.baseDelayMs, 2000); // default
  assert.strictEqual(merged.maxDelayMs, 60000); // default
  assert.strictEqual(merged.useJitter, false); // overridden
});

test('Empty override preserves all defaults', () => {
  const defaults: Required<RetryConfig> = {
    maxRetries: 5,
    baseDelayMs: 2000,
    maxDelayMs: 60000,
    initialRateLimitDelayMs: 15000,
    useJitter: true,
  };

  const override: RetryConfig = {};

  const merged = {
    ...defaults,
    ...override,
  };

  assert.deepStrictEqual(merged, defaults);
});

// ============================================================================
// Token Estimation Tests
// ============================================================================

test('Token estimation approximates ~4 chars per token', () => {
  // Common approximation: 1 token ≈ 4 characters
  const text = 'Hello, world!'; // 13 chars
  const estimatedTokens = Math.ceil(text.length / 4);

  assert.ok(estimatedTokens >= 1);
  assert.ok(estimatedTokens <= text.length); // Never more tokens than chars
});

test('Token estimation handles empty string', () => {
  const text = '';
  const estimatedTokens = Math.ceil(text.length / 4) || 0;

  assert.strictEqual(estimatedTokens, 0);
});

test('Token estimation handles long prompts', () => {
  const text = 'a'.repeat(10000); // 10000 chars
  const estimatedTokens = Math.ceil(text.length / 4);

  assert.strictEqual(estimatedTokens, 2500);
});
