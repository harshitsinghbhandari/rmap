/**
 * Fallback Regex Parser
 *
 * Simple regex-based import extraction for unsupported languages
 * or when AST parsing fails. Less accurate than AST-based parsers
 * but works as a last resort.
 */

import type { Parser, ParseResult, ImportInfo } from './types.js';

/**
 * Import statement regex patterns for different languages
 */
const IMPORT_PATTERNS = {
  // JavaScript/TypeScript: import, require, export from
  javascript: [
    /import\s+[^'"]+?\s+from\s+['"]([^'"]+)['"]/g, // Matches all import forms including mixed
    /import\s+['"]([^'"]+)['"]/g, // Side-effect imports
    /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // CommonJS require
    /export\s+(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g, // Re-exports including export * as
  ],
  // Python: import, from ... import
  python: [/from\s+([\w.]+)\s+import/g, /import\s+([\w.]+)/g],
  // Go: import
  go: [/import\s+['"]([^'"]+)['"]/g, /import\s+\w+\s+['"]([^'"]+)['"]/g],
  // Rust: use
  rust: [/use\s+([\w:]+)/g],
};

/**
 * Fallback parser using regex patterns
 *
 * This parser is used when no AST-based parser is available for the language,
 * or when AST parsing fails due to syntax errors.
 */
export class FallbackParser implements Parser {
  supportedLanguages = ['*']; // Fallback for all languages

  /**
   * Extract imports using regex patterns
   *
   * @param content - File content to parse
   * @param filePath - File path (for determining language)
   * @returns Parse result with imports (always succeeds)
   */
  parse(content: string, filePath: string): ParseResult {
    const imports: ImportInfo[] = [];

    // Try to determine language from file path
    const language = this.detectLanguage(filePath);

    // Select appropriate patterns based on language
    let patterns: RegExp[] = [];
    if (language === 'JavaScript' || language === 'TypeScript') {
      patterns = IMPORT_PATTERNS.javascript;
    } else if (language === 'Python') {
      patterns = IMPORT_PATTERNS.python;
    } else if (language === 'Go') {
      patterns = IMPORT_PATTERNS.go;
    } else if (language === 'Rust') {
      patterns = IMPORT_PATTERNS.rust;
    }

    // Extract imports using each pattern
    for (const pattern of patterns) {
      let match;
      // Need to reset lastIndex for global regex
      const regex = new RegExp(pattern);
      while ((match = regex.exec(content)) !== null) {
        if (match[1]) {
          imports.push({
            source: match[1],
            type: 'static',
            isSideEffect: false,
          });
        }
      }
    }

    // Remove duplicates
    const uniqueSources = new Set(imports.map((imp) => imp.source));
    const uniqueImports: ImportInfo[] = Array.from(uniqueSources).map(
      (source) => ({
        source,
        type: 'static',
        isSideEffect: false,
      })
    );

    return {
      imports: uniqueImports,
      success: true, // Fallback parser always "succeeds"
    };
  }

  /**
   * Detect language from file extension
   */
  private detectLanguage(filePath: string): string | undefined {
    const ext = filePath.split('.').pop()?.toLowerCase();

    const languageMap: Record<string, string> = {
      ts: 'TypeScript',
      tsx: 'TypeScript',
      js: 'JavaScript',
      jsx: 'JavaScript',
      mjs: 'JavaScript',
      cjs: 'JavaScript',
      py: 'Python',
      go: 'Go',
      rs: 'Rust',
    };

    return ext ? languageMap[ext] : undefined;
  }
}
