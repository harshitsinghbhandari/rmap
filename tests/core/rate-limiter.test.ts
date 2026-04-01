/**
 * Tests for Token Bucket Rate Limiter
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  TokenBucket,
  RateLimiter,
  estimateTokens,
  type RateLimiterConfig,
} from '../../src/core/rate-limiter.js';

// Helper to sleep for specified milliseconds
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Test: estimateTokens function
test('estimateTokens: estimates tokens at ~4 characters per token', () => {
  assert.strictEqual(estimateTokens('test'), 1); // 4 chars = 1 token
  assert.strictEqual(estimateTokens('hello world'), 3); // 11 chars = 3 tokens
  assert.strictEqual(estimateTokens('a'.repeat(100)), 25); // 100 chars = 25 tokens
});

test('estimateTokens: rounds up fractional tokens', () => {
  assert.strictEqual(estimateTokens('hello'), 2); // 5 chars = 1.25 -> 2 tokens
  assert.strictEqual(estimateTokens('hi'), 1); // 2 chars = 0.5 -> 1 token
});

test('estimateTokens: handles empty strings', () => {
  assert.strictEqual(estimateTokens(''), 0);
});

// Test: TokenBucket initialization
test('TokenBucket: starts with full capacity', () => {
  const bucket = new TokenBucket(10, 60);
  assert.strictEqual(bucket.getCurrentTokens(), 10);
  assert.strictEqual(bucket.getCapacity(), 10);
});

// Test: TokenBucket acquisition
test('TokenBucket: allows acquiring tokens when available', async () => {
  const bucket = new TokenBucket(10, 60);
  await bucket.acquire(5);
  // Allow for small floating point variance due to continuous refill
  const remaining = bucket.getCurrentTokens();
  assert.ok(remaining >= 5 && remaining < 5.1, `Expected ~5 tokens, got ${remaining}`);
});

test('TokenBucket: allows multiple acquisitions up to capacity', async () => {
  const bucket = new TokenBucket(10, 60);
  await bucket.acquire(3);
  await bucket.acquire(4);
  await bucket.acquire(2);
  // Allow for small floating point variance due to continuous refill
  const remaining = bucket.getCurrentTokens();
  assert.ok(remaining >= 1 && remaining < 1.1, `Expected ~1 token, got ${remaining}`);
});

test('TokenBucket: allows requests larger than capacity by waiting', async () => {
  // Bucket with 10 capacity, 600 per minute = 10 per second
  const bucket = new TokenBucket(10, 600);
  await bucket.acquire(10); // Drain the bucket

  const startTime = Date.now();

  // Request 15 tokens (exceeds capacity)
  // Should wait ~1.5 seconds (10 tokens refill in 1s, need 5 more in 0.5s)
  await bucket.acquire(15);

  const elapsed = Date.now() - startTime;

  // Should take at least 1.4 seconds to accumulate 15 tokens
  assert.ok(elapsed >= 1400, `Expected >= 1400ms for large request, got ${elapsed}ms`);
  assert.ok(elapsed < 2000, `Should not take too long, got ${elapsed}ms`);
});

// Test: TokenBucket refill
test('TokenBucket: refills tokens over time', async () => {
  // Bucket with 60 tokens capacity, 60 per minute = 1 per second
  const bucket = new TokenBucket(60, 60);
  await bucket.acquire(60); // Drain the bucket

  // Should be nearly empty (allow for tiny floating point variance)
  assert.ok(bucket.getCurrentTokens() < 0.1, 'Should be nearly empty after draining');

  // Wait for 2 seconds
  await sleep(2000);

  // Should have refilled ~2 tokens (allowing some variance)
  const current = bucket.getCurrentTokens();
  assert.ok(current >= 1.5 && current <= 3, `Expected 1.5-3 tokens, got ${current}`);
});

test('TokenBucket: does not exceed capacity when refilling', async () => {
  const bucket = new TokenBucket(10, 60);
  // Don't consume any tokens, just wait
  await sleep(1000);

  // Should still be at capacity, not above
  assert.ok(bucket.getCurrentTokens() <= 10);
});

test('TokenBucket: waits and acquires when tokens refill', async () => {
  // Bucket with 600 capacity, 600 per minute = 10 per second
  const bucket = new TokenBucket(600, 600);
  await bucket.acquire(600); // Drain completely

  const startTime = Date.now();

  // This should wait ~1 second for 10 tokens to refill
  await bucket.acquire(10);

  const elapsed = Date.now() - startTime;

  // Should take at least 900ms (allowing some variance)
  assert.ok(elapsed >= 900, `Expected >= 900ms, got ${elapsed}ms`);
});

test('TokenBucket: processes queued requests in FIFO order', async () => {
  const bucket = new TokenBucket(10, 600); // 10 per second
  await bucket.acquire(10); // Drain completely

  const results: number[] = [];

  // Queue multiple requests
  const promise1 = bucket.acquire(3).then(() => results.push(1));
  const promise2 = bucket.acquire(3).then(() => results.push(2));
  const promise3 = bucket.acquire(3).then(() => results.push(3));

  // Wait for all to complete
  await Promise.all([promise1, promise2, promise3]);

  // Should process in order: 1, 2, 3
  assert.deepStrictEqual(results, [1, 2, 3]);
});

// Test: RateLimiter initialization
test('RateLimiter: initializes with correct capacity', () => {
  const config: RateLimiterConfig = {
    requestsPerMinute: 30,
    inputTokensPerMinute: 18000,
  };
  const limiter = new RateLimiter(config);
  const state = limiter.getState();

  assert.strictEqual(state.requests.capacity, 30);
  assert.strictEqual(state.requests.current, 30);
  assert.strictEqual(state.tokens.capacity, 18000);
  assert.strictEqual(state.tokens.current, 18000);
});

// Test: RateLimiter acquisition
test('RateLimiter: acquires from both buckets', async () => {
  const config: RateLimiterConfig = {
    requestsPerMinute: 30,
    inputTokensPerMinute: 18000,
  };
  const limiter = new RateLimiter(config);

  await limiter.acquire(1000); // 1 request, 1000 tokens

  const state = limiter.getState();
  // Allow for small floating point variance due to continuous refill
  assert.ok(state.requests.current >= 29 && state.requests.current < 29.1);
  assert.ok(state.tokens.current >= 17000 && state.tokens.current < 17010);
});

test('RateLimiter: handles multiple acquisitions', async () => {
  const config: RateLimiterConfig = {
    requestsPerMinute: 30,
    inputTokensPerMinute: 18000,
  };
  const limiter = new RateLimiter(config);

  await limiter.acquire(500);
  await limiter.acquire(1000);
  await limiter.acquire(1500);

  const state = limiter.getState();
  // Allow for small floating point variance due to continuous refill
  assert.ok(state.requests.current >= 27 && state.requests.current < 27.1);
  assert.ok(state.tokens.current >= 15000 && state.tokens.current < 15010);
});

// Test: RateLimiter waiting behavior
test('RateLimiter: waits when request limit exceeded', async () => {
  const config: RateLimiterConfig = {
    requestsPerMinute: 60, // 1 per second
    inputTokensPerMinute: 60000,
  };
  const limiter = new RateLimiter(config);

  // Use up 60 requests
  for (let i = 0; i < 60; i++) {
    await limiter.acquire(100);
  }

  const startTime = Date.now();

  // This request should wait ~1 second
  await limiter.acquire(100);

  const elapsed = Date.now() - startTime;

  // Should take at least 900ms
  assert.ok(elapsed >= 900, `Expected >= 900ms, got ${elapsed}ms`);
});

test('RateLimiter: waits when token limit exceeded', async () => {
  const config: RateLimiterConfig = {
    requestsPerMinute: 600, // Plenty of requests
    inputTokensPerMinute: 6000, // 100 per second
  };
  const limiter = new RateLimiter(config);

  // Use up all tokens
  await limiter.acquire(6000);

  const startTime = Date.now();

  // This should wait ~1 second for 100 tokens
  await limiter.acquire(100);

  const elapsed = Date.now() - startTime;

  // Should take at least 900ms
  assert.ok(elapsed >= 900, `Expected >= 900ms, got ${elapsed}ms`);
});

test('RateLimiter: enforces both limits simultaneously', async () => {
  const config: RateLimiterConfig = {
    requestsPerMinute: 120, // 2 per second
    inputTokensPerMinute: 6000, // 100 per second
  };
  const limiter = new RateLimiter(config);

  // First two requests: OK
  await limiter.acquire(3000);
  await limiter.acquire(3000);

  const state = limiter.getState();
  // Allow for small floating point variance due to continuous refill
  assert.ok(state.requests.current >= 118 && state.requests.current < 118.1);
  assert.ok(state.tokens.current >= 0 && state.tokens.current < 10);

  const startTime = Date.now();

  // Third request: Must wait for tokens to refill
  await limiter.acquire(100);

  const elapsed = Date.now() - startTime;

  // Should wait for tokens (at least 900ms)
  assert.ok(elapsed >= 900, `Expected >= 900ms, got ${elapsed}ms`);
});

// Integration test: Throttling burst requests
test('RateLimiter: throttles burst of requests', async () => {
  const config: RateLimiterConfig = {
    requestsPerMinute: 60, // 1 per second
    inputTokensPerMinute: 6000, // 100 per second
  };
  const limiter = new RateLimiter(config);

  // First, drain the buckets
  for (let i = 0; i < 60; i++) {
    await limiter.acquire(100);
  }

  const startTime = Date.now();

  // Now try to make 3 more requests (should be throttled)
  const requests = Array.from({ length: 3 }, () => limiter.acquire(100));

  await Promise.all(requests);

  const elapsed = Date.now() - startTime;

  // With 1 per second limit, 3 requests should take at least 2.5 seconds
  assert.ok(elapsed >= 2500, `Expected >= 2500ms for 3 requests, got ${elapsed}ms`);
  assert.ok(elapsed < 4000, `Should not take too long, got ${elapsed}ms`);
});

// Integration test: Steady throughput
test('RateLimiter: allows steady throughput without blocking', async () => {
  const config: RateLimiterConfig = {
    requestsPerMinute: 600, // 10 per second
    inputTokensPerMinute: 60000, // 1000 per second
  };
  const limiter = new RateLimiter(config);

  const startTime = Date.now();

  // Make 5 requests with small delays between them
  for (let i = 0; i < 5; i++) {
    await limiter.acquire(100);
    await sleep(200); // Wait 200ms between requests
  }

  const elapsed = Date.now() - startTime;

  // Should not be significantly delayed (no blocking under steady load)
  // Expected: ~1000ms (5 * 200ms delays), allowing margin for acquire() overhead
  assert.ok(elapsed < 3000, `Requests should not be significantly delayed, took ${elapsed}ms`);
});
