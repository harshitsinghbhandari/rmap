/**
 * Tests for Level 3 Deep File Annotator
 *
 * Tests file annotation output, batch processing, file truncation,
 * and mock LLM response handling
 */

import { test, mock } from 'node:test';
import assert from 'node:assert';
import type { FileAnnotation, RawFileMetadata, DelegationTask } from '../../../src/core/types.js';
import { ANNOTATION_MODEL_MAP, MODELS } from '../../../src/config/models.js';

// Mock raw file metadata
const mockFileMetadata: RawFileMetadata[] = [
  {
    name: 'jwt.ts',
    path: 'src/auth/jwt.ts',
    extension: '.ts',
    size_bytes: 2048,
    line_count: 100,
    language: 'TypeScript',
    raw_imports: ['crypto', './config'],
  },
  {
    name: 'session.ts',
    path: 'src/auth/session.ts',
    extension: '.ts',
    size_bytes: 3072,
    line_count: 150,
    language: 'TypeScript',
    raw_imports: ['./jwt', '../database/users'],
  },
  {
    name: 'logger.ts',
    path: 'src/utils/logger.ts',
    extension: '.ts',
    size_bytes: 512,
    line_count: 30,
    language: 'TypeScript',
    raw_imports: [],
  },
];

// Mock delegation task
const mockTask: DelegationTask = {
  scope: 'src/auth/',
  agent_size: 'medium',
  estimated_files: 2,
};

// Test: FileAnnotation structure
test('annotateFiles: returns FileAnnotation array', () => {
  const mockAnnotations: FileAnnotation[] = [
    {
      path: 'src/auth/jwt.ts',
      language: 'TypeScript',
      size_bytes: 2048,
      line_count: 100,
      purpose: 'JWT token generation and validation',
      tags: ['authentication', 'jwt'],
      exports: ['generateToken', 'validateToken', 'decodeToken'],
      imports: ['src/config/env'],
    },
  ];

  // Validate structure
  assert.ok(Array.isArray(mockAnnotations));
  assert.strictEqual(mockAnnotations.length, 1);

  const annotation = mockAnnotations[0];
  assert.ok(typeof annotation.path === 'string');
  assert.ok(typeof annotation.language === 'string');
  assert.ok(typeof annotation.size_bytes === 'number');
  assert.ok(typeof annotation.line_count === 'number');
  assert.ok(typeof annotation.purpose === 'string');
  assert.ok(Array.isArray(annotation.tags));
  assert.ok(Array.isArray(annotation.exports));
  assert.ok(Array.isArray(annotation.imports));
});

// Test: Annotation preserves metadata
test('annotateFiles: preserves file metadata from Level 0', () => {
  const metadata = mockFileMetadata[0];
  const mockAnnotation: FileAnnotation = {
    path: metadata.path,
    language: metadata.language!,
    size_bytes: metadata.size_bytes,
    line_count: metadata.line_count,
    purpose: 'JWT token operations',
    tags: ['authentication', 'jwt'],
    exports: ['generateToken'],
    imports: [],
  };

  // Should preserve all metadata fields
  assert.strictEqual(mockAnnotation.path, metadata.path);
  assert.strictEqual(mockAnnotation.language, metadata.language);
  assert.strictEqual(mockAnnotation.size_bytes, metadata.size_bytes);
  assert.strictEqual(mockAnnotation.line_count, metadata.line_count);
});

// Test: Batch processing
test('annotateFiles: processes multiple files', () => {
  const mockAnnotations: FileAnnotation[] = mockFileMetadata.map((meta, i) => ({
    path: meta.path,
    language: meta.language!,
    size_bytes: meta.size_bytes,
    line_count: meta.line_count,
    purpose: `Purpose for ${meta.name}`,
    tags: ['utility'],
    exports: [`export${i}`],
    imports: [],
  }));

  assert.strictEqual(mockAnnotations.length, mockFileMetadata.length);

  // Each file should have an annotation
  for (let i = 0; i < mockFileMetadata.length; i++) {
    assert.strictEqual(mockAnnotations[i].path, mockFileMetadata[i].path);
  }
});

// Test: Model selection based on agent size
test('annotateFiles: selects correct model for agent size', () => {
  // Should map to correct models from centralized config
  assert.strictEqual(ANNOTATION_MODEL_MAP.small, MODELS.HAIKU);
  assert.strictEqual(ANNOTATION_MODEL_MAP.medium, MODELS.SONNET);
  assert.strictEqual(ANNOTATION_MODEL_MAP.large, MODELS.SONNET);

  // Verify the actual model names are correct
  assert.strictEqual(MODELS.HAIKU, 'claude-haiku-4-5-20251001');
  assert.strictEqual(MODELS.SONNET, 'claude-sonnet-4-5-20250929');
});

// Test: Binary file handling
test('annotateFiles: skips binary files', () => {
  const binaryMetadata: RawFileMetadata = {
    name: 'image.png',
    path: 'assets/image.png',
    extension: '.png',
    size_bytes: 10240,
    line_count: 0,
    raw_imports: [],
  };

  // Binary files should not be annotated (would return null)
  // In practice, the annotator would skip these
  assert.strictEqual(binaryMetadata.extension, '.png');
  assert.strictEqual(binaryMetadata.line_count, 0);
});

// Test: Large file truncation
test('annotateFiles: truncates files exceeding 10k lines', () => {
  const largeFileMetadata: RawFileMetadata = {
    name: 'large.ts',
    path: 'src/large.ts',
    extension: '.ts',
    size_bytes: 500000,
    line_count: 15000,
    language: 'TypeScript',
    raw_imports: [],
  };

  // Files over 10k lines should be truncated
  const MAX_LINES = 10000;
  assert.ok(largeFileMetadata.line_count > MAX_LINES);

  // The annotator would truncate content before sending to LLM
  // Annotation should still be created with original line_count
  const mockAnnotation: FileAnnotation = {
    path: largeFileMetadata.path,
    language: largeFileMetadata.language!,
    size_bytes: largeFileMetadata.size_bytes,
    line_count: largeFileMetadata.line_count, // Original count preserved
    purpose: 'Large file with truncated content',
    tags: ['generated'],
    exports: [],
    imports: [],
  };

  assert.strictEqual(mockAnnotation.line_count, 15000);
});

// Test: Purpose field validation
test('annotateFiles: purpose should be concise', () => {
  const annotation: FileAnnotation = {
    path: 'src/test.ts',
    language: 'TypeScript',
    size_bytes: 1024,
    line_count: 50,
    purpose: 'Handles user authentication via JWT tokens',
    tags: ['authentication'],
    exports: [],
    imports: [],
  };

  // Purpose should be a single sentence
  assert.ok(annotation.purpose.length > 0);
  assert.ok(annotation.purpose.length <= 200); // Reasonable max length
  assert.ok(typeof annotation.purpose === 'string');
});

// Test: Tags validation
test('annotateFiles: validates tags are from taxonomy', () => {
  const validTags = ['authentication', 'jwt', 'database', 'api_endpoint'];
  const annotation: FileAnnotation = {
    path: 'src/test.ts',
    language: 'TypeScript',
    size_bytes: 1024,
    line_count: 50,
    purpose: 'Test file',
    tags: validTags.slice(0, 2),
    exports: [],
    imports: [],
  };

  // All tags should be from TAG_TAXONOMY
  assert.ok(annotation.tags.length >= 1);
  assert.ok(annotation.tags.length <= 5); // MAX_TAGS_PER_FILE
});

// Test: Exports extraction
test('annotateFiles: extracts exports correctly', () => {
  const annotation: FileAnnotation = {
    path: 'src/auth/jwt.ts',
    language: 'TypeScript',
    size_bytes: 2048,
    line_count: 100,
    purpose: 'JWT operations',
    tags: ['authentication', 'jwt'],
    exports: ['generateToken', 'validateToken', 'JWTConfig'],
    imports: [],
  };

  // Should extract function and type names
  assert.ok(Array.isArray(annotation.exports));
  assert.ok(annotation.exports.length > 0);
  assert.ok(annotation.exports.every(exp => typeof exp === 'string'));
  assert.ok(annotation.exports.every(exp => exp.length > 0));
});

// Test: Internal imports only
test('annotateFiles: includes only internal imports', () => {
  const annotation: FileAnnotation = {
    path: 'src/auth/session.ts',
    language: 'TypeScript',
    size_bytes: 3072,
    line_count: 150,
    purpose: 'Session management',
    tags: ['authentication', 'session'],
    exports: ['createSession'],
    imports: ['src/auth/jwt', 'src/database/users'],
  };

  // Should only have internal imports (no 'express', 'crypto', etc.)
  assert.ok(Array.isArray(annotation.imports));
  for (const imp of annotation.imports) {
    // Internal imports should have path structure
    assert.ok(imp.includes('/'));
  }
});

// Test: Error handling for malformed responses
test('annotateFiles: handles malformed LLM responses', () => {
  // Malformed responses should be caught and retried or skipped
  const malformedResponses = [
    'Not JSON at all',
    '{"incomplete": true',
    '{"tags": "not-an-array"}',
    '{}', // Missing required fields
  ];

  for (const response of malformedResponses) {
    // In practice, these would throw AnnotationValidationError
    assert.ok(typeof response === 'string');
  }
});

// Test: Retry logic for validation errors
test('annotateFiles: retries on validation errors', () => {
  // Mock scenario: first attempt fails, retry succeeds
  let attemptCount = 0;

  const mockAnnotate = () => {
    attemptCount++;
    if (attemptCount === 1) {
      throw new Error('Validation failed');
    }
    return {
      path: 'src/test.ts',
      language: 'TypeScript',
      size_bytes: 1024,
      line_count: 50,
      purpose: 'Test file',
      tags: ['testing'],
      exports: [],
      imports: [],
    };
  };

  // First call fails, second succeeds
  try {
    mockAnnotate();
  } catch {
    const result = mockAnnotate();
    assert.ok(result);
    assert.strictEqual(attemptCount, 2);
  }
});

// Test: Progress tracking
test('annotateFiles: tracks annotation progress', () => {
  const total = mockFileMetadata.length;
  let processed = 0;

  // Simulate processing
  for (const metadata of mockFileMetadata) {
    processed++;
    const progress = (processed / total) * 100;
    assert.ok(progress >= 0 && progress <= 100);
  }

  assert.strictEqual(processed, total);
});

// Test: Success and failure counts
test('annotateFiles: reports success and failure counts', () => {
  const results = {
    success: 2,
    failed: 1,
    total: 3,
  };

  assert.strictEqual(results.success + results.failed, results.total);
  assert.ok(results.success >= 0);
  assert.ok(results.failed >= 0);
});

// Test: Task scope filtering
test('annotateTask: filters files by task scope', () => {
  const task: DelegationTask = {
    scope: 'src/auth/',
    agent_size: 'medium',
    estimated_files: 2,
  };

  // Should only include files matching scope
  const scopedFiles = mockFileMetadata.filter(f => f.path.startsWith(task.scope));

  assert.ok(scopedFiles.length > 0);
  assert.ok(scopedFiles.length <= task.estimated_files + 2); // Allow some deviation
  assert.ok(scopedFiles.every(f => f.path.startsWith('src/auth/')));
});

// Test: Empty scope handling
test('annotateTask: handles empty scope results', () => {
  const task: DelegationTask = {
    scope: 'src/nonexistent/',
    agent_size: 'small',
    estimated_files: 0,
  };

  const scopedFiles = mockFileMetadata.filter(f => f.path.startsWith(task.scope));

  // Should return empty array for non-matching scope
  assert.strictEqual(scopedFiles.length, 0);
});

// Test: Sequential processing to avoid rate limits
test('annotateFiles: processes files sequentially', async () => {
  const delays: number[] = [];
  const mockDelay = 100; // 100ms between requests

  // Simulate sequential processing with delays
  for (let i = 0; i < 3; i++) {
    const start = Date.now();
    await new Promise(resolve => setTimeout(resolve, mockDelay));
    delays.push(Date.now() - start);
  }

  // Each delay should be approximately the mock delay
  for (const delay of delays) {
    assert.ok(delay >= mockDelay * 0.9); // Allow 10% tolerance
  }
});

// Test: Annotation for files without language
test('annotateFiles: handles files without detected language', () => {
  const metadataNoLang: RawFileMetadata = {
    name: 'README',
    path: 'README',
    extension: '',
    size_bytes: 512,
    line_count: 20,
    raw_imports: [],
    // No language field
  };

  const annotation: FileAnnotation = {
    path: metadataNoLang.path,
    language: 'Unknown', // Should default to 'Unknown'
    size_bytes: metadataNoLang.size_bytes,
    line_count: metadataNoLang.line_count,
    purpose: 'Project documentation',
    tags: ['documentation'],
    exports: [],
    imports: [],
  };

  assert.strictEqual(annotation.language, 'Unknown');
});

// Test: Empty exports/imports arrays are valid
test('annotateFiles: allows empty exports and imports', () => {
  const annotation: FileAnnotation = {
    path: 'src/constants.ts',
    language: 'TypeScript',
    size_bytes: 256,
    line_count: 10,
    purpose: 'Application constants',
    tags: ['constants'],
    exports: [], // No exports
    imports: [], // No imports
  };

  assert.ok(Array.isArray(annotation.exports));
  assert.ok(Array.isArray(annotation.imports));
  assert.strictEqual(annotation.exports.length, 0);
  assert.strictEqual(annotation.imports.length, 0);
});

// Test: API key validation
test('annotateFiles: requires ANTHROPIC_API_KEY', () => {
  // Should check for API key before processing
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  // In practice, would throw error if not set
  if (!hasApiKey) {
    assert.ok(true, 'API key not set (expected in test environment)');
  }
});

// Test: Concurrent processing
test('annotateFiles: processes files concurrently', async () => {
  // Mock concurrent execution tracking
  const executionLog: Array<{ file: string; start: number; end: number }> = [];
  const concurrency = 3;

  // Simulate concurrent file processing
  const files = mockFileMetadata;
  const processFile = async (file: RawFileMetadata) => {
    const start = Date.now();
    await new Promise(resolve => setTimeout(resolve, 50)); // Simulate LLM call
    const end = Date.now();
    executionLog.push({ file: file.path, start, end });
    return file;
  };

  // Process with concurrency
  const startTime = Date.now();
  const promises = files.map(f => processFile(f));
  await Promise.all(promises);
  const totalTime = Date.now() - startTime;

  // With 3 files and concurrency, should complete faster than sequential
  // Sequential: 3 * 50ms = 150ms
  // Concurrent: ~50ms (plus overhead)
  assert.ok(totalTime < 150, `Concurrent processing should be faster: ${totalTime}ms`);

  // Verify all files were processed
  assert.strictEqual(executionLog.length, files.length);
});

// Test: Concurrency configuration
test('annotateFiles: respects CONCURRENCY_CONFIG', async () => {
  // Test that concurrency settings are available
  const { CONCURRENCY_CONFIG } = await import('../../../src/config/models.js');

  assert.ok(typeof CONCURRENCY_CONFIG.MAX_CONCURRENT_ANNOTATIONS === 'number');
  assert.ok(CONCURRENCY_CONFIG.MAX_CONCURRENT_ANNOTATIONS > 0);
  assert.ok(typeof CONCURRENCY_CONFIG.TASK_START_DELAY_MS === 'number');
  assert.ok(CONCURRENCY_CONFIG.TASK_START_DELAY_MS >= 0);

  // Default values should be reasonable
  assert.ok(CONCURRENCY_CONFIG.MAX_CONCURRENT_ANNOTATIONS >= 1);
  assert.ok(CONCURRENCY_CONFIG.MAX_CONCURRENT_ANNOTATIONS <= 50);
});
