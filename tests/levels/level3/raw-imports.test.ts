/**
 * Test that raw_imports from Level 0 are properly used in Level 3 annotations
 *
 * This test verifies the fix for issue #71 where the dependency graph was empty
 * because Level 3 was ignoring raw_imports and asking the LLM to extract imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  processRawImports,
  parseAnnotationResponseWithDetails,
} from '../../../src/levels/level3/parser.js';
import type { RawFileMetadata } from '../../../src/core/types.js';

describe('Level 3: raw_imports integration', () => {
  describe('processRawImports', () => {
    it('filters external packages and normalizes paths', () => {
      const rawImports = [
        'zod', // external package - should be filtered
        'node:fs', // node protocol - should be filtered
        '@anthropic-ai/sdk', // scoped package - should be filtered
        './utils.js', // relative import - should be normalized
        '../../config/index.ts', // relative import - should be normalized
        'src/core/validation.ts', // already absolute - should be kept
      ];

      const currentFilePath = 'src/levels/level3/annotator.ts';
      const repoRoot = '.';

      const result = processRawImports(rawImports, currentFilePath, repoRoot);

      // Should only include internal imports
      assert.strictEqual(result.includes('zod'), false, 'Should filter external package');
      assert.strictEqual(result.includes('node:fs'), false, 'Should filter node: protocol');
      assert.strictEqual(
        result.includes('@anthropic-ai/sdk'),
        false,
        'Should filter scoped package'
      );

      // Should normalize relative imports
      // From src/levels/level3/annotator.ts:
      // ./utils.js → src/levels/level3/utils
      // ../../config/index.ts → src/config/index (up 2 levels: level3 → levels → src, then into config)
      assert.ok(result.includes('src/levels/level3/utils'), 'Should normalize ./utils.js');
      assert.ok(result.includes('src/config/index'), 'Should normalize ../../config/index.ts');

      // Should keep already-absolute paths (without extension)
      assert.ok(
        result.includes('src/core/validation'),
        'Should keep absolute path (without extension)'
      );
    });

    it('removes file extensions from normalized paths', () => {
      const rawImports = ['./helper.ts', '../utils.js', 'src/core/types.tsx'];

      const result = processRawImports(rawImports, 'src/foo/bar.ts', '.');

      // All results should have extensions removed
      result.forEach((imp) => {
        assert.strictEqual(imp.endsWith('.ts'), false, `${imp} should not end with .ts`);
        assert.strictEqual(imp.endsWith('.js'), false, `${imp} should not end with .js`);
        assert.strictEqual(imp.endsWith('.tsx'), false, `${imp} should not end with .tsx`);
      });
    });

    it('handles empty raw_imports array', () => {
      const result = processRawImports([], 'src/test.ts', '.');
      assert.deepStrictEqual(result, []);
    });

    it('filters packages without path separators', () => {
      const rawImports = [
        'express', // no slash - external
        'react', // no slash - external
        'lodash', // no slash - external
        './local', // has slash - internal
      ];

      const result = processRawImports(rawImports, 'src/test.ts', '.');

      assert.strictEqual(result.includes('express'), false);
      assert.strictEqual(result.includes('react'), false);
      assert.strictEqual(result.includes('lodash'), false);
      assert.ok(result.length > 0, 'Should include the local import');
    });
  });

  describe('parseAnnotationResponseWithDetails with preExtractedImports', () => {
    const metadata: RawFileMetadata = {
      name: 'validation.ts',
      path: 'src/core/validation.ts',
      extension: '.ts',
      size_bytes: 5000,
      line_count: 200,
      language: 'TypeScript',
      raw_imports: ['zod', './constants.js', '../config/defaults.js'],
    };

    it('uses preExtractedImports instead of LLM-extracted imports', () => {
      const llmResponse = JSON.stringify({
        purpose: 'Validates data structures',
        tags: ['validation', 'core'],
        exports: ['validateSchema', 'ValidationError'],
        imports: ['wrong/path/from/llm'], // This should be ignored
      });

      const preExtractedImports = ['src/core/constants', 'src/config/defaults'];

      const result = parseAnnotationResponseWithDetails(
        llmResponse,
        metadata,
        '.',
        preExtractedImports
      );

      assert.ok(result.annotation !== null, 'Annotation should be created');
      assert.deepStrictEqual(
        result.annotation.imports,
        preExtractedImports,
        'Should use preExtractedImports, not LLM imports'
      );
    });

    it('falls back to LLM imports when preExtractedImports not provided', () => {
      const llmImports = ['src/utils/helper', 'src/lib/formatter'];
      const llmResponse = JSON.stringify({
        purpose: 'Helper utilities',
        tags: ['utility'],
        exports: ['formatData'],
        imports: llmImports,
      });

      // Don't pass preExtractedImports
      const result = parseAnnotationResponseWithDetails(llmResponse, metadata, '.');

      assert.ok(result.annotation !== null);
      // LLM imports should be normalized (paths without extensions)
      assert.ok(
        result.annotation.imports.includes('src/utils/helper'),
        'Should include normalized LLM import'
      );
    });

    it('correctly processes Level 0 raw_imports for real file example', () => {
      // Simulate what Level 0 would extract from validation.ts
      const rawImports = [
        'zod', // external - will be filtered
        './constants.js', // internal - will be normalized
        '../config/defaults.js', // internal - will be normalized
      ];

      const processedImports = processRawImports(rawImports, metadata.path, '.');

      // Should filter out 'zod' and normalize the relative paths
      assert.strictEqual(processedImports.includes('zod'), false, 'Should filter external zod');
      assert.ok(
        processedImports.includes('src/core/constants'),
        'Should normalize ./constants.js'
      );
      assert.ok(
        processedImports.includes('src/config/defaults'),
        'Should normalize ../config/defaults.js'
      );
    });

    it('handles files with only external imports', () => {
      const externalOnlyImports = ['express', 'zod', '@types/node', 'node:fs'];

      const result = processRawImports(externalOnlyImports, 'src/app.ts', '.');

      assert.deepStrictEqual(result, [], 'Should return empty array when all imports are external');
    });
  });

  describe('Integration: Level 0 raw_imports → Level 3 annotation', () => {
    it('demonstrates the full flow from raw_imports to annotation.imports', () => {
      // Step 1: Level 0 extracts raw_imports
      // Note: These are the actual imports from src/coordinator/pipeline.ts
      const level0Metadata: RawFileMetadata = {
        name: 'pipeline.ts',
        path: 'src/coordinator/pipeline.ts',
        extension: '.ts',
        size_bytes: 10000,
        line_count: 350,
        language: 'TypeScript',
        raw_imports: [
          'node:path', // external - will be filtered
          './graph.js', // internal relative: src/coordinator/graph
          './assembler.js', // internal relative: src/coordinator/assembler
          '../core/types.ts', // internal relative: src/core/types
          'zod', // external package - will be filtered
        ],
      };

      // Step 2: Level 3 processes raw_imports
      const processedImports = processRawImports(
        level0Metadata.raw_imports,
        level0Metadata.path,
        '.'
      );

      // Should only have internal imports, normalized
      // External packages and node: imports should be filtered out
      assert.strictEqual(processedImports.includes('node:path'), false, 'Should filter node:path');
      assert.strictEqual(processedImports.includes('zod'), false, 'Should filter zod');

      // Relative imports should be normalized to repo-root paths (without extensions)
      // From src/coordinator/pipeline.ts:
      //   ./graph.js → src/coordinator/graph
      //   ./assembler.js → src/coordinator/assembler
      //   ../core/types.ts → src/core/types
      assert.ok(processedImports.includes('src/coordinator/graph'), 'Should include graph');
      assert.ok(processedImports.includes('src/coordinator/assembler'), 'Should include assembler');
      assert.ok(processedImports.includes('src/core/types'), 'Should include types');

      // Step 3: LLM returns annotation (imports will be overridden)
      const llmResponse = JSON.stringify({
        purpose: 'Orchestrates the map building pipeline',
        tags: ['build', 'utility'], // Use valid taxonomy tags
        exports: ['runPipeline', 'resumeFromCheckpoint'],
        imports: ['ignored/llm/path'], // This will be ignored
      });

      // Step 4: Parse with preExtractedImports
      const result = parseAnnotationResponseWithDetails(
        llmResponse,
        level0Metadata,
        '.',
        processedImports
      );

      // Step 5: Verify final annotation has correct imports
      assert.ok(result.annotation !== null);
      assert.deepStrictEqual(
        result.annotation.imports,
        processedImports,
        'Final annotation should use Level 0 raw_imports, not LLM imports'
      );

      assert.strictEqual(result.annotation.path, 'src/coordinator/pipeline.ts');
      assert.strictEqual(result.annotation.purpose, 'Orchestrates the map building pipeline');
      assert.deepStrictEqual(result.annotation.tags, ['build', 'utility']);
    });
  });
});
