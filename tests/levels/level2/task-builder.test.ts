import { test, mock } from 'node:test';
import assert from 'node:assert';
import {
  buildTaskAssignmentPlan,
  getFilesForTask,
  printTaskPlanSummary,
  validateTaskPlan,
} from '../../../src/levels/level2/task-builder.js';
import type { Level0Output, RawFileMetadata, TaskAssignmentPlan } from '../../../src/core/types.js';
import { LOC } from '../../../src/config/index.js';

// Helper to create mock files
const createMockFile = (path: string, line_count: number, language: string = 'TypeScript'): RawFileMetadata => ({
  path,
  name: path.split('/').pop() || path,
  extension: `.${path.split('.').pop()}`,
  size_bytes: line_count * 30, // roughly
  line_count,
  language,
  raw_imports: [],
});

test('buildTaskAssignmentPlan: groups related files by directory', () => {
  const level0: Level0Output = {
    total_files: 3,
    files: [
      createMockFile('src/dir1/file1.ts', 100),
      createMockFile('src/dir1/file2.ts', 100),
      createMockFile('src/dir2/file3.ts', 100),
    ],
  };

  const plan = buildTaskAssignmentPlan(level0);

  // dir1 files should be grouped together if possible (they fit well within default 500 LOC target)
  assert.strictEqual(plan.tasks.length > 0, true);

  // They might be in one task because they're small, or split if logic splits on directory strictly.
  // Wait, logic says: shouldSplitForDir = dirChange && currentTask.totalLoc >= targetLoc * 0.5;
  // targetLoc = 500, targetLoc * 0.5 = 250.
  // current task has 200, so they might all go into 1 task. Let's make them bigger so dir change triggers a split.

  const level0Bigger: Level0Output = {
    total_files: 3,
    files: [
      createMockFile('src/dir1/file1.ts', 200),
      createMockFile('src/dir1/file2.ts', 200),
      createMockFile('src/dir2/file3.ts', 200),
    ],
  };

  const plan2 = buildTaskAssignmentPlan(level0Bigger);

  // dir1 files = 400 LOC. Next file is dir2. 400 >= 250, so it should split!
  assert.strictEqual(plan2.tasks.length, 2);
  assert.strictEqual(plan2.tasks[0].primaryDirectory, 'src/dir1');
  assert.strictEqual(plan2.tasks[1].primaryDirectory, 'src/dir2');
});

test('buildTaskAssignmentPlan: isolates large files over target LOC', () => {
  const level0: Level0Output = {
    total_files: 3,
    files: [
      createMockFile('src/small.ts', 50),
      createMockFile('src/huge.ts', LOC.TARGET_LOC_PER_TASK + 100),
      createMockFile('src/small2.ts', 50),
    ],
  };

  const plan = buildTaskAssignmentPlan(level0);

  // Because files are sorted by path, order is: huge.ts, small.ts, small2.ts
  assert.strictEqual(plan.tasks.length, 2);
  assert.strictEqual(plan.tasks[0].fileCount, 1);
  assert.strictEqual(plan.tasks[0].files[0].path, 'src/huge.ts');
  assert.strictEqual(plan.tasks[0].agentSize, 'medium');
});

test('buildTaskAssignmentPlan: trims files exceeding LLM limits', () => {
  const level0: Level0Output = {
    total_files: 1,
    files: [
      createMockFile('src/very_huge.ts', LOC.MAX_LOC_PER_FILE_FOR_LLM + 500),
    ],
  };

  const plan = buildTaskAssignmentPlan(level0);

  assert.strictEqual(plan.trimmedFileCount, 1);
  assert.strictEqual(plan.tasks[0].files[0].trimmed, true);
  assert.strictEqual(plan.tasks[0].files[0].effectiveLoc, LOC.MAX_LOC_PER_FILE_FOR_LLM);
  assert.strictEqual(plan.tasks[0].totalLoc, LOC.MAX_LOC_PER_FILE_FOR_LLM);
});

test('buildTaskAssignmentPlan: determines agent size based on complexity', () => {
  const level0Small: Level0Output = {
    total_files: 2,
    files: [
      createMockFile('src/test.json', 50, 'JSON'),
      createMockFile('src/config.yaml', 50, 'YAML'),
    ],
  };

  const planSmall = buildTaskAssignmentPlan(level0Small);
  assert.strictEqual(planSmall.tasks[0].agentSize, 'small');

  const level0Medium: Level0Output = {
    total_files: 2,
    files: [
      createMockFile('src/complex.ts', 150, 'TypeScript'), // > 100 LOC and complex ext
      createMockFile('src/complex2.ts', 150, 'TypeScript'),
    ],
  };

  const planMedium = buildTaskAssignmentPlan(level0Medium);
  assert.strictEqual(planMedium.tasks[0].agentSize, 'medium');
});

test('printTaskPlanSummary: outputs expected statistics', () => {
  const level0: Level0Output = {
    total_files: 4,
    files: [
      createMockFile('src/dir1/file1.ts', 100),
      createMockFile('src/dir1/file2.ts', 100),
      createMockFile('src/dir1/file3.ts', 100),
      createMockFile('src/dir1/file4.ts', 100),
    ],
  };

  const plan = buildTaskAssignmentPlan(level0);
  const logMock = mock.method(console, 'log', () => {});

  printTaskPlanSummary(plan);

  assert.strictEqual(logMock.mock.calls.length > 0, true);
  logMock.mock.restore();
});

test('getFilesForTask: retrieves correct files for a valid task id', () => {
  const level0: Level0Output = {
    total_files: 3,
    files: [
      createMockFile('src/dir1/file1.ts', 200),
      createMockFile('src/dir1/file2.ts', 200),
      createMockFile('src/dir2/file3.ts', 200),
    ],
  };

  const plan = buildTaskAssignmentPlan(level0);

  const files1 = getFilesForTask(plan, plan.tasks[0].taskId, level0);
  assert.strictEqual(files1.length, 2);
  assert.strictEqual(files1[0].path, 'src/dir1/file1.ts');

  // test invalid task id
  const filesInvalid = getFilesForTask(plan, 'invalid_task_id', level0);
  assert.strictEqual(filesInvalid.length, 0);
});

test('validateTaskPlan: identifies missing assignments and duplicates', () => {
  const level0: Level0Output = {
    total_files: 2,
    files: [
      createMockFile('src/file1.ts', 100),
      createMockFile('src/file2.ts', 100),
    ],
  };

  const plan = buildTaskAssignmentPlan(level0);

  const validResult = validateTaskPlan(plan, level0);
  assert.strictEqual(validResult.valid, true);

  // Clone plan and mutate to simulate errors
  const invalidPlan: TaskAssignmentPlan = JSON.parse(JSON.stringify(plan));

  // 1. Missing assignment (remove file2 from fileToTask)
  delete invalidPlan.fileToTask['src/file2.ts'];

  // 2. Duplicate assignment (add file1 to another task)
  invalidPlan.tasks.push({
    taskId: 'task_dup',
    files: [invalidPlan.tasks[0].files[0]], // Duplicate file1
    totalLoc: 100,
    originalLoc: 100,
    fileCount: 1,
    primaryDirectory: '.',
    agentSize: 'small'
  });

  // 3. Duplicate Task ID
  invalidPlan.tasks[1].taskId = invalidPlan.tasks[0].taskId;

  // 4. File count mismatch: increment totalFiles
  invalidPlan.totalFiles++;

  const invalidResult = validateTaskPlan(invalidPlan, level0);
  assert.strictEqual(invalidResult.valid, false);
  assert.ok(invalidResult.issues.some(i => i.includes('File not assigned')));
  assert.ok(invalidResult.issues.some(i => i.includes('File assigned to multiple tasks')));
  assert.ok(invalidResult.issues.some(i => i.includes('Duplicate task ID')));
  assert.ok(invalidResult.issues.some(i => i.includes('File count mismatch')));
});
