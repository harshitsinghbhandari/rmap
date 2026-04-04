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

  /** Named imports (e.g., import { foo, bar } from './mod') */
  namedImports?: string[];

  /** Default import local name (e.g., import Foo from './mod') */
  defaultImport?: string;

  /** Namespace import local name (e.g., import * as utils from './mod') */
  namespaceImport?: string;
}

/**
 * Information about a re-export statement
 */
export interface ReExportInfo {
  /** The symbol being re-exported */
  symbol: string;

  /** The source module (e.g., './bar') */
  source: string;
}

/**
 * Export information from a file
 */
export interface ExportInfo {
  /** Named exports (e.g., export function foo(), export const bar) */
  namedExports: string[];

  /** Whether file has a default export */
  defaultExport: boolean;

  /** Re-exports from other modules */
  reExports: ReExportInfo[];
}

/**
 * Result of parsing a file for imports
 */
export interface ParseResult {
  /** List of imports found */
  imports: ImportInfo[];

  /** Export information from the file */
  exports?: ExportInfo;

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
