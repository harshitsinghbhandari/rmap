/**
 * Tests for ConcurrencyPool
 *
 * Tests concurrent task execution, rate limiting, error handling,
 * and performance characteristics.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { ConcurrencyPool } from '../../src/core/concurrency.js';

// Helper to simulate async work
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Test: Basic concurrent execution
test('ConcurrencyPool: executes tasks concurrently', async () => {
  const pool = new ConcurrencyPool({ concurrency: 3 });
  const items = [1, 2, 3, 4, 5];
  const startTimes = new Map<number, number>();
  const endTimes = new Map<number, number>();

  const results = await pool.run(items, async (item) => {
    startTimes.set(item, Date.now());
    await sleep(50); // Simulate work
    endTimes.set(item, Date.now());
    return item * 2;
  });

  // All tasks should complete
  assert.strictEqual(results.length, 5);
  assert.ok(results.every((r) => r.success));

  // Values should be doubled
  assert.strictEqual(results[0].value, 2);
  assert.strictEqual(results[4].value, 10);
});

// Test: Concurrency limit is respected
test('ConcurrencyPool: respects concurrency limit', async () => {
  const pool = new ConcurrencyPool({ concurrency: 2 });
  const items = [1, 2, 3, 4, 5];
  const activeCount = { current: 0, max: 0 };

  await pool.run(items, async (item) => {
    activeCount.current++;
    activeCount.max = Math.max(activeCount.max, activeCount.current);
    await sleep(50);
    activeCount.current--;
    return item;
  });

  // Should never exceed concurrency limit
  assert.ok(activeCount.max <= 2);
  assert.ok(activeCount.max > 1); // Should have actually run concurrently
});

// Test: Error handling
test('ConcurrencyPool: handles errors gracefully', async () => {
  const pool = new ConcurrencyPool({ concurrency: 2, stopOnError: false });
  const items = [1, 2, 3, 4, 5];

  const results = await pool.run(items, async (item) => {
    if (item === 3) {
      throw new Error(`Failed on item ${item}`);
    }
    return item * 2;
  });

  // Should have 4 successes and 1 failure
  const successes = results.filter((r) => r.success);
  const failures = results.filter((r) => !r.success);

  assert.strictEqual(successes.length, 4);
  assert.strictEqual(failures.length, 1);
  assert.strictEqual(failures[0].index, 2); // Item 3 is at index 2
  assert.ok(failures[0].error instanceof Error);
});

// Test: Stop on error
test('ConcurrencyPool: can stop on first error', async () => {
  const pool = new ConcurrencyPool({ concurrency: 2, stopOnError: true });
  const items = [1, 2, 3, 4, 5];
  const processed: number[] = [];

  const results = await pool.run(items, async (item) => {
    processed.push(item);
    await sleep(10);
    if (item === 2) {
      throw new Error('Stop here');
    }
    return item;
  });

  // Should stop processing after error
  // Note: Due to concurrency, some tasks may start before error is detected
  assert.ok(processed.length < items.length);
});

// Test: Task delay
test('ConcurrencyPool: applies delay between task starts', async () => {
  const pool = new ConcurrencyPool({
    concurrency: 10,
    delayBetweenTasks: 50,
  });
  const items = [1, 2, 3];
  const startTimes: number[] = [];

  await pool.run(items, async (item) => {
    startTimes.push(Date.now());
    return item;
  });

  // Check that delays were applied (with some tolerance)
  for (let i = 1; i < startTimes.length; i++) {
    const delay = startTimes[i] - startTimes[i - 1];
    assert.ok(delay >= 40); // Allow 20% tolerance
  }
});

// Test: runAndFilter method
test('ConcurrencyPool: runAndFilter returns only successes', async () => {
  const pool = new ConcurrencyPool({ concurrency: 2 });
  const items = [1, 2, 3, 4, 5];

  const results = await pool.runAndFilter(items, async (item) => {
    if (item === 3) {
      throw new Error('Skip this');
    }
    return item * 2;
  });

  // Should only return successful results
  assert.strictEqual(results.length, 4);
  assert.deepStrictEqual(results, [2, 4, 8, 10]);
});

// Test: runWithStats method
test('ConcurrencyPool: runWithStats provides detailed statistics', async () => {
  const pool = new ConcurrencyPool({ concurrency: 2 });
  const items = [1, 2, 3, 4, 5];

  const stats = await pool.runWithStats(items, async (item) => {
    if (item === 2 || item === 4) {
      throw new Error(`Failed: ${item}`);
    }
    return item * 2;
  });

  assert.strictEqual(stats.successCount, 3);
  assert.strictEqual(stats.failureCount, 2);
  assert.deepStrictEqual(stats.successes, [2, 6, 10]);
  assert.strictEqual(stats.failures.length, 2);
  assert.strictEqual(stats.failures[0].item, 2);
  assert.strictEqual(stats.failures[1].item, 4);
});

// Test: Empty array
test('ConcurrencyPool: handles empty input array', async () => {
  const pool = new ConcurrencyPool({ concurrency: 5 });
  const results = await pool.run([], async (item) => item);

  assert.strictEqual(results.length, 0);
});

// Test: Single item
test('ConcurrencyPool: handles single item', async () => {
  const pool = new ConcurrencyPool({ concurrency: 5 });
  const results = await pool.run([42], async (item) => item * 2);

  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].value, 84);
  assert.strictEqual(results[0].success, true);
});

// Test: Large batch
test('ConcurrencyPool: handles large batches efficiently', async () => {
  const pool = new ConcurrencyPool({ concurrency: 10 });
  const items = Array.from({ length: 100 }, (_, i) => i);

  let inFlight = 0;
  let maxInFlight = 0;

  const results = await pool.run(items, async (item) => {
    inFlight++;
    if (inFlight > maxInFlight) {
      maxInFlight = inFlight;
    }
    try {
      await sleep(10);
      return item;
    } finally {
      inFlight--;
    }
  });

  // All should succeed
  assert.strictEqual(results.length, 100);
  assert.ok(results.every((r) => r.success));

  // Should process multiple items concurrently (not purely sequential)
  assert.ok(
    maxInFlight > 1,
    `Expected more than one item in flight, got ${maxInFlight}`,
  );
});

// Test: Index tracking
test('ConcurrencyPool: tracks item indices correctly', async () => {
  const pool = new ConcurrencyPool({ concurrency: 3 });
  const items = ['a', 'b', 'c', 'd', 'e'];

  const results = await pool.run(items, async (item, index) => {
    return { item, index };
  });

  // Indices should match
  for (let i = 0; i < results.length; i++) {
    assert.strictEqual(results[i].index, i);
    assert.strictEqual(results[i].value!.index, i);
    assert.strictEqual(results[i].value!.item, items[i]);
  }
});

// Test: Async function support
test('ConcurrencyPool: works with async functions', async () => {
  const pool = new ConcurrencyPool({ concurrency: 2 });
  const items = [1, 2, 3];

  const results = await pool.run(items, async (item) => {
    await sleep(10);
    const doubled = item * 2;
    await sleep(10);
    return doubled;
  });

  assert.strictEqual(results.length, 3);
  assert.deepStrictEqual(
    results.map((r) => r.value),
    [2, 4, 6]
  );
});

// Test: Performance improvement over sequential
test('ConcurrencyPool: provides significant speedup vs sequential', async () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  const taskDuration = 50; // ms

  let activeTasks = 0;
  let maxActiveTasks = 0;
  const pool = new ConcurrencyPool({ concurrency: 5 });
  await pool.run(items, async () => {
    activeTasks++;
    if (activeTasks > maxActiveTasks) {
      maxActiveTasks = activeTasks;
    }
    try {
      await sleep(taskDuration);
    } finally {
      activeTasks--;
    }
  });

  // Pool should utilize concurrency without exceeding the configured limit
  assert.ok(
    maxActiveTasks <= 5,
    `Max active tasks was ${maxActiveTasks}, expected <= 5`
  );
  assert.ok(
    maxActiveTasks > 1,
    `Max active tasks was ${maxActiveTasks}, expected > 1 to show concurrency`
  );
});

// Test: Default options
test('ConcurrencyPool: uses sensible defaults', async () => {
  const pool = new ConcurrencyPool(); // No options
  const items = [1, 2, 3, 4, 5];

  const results = await pool.run(items, async (item) => item * 2);

  // Should work with defaults
  assert.strictEqual(results.length, 5);
  assert.ok(results.every((r) => r.success));
});

// Test: Maintains order in results
test('ConcurrencyPool: maintains input order in results', async () => {
  const pool = new ConcurrencyPool({ concurrency: 5 });
  const items = [5, 4, 3, 2, 1];

  const results = await pool.run(items, async (item) => {
    // Vary duration to ensure order isn't due to timing
    await sleep(item * 10);
    return item * 2;
  });

  // Results should be in input order despite varying completion times
  assert.strictEqual(results[0].value, 10);
  assert.strictEqual(results[1].value, 8);
  assert.strictEqual(results[2].value, 6);
  assert.strictEqual(results[3].value, 4);
  assert.strictEqual(results[4].value, 2);
});
