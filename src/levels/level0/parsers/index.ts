/**
 * Parser Factory and Dispatcher
 *
 * Selects and dispatches to the appropriate parser based on language,
 * with automatic fallback to regex-based parsing if AST parsing fails.
 */

import type { Parser, ParseResult } from './types.js';
import type { FileImportData, SymbolImportInfo, ReExportInfo } from '../../../core/types.js';
import { JavaScriptParser } from './javascript.js';
import { FallbackParser } from './fallback.js';

/**
 * Available parsers, in order of preference
 */
const parsers: Parser[] = [
  new JavaScriptParser(),
  // Add more parsers here as needed:
  // new PythonParser(),
];

/**
 * Get the appropriate parser for a given language
 *
 * @param language - Language name (e.g., 'JavaScript', 'TypeScript', 'Python')
 * @returns Parser instance (never null - returns fallback if no match)
 */
export function getParser(language: string): Parser {
  for (const parser of parsers) {
    if (parser.supportedLanguages.includes(language)) {
      return parser;
    }
  }

  // Fallback to regex-based parser for unsupported languages
  return new FallbackParser();
}

/**
 * Extract imports from file content
 *
 * This is the main entry point for import extraction. It selects the
 * appropriate parser based on language and handles fallback if parsing fails.
 *
 * @param content - File content to parse
 * @param language - Programming language
 * @param filePath - File path (for error messages and fallback detection)
 * @returns Array of unique import source paths
 */
export function extractImports(
  content: string,
  language: string,
  filePath: string
): string[] {
  const parser = getParser(language);
  const result = parser.parse(content, filePath);

  if (!result.success) {
    // AST parsing failed, try fallback parser
    console.warn(
      `Warning: Failed to parse ${filePath}: ${result.error}. Using fallback parser.`
    );

    const fallbackParser = new FallbackParser();
    const fallbackResult = fallbackParser.parse(content, filePath);
    return fallbackResult.imports.map((imp) => imp.source);
  }

  // Return deduplicated list of import sources
  return [...new Set(result.imports.map((imp) => imp.source))];
}

/**
 * Convert ParseResult imports to SymbolImportInfo array
 */
function toSymbolImports(result: ParseResult): SymbolImportInfo[] {
  return result.imports.map((imp) => ({
    source: imp.source,
    type: imp.type,
    isSideEffect: imp.isSideEffect,
    line: imp.line,
    namedImports: imp.namedImports,
    defaultImport: imp.defaultImport,
    namespaceImport: imp.namespaceImport,
  }));
}

/**
 * Extract symbol-level import/export data from file content
 *
 * This returns the full structured import/export data including
 * named imports, default imports, namespace imports, and exports.
 *
 * @param content - File content to parse
 * @param language - Programming language
 * @param filePath - File path (used as path in FileImportData)
 * @returns FileImportData with symbol-level information, or null if parsing fails
 */
export function extractImportData(
  content: string,
  language: string,
  filePath: string
): FileImportData | null {
  const parser = getParser(language);
  const result = parser.parse(content, filePath);

  if (!result.success) {
    // AST parsing failed, try fallback parser
    console.warn(
      `Warning: Failed to parse ${filePath}: ${result.error}. Using fallback parser.`
    );

    const fallbackParser = new FallbackParser();
    const fallbackResult = fallbackParser.parse(content, filePath);

    // Fallback parser doesn't provide symbol-level info, return basic structure
    return {
      path: filePath,
      imports: toSymbolImports(fallbackResult),
      namedExports: [],
      defaultExport: false,
      reExports: [],
    };
  }

  // Build FileImportData from ParseResult
  const reExports: ReExportInfo[] = result.exports?.reExports ?? [];

  return {
    path: filePath,
    imports: toSymbolImports(result),
    namedExports: result.exports?.namedExports ?? [],
    defaultExport: result.exports?.defaultExport ?? false,
    reExports,
  };
}
