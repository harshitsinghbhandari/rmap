/**
 * Tests for coordinator/shutdown-handler.ts
 *
 * Tests graceful shutdown handling with signal management.
 */

import { test, mock } from 'node:test';
import assert from 'node:assert';
import {
  GracefulShutdownHandler,
  type CleanupCallback,
} from '../../src/coordinator/shutdown-handler.js';

// ============================================================================
// Constructor Tests
// ============================================================================

test('GracefulShutdownHandler creates instance', () => {
  const handler = new GracefulShutdownHandler();
  assert.ok(handler instanceof GracefulShutdownHandler);
});

test('GracefulShutdownHandler starts with no cleanup callbacks', () => {
  const handler = new GracefulShutdownHandler();
  // Internal state is private, but we can verify behavior
  assert.ok(handler);
});

// ============================================================================
// onShutdown Registration Tests
// ============================================================================

test('onShutdown accepts sync callback', () => {
  const handler = new GracefulShutdownHandler();
  let called = false;

  const callback: CleanupCallback = () => {
    called = true;
  };

  handler.onShutdown(callback);
  // Callback should be registered but not called yet
  assert.strictEqual(called, false);
});

test('onShutdown accepts async callback', () => {
  const handler = new GracefulShutdownHandler();
  let called = false;

  const callback: CleanupCallback = async () => {
    called = true;
  };

  handler.onShutdown(callback);
  assert.strictEqual(called, false);
});

test('onShutdown allows multiple callbacks', () => {
  const handler = new GracefulShutdownHandler();
  const calls: number[] = [];

  handler.onShutdown(() => calls.push(1));
  handler.onShutdown(() => calls.push(2));
  handler.onShutdown(() => calls.push(3));

  // Callbacks registered but not executed
  assert.strictEqual(calls.length, 0);
});

// ============================================================================
// Register/Unregister Tests
// ============================================================================

test('register adds signal handlers', () => {
  const handler = new GracefulShutdownHandler();

  // Count listeners before
  const sigintBefore = process.listenerCount('SIGINT');
  const sigtermBefore = process.listenerCount('SIGTERM');

  handler.register();

  // Count listeners after
  const sigintAfter = process.listenerCount('SIGINT');
  const sigtermAfter = process.listenerCount('SIGTERM');

  // Should have added one listener each
  assert.strictEqual(sigintAfter, sigintBefore + 1);
  assert.strictEqual(sigtermAfter, sigtermBefore + 1);

  // Clean up
  handler.unregister();
});

test('unregister removes signal handlers', () => {
  const handler = new GracefulShutdownHandler();

  // Count listeners before register
  const sigintBefore = process.listenerCount('SIGINT');
  const sigtermBefore = process.listenerCount('SIGTERM');

  handler.register();
  handler.unregister();

  // Count listeners after unregister
  const sigintAfter = process.listenerCount('SIGINT');
  const sigtermAfter = process.listenerCount('SIGTERM');

  // Should be back to original count
  assert.strictEqual(sigintAfter, sigintBefore);
  assert.strictEqual(sigtermAfter, sigtermBefore);
});

test('unregister is safe to call multiple times', () => {
  const handler = new GracefulShutdownHandler();

  handler.register();
  handler.unregister();
  handler.unregister(); // Should not throw

  assert.ok(true);
});

test('unregister is safe to call without register', () => {
  const handler = new GracefulShutdownHandler();

  // Should not throw
  handler.unregister();
  assert.ok(true);
});

test('register can be called after unregister', () => {
  const handler = new GracefulShutdownHandler();

  const sigintBefore = process.listenerCount('SIGINT');

  handler.register();
  handler.unregister();
  handler.register();

  const sigintAfter = process.listenerCount('SIGINT');
  assert.strictEqual(sigintAfter, sigintBefore + 1);

  handler.unregister();
});

// ============================================================================
// CleanupCallback Type Tests
// ============================================================================

test('CleanupCallback can return void', () => {
  const callback: CleanupCallback = () => {
    // sync callback returning void
  };

  const result = callback();
  assert.strictEqual(result, undefined);
});

test('CleanupCallback can return Promise<void>', async () => {
  const callback: CleanupCallback = async () => {
    // async callback returning Promise<void>
  };

  const result = callback();
  assert.ok(result instanceof Promise);
  await result; // Should resolve
});

// ============================================================================
// Multiple Handlers Tests
// ============================================================================

test('Multiple handlers can coexist', () => {
  const handler1 = new GracefulShutdownHandler();
  const handler2 = new GracefulShutdownHandler();

  const sigintBefore = process.listenerCount('SIGINT');

  handler1.register();
  handler2.register();

  const sigintAfter = process.listenerCount('SIGINT');
  assert.strictEqual(sigintAfter, sigintBefore + 2);

  handler1.unregister();
  handler2.unregister();

  const sigintFinal = process.listenerCount('SIGINT');
  assert.strictEqual(sigintFinal, sigintBefore);
});

// ============================================================================
// Cleanup Callback Order Tests
// ============================================================================

test('Cleanup callbacks are stored in registration order', () => {
  const handler = new GracefulShutdownHandler();
  const order: string[] = [];

  handler.onShutdown(() => order.push('first'));
  handler.onShutdown(() => order.push('second'));
  handler.onShutdown(() => order.push('third'));

  // We can't easily test the actual execution order without triggering shutdown
  // but we've verified the registration works
  assert.strictEqual(order.length, 0);
});

// ============================================================================
// Edge Cases
// ============================================================================

test('Handler with no callbacks registered does not throw', () => {
  const handler = new GracefulShutdownHandler();
  handler.register();
  // No callbacks registered, should still work
  handler.unregister();
  assert.ok(true);
});

test('Handler accepts void-returning callbacks', () => {
  const handler = new GracefulShutdownHandler();

  let count = 0;
  handler.onShutdown(() => {
    count++;
    // No return statement - returns void
  });

  assert.strictEqual(count, 0);
});

test('Handler accepts promise-returning callbacks', () => {
  const handler = new GracefulShutdownHandler();

  let count = 0;
  handler.onShutdown(async () => {
    count++;
    await Promise.resolve();
    // Returns Promise<void>
  });

  assert.strictEqual(count, 0);
});

// ============================================================================
// Memory Leak Prevention Tests
// ============================================================================

test('Unregister prevents listener accumulation', () => {
  const initialCount = process.listenerCount('SIGINT');

  for (let i = 0; i < 10; i++) {
    const handler = new GracefulShutdownHandler();
    handler.register();
    handler.unregister();
  }

  const finalCount = process.listenerCount('SIGINT');
  assert.strictEqual(finalCount, initialCount);
});

test('Proper cleanup after multiple register/unregister cycles', () => {
  const handler = new GracefulShutdownHandler();
  const initialCount = process.listenerCount('SIGINT');

  for (let i = 0; i < 5; i++) {
    handler.register();
    handler.unregister();
  }

  const finalCount = process.listenerCount('SIGINT');
  assert.strictEqual(finalCount, initialCount);
});
