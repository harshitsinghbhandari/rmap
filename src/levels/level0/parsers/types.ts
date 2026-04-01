/**
 * Parser Types and Interfaces
 *
 * Defines the contract for import parsers across different languages.
 */

/**
 * Information about a single import statement
 */
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

/**
 * Result of parsing a file for imports
 */
export interface ParseResult {
  /** List of imports found */
  imports: ImportInfo[];

  /** Whether parsing succeeded */
  success: boolean;

  /** Parse error if any */
  error?: string;
}

/**
 * Base interface for import parsers
 */
export interface Parser {
  /** Parse file content and extract imports */
  parse(content: string, filePath: string): ParseResult;

  /** Languages supported by this parser */
  supportedLanguages: string[];
}
