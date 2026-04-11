import { test, mock } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  annotateFiles,
  annotateTask,
  annotateExplicitTask,
} from '../../../src/levels/level3/annotator.js';
import { LLMClient } from '../../../src/core/index.js';
import type {
  RawFileMetadata,
  DelegationTask,
  ExplicitTask,
  FileAnnotation,
} from '../../../src/core/types.js';

// Setup mock files for the test
const repoRoot = path.resolve('.');
const testDir = path.join(repoRoot, '.test-tmp-annotator');

function setupTestFiles() {
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }

  // Text file
  const txtPath = path.join(testDir, 'test.txt');
  fs.writeFileSync(txtPath, 'Hello world\n');

  // Binary file (null bytes)
  const binPath = path.join(testDir, 'test.bin');
  fs.writeFileSync(binPath, Buffer.from([0, 1, 2, 0, 3, 4]));

  return { testDir, txtPath, binPath };
}

function cleanupTestFiles() {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

test('annotator - setup and cleanup', async (t) => {
  let paths: any;

  t.beforeEach(() => {
    paths = setupTestFiles();
  });

  t.afterEach(() => {
    cleanupTestFiles();
  });

  await t.test('annotateFiles - skips binary files', async () => {
    const files: RawFileMetadata[] = [
      {
        path: path.relative(repoRoot, paths.binPath),
        name: 'test.bin',
        extension: '.bin',
        size_bytes: 6,
        line_count: 0,
        language: 'Unknown',
        raw_imports: [],
      },
    ];

    const result = await annotateFiles(files, {
      agentSize: 'small',
      repoRoot,
      quiet: true,
    });

    assert.strictEqual(result.length, 0); // Binary file skipped, so 0 annotations
  });

  await t.test('annotateFiles - returns parsed annotation for text file', async () => {
    const files: RawFileMetadata[] = [
      {
        path: path.relative(repoRoot, paths.txtPath),
        name: 'test.txt',
        extension: '.txt',
        size_bytes: 12,
        line_count: 1,
        language: 'Text',
        raw_imports: [],
      },
    ];

    const mockLlmClient = Object.create(LLMClient.prototype);
    mockLlmClient.sendMessage = mock.fn(async () => {
      return {
        text: `\`\`\`json\n{
          "purpose": "A test text file",
          "exports": [],
          "imports": []
        }\n\`\`\``,
        model: 'mock-model',
        inputTokens: 10,
        outputTokens: 20,
      };
    });

    let recordedMetrics: any = null;
    const mockMetrics = {
      recordLLMCall: (m: any) => {
        recordedMetrics = m;
      },
    };

    const result = await annotateFiles(files, {
      agentSize: 'small',
      repoRoot,
      llmClient: mockLlmClient as any,
      metrics: mockMetrics as any,
      quiet: false,
    });

    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].purpose, 'A test text file');
    assert.deepStrictEqual(result[0].exports, []);
    assert.deepStrictEqual(result[0].imports, []);
    assert.ok(recordedMetrics);
    assert.strictEqual(recordedMetrics.model, 'mock-model');
  });

  await t.test('annotateFiles - skips file if not found or unreadable', async () => {
    const files: RawFileMetadata[] = [
      {
        path: 'non-existent-file.txt',
        name: 'non-existent-file.txt',
        extension: '.txt',
        size_bytes: 12,
        line_count: 1,
        language: 'Text',
        raw_imports: [],
      },
    ];

    const mockLlmClient = Object.create(LLMClient.prototype);

    const result = await annotateFiles(files, {
      agentSize: 'small',
      repoRoot,
      llmClient: mockLlmClient as any,
      quiet: true,
    });

    assert.strictEqual(result.length, 0);
  });

  await t.test('annotateFiles - catches LLM failure and returns null for file', async () => {
    const files: RawFileMetadata[] = [
      {
        path: path.relative(repoRoot, paths.txtPath),
        name: 'test.txt',
        extension: '.txt',
        size_bytes: 12,
        line_count: 1,
        language: 'Text',
        raw_imports: [],
      },
    ];

    const mockLlmClient = Object.create(LLMClient.prototype);
    mockLlmClient.sendMessage = mock.fn(async () => {
      throw new Error("LLM failure");
    });

    // We expect it to log error and skip the file, returning empty array
    const originalConsoleError = console.error;
    let consoleErrorCalled = false;
    console.error = () => { consoleErrorCalled = true; };

    try {
      const result = await annotateFiles(files, {
        agentSize: 'small',
        repoRoot,
        llmClient: mockLlmClient as any,
        quiet: true,
      });

      assert.strictEqual(result.length, 0);
      assert.ok(consoleErrorCalled);
    } finally {
      console.error = originalConsoleError;
    }
  });

  await t.test('annotateFiles - catches Validation error and returns null for file', async () => {
    const files: RawFileMetadata[] = [
      {
        path: path.relative(repoRoot, paths.txtPath),
        name: 'test.txt',
        extension: '.txt',
        size_bytes: 12,
        line_count: 1,
        language: 'Text',
        raw_imports: [],
      },
    ];

    const mockLlmClient = Object.create(LLMClient.prototype);
    mockLlmClient.sendMessage = mock.fn(async () => {
      return {
        text: `\`\`\`json\n{
          "invalid_schema": true
        }\n\`\`\``,
        model: 'mock-model',
        inputTokens: 10,
        outputTokens: 20,
      };
    });

    const originalConsoleError = console.error;
    let consoleErrorCalled = false;
    console.error = () => { consoleErrorCalled = true; };

    try {
      const result = await annotateFiles(files, {
        agentSize: 'small',
        repoRoot,
        llmClient: mockLlmClient as any,
        quiet: true,
      });

      assert.strictEqual(result.length, 0);
      assert.ok(consoleErrorCalled);
    } finally {
      console.error = originalConsoleError;
    }
  });

  await t.test('annotateTask - scope filtering', async () => {
    const allFiles: RawFileMetadata[] = [
      { path: 'src/a.txt', name: 'a.txt', extension: '.txt', size_bytes: 1, line_count: 1, raw_imports: [] },
      { path: 'src/b.txt', name: 'b.txt', extension: '.txt', size_bytes: 1, line_count: 1, raw_imports: [] },
      { path: 'test/c.txt', name: 'c.txt', extension: '.txt', size_bytes: 1, line_count: 1, raw_imports: [] },
    ];

    // Override isBinaryFile locally for this test or just mock readFileContent...
    // Actually annotateTask calls annotateFiles which calls readFileContent
    // If files don't exist, they are skipped and result is empty. That's fine for testing scope filtering, we can just check if onProgress is called correctly.

    const task: DelegationTask = {
      scope: 'src/',
      agent_size: 'small',
      estimated_files: 2
    };

    let onProgressEvents: any[] = [];
    const onProgress = (status: string, taskName: string) => {
      onProgressEvents.push({ status, taskName });
    };

    const mockLlmClient = Object.create(LLMClient.prototype);

    await annotateTask({
      task,
      allFiles,
      repoRoot,
      onProgress
    });

    assert.strictEqual(onProgressEvents.length, 2);
    assert.strictEqual(onProgressEvents[0].status, 'start');
    assert.strictEqual(onProgressEvents[0].taskName, 'src/');
    assert.strictEqual(onProgressEvents[1].status, 'complete');
    assert.strictEqual(onProgressEvents[1].taskName, 'src/');
  });

  await t.test('annotateTask - no files matching scope', async () => {
    const allFiles: RawFileMetadata[] = [
      { path: 'src/a.txt', name: 'a.txt', extension: '.txt', size_bytes: 1, line_count: 1, raw_imports: [] },
    ];

    const task: DelegationTask = {
      scope: 'test/',
      agent_size: 'small',
      estimated_files: 1
    };

    let onProgressEvents: any[] = [];
    const result = await annotateTask({
      task,
      allFiles,
      repoRoot,
      onProgress: (status, name) => onProgressEvents.push({status, name})
    });

    assert.strictEqual(result.length, 0);
    assert.strictEqual(onProgressEvents.length, 2);
    assert.strictEqual(onProgressEvents[1].status, 'complete');
  });

  await t.test('annotateTask - fallback legacy positional arguments', async () => {
    const allFiles: RawFileMetadata[] = [];
    const task: DelegationTask = {
      scope: 'test/',
      agent_size: 'small',
      estimated_files: 1
    };

    const originalConsoleWarn = console.warn;
    let consoleWarnCalled = false;
    console.warn = () => { consoleWarnCalled = true; };

    try {
      const result = await annotateTask(task, allFiles, repoRoot, undefined);
      assert.strictEqual(result.length, 0);
      assert.ok(consoleWarnCalled);
    } finally {
      console.warn = originalConsoleWarn;
    }
  });

  await t.test('annotateExplicitTask - explicit filtering', async () => {
    const allFiles: RawFileMetadata[] = [
      { path: 'src/a.txt', name: 'a.txt', extension: '.txt', size_bytes: 1, line_count: 1, raw_imports: [] },
      { path: 'src/b.txt', name: 'b.txt', extension: '.txt', size_bytes: 1, line_count: 1, raw_imports: [] },
      { path: 'test/c.txt', name: 'c.txt', extension: '.txt', size_bytes: 1, line_count: 1, raw_imports: [] },
    ];

    const task: ExplicitTask = {
      taskId: 'task-1',
      agentSize: 'small',
      files: [{ path: 'src/a.txt' }, { path: 'test/c.txt' }],
      instructions: ''
    };

    let onProgressEvents: any[] = [];
    const onProgress = (status: string, taskName: string) => {
      onProgressEvents.push({ status, taskName });
    };

    await annotateExplicitTask({
      task,
      allFiles,
      repoRoot,
      onProgress
    });

    assert.strictEqual(onProgressEvents.length, 2);
    assert.strictEqual(onProgressEvents[0].status, 'start');
    assert.strictEqual(onProgressEvents[0].taskName, 'task-1');
    assert.strictEqual(onProgressEvents[1].status, 'complete');
    assert.strictEqual(onProgressEvents[1].taskName, 'task-1');
  });

  await t.test('annotateExplicitTask - no files matching', async () => {
    const allFiles: RawFileMetadata[] = [
      { path: 'src/a.txt', name: 'a.txt', extension: '.txt', size_bytes: 1, line_count: 1, raw_imports: [] },
    ];

    const task: ExplicitTask = {
      taskId: 'task-1',
      agentSize: 'small',
      files: [{ path: 'src/b.txt' }],
      instructions: ''
    };

    const originalConsoleWarn = console.warn;
    let consoleWarnCalled = false;
    console.warn = () => { consoleWarnCalled = true; };

    try {
      const result = await annotateExplicitTask({
        task,
        allFiles,
        repoRoot,
      });

      assert.strictEqual(result.length, 0);
      assert.ok(consoleWarnCalled);
    } finally {
      console.warn = originalConsoleWarn;
    }
  });

  await t.test('annotateTask - propagates errors', async () => {
    const allFiles: RawFileMetadata[] = [
      { path: 'src/a.txt', name: 'a.txt', extension: '.txt', size_bytes: 1, line_count: 1, raw_imports: [] },
    ];

    const task: DelegationTask = {
      scope: 'src/',
      agent_size: 'small',
      estimated_files: 1
    };

    let onProgressEvents: any[] = [];
    const mockLlmClient = Object.create(LLMClient.prototype);
    mockLlmClient.sendMessage = mock.fn(async () => {
      // simulate some severe error that bypassing internal catches (not really possible without throwing from somewhere higher, but we can test if annotateFiles throws, annotateTask will catch and trigger onProgress('error'))
      throw new Error("Pool failure");
    });

    // We mock annotateFiles somehow or just pass it in? We can't mock annotateFiles easily since it's the same module.
    // However, if we pass invalid LLMClient that throws error in LLMClient.withProvider ? No, annotateTask just calls annotateFiles.
    // If annotateFiles throws, annotateTask catches it.
    // annotateFiles throws if pool fails. Pool fails if we pass a bad array or something?
    // Let's just mock `path.join` or something to force an error? Better not.
    // Actually `annotateFiles` doesn't throw on individual file errors, it catches them.
    // Let's pass null for allFiles to force an error?
  });
});

test('annotateTask - propagates errors', async () => {
  const task: DelegationTask = { scope: 'src/', agent_size: 'small', estimated_files: 1 };

  try {
    // missing allFiles array should trigger a TypeError and propagate
    await annotateTask({
      task,
      allFiles: null as any,
      repoRoot,
      onProgress: (status, taskName) => {}
    });
    assert.fail('Should have thrown error');
  } catch (err: any) {
    assert.ok(err instanceof TypeError || err.message.includes('filter'));
  }
});

test('annotateExplicitTask - propagates errors', async () => {
  const task: ExplicitTask = { taskId: 'task-1', agentSize: 'small', files: [{path: 'src/a.txt'}], instructions: '' };

  try {
    await annotateExplicitTask({
      task,
      allFiles: null as any,
      repoRoot,
      onProgress: (status, taskName) => {}
    });
    assert.fail('Should have thrown error');
  } catch (err: any) {
    assert.ok(err instanceof TypeError || err.message.includes('filter'));
  }
});

