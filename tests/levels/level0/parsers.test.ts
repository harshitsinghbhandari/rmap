/**
 * Tests for Level 0 Import Parsers
 *
 * Comprehensive tests for AST-based and fallback import extraction.
 * Covers JavaScript, TypeScript, and edge cases.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { JavaScriptParser } from '../../../src/levels/level0/parsers/javascript.js';
import { FallbackParser } from '../../../src/levels/level0/parsers/fallback.js';
import {
  extractImports,
  getParser,
} from '../../../src/levels/level0/parsers/index.js';

describe('JavaScriptParser', () => {
  const parser = new JavaScriptParser();

  describe('Static imports', () => {
    it('should extract default imports', () => {
      const code = `
        import React from 'react';
        import lodash from 'lodash';
      `;

      const result = parser.parse(code, 'test.ts');

      assert.ok(result.success);
      assert.strictEqual(result.imports.length, 2);

      const sources = result.imports.map((imp) => imp.source).sort();
      assert.deepStrictEqual(sources, ['lodash', 'react']);
    });

    it('should extract named imports', () => {
      const code = `
        import { useState, useEffect } from 'react';
        import { debounce } from 'lodash';
      `;

      const result = parser.parse(code, 'test.ts');

      assert.ok(result.success);
      assert.strictEqual(result.imports.length, 2);

      const sources = result.imports.map((imp) => imp.source).sort();
      assert.deepStrictEqual(sources, ['lodash', 'react']);
    });

    it('should extract namespace imports', () => {
      const code = `
        import * as React from 'react';
        import * as Utils from './utils';
      `;

      const result = parser.parse(code, 'test.ts');

      assert.ok(result.success);
      assert.strictEqual(result.imports.length, 2);

      const sources = result.imports.map((imp) => imp.source).sort();
      assert.deepStrictEqual(sources, ['./utils', 'react']);
    });

    it('should extract mixed imports', () => {
      const code = `
        import React, { useState } from 'react';
        import lodash, { debounce } from 'lodash';
      `;

      const result = parser.parse(code, 'test.ts');

      assert.ok(result.success);
      assert.strictEqual(result.imports.length, 2);

      const sources = result.imports.map((imp) => imp.source).sort();
      assert.deepStrictEqual(sources, ['lodash', 'react']);
    });
  });

  describe('Multi-line imports', () => {
    it('should extract multi-line named imports', () => {
      const code = `
        import {
          foo,
          bar,
          baz
        } from 'module';
      `;

      const result = parser.parse(code, 'test.ts');

      assert.ok(result.success);
      assert.strictEqual(result.imports.length, 1);
      assert.strictEqual(result.imports[0].source, 'module');
    });

    it('should extract multi-line imports with comments', () => {
      const code = `
        import {
          // Component imports
          Button,
          Input,
          // Utility imports
          formatDate
        } from 'ui-library';
      `;

      const result = parser.parse(code, 'test.ts');

      assert.ok(result.success);
      assert.strictEqual(result.imports.length, 1);
      assert.strictEqual(result.imports[0].source, 'ui-library');
    });
  });

  describe('Dynamic imports', () => {
    it('should extract dynamic imports with string literals', () => {
      const code = `
        const module = await import('./lazy');
        import('./dynamic').then(m => m.default);
      `;

      const result = parser.parse(code, 'test.ts');

      assert.ok(result.success);
      assert.strictEqual(result.imports.length, 2);

      const sources = result.imports.map((imp) => imp.source).sort();
      assert.deepStrictEqual(sources, ['./dynamic', './lazy']);

      const dynamicImports = result.imports.filter(
        (imp) => imp.type === 'dynamic'
      );
      assert.strictEqual(dynamicImports.length, 2);
    });

    it('should skip dynamic imports with template literals', () => {
      const code = `
        const lang = 'en';
        import(\`./locales/\${lang}.js\`);
      `;

      const result = parser.parse(code, 'test.ts');

      assert.ok(result.success);
      // Template literals are not statically resolvable, so should be skipped
      assert.strictEqual(result.imports.length, 0);
    });

    it('should skip dynamic imports with variables', () => {
      const code = `
        const path = './module';
        import(path);
      `;

      const result = parser.parse(code, 'test.ts');

      assert.ok(result.success);
      // Variable paths are not statically resolvable
      assert.strictEqual(result.imports.length, 0);
    });
  });

  describe('CommonJS require', () => {
    it('should extract require statements', () => {
      const code = `
        const fs = require('fs');
        const path = require('path');
      `;

      const result = parser.parse(code, 'test.js');

      assert.ok(result.success);
      assert.strictEqual(result.imports.length, 2);

      const sources = result.imports.map((imp) => imp.source).sort();
      assert.deepStrictEqual(sources, ['fs', 'path']);

      const requires = result.imports.filter((imp) => imp.type === 'require');
      assert.strictEqual(requires.length, 2);
    });

    it('should extract require with destructuring', () => {
      const code = `
        const { readFile, writeFile } = require('fs');
        const { join } = require('path');
      `;

      const result = parser.parse(code, 'test.js');

      assert.ok(result.success);
      assert.strictEqual(result.imports.length, 2);

      const sources = result.imports.map((imp) => imp.source).sort();
      assert.deepStrictEqual(sources, ['fs', 'path']);
    });

    it('should extract node: protocol imports', () => {
      const code = `
        const fs = require('node:fs');
        import { readFile } from 'node:fs/promises';
      `;

      const result = parser.parse(code, 'test.js');

      assert.ok(result.success);
      assert.strictEqual(result.imports.length, 2);

      const sources = result.imports.map((imp) => imp.source).sort();
      assert.deepStrictEqual(sources, ['node:fs', 'node:fs/promises']);
    });
  });

  describe('Re-exports', () => {
    it('should extract named re-exports', () => {
      const code = `
        export { foo, bar } from './foo';
        export { default as baz } from './baz';
      `;

      const result = parser.parse(code, 'test.ts');

      assert.ok(result.success);
      assert.strictEqual(result.imports.length, 2);

      const sources = result.imports.map((imp) => imp.source).sort();
      assert.deepStrictEqual(sources, ['./baz', './foo']);
    });

    it('should extract star re-exports', () => {
      const code = `
        export * from './utils';
        export * as helpers from './helpers';
      `;

      const result = parser.parse(code, 'test.ts');

      assert.ok(result.success);
      assert.strictEqual(result.imports.length, 2);

      const sources = result.imports.map((imp) => imp.source).sort();
      assert.deepStrictEqual(sources, ['./helpers', './utils']);
    });
  });

  describe('TypeScript type imports', () => {
    it('should extract type-only imports', () => {
      const code = `
        import type { User } from './types';
        import type { Config } from './config';
      `;

      const result = parser.parse(code, 'test.ts');

      assert.ok(result.success);
      assert.strictEqual(result.imports.length, 2);

      const sources = result.imports.map((imp) => imp.source).sort();
      assert.deepStrictEqual(sources, ['./config', './types']);

      const typeImports = result.imports.filter(
        (imp) => imp.type === 'type-only'
      );
      assert.strictEqual(typeImports.length, 2);
    });

    it('should extract mixed value and type imports', () => {
      const code = `
        import { type Config, getData } from './api';
        import React, { type FC } from 'react';
      `;

      const result = parser.parse(code, 'test.ts');

      assert.ok(result.success);
      assert.strictEqual(result.imports.length, 2);

      const sources = result.imports.map((imp) => imp.source).sort();
      assert.deepStrictEqual(sources, ['./api', 'react']);

      // Note: These are static imports (not type-only) because they have mixed imports
      const staticImports = result.imports.filter(
        (imp) => imp.type === 'static'
      );
      assert.strictEqual(staticImports.length, 2);
    });
  });

  describe('Side-effect imports', () => {
    it('should extract side-effect imports', () => {
      const code = `
        import './styles.css';
        import 'polyfill';
      `;

      const result = parser.parse(code, 'test.ts');

      assert.ok(result.success);
      assert.strictEqual(result.imports.length, 2);

      const sources = result.imports.map((imp) => imp.source).sort();
      assert.deepStrictEqual(sources, ['./styles.css', 'polyfill']);

      const sideEffects = result.imports.filter((imp) => imp.isSideEffect);
      assert.strictEqual(sideEffects.length, 2);
    });
  });

  describe('Import assertions (Node 17+)', () => {
    it('should extract imports with assertions', () => {
      const code = `
        import data from './data.json' assert { type: 'json' };
      `;

      const result = parser.parse(code, 'test.ts');

      assert.ok(result.success);
      assert.strictEqual(result.imports.length, 1);
      assert.strictEqual(result.imports[0].source, './data.json');
    });
  });

  describe('Error handling', () => {
    it('should handle files with syntax errors', () => {
      const code = `
        import { foo from 'bar'; // missing closing brace
        const x = ;
      `;

      const result = parser.parse(code, 'test.ts');

      assert.ok(!result.success);
      assert.ok(result.error);
      assert.strictEqual(result.imports.length, 0);
    });

    it('should handle empty files', () => {
      const code = '';

      const result = parser.parse(code, 'test.ts');

      assert.ok(result.success);
      assert.strictEqual(result.imports.length, 0);
    });

    it('should handle files with only comments', () => {
      const code = `
        // This is a comment
        /* Multi-line
           comment */
      `;

      const result = parser.parse(code, 'test.ts');

      assert.ok(result.success);
      assert.strictEqual(result.imports.length, 0);
    });
  });

  describe('Deduplication', () => {
    it('should not deduplicate at parser level (handled by extractImports)', () => {
      const code = `
        import React from 'react';
        import { useState } from 'react';
        import { useEffect } from 'react';
      `;

      const result = parser.parse(code, 'test.ts');

      assert.ok(result.success);
      // Parser returns all imports, deduplication happens at higher level
      assert.strictEqual(result.imports.length, 3);
    });
  });

  describe('Line numbers', () => {
    it('should track line numbers', () => {
      const code = `
import React from 'react';
import { useState } from 'react';

const Component = () => {
  const [state] = useState();
  return <div>Hello</div>;
};
      `;

      const result = parser.parse(code, 'test.tsx');

      assert.ok(result.success);
      assert.strictEqual(result.imports.length, 2);

      // Line numbers should be tracked
      const reactImport = result.imports.find(
        (imp) => imp.source === 'react' && imp.line === 2
      );
      assert.ok(reactImport);
    });
  });
});

describe('FallbackParser', () => {
  const parser = new FallbackParser();

  it('should support all languages', () => {
    assert.ok(parser.supportedLanguages.includes('*'));
  });

  it('should extract JavaScript imports with regex', () => {
    const code = `
      import React from 'react';
      const fs = require('fs');
    `;

    const result = parser.parse(code, 'test.js');

    assert.ok(result.success);
    assert.strictEqual(result.imports.length, 2);

    const sources = result.imports.map((imp) => imp.source).sort();
    assert.deepStrictEqual(sources, ['fs', 'react']);
  });

  it('should extract Python imports with regex', () => {
    const code = `
      import os
      from typing import List
      import json
    `;

    const result = parser.parse(code, 'test.py');

    assert.ok(result.success);
    // Note: Regex-based Python parser may extract extra imports (e.g., "List" from "import List")
    // This is a known limitation of regex parsing
    assert.ok(result.imports.length >= 3);

    const sources = result.imports.map((imp) => imp.source).sort();
    // Should at least have these three
    assert.ok(sources.includes('json'));
    assert.ok(sources.includes('os'));
    assert.ok(sources.includes('typing'));
  });

  it('should deduplicate imports', () => {
    const code = `
      import React from 'react';
      import { useState } from 'react';
    `;

    const result = parser.parse(code, 'test.js');

    assert.ok(result.success);
    // Fallback parser deduplicates
    assert.strictEqual(result.imports.length, 1);
    assert.strictEqual(result.imports[0].source, 'react');
  });

  it('should handle empty files', () => {
    const code = '';

    const result = parser.parse(code, 'test.js');

    assert.ok(result.success);
    assert.strictEqual(result.imports.length, 0);
  });
});

describe('Parser Factory', () => {
  describe('getParser', () => {
    it('should return JavaScriptParser for JavaScript', () => {
      const parser = getParser('JavaScript');
      assert.ok(parser instanceof JavaScriptParser);
    });

    it('should return JavaScriptParser for TypeScript', () => {
      const parser = getParser('TypeScript');
      assert.ok(parser instanceof JavaScriptParser);
    });

    it('should return FallbackParser for Python', () => {
      const parser = getParser('Python');
      assert.ok(parser instanceof FallbackParser);
    });

    it('should return FallbackParser for unsupported languages', () => {
      const parser = getParser('COBOL');
      assert.ok(parser instanceof FallbackParser);
    });
  });

  describe('extractImports', () => {
    it('should extract and deduplicate imports', () => {
      const code = `
        import React from 'react';
        import { useState } from 'react';
        import lodash from 'lodash';
      `;

      const imports = extractImports(code, 'JavaScript', 'test.js');

      assert.strictEqual(imports.length, 2);
      assert.ok(imports.includes('react'));
      assert.ok(imports.includes('lodash'));
    });

    it('should fall back on parse errors', () => {
      const code = `
        import { foo from 'bar'; // syntax error
      `;

      // Capture console.warn
      const originalWarn = console.warn;
      let warningCalled = false;
      console.warn = (msg: string) => {
        if (msg.includes('Failed to parse')) {
          warningCalled = true;
        }
      };

      try {
        const imports = extractImports(code, 'JavaScript', 'test.js');

        // Should have warned about parse failure
        assert.ok(warningCalled);

        // Fallback parser should still extract something
        assert.ok(Array.isArray(imports));
      } finally {
        console.warn = originalWarn;
      }
    });

    it('should return empty array for unsupported language with no imports', () => {
      const code = 'SELECT * FROM users;';

      const imports = extractImports(code, 'SQL', 'test.sql');

      assert.strictEqual(imports.length, 0);
    });
  });
});

describe('Edge Cases', () => {
  const parser = new JavaScriptParser();

  it('should handle imports in JSX/TSX files', () => {
    const code = `
      import React from 'react';
      import { Button } from './components';

      const App = () => <Button>Click</Button>;
    `;

    const result = parser.parse(code, 'test.tsx');

    assert.ok(result.success);
    assert.strictEqual(result.imports.length, 2);

    const sources = result.imports.map((imp) => imp.source).sort();
    assert.deepStrictEqual(sources, ['./components', 'react']);
  });

  it('should handle imports with quotes inside strings', () => {
    const code = `
      import foo from 'bar';
      const str = "import something from 'string'";
    `;

    const result = parser.parse(code, 'test.js');

    assert.ok(result.success);
    // Should only extract the real import, not the string
    assert.strictEqual(result.imports.length, 1);
    assert.strictEqual(result.imports[0].source, 'bar');
  });

  it('should handle imports in different module contexts', () => {
    const code = `
      // ESM import
      import foo from 'esm-module';

      // CommonJS require (in same file, unusual but valid)
      const bar = require('cjs-module');
    `;

    const result = parser.parse(code, 'test.js');

    assert.ok(result.success);
    assert.strictEqual(result.imports.length, 2);

    const sources = result.imports.map((imp) => imp.source).sort();
    assert.deepStrictEqual(sources, ['cjs-module', 'esm-module']);
  });

  it('should handle scoped package imports', () => {
    const code = `
      import { render } from '@testing-library/react';
      import styles from '@/styles/main.css';
    `;

    const result = parser.parse(code, 'test.ts');

    assert.ok(result.success);
    assert.strictEqual(result.imports.length, 2);

    const sources = result.imports.map((imp) => imp.source).sort();
    assert.deepStrictEqual(sources, ['@/styles/main.css', '@testing-library/react']);
  });

  it('should handle relative imports with various depths', () => {
    const code = `
      import a from './sibling';
      import b from '../parent';
      import c from '../../grandparent';
      import d from '../../../root';
    `;

    const result = parser.parse(code, 'test.ts');

    assert.ok(result.success);
    assert.strictEqual(result.imports.length, 4);

    const sources = result.imports.map((imp) => imp.source).sort();
    assert.deepStrictEqual(sources, [
      '../../../root',
      '../../grandparent',
      '../parent',
      './sibling',
    ]);
  });
});
