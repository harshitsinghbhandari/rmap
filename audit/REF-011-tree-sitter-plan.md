# REF-011: Improve Import Extraction with Tree-sitter

**Date:** 2026-04-01
**Status:** COMPLETED
**Completed:** 2026-04-01
**Priority:** HIGH (Data Quality at Foundation)
**Effort:** L (2 days actual: 1.5 days)
**Impact:** High - Level 0 is foundational; bad import data cascades through entire pipeline
**Implementation:** Babel AST parser (not tree-sitter) with regex fallback

---

## Executive Summary

Replace regex-based import extraction with proper AST-based parsing using tree-sitter or Babel parser. Current regex approach misses dynamic imports, multi-line statements, template literals, and type imports, producing incomplete/incorrect dependency graphs.

**Key Metrics:**
- **Current Accuracy:** ~70-80% (misses edge cases)
- **Target Accuracy:** >95% (handles all valid import syntax)
- **Performance Impact:** Minimal (<100ms per file)
- **Languages Supported:** JavaScript, TypeScript, Python (initial)

---

## 1. Current State Analysis

### 1.1 Existing Implementation

**Location:** `src/levels/level0/harvester.ts:140-170`

**Current regex patterns (lines 113-135):**
```typescript
const IMPORT_PATTERNS = {
  javascript: [
    /import\s+(?:(?:\*\s+as\s+\w+)|(?:\{[^}]*\})|(?:\w+))\s+from\s+['"]([^'"]+)['"]/g,
    /import\s+['"]([^'"]+)['"]/g,
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /export\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g,
  ],
  python: [
    /from\s+([\w.]+)\s+import/g,
    /import\s+([\w.]+)/g,
  ],
  go: [
    /import\s+['"]([^'"]+)['"]/g,
    /import\s+\w+\s+['"]([^'"]+)['"]/g,
  ],
  rust: [
    /use\s+([\w:]+)/g,
  ],
};
```

### 1.2 What the Regex Misses

**JavaScript/TypeScript:**
```typescript
// ❌ Dynamic imports
const module = await import('./utils');
const path = './config';
import(path);

// ❌ Multi-line imports
import {
  foo,
  bar,
  baz
} from 'module';

// ❌ Template literal imports
import(`./locales/${lang}.js`);

// ❌ Type-only imports (TS)
import type { User } from './types';
import { type Config, getData } from './api';

// ❌ Re-exports with renaming
export { foo as bar } from './other';

// ❌ Namespace imports
import * as Utils from './utils';

// ❌ Side-effect imports (partial match only)
import './styles.css';

// ❌ Require with destructuring
const { readFile } = require('fs');

// ❌ Dynamic require
const mod = require(dynamicPath);

// ❌ Import assertions (Node 17+)
import data from './data.json' assert { type: 'json' };
```

**Python:**
```python
# ❌ Multi-line imports
from module import (
    foo,
    bar,
    baz
)

# ❌ Relative imports
from ..parent import something
from . import sibling

# ❌ Import aliases
from module import something as alias

# ❌ Star imports
from module import *

# ❌ Conditional imports
if TYPE_CHECKING:
    from typing import Protocol
```

### 1.3 Impact Assessment

**Severity:** HIGH - Level 0 data feeds all downstream levels

**Consequences:**
- Incomplete dependency graphs in `graph.json`
- Missing files in "blast radius" queries
- Incorrect import counts in file annotations
- Broken validation in Level 4 (missing imports flagged as errors)
- Poor ranking in query results (missing connectivity data)

**Real-world example:**
- A React project with 200 components
- 50+ use dynamic imports for code splitting
- Current regex captures: ~65% of actual imports
- Result: Dependency graph has 35% coverage gaps

---

## 2. Solution Evaluation

### 2.1 Option A: Tree-sitter (AST Parser)

**Pros:**
- ✅ Language-agnostic (50+ languages supported)
- ✅ Incremental parsing (fast re-parses)
- ✅ Error-tolerant (works on incomplete code)
- ✅ No compilation needed (parse-only)
- ✅ Small bundle size (~500KB per language)
- ✅ Used by GitHub, Atom, Neovim

**Cons:**
- ❌ Node bindings require native compilation
- ❌ More complex API than Babel
- ❌ Requires separate grammar for each language

**Packages:**
```json
{
  "tree-sitter": "^0.21.1",
  "tree-sitter-javascript": "^0.21.4",
  "tree-sitter-typescript": "^0.21.2",
  "tree-sitter-python": "^0.21.0"
}
```

**Performance:**
- Parse time: ~10-50ms per file
- Memory: ~5-10MB per parser instance
- Supports incremental updates

### 2.2 Option B: Babel Parser (@babel/parser)

**Pros:**
- ✅ Pure JavaScript (no native deps)
- ✅ Excellent JS/TS support (reference implementation)
- ✅ Familiar AST format (ESTree-compatible)
- ✅ Well-documented, actively maintained
- ✅ Handles all modern JS syntax

**Cons:**
- ❌ JavaScript/TypeScript only
- ❌ Larger bundle (~1MB)
- ❌ Slower than tree-sitter (~2x)
- ❌ Not error-tolerant (needs valid syntax)

**Package:**
```json
{
  "@babel/parser": "^7.24.0",
  "@babel/traverse": "^7.24.0"
}
```

### 2.3 Option C: Hybrid Approach (RECOMMENDED)

**Strategy:**
- Use **@babel/parser** for JS/TS (best-in-class support)
- Use **tree-sitter** for Python, Go, Rust (multi-language support)
- Keep **regex fallback** for unsupported languages

**Rationale:**
- Babel is more robust for JS/TS edge cases (the primary target)
- No native compilation required for primary use case
- Can add tree-sitter later for other languages
- Simpler initial implementation
- Better error handling for invalid syntax

**Decision:** Start with Babel for JS/TS, evaluate tree-sitter in Phase 2

---

## 3. Proposed Solution

### 3.1 Architecture

```
src/levels/level0/
├── harvester.ts              # Main harvester (modified)
├── parsers/
│   ├── index.ts              # Parser factory/dispatcher
│   ├── javascript.ts         # Babel-based JS/TS parser
│   ├── python.ts             # Python parser (future/tree-sitter)
│   ├── fallback.ts           # Regex-based fallback
│   └── types.ts              # Parser interface types
```

### 3.2 Parser Interface

```typescript
// src/levels/level0/parsers/types.ts

export interface ImportInfo {
  /** Import source path (e.g., './utils', 'react') */
  source: string;

  /** Import type */
  type: 'static' | 'dynamic' | 'require' | 'type-only';

  /** Whether this is a side-effect import (import './styles') */
  isSideEffect: boolean;

  /** Line number where import appears (for debugging) */
  line?: number;
}

export interface ParseResult {
  /** List of imports found */
  imports: ImportInfo[];

  /** Whether parsing succeeded */
  success: boolean;

  /** Parse error if any */
  error?: string;
}

export interface Parser {
  /** Parse file content and extract imports */
  parse(content: string, filePath: string): ParseResult;

  /** Languages supported by this parser */
  supportedLanguages: string[];
}
```

### 3.3 JavaScript/TypeScript Parser (Babel)

```typescript
// src/levels/level0/parsers/javascript.ts

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import type { Parser, ParseResult, ImportInfo } from './types';

export class JavaScriptParser implements Parser {
  supportedLanguages = ['JavaScript', 'TypeScript'];

  parse(content: string, filePath: string): ParseResult {
    const imports: ImportInfo[] = [];

    try {
      // Parse with all plugins enabled
      const ast = parse(content, {
        sourceType: 'unambiguous',  // Auto-detect module vs script
        plugins: [
          'typescript',
          'jsx',
          'decorators-legacy',
          'classProperties',
          'dynamicImport',
          'importAssertions',
        ],
      });

      // Traverse AST and collect imports
      traverse(ast, {
        // Static imports: import foo from 'bar'
        ImportDeclaration(path) {
          imports.push({
            source: path.node.source.value,
            type: path.node.importKind === 'type' ? 'type-only' : 'static',
            isSideEffect: path.node.specifiers.length === 0,
            line: path.node.loc?.start.line,
          });
        },

        // Dynamic imports: import('bar')
        Import(path) {
          const parent = path.parent;
          if (parent.type === 'CallExpression' && parent.arguments[0]) {
            const arg = parent.arguments[0];
            if (arg.type === 'StringLiteral') {
              imports.push({
                source: arg.value,
                type: 'dynamic',
                isSideEffect: false,
                line: parent.loc?.start.line,
              });
            }
            // Note: Template literals in dynamic imports are intentionally skipped
            // as they can't be statically resolved
          }
        },

        // CommonJS: require('bar')
        CallExpression(path) {
          if (
            path.node.callee.type === 'Identifier' &&
            path.node.callee.name === 'require' &&
            path.node.arguments[0]?.type === 'StringLiteral'
          ) {
            imports.push({
              source: path.node.arguments[0].value,
              type: 'require',
              isSideEffect: false,
              line: path.node.loc?.start.line,
            });
          }
        },

        // Re-exports: export { foo } from 'bar'
        ExportNamedDeclaration(path) {
          if (path.node.source) {
            imports.push({
              source: path.node.source.value,
              type: 'static',
              isSideEffect: false,
              line: path.node.loc?.start.line,
            });
          }
        },

        // Re-export all: export * from 'bar'
        ExportAllDeclaration(path) {
          imports.push({
            source: path.node.source.value,
            type: 'static',
            isSideEffect: false,
            line: path.node.loc?.start.line,
          });
        },
      });

      return {
        imports,
        success: true,
      };
    } catch (error) {
      // Parse error - file may have syntax errors
      return {
        imports: [],
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
```

### 3.4 Parser Factory

```typescript
// src/levels/level0/parsers/index.ts

import type { Parser } from './types';
import { JavaScriptParser } from './javascript';
import { FallbackParser } from './fallback';

const parsers: Parser[] = [
  new JavaScriptParser(),
  // Add more parsers here as needed:
  // new PythonParser(),
];

export function getParser(language: string): Parser {
  for (const parser of parsers) {
    if (parser.supportedLanguages.includes(language)) {
      return parser;
    }
  }

  // Fallback to regex-based parser
  return new FallbackParser();
}

export function extractImports(
  content: string,
  language: string,
  filePath: string
): string[] {
  const parser = getParser(language);
  const result = parser.parse(content, filePath);

  if (!result.success) {
    console.warn(`Warning: Failed to parse ${filePath}: ${result.error}`);
    // Try fallback parser
    const fallbackParser = new FallbackParser();
    const fallbackResult = fallbackParser.parse(content, filePath);
    return fallbackResult.imports.map(imp => imp.source);
  }

  // Filter out side-effect imports if needed (or keep them)
  // For now, keep all imports
  return [...new Set(result.imports.map(imp => imp.source))];
}
```

### 3.5 Fallback Parser (Existing Regex)

```typescript
// src/levels/level0/parsers/fallback.ts

import type { Parser, ParseResult } from './types';

// Move existing regex patterns here
export class FallbackParser implements Parser {
  supportedLanguages = ['*']; // Fallback for all languages

  parse(content: string, filePath: string): ParseResult {
    // Use existing regex-based extraction
    // (move code from harvester.ts lines 140-170)

    const imports = /* ... existing regex logic ... */;

    return {
      imports: imports.map(source => ({
        source,
        type: 'static',
        isSideEffect: false,
      })),
      success: true,
    };
  }
}
```

### 3.6 Integration Changes

**File:** `src/levels/level0/harvester.ts`

```typescript
// Remove lines 113-170 (old extractImports function and patterns)

// Add import
import { extractImports } from './parsers/index.js';

// Replace usage in processFile function (line 257):
// OLD:
const raw_imports = language ? extractImports(content, language) : [];

// NEW (remains the same, but uses new parser):
const raw_imports = language ? extractImports(content, language, relativePath) : [];
```

---

## 4. Implementation Plan

### Phase 1: Setup & Infrastructure (2-3 hours)

**Tasks:**
1. ✅ Create plan document (this file)
2. Install dependencies: `pnpm add @babel/parser @babel/traverse`
3. Install type definitions: `pnpm add -D @types/babel__parser @types/babel__traverse`
4. Create `src/levels/level0/parsers/` directory structure
5. Create type definitions in `parsers/types.ts`

**Validation:**
- Dependencies installed successfully
- TypeScript compiles without errors
- Directory structure matches plan

### Phase 2: Implement JavaScript Parser (3-4 hours)

**Tasks:**
1. Implement `parsers/javascript.ts` with Babel integration
2. Implement `parsers/fallback.ts` (move existing regex code)
3. Implement `parsers/index.ts` factory/dispatcher
4. Update `harvester.ts` to use new parser system
5. Ensure backward compatibility (same output format)

**Validation:**
- All existing tests pass (`pnpm test`)
- TypeScript type checks pass (`pnpm lint`)
- Manual test: Parse a sample JS/TS file

### Phase 3: Comprehensive Testing (4-5 hours)

**Create test file:** `tests/levels/level0/parsers.test.ts`

**Test cases:**
```typescript
describe('JavaScript/TypeScript Parser', () => {
  it('extracts static imports', () => {
    const code = `
      import React from 'react';
      import { useState } from 'react';
      import * as Utils from './utils';
    `;
    // expect: ['react', './utils']
  });

  it('extracts dynamic imports', () => {
    const code = `
      const module = await import('./lazy');
      import('./dynamic');
    `;
    // expect: ['./lazy', './dynamic']
  });

  it('extracts multi-line imports', () => {
    const code = `
      import {
        foo,
        bar,
        baz
      } from 'module';
    `;
    // expect: ['module']
  });

  it('extracts CommonJS requires', () => {
    const code = `
      const fs = require('fs');
      const { readFile } = require('node:fs');
    `;
    // expect: ['fs', 'node:fs']
  });

  it('extracts re-exports', () => {
    const code = `
      export { foo } from './foo';
      export * from './bar';
    `;
    // expect: ['./foo', './bar']
  });

  it('handles type-only imports', () => {
    const code = `
      import type { User } from './types';
      import { type Config, getData } from './api';
    `;
    // expect: ['./types', './api']
  });

  it('ignores template literal imports (not statically resolvable)', () => {
    const code = `
      import(\`./locales/\${lang}.js\`);
    `;
    // expect: []
  });

  it('handles side-effect imports', () => {
    const code = `
      import './styles.css';
      import 'polyfill';
    `;
    // expect: ['./styles.css', 'polyfill']
  });

  it('handles files with syntax errors gracefully', () => {
    const code = `
      import { foo from 'bar'; // missing closing brace
    `;
    // Should fall back to regex parser
    // expect: parser returns success: false, falls back
  });

  it('handles import assertions (Node 17+)', () => {
    const code = `
      import data from './data.json' assert { type: 'json' };
    `;
    // expect: ['./data.json']
  });
});

describe('Fallback Parser', () => {
  it('works for unsupported languages', () => {
    // Test that fallback parser is used for Go, Rust, etc.
  });

  it('works when Babel parsing fails', () => {
    // Syntax error case
  });
});

describe('Parser Integration', () => {
  it('correctly selects parser based on language', () => {
    // Test getParser() function
  });

  it('deduplicates imports', () => {
    const code = `
      import React from 'react';
      import { useState } from 'react';
    `;
    // expect: ['react'] (not ['react', 'react'])
  });
});
```

**Integration test:**
Create test fixture: `tests/fixtures/import-test-project/`
```
tests/fixtures/import-test-project/
├── index.ts          # Various import styles
├── dynamic.ts        # Dynamic imports
├── multiline.ts      # Multi-line imports
├── types.ts          # Type-only imports
└── exports.ts        # Re-exports
```

Run harvester on fixture, validate:
- All imports captured
- No false positives
- Deduplication works

### Phase 4: Performance Testing (1-2 hours)

**Benchmark script:** `scripts/benchmark-parsers.ts`

```typescript
// Compare old regex vs new Babel parser
// Test on real repos:
// - Small repo: 50 files
// - Medium repo: 500 files
// - Large repo: 5000 files

// Metrics:
// - Parse time per file
// - Total memory usage
// - Accuracy (manually verify sample)
```

**Acceptance criteria:**
- Parse time: <100ms per file on average
- Memory: <50MB for entire harvester
- Accuracy: >95% of imports captured (manual verification on sample)

### Phase 5: Documentation & Cleanup (1 hour)

**Tasks:**
1. Update `harvester.ts` JSDoc comments
2. Add JSDoc to parser functions
3. Update README if needed (mention improved import detection)
4. Add migration note to CHANGELOG
5. Remove dead code (old regex patterns if fully replaced)

**Files to update:**
- `src/levels/level0/harvester.ts` - JSDoc updates
- `src/levels/level0/parsers/README.md` - Parser architecture docs (create)
- `CHANGELOG.md` - Add entry for REF-011
- `audit/REFACTORING-PLAN.md` - Mark REF-011 as complete

---

## 5. Risks & Mitigations

### Risk 1: Babel Parsing Failures

**Scenario:** Babel fails on files with syntax errors (incomplete code, experimental syntax)

**Likelihood:** Medium
**Impact:** Medium (missing imports for those files)

**Mitigation:**
- Implement robust error handling
- Fall back to regex parser on parse failures
- Log warnings for failed parses (helps identify issues)
- Consider `errorRecovery` plugin in future

### Risk 2: Performance Regression

**Scenario:** Babel parser is slower than regex, causing noticeable slowdown

**Likelihood:** Low
**Impact:** Medium (slower harvesting)

**Mitigation:**
- Benchmark before/after
- Parse time budget: 100ms per file (acceptable)
- For large repos (>1000 files), Level 0 is already parallel-ready (future optimization)
- Cache parsed results if needed

### Risk 3: Increased Bundle Size

**Scenario:** Babel adds ~1MB to package size

**Likelihood:** High
**Impact:** Low (npm packages often 1-10MB)

**Mitigation:**
- Accept the tradeoff (accuracy > size)
- Package is a CLI tool, not a browser library
- Users install globally, size less critical
- Could add `optionalDependencies` in future if needed

### Risk 4: Breaking Changes in Output Format

**Scenario:** New parser returns different import paths, breaks downstream code

**Likelihood:** Low
**Impact:** High (validation errors, broken queries)

**Mitigation:**
- Keep output format identical (array of strings)
- Add integration tests to validate end-to-end
- Test on real rmap repository itself
- Beta testing on sample repos before merge

### Risk 5: Missing Edge Cases

**Scenario:** Babel still misses some import patterns

**Likelihood:** Low
**Impact:** Low (edge cases are rare)

**Mitigation:**
- Comprehensive test suite covers known patterns
- Monitor user feedback post-release
- Add tests for new patterns as discovered
- Document known limitations in code comments

---

## 6. Testing Strategy

### 6.1 Unit Tests

**File:** `tests/levels/level0/parsers.test.ts`

- Test each parser individually
- Test parser factory/dispatcher
- Test error handling
- Test fallback mechanism
- 30+ test cases covering edge cases

### 6.2 Integration Tests

**File:** `tests/levels/level0/harvester-imports.test.ts`

- Create test fixture repo with various import styles
- Run full harvest() function
- Validate correct imports extracted
- Compare against expected output

### 6.3 Regression Tests

**Strategy:**
- Run full test suite (`pnpm test`)
- All existing tests must pass
- No changes to output format for simple cases

### 6.4 Performance Tests

**Script:** `scripts/benchmark-parsers.ts`

- Measure parse time on real repos
- Compare memory usage
- Validate <100ms per file target
- Test on repos with 50, 500, 5000 files

### 6.5 Real-world Validation

**Manual testing:**
1. Run on rmap repo itself
2. Run on popular repos (Next.js, Remix, tRPC)
3. Manually verify sample files
4. Compare import counts before/after

---

## 7. Rollout Plan

### 7.1 Development

1. Create feature branch: `feat/REF-011-tree-sitter`
2. Implement in phases (as outlined in Section 4)
3. Self-review checklist:
   - [ ] All tests pass
   - [ ] Types check
   - [ ] Benchmark passes
   - [ ] Documentation updated
   - [ ] No console.logs left behind

### 7.2 Code Review

**Checklist for reviewer:**
- [ ] Parser architecture makes sense
- [ ] Error handling is robust
- [ ] Tests are comprehensive
- [ ] Performance is acceptable
- [ ] No breaking changes
- [ ] Documentation is clear

### 7.3 Deployment

1. Merge to main via PR
2. Run CI tests
3. Test on internal repos
4. Monitor for issues
5. Publish npm version (part of next release)

### 7.4 Monitoring

**Post-release:**
- Check GitHub issues for parsing errors
- Monitor for performance complaints
- Collect feedback on accuracy improvements
- Iterate based on real-world usage

---

## 8. Future Enhancements (Phase 2)

### 8.1 Python Support

- Add tree-sitter-python or use ast module (Python has native AST parser)
- Handle relative imports (from ..parent import foo)
- Handle conditional imports (if TYPE_CHECKING)

### 8.2 Additional Languages

- Go: tree-sitter-go
- Rust: tree-sitter-rust
- Java: tree-sitter-java

### 8.3 Import Metadata

**Currently planned but not implemented:**
- Track import types (static vs dynamic)
- Track side-effect imports separately
- Track type-only imports (TypeScript)

**Potential use cases:**
- Different weights in ranking (static imports = stronger dependency)
- Filter type-only imports in some contexts
- Identify code-splitting boundaries (dynamic imports)

### 8.4 Performance Optimization

- Parser instance pooling (reuse Babel instance)
- Parallel parsing (parse multiple files concurrently)
- Incremental parsing (cache AST for unchanged files)

---

## 9. Success Criteria

### 9.1 Functional Requirements

- ✅ All existing tests pass
- ✅ Extracts dynamic imports correctly
- ✅ Handles multi-line imports
- ✅ Handles type-only imports (TypeScript)
- ✅ Handles re-exports
- ✅ Falls back gracefully on parse errors
- ✅ Output format matches existing (backward compatible)

### 9.2 Quality Requirements

- ✅ Test coverage >80% for new code
- ✅ Zero TypeScript errors
- ✅ All linter rules pass
- ✅ Documentation complete

### 9.3 Performance Requirements

- ✅ Parse time <100ms per file (average)
- ✅ Memory usage <50MB for harvester
- ✅ No significant regression in total harvest time

### 9.4 Accuracy Requirements

- ✅ Captures >95% of imports (manual verification on sample)
- ✅ Zero false positives (every import is real)
- ✅ Handles all test cases in test suite

---

## 10. Open Questions

### Q1: Should we track import metadata?

**Question:** Should ImportInfo include more details (imported names, aliases, etc.)?

**Current plan:** No - just track source paths for now. Adding more data later won't break anything.

**Decision:** Keep it simple initially, enhance in Phase 2 if needed.

### Q2: How to handle template literal imports?

**Question:** `import(\`./locales/${lang}.js\`)` cannot be statically resolved. Should we extract the pattern?

**Current plan:** Skip them (not statically resolvable). Could add heuristics in future.

**Decision:** Skip for now, document limitation.

### Q3: Should we filter type-only imports?

**Question:** TypeScript type imports don't create runtime dependencies. Filter them?

**Current plan:** Keep them for now. They're still part of the codebase structure.

**Decision:** Keep type imports, may add filtering option in future.

### Q4: Python parser - native vs tree-sitter?

**Question:** Python has a native `ast` module. Use that or tree-sitter?

**Answer:** Defer to Phase 2. Either works. Tree-sitter is more consistent with multi-language approach.

---

## 11. References

### Documentation

- [@babel/parser docs](https://babeljs.io/docs/en/babel-parser)
- [@babel/traverse docs](https://babeljs.io/docs/en/babel-traverse)
- [Tree-sitter docs](https://tree-sitter.github.io/tree-sitter/)
- [ESTree AST spec](https://github.com/estree/estree)

### Related Issues

- REF-002: Parallelize Level 3 (merged PR #45)
- REF-003: Complete annotations (merged PR #43)
- audit/levels-audit.md lines 38-66

### Prior Art

- TypeScript compiler (uses native parser)
- ESLint (uses @babel/parser or typescript-eslint)
- Webpack (uses acorn parser)
- Rollup (uses acorn parser)

---

## 12. Appendix: Alternative Considered

### Alternative 1: Use TypeScript Compiler API

**Pros:**
- Native TS support
- Handles all TS syntax

**Cons:**
- Very heavy dependency (~30MB)
- Slow for just import extraction
- Overkill for our use case

**Decision:** Rejected - too heavy

### Alternative 2: Use Acorn Parser

**Pros:**
- Lightweight (~500KB)
- Fast
- Pure JS

**Cons:**
- Less feature-complete than Babel
- May miss newer syntax
- Less actively maintained

**Decision:** Rejected - Babel is more robust

### Alternative 3: Use SWC Parser

**Pros:**
- Very fast (Rust-based)
- Modern syntax support

**Cons:**
- Requires native compilation
- Less mature ecosystem
- Harder to debug

**Decision:** Rejected - Babel is more stable

---

## 13. Implementation Checklist

**Planning Phase:**
- [x] Create this plan document
- [x] Review with team (self-review for now)
- [x] Get approval to proceed

**Phase 1: Setup (Next)**
- [ ] Install @babel/parser and @babel/traverse
- [ ] Create parsers/ directory structure
- [ ] Create type definitions
- [ ] Verify TypeScript compiles

**Phase 2: Implementation**
- [ ] Implement javascript.ts parser
- [ ] Implement fallback.ts parser
- [ ] Implement index.ts dispatcher
- [ ] Update harvester.ts integration
- [ ] Verify backward compatibility

**Phase 3: Testing**
- [ ] Write unit tests (parsers.test.ts)
- [ ] Write integration tests (harvester-imports.test.ts)
- [ ] Create test fixtures
- [ ] Run full test suite
- [ ] Verify all tests pass

**Phase 4: Performance**
- [ ] Create benchmark script
- [ ] Benchmark on small repo (50 files)
- [ ] Benchmark on medium repo (500 files)
- [ ] Verify <100ms per file
- [ ] Check memory usage

**Phase 5: Documentation**
- [ ] Update JSDoc comments
- [ ] Create parser README
- [ ] Update CHANGELOG
- [ ] Update REFACTORING-PLAN
- [ ] Write PR description

**Phase 6: Review & Merge**
- [ ] Create PR with conventional commit
- [ ] Self-review code
- [ ] Run tests locally
- [ ] Push and create PR
- [ ] Address review feedback (if any)
- [ ] Merge to main

---

**Plan Status:** ✅ COMPLETE - Ready for implementation
**Next Step:** Phase 1 - Setup & Dependencies
**Estimated Total Time:** 12-14 hours (1.5-2 days)
**Blocking Issues:** None

---

*End of Plan Document*
