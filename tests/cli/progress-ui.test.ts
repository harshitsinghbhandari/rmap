/**
 * Tests for progress-ui.ts - TaskProgressTracker
 *
 * Tests the rolling progress view for Level 3 tasks.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { TaskProgressTracker, type TaskStatus, type TaskInfo } from '../../src/cli/progress-ui.js';

describe('TaskProgressTracker', () => {
  // In test environment, the tracker is silent (IS_TEST_ENV = true)
  // We can only test that methods don't throw and the class works correctly

  describe('constructor', () => {
    it('should create a tracker with default maxVisibleTasks', () => {
      const tracker = new TaskProgressTracker(10);
      // Should not throw
      assert.ok(tracker);
    });

    it('should create a tracker with custom maxVisibleTasks', () => {
      const tracker = new TaskProgressTracker(10, 3);
      // Should not throw
      assert.ok(tracker);
    });

    it('should handle zero total tasks', () => {
      const tracker = new TaskProgressTracker(0);
      // Should not throw
      assert.ok(tracker);
    });
  });

  describe('startTask', () => {
    it('should start a task without error', () => {
      const tracker = new TaskProgressTracker(5);
      // Should not throw
      tracker.startTask('packages/foo/');
      assert.ok(true);
    });

    it('should handle multiple tasks', () => {
      const tracker = new TaskProgressTracker(5);
      tracker.startTask('packages/foo/');
      tracker.startTask('packages/bar/');
      tracker.startTask('packages/baz/');
      // Should not throw
      assert.ok(true);
    });
  });

  describe('completeTask', () => {
    it('should complete a task without error', () => {
      const tracker = new TaskProgressTracker(5);
      tracker.startTask('packages/foo/');
      tracker.completeTask('packages/foo/');
      // Should not throw
      assert.ok(true);
    });

    it('should handle completing non-existent task gracefully', () => {
      const tracker = new TaskProgressTracker(5);
      tracker.completeTask('non-existent');
      // Should not throw
      assert.ok(true);
    });

    it('should handle completing already completed task', () => {
      const tracker = new TaskProgressTracker(5);
      tracker.startTask('packages/foo/');
      tracker.completeTask('packages/foo/');
      tracker.completeTask('packages/foo/');
      // Should not throw
      assert.ok(true);
    });
  });

  describe('errorTask', () => {
    it('should mark a task as errored without error', () => {
      const tracker = new TaskProgressTracker(5);
      tracker.startTask('packages/foo/');
      tracker.errorTask('packages/foo/');
      // Should not throw
      assert.ok(true);
    });

    it('should handle erroring non-existent task gracefully', () => {
      const tracker = new TaskProgressTracker(5);
      tracker.errorTask('non-existent');
      // Should not throw
      assert.ok(true);
    });
  });

  describe('done', () => {
    it('should finalize the tracker without error', () => {
      const tracker = new TaskProgressTracker(5);
      tracker.startTask('packages/foo/');
      tracker.completeTask('packages/foo/');
      tracker.done();
      // Should not throw
      assert.ok(true);
    });

    it('should handle done() with no tasks', () => {
      const tracker = new TaskProgressTracker(0);
      tracker.done();
      // Should not throw
      assert.ok(true);
    });
  });

  describe('clear', () => {
    it('should clear the tracker without error', () => {
      const tracker = new TaskProgressTracker(5);
      tracker.startTask('packages/foo/');
      tracker.clear();
      // Should not throw
      assert.ok(true);
    });
  });

  describe('full workflow', () => {
    it('should handle a complete workflow', () => {
      const tracker = new TaskProgressTracker(5, 3);

      // Start and complete multiple tasks
      tracker.startTask('packages/a/');
      tracker.completeTask('packages/a/');

      tracker.startTask('packages/b/');
      tracker.completeTask('packages/b/');

      tracker.startTask('packages/c/');
      tracker.errorTask('packages/c/');

      tracker.startTask('packages/d/');
      tracker.completeTask('packages/d/');

      tracker.startTask('packages/e/');
      tracker.completeTask('packages/e/');

      tracker.done();

      // Should not throw
      assert.ok(true);
    });

    it('should handle parallel task starts', () => {
      const tracker = new TaskProgressTracker(10, 5);

      // Start multiple tasks (simulating parallel execution)
      tracker.startTask('task-1');
      tracker.startTask('task-2');
      tracker.startTask('task-3');

      // Complete them in different order
      tracker.completeTask('task-2');
      tracker.completeTask('task-1');
      tracker.completeTask('task-3');

      tracker.done();

      // Should not throw
      assert.ok(true);
    });

    it('should handle long task names', () => {
      const tracker = new TaskProgressTracker(5);

      const longTaskName = 'packages/very/long/path/to/some/nested/directory/structure/';
      tracker.startTask(longTaskName);
      tracker.completeTask(longTaskName);
      tracker.done();

      // Should not throw
      assert.ok(true);
    });
  });
});

describe('TaskStatus type', () => {
  it('should accept valid status values', () => {
    const statuses: TaskStatus[] = ['pending', 'working', 'done', 'error'];
    assert.strictEqual(statuses.length, 4);
  });
});

describe('TaskInfo interface', () => {
  it('should have correct shape', () => {
    const taskInfo: TaskInfo = {
      name: 'test-task',
      status: 'working',
    };
    assert.strictEqual(taskInfo.name, 'test-task');
    assert.strictEqual(taskInfo.status, 'working');
  });
});
