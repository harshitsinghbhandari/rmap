/**
 * JavaScript/TypeScript Parser
 *
 * Uses Babel parser to extract imports from JavaScript and TypeScript files.
 * Handles modern syntax including dynamic imports, type-only imports, and re-exports.
 */

import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import type { Parser, ParseResult, ImportInfo } from './types.js';

/**
 * Parser for JavaScript and TypeScript files using Babel
 */
export class JavaScriptParser implements Parser {
  supportedLanguages = ['JavaScript', 'TypeScript'];

  /**
   * Parse JavaScript/TypeScript file content and extract all imports
   *
   * @param content - File content to parse
   * @param filePath - File path (for error messages)
   * @returns Parse result with list of imports
   */
  parse(content: string, filePath: string): ParseResult {
    const imports: ImportInfo[] = [];

    try {
      // Parse with all plugins enabled to support modern syntax
      const ast = parse(content, {
        sourceType: 'unambiguous', // Auto-detect module vs script
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
