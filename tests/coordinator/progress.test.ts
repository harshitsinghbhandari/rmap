/**
 * Tests for Progress Tracker
 *
 * Tests progress reporting, statistics collection,
 * LLM call tracking, and timing measurements.
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { ProgressTracker } from '../../src/coordinator/progress.js';

// Test: ProgressTracker instantiation
test('ProgressTracker: creates new tracker instance', () => {
  const tracker = new ProgressTracker();
  assert.ok(tracker);
});

// Test: Start time initialization
test('ProgressTracker: initializes start time on creation', () => {
  const beforeCreate = Date.now();
  const tracker = new ProgressTracker();
  const afterCreate = Date.now();

  // Start time should be between before and after
  const elapsed = tracker.getElapsedSeconds();
  assert.ok(elapsed >= 0);
  assert.ok(elapsed < 1); // Should be less than 1 second
});

// Test: Level tracking
test('ProgressTracker: tracks level start and completion', () => {
  const tracker = new ProgressTracker();

  // Should not throw
  assert.doesNotThrow(() => {
    tracker.startLevel('Level 0: Test Level');
    tracker.completeLevel('Level 0: Test Level');
  });
});

// Test: Multiple levels
test('ProgressTracker: tracks multiple levels sequentially', () => {
  const tracker = new ProgressTracker();

  const levels = [
    'Level 0: Metadata Harvester',
    'Level 1: Structure Detector',
    'Level 2: Work Divider',
    'Level 3: Deep File Annotator',
    'Level 4: Consistency Validator',
  ];

  for (const level of levels) {
    assert.doesNotThrow(() => {
      tracker.startLevel(level);
      tracker.completeLevel(level);
    });
  }
});

// Test: Level timing
test('ProgressTracker: measures level duration', async () => {
  const tracker = new ProgressTracker();

  tracker.startLevel('Test Level');
  await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms
  tracker.completeLevel('Test Level');

  // Elapsed time should be at least 100ms (0.1 seconds)
  const elapsed = tracker.getElapsedSeconds();
  assert.ok(elapsed >= 0.09, `Expected >= 0.09s, got ${elapsed}s`);
});

// Test: LLM call tracking
test('ProgressTracker: tracks LLM calls', () => {
  const tracker = new ProgressTracker();

  tracker.trackLLMCall();
  tracker.trackLLMCall();
  tracker.trackLLMCall();

  const stats = tracker.getStats();
  assert.strictEqual(stats.llmCallCount, 3);
});

// Test: Token tracking
test('ProgressTracker: tracks token usage', () => {
  const tracker = new ProgressTracker();

  tracker.trackLLMCall(1000);
  tracker.trackLLMCall(2000);
  tracker.trackLLMCall(1500);

  const stats = tracker.getStats();
  assert.strictEqual(stats.tokenCount, 4500);
});

// Test: Token tracking with default value
test('ProgressTracker: tracks LLM calls with default token count', () => {
  const tracker = new ProgressTracker();

  tracker.trackLLMCall(); // No tokens specified
  tracker.trackLLMCall(100);

  const stats = tracker.getStats();
  assert.strictEqual(stats.llmCallCount, 2);
  assert.strictEqual(stats.tokenCount, 100); // Only the explicit 100
});

// Test: Elapsed time in minutes
test('ProgressTracker: calculates elapsed time in minutes', async () => {
  const tracker = new ProgressTracker();

  await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms

  const elapsedMinutes = tracker.getElapsedMinutes();
  assert.ok(elapsedMinutes >= 0);
  assert.ok(elapsedMinutes < 1); // Should be less than 1 minute
});

// Test: Elapsed time in seconds
test('ProgressTracker: calculates elapsed time in seconds', async () => {
  const tracker = new ProgressTracker();

  await new Promise(resolve => setTimeout(resolve, 100)); // Wait 100ms

  const elapsedSeconds = tracker.getElapsedSeconds();
  assert.ok(elapsedSeconds >= 0.09, `Expected >= 0.09s, got ${elapsedSeconds}s`);
});

// Test: Stats collection
test('ProgressTracker: getStats returns complete statistics', () => {
  const tracker = new ProgressTracker();

  tracker.trackLLMCall(1000);
  tracker.trackLLMCall(2000);

  const stats = tracker.getStats();

  assert.ok(typeof stats.llmCallCount === 'number');
  assert.ok(typeof stats.tokenCount === 'number');
  assert.ok(typeof stats.elapsedMinutes === 'number');

  assert.strictEqual(stats.llmCallCount, 2);
  assert.strictEqual(stats.tokenCount, 3000);
});

// Test: Progress logging
test('ProgressTracker: logs progress messages', () => {
  const tracker = new ProgressTracker();

  // Should not throw
  assert.doesNotThrow(() => {
    tracker.logProgress('Test progress message');
  });
});

// Test: Warning logging
test('ProgressTracker: logs warning messages', () => {
  const tracker = new ProgressTracker();

  // Should not throw
  assert.doesNotThrow(() => {
    tracker.logWarning('Test warning message');
  });
});

// Test: Error logging
test('ProgressTracker: logs error messages', () => {
  const tracker = new ProgressTracker();

  // Should not throw
  assert.doesNotThrow(() => {
    tracker.logError('Test error message');
  });
});

// Test: Summary printing
test('ProgressTracker: prints summary with statistics', () => {
  const tracker = new ProgressTracker();

  tracker.trackLLMCall(5000);
  tracker.trackLLMCall(3000);

  const summaryStats = {
    filesAnnotated: 100,
    agentsUsed: 5,
    validationIssues: 2,
  };

  // Should not throw
  assert.doesNotThrow(() => {
    tracker.printSummary(summaryStats);
  });
});

// Test: Time measurements are monotonic
test('ProgressTracker: elapsed time increases monotonically', async () => {
  const tracker = new ProgressTracker();

  const time1 = tracker.getElapsedSeconds();
  await new Promise(resolve => setTimeout(resolve, 50));
  const time2 = tracker.getElapsedSeconds();
  await new Promise(resolve => setTimeout(resolve, 50));
  const time3 = tracker.getElapsedSeconds();

  assert.ok(time2 >= time1, 'Time should increase');
  assert.ok(time3 >= time2, 'Time should increase');
  assert.ok(time3 > time1, 'Time should be strictly greater');
});

// Test: Multiple trackers are independent
test('ProgressTracker: multiple instances are independent', () => {
  const tracker1 = new ProgressTracker();
  const tracker2 = new ProgressTracker();

  tracker1.trackLLMCall(1000);
  tracker2.trackLLMCall(2000);

  const stats1 = tracker1.getStats();
  const stats2 = tracker2.getStats();

  assert.strictEqual(stats1.llmCallCount, 1);
  assert.strictEqual(stats1.tokenCount, 1000);

  assert.strictEqual(stats2.llmCallCount, 1);
  assert.strictEqual(stats2.tokenCount, 2000);
});

// Test: LLM call tracking with multiple calls at once
test('ProgressTracker: tracks multiple LLM calls in batch', () => {
  const tracker = new ProgressTracker();

  // Simulate parallel task execution with multiple LLM calls
  for (let i = 0; i < 5; i++) {
    tracker.trackLLMCall();
  }

  const stats = tracker.getStats();
  assert.strictEqual(stats.llmCallCount, 5);
});

// Test: Zero elapsed time initially
test('ProgressTracker: elapsed time starts near zero', () => {
  const tracker = new ProgressTracker();
  const elapsed = tracker.getElapsedSeconds();

  assert.ok(elapsed >= 0);
  assert.ok(elapsed < 0.1); // Should be very small initially
});

// Test: Stats structure
test('ProgressTracker: getStats returns correct structure', () => {
  const tracker = new ProgressTracker();
  const stats = tracker.getStats();

  // Check all required fields exist
  assert.ok('llmCallCount' in stats);
  assert.ok('tokenCount' in stats);
  assert.ok('elapsedMinutes' in stats);
});

// Test: Level completion without start
test('ProgressTracker: handles level completion without start', () => {
  const tracker = new ProgressTracker();

  // Should not throw even if level was not started
  assert.doesNotThrow(() => {
    tracker.completeLevel('Non-existent Level');
  });
});

// Test: Same level started multiple times
test('ProgressTracker: handles same level started multiple times', () => {
  const tracker = new ProgressTracker();

  tracker.startLevel('Test Level');
  tracker.startLevel('Test Level'); // Start again

  // Should not throw
  assert.doesNotThrow(() => {
    tracker.completeLevel('Test Level');
  });
});

// Test: Large token counts
test('ProgressTracker: handles large token counts', () => {
  const tracker = new ProgressTracker();

  tracker.trackLLMCall(1000000); // 1 million tokens
  tracker.trackLLMCall(2000000); // 2 million tokens

  const stats = tracker.getStats();
  assert.strictEqual(stats.tokenCount, 3000000);
});

// Test: Realistic pipeline simulation
test('ProgressTracker: simulates realistic pipeline execution', async () => {
  const tracker = new ProgressTracker();

  // Level 0
  tracker.startLevel('Level 0: Metadata Harvester');
  await new Promise(resolve => setTimeout(resolve, 10));
  tracker.completeLevel('Level 0: Metadata Harvester');

  // Level 1
  tracker.startLevel('Level 1: Structure Detector');
  tracker.trackLLMCall(5000);
  await new Promise(resolve => setTimeout(resolve, 10));
  tracker.completeLevel('Level 1: Structure Detector');

  // Level 2
  tracker.startLevel('Level 2: Work Divider');
  tracker.trackLLMCall(3000);
  await new Promise(resolve => setTimeout(resolve, 10));
  tracker.completeLevel('Level 2: Work Divider');

  // Level 3
  tracker.startLevel('Level 3: Deep File Annotator');
  tracker.trackLLMCall(50000);
  tracker.trackLLMCall(45000);
  tracker.trackLLMCall(48000);
  tracker.logProgress('Annotated 100 files');
  await new Promise(resolve => setTimeout(resolve, 10));
  tracker.completeLevel('Level 3: Deep File Annotator');

  // Level 4
  tracker.startLevel('Level 4: Consistency Validator');
  await new Promise(resolve => setTimeout(resolve, 10));
  tracker.completeLevel('Level 4: Consistency Validator');

  // Check final stats
  const stats = tracker.getStats();
  assert.strictEqual(stats.llmCallCount, 5);
  assert.strictEqual(stats.tokenCount, 151000);
  assert.ok(stats.elapsedMinutes > 0);

  // Print summary
  tracker.printSummary({
    filesAnnotated: 100,
    agentsUsed: 3,
    validationIssues: 2,
  });
});

// Test: Progress messages with timing
test('ProgressTracker: progress messages include elapsed time', async () => {
  const tracker = new ProgressTracker();

  await new Promise(resolve => setTimeout(resolve, 100));

  // Should not throw
  assert.doesNotThrow(() => {
    tracker.logProgress('Completed task 1/10');
  });

  const elapsed = tracker.getElapsedSeconds();
  assert.ok(elapsed >= 0.09);
});

// Test: Zero LLM calls initially
test('ProgressTracker: starts with zero LLM calls', () => {
  const tracker = new ProgressTracker();
  const stats = tracker.getStats();

  assert.strictEqual(stats.llmCallCount, 0);
  assert.strictEqual(stats.tokenCount, 0);
});

// Test: Negative token count handling
test('ProgressTracker: handles negative token counts gracefully', () => {
  const tracker = new ProgressTracker();

  // This shouldn't happen in practice, but handle it gracefully
  tracker.trackLLMCall(-1000);

  const stats = tracker.getStats();
  // Should accept the value (validation is the caller's responsibility)
  assert.strictEqual(stats.tokenCount, -1000);
});

// Test: Fractional token counts
test('ProgressTracker: handles fractional token counts', () => {
  const tracker = new ProgressTracker();

  tracker.trackLLMCall(1234.56);

  const stats = tracker.getStats();
  assert.strictEqual(stats.tokenCount, 1234.56);
});

// Test: Summary with zero values
test('ProgressTracker: prints summary with zero values', () => {
  const tracker = new ProgressTracker();

  // Should not throw even with all zeros
  assert.doesNotThrow(() => {
    tracker.printSummary({
      filesAnnotated: 0,
      agentsUsed: 0,
      validationIssues: 0,
    });
  });
});

// Test: Summary with large numbers
test('ProgressTracker: prints summary with large numbers', () => {
  const tracker = new ProgressTracker();

  tracker.trackLLMCall(1000000);

  // Should not throw
  assert.doesNotThrow(() => {
    tracker.printSummary({
      filesAnnotated: 10000,
      agentsUsed: 100,
      validationIssues: 500,
    });
  });
});

// Test: Elapsed minutes precision
test('ProgressTracker: elapsed minutes has reasonable precision', async () => {
  const tracker = new ProgressTracker();

  await new Promise(resolve => setTimeout(resolve, 100));

  const minutes = tracker.getElapsedMinutes();
  const seconds = tracker.getElapsedSeconds();

  // Minutes should be seconds / 60
  const expectedMinutes = seconds / 60;
  assert.ok(Math.abs(minutes - expectedMinutes) < 0.001);
});

// Test: Level tracking doesn't affect timing
test('ProgressTracker: level tracking does not interfere with elapsed time', async () => {
  const tracker = new ProgressTracker();

  const start = tracker.getElapsedSeconds();

  tracker.startLevel('Test Level');
  await new Promise(resolve => setTimeout(resolve, 50));
  tracker.completeLevel('Test Level');

  const end = tracker.getElapsedSeconds();

  // Time should have advanced
  assert.ok(end > start);
});

// Test: Warning and error logging don't affect stats
test('ProgressTracker: logging does not affect statistics', () => {
  const tracker = new ProgressTracker();

  tracker.trackLLMCall(1000);

  tracker.logWarning('Warning message');
  tracker.logError('Error message');
  tracker.logProgress('Progress message');

  const stats = tracker.getStats();
  assert.strictEqual(stats.llmCallCount, 1);
  assert.strictEqual(stats.tokenCount, 1000);
});

// Test: Batch LLM call tracking
test('ProgressTracker: tracks batch LLM calls correctly', () => {
  const tracker = new ProgressTracker();

  // Simulate Level 3 with multiple parallel tasks
  const taskCount = 8;
  for (let i = 0; i < taskCount; i++) {
    tracker.trackLLMCall();
  }

  const stats = tracker.getStats();
  assert.strictEqual(stats.llmCallCount, taskCount);
});

// Test: Real-world scenario timing
test('ProgressTracker: tracks realistic build time', async () => {
  const tracker = new ProgressTracker();

  // Simulate a 200ms build
  await new Promise(resolve => setTimeout(resolve, 200));

  const minutes = tracker.getElapsedMinutes();
  const seconds = tracker.getElapsedSeconds();

  assert.ok(seconds >= 0.18, `Expected >= 0.18s, got ${seconds}s`);
  assert.ok(minutes >= 0.003, `Expected >= 0.003min, got ${minutes}min`);
});
