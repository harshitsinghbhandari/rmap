/**
 * Integration test for import parser on real codebase files
 *
 * Tests the parser on actual rmap source files to ensure it works correctly
 * in real-world scenarios.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractImports } from '../../../src/levels/level0/parsers/index.js';

describe('Import Parser Integration', () => {
  const projectRoot = path.join(process.cwd());

  describe('Real TypeScript files', () => {
    it('should extract imports from harvester.ts', () => {
      const filePath = path.join(projectRoot, 'src/levels/level0/harvester.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      const imports = extractImports(content, 'TypeScript', filePath);

      // Should extract at least these core imports
      assert.ok(imports.length > 0, 'Should extract some imports');
      assert.ok(
        imports.includes('node:fs') || imports.some(imp => imp.includes('fs')),
        'Should extract fs import'
      );
      assert.ok(
        imports.includes('node:path') || imports.some(imp => imp.includes('path')),
        'Should extract path import'
      );
      assert.ok(
        imports.includes('node:child_process') || imports.some(imp => imp.includes('child_process')),
        'Should extract child_process import'
      );
      assert.ok(
        imports.some(imp => imp.includes('./parsers/index.js')),
        'Should extract parsers/index import'
      );
    });

    it('should extract imports from javascript.ts parser', () => {
      const filePath = path.join(
        projectRoot,
        'src/levels/level0/parsers/javascript.ts'
      );
      const content = fs.readFileSync(filePath, 'utf-8');

      const imports = extractImports(content, 'TypeScript', filePath);

      // Should extract Babel imports
      assert.ok(imports.includes('@babel/parser'), 'Should extract @babel/parser');
      assert.ok(imports.includes('@babel/traverse'), 'Should extract @babel/traverse');
      assert.ok(
        imports.some(imp => imp.includes('./types.js')),
        'Should extract types import'
      );
    });

    it('should extract imports from coordinator/pipeline.ts', () => {
      const filePath = path.join(
        projectRoot,
        'src/coordinator/pipeline.ts'
      );

      if (!fs.existsSync(filePath)) {
        console.log('Skipping: pipeline.ts not found');
        return;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const imports = extractImports(content, 'TypeScript', filePath);

      // Should extract imports from a complex file
      assert.ok(imports.length > 5, 'Should extract multiple imports from pipeline');
    });
  });

  describe('Edge cases from real code', () => {
    it('should handle files with both ESM and type imports', () => {
      const code = `
        import { describe, it } from 'node:test';
        import assert from 'node:assert';
        import type { FileAnnotation } from '../types.js';
        import { helper } from './helper.js';
      `;

      const imports = extractImports(code, 'TypeScript', 'test.ts');

      assert.ok(imports.includes('node:test'));
      assert.ok(imports.includes('node:assert'));
      assert.ok(imports.includes('../types.js'));
      assert.ok(imports.includes('./helper.js'));
      assert.strictEqual(imports.length, 4);
    });

    it('should handle files with complex import patterns', () => {
      const code = `
        import * as fs from 'node:fs';
        import path from 'node:path';
        import { execSync } from 'node:child_process';
        import type { Level0Output } from '../../core/types.js';
        import { FILE, OUTPUT } from '../../config/index.js';
        export { harvest } from './harvester.js';
        export type { RawFileMetadata } from '../../core/types.js';
      `;

      const imports = extractImports(code, 'TypeScript', 'test.ts');

      // Should extract all imports and re-exports
      assert.ok(imports.includes('node:fs'));
      assert.ok(imports.includes('node:path'));
      assert.ok(imports.includes('node:child_process'));
      assert.ok(imports.includes('../../core/types.js'));
      assert.ok(imports.includes('../../config/index.js'));
      assert.ok(imports.includes('./harvester.js'));
    });
  });

  describe('Performance', () => {
    it('should parse files quickly (< 100ms per file)', () => {
      const testFiles = [
        'src/levels/level0/harvester.ts',
        'src/levels/level0/parsers/javascript.ts',
        'src/coordinator/assembler.ts',
        'src/query/engine.ts',
      ];

      for (const relPath of testFiles) {
        const filePath = path.join(projectRoot, relPath);

        if (!fs.existsSync(filePath)) {
          continue;
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        const startTime = Date.now();

        extractImports(content, 'TypeScript', filePath);

        const duration = Date.now() - startTime;

        assert.ok(
          duration < 100,
          `${relPath} took ${duration}ms (should be < 100ms)`
        );
      }
    });

    it('should handle large files efficiently', () => {
      // Create a large test file content
      const largeFileContent = [
        ...Array(1000)
          .fill(0)
          .map((_, i) => `import module${i} from './module${i}';`),
        'export const data = "test";',
      ].join('\n');

      const startTime = Date.now();
      const imports = extractImports(largeFileContent, 'JavaScript', 'large.js');
      const duration = Date.now() - startTime;

      assert.strictEqual(imports.length, 1000);
      assert.ok(
        duration < 500,
        `Large file took ${duration}ms (should be < 500ms)`
      );
    });
  });

  describe('Accuracy verification', () => {
    it('should extract all imports from a complex real file', () => {
      const code = `
        // Complex file with various import patterns
        import React, { useState, useEffect } from 'react';
        import type { FC, ReactNode } from 'react';

        import * as utils from './utils';
        import { helper } from './helper';

        // Dynamic import
        const loadModule = async () => {
          const mod = await import('./lazy-module');
          return mod.default;
        };

        // CommonJS require
        const fs = require('fs');

        // Re-export
        export { Button } from './components/button';
        export * from './components/input';

        // Side effect
        import './styles.css';
      `;

      const imports = extractImports(code, 'TypeScript', 'complex.tsx');

      // Verify all expected imports are present
      assert.ok(imports.includes('react'));
      assert.ok(imports.includes('./utils'));
      assert.ok(imports.includes('./helper'));
      assert.ok(imports.includes('./lazy-module'));
      assert.ok(imports.includes('fs'));
      assert.ok(imports.includes('./components/button'));
      assert.ok(imports.includes('./components/input'));
      assert.ok(imports.includes('./styles.css'));

      // No duplicates (react appears multiple times but should be deduplicated)
      const uniqueImports = [...new Set(imports)];
      assert.strictEqual(
        imports.length,
        uniqueImports.length,
        'Should not have duplicate imports'
      );
    });
  });
});
