/**
 * Tests for incremental annotations module
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  appendAnnotationsToFile,
  loadIncrementalAnnotations,
  clearIncrementalAnnotations,
  finalizeAnnotations,
  getIncrementalAnnotationCount,
} from '../../src/coordinator/incremental-annotations.js';
import type { FileAnnotation } from '../../src/core/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Incremental Annotations', () => {
  const testRepoRoot = path.join(__dirname, '..', '..', 'test-temp-incremental');
  const checkpointDir = path.join(testRepoRoot, '.repo_map', '.checkpoint');
  const incrementalPath = path.join(checkpointDir, 'level3_annotations.jsonl');
  const finalPath = path.join(testRepoRoot, '.repo_map', 'annotations.json');

  const mockAnnotations: FileAnnotation[] = [
    {
      path: 'src/index.ts',
      language: 'TypeScript',
      size_bytes: 1024,
      line_count: 42,
      purpose: 'Main entry point',
      exports: ['main'],
      imports: ['config'],
    },
    {
      path: 'src/config.ts',
      language: 'TypeScript',
      size_bytes: 512,
      line_count: 20,
      purpose: 'Configuration module',
      exports: ['config'],
      imports: [],
    },
  ];

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(testRepoRoot)) {
      fs.rmSync(testRepoRoot, { recursive: true, force: true });
    }
    fs.mkdirSync(testRepoRoot, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testRepoRoot)) {
      fs.rmSync(testRepoRoot, { recursive: true, force: true });
    }
  });

  it('appendAnnotationsToFile: creates JSONL file with annotations', async () => {
    await appendAnnotationsToFile(testRepoRoot, mockAnnotations);

    assert.ok(fs.existsSync(incrementalPath), 'Incremental file should exist');

    const content = fs.readFileSync(incrementalPath, 'utf-8');
    const lines = content.trim().split('\n');

    assert.strictEqual(lines.length, 2, 'Should have 2 lines');

    const parsed1 = JSON.parse(lines[0]) as FileAnnotation;
    const parsed2 = JSON.parse(lines[1]) as FileAnnotation;

    assert.strictEqual(parsed1.path, 'src/index.ts');
    assert.strictEqual(parsed2.path, 'src/config.ts');
  });

  it('appendAnnotationsToFile: appends to existing file', async () => {
    const batch1 = [mockAnnotations[0]];
    const batch2 = [mockAnnotations[1]];

    await appendAnnotationsToFile(testRepoRoot, batch1);
    await appendAnnotationsToFile(testRepoRoot, batch2);

    const content = fs.readFileSync(incrementalPath, 'utf-8');
    const lines = content.trim().split('\n');

    assert.strictEqual(lines.length, 2, 'Should have 2 lines after appending');
  });

  it('appendAnnotationsToFile: handles empty array', async () => {
    await appendAnnotationsToFile(testRepoRoot, []);

    assert.ok(!fs.existsSync(incrementalPath), 'File should not be created for empty array');
  });

  it('loadIncrementalAnnotations: loads annotations from JSONL', async () => {
    await appendAnnotationsToFile(testRepoRoot, mockAnnotations);

    const loaded = await loadIncrementalAnnotations(testRepoRoot);

    assert.strictEqual(loaded.length, 2);
    assert.strictEqual(loaded[0].path, 'src/index.ts');
    assert.strictEqual(loaded[1].path, 'src/config.ts');
  });

  it('loadIncrementalAnnotations: returns empty array when file does not exist', async () => {
    const loaded = await loadIncrementalAnnotations(testRepoRoot);

    assert.deepStrictEqual(loaded, []);
  });

  it('loadIncrementalAnnotations: handles empty file', async () => {
    fs.mkdirSync(checkpointDir, { recursive: true });
    fs.writeFileSync(incrementalPath, '', 'utf-8');

    const loaded = await loadIncrementalAnnotations(testRepoRoot);

    assert.deepStrictEqual(loaded, []);
  });

  it('clearIncrementalAnnotations: deletes incremental file', async () => {
    await appendAnnotationsToFile(testRepoRoot, mockAnnotations);
    assert.ok(fs.existsSync(incrementalPath), 'File should exist before clear');

    await clearIncrementalAnnotations(testRepoRoot);

    assert.ok(!fs.existsSync(incrementalPath), 'File should be deleted after clear');
  });

  it('clearIncrementalAnnotations: handles non-existent file gracefully', async () => {
    // Should not throw
    await clearIncrementalAnnotations(testRepoRoot);
  });

  it('finalizeAnnotations: consolidates JSONL into annotations.json', async () => {
    await appendAnnotationsToFile(testRepoRoot, mockAnnotations);

    await finalizeAnnotations(testRepoRoot);

    assert.ok(fs.existsSync(finalPath), 'Final annotations.json should exist');

    const content = fs.readFileSync(finalPath, 'utf-8');
    const parsed = JSON.parse(content) as FileAnnotation[];

    assert.strictEqual(parsed.length, 2);
    assert.strictEqual(parsed[0].path, 'src/index.ts');
    assert.strictEqual(parsed[1].path, 'src/config.ts');
  });

  it('finalizeAnnotations: creates properly formatted JSON', async () => {
    await appendAnnotationsToFile(testRepoRoot, mockAnnotations);

    await finalizeAnnotations(testRepoRoot);

    const content = fs.readFileSync(finalPath, 'utf-8');

    // Should be pretty-printed with 2-space indentation
    assert.ok(content.includes('\n  '), 'Should have pretty-printed indentation');
  });

  it('getIncrementalAnnotationCount: returns correct count', async () => {
    await appendAnnotationsToFile(testRepoRoot, mockAnnotations);

    const count = await getIncrementalAnnotationCount(testRepoRoot);

    assert.strictEqual(count, 2);
  });

  it('getIncrementalAnnotationCount: returns 0 for non-existent file', async () => {
    const count = await getIncrementalAnnotationCount(testRepoRoot);

    assert.strictEqual(count, 0);
  });

  it('getIncrementalAnnotationCount: returns 0 for empty file', async () => {
    fs.mkdirSync(checkpointDir, { recursive: true });
    fs.writeFileSync(incrementalPath, '', 'utf-8');

    const count = await getIncrementalAnnotationCount(testRepoRoot);

    assert.strictEqual(count, 0);
  });

  it('incremental workflow: append, load, finalize', async () => {
    // Simulate Level 3 incremental saves
    const batch1 = [mockAnnotations[0]];
    const batch2 = [mockAnnotations[1]];

    // Task 1 completes
    await appendAnnotationsToFile(testRepoRoot, batch1);
    let count = await getIncrementalAnnotationCount(testRepoRoot);
    assert.strictEqual(count, 1, 'Should have 1 annotation after first task');

    // Task 2 completes
    await appendAnnotationsToFile(testRepoRoot, batch2);
    count = await getIncrementalAnnotationCount(testRepoRoot);
    assert.strictEqual(count, 2, 'Should have 2 annotations after second task');

    // Load all annotations (for resume)
    const loaded = await loadIncrementalAnnotations(testRepoRoot);
    assert.strictEqual(loaded.length, 2);

    // Finalize into annotations.json
    await finalizeAnnotations(testRepoRoot);

    const finalContent = fs.readFileSync(finalPath, 'utf-8');
    const final = JSON.parse(finalContent) as FileAnnotation[];
    assert.strictEqual(final.length, 2);
  });

  it('resume workflow: load existing, append new', async () => {
    // Simulate interrupted Level 3
    await appendAnnotationsToFile(testRepoRoot, [mockAnnotations[0]]);

    // Resume: load existing
    const existing = await loadIncrementalAnnotations(testRepoRoot);
    assert.strictEqual(existing.length, 1);

    // Complete remaining tasks
    await appendAnnotationsToFile(testRepoRoot, [mockAnnotations[1]]);

    // Load all
    const all = await loadIncrementalAnnotations(testRepoRoot);
    assert.strictEqual(all.length, 2);
  });
});
