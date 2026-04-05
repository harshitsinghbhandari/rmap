/**
 * JavaScript/TypeScript Parser
 *
 * Uses Babel parser to extract imports from JavaScript and TypeScript files.
 * Handles modern syntax including dynamic imports, type-only imports, and re-exports.
 */

import { parse } from '@babel/parser';
import * as _traverse from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
import type {
  ImportDeclaration,
  Import,
  CallExpression,
  ExportNamedDeclaration,
  ExportAllDeclaration,
  ExportDefaultDeclaration,
} from '@babel/types';
import type { Parser, ParseResult, ImportInfo, ExportInfo, ReExportInfo } from './types.js';

// Handle CommonJS/ESM interop for @babel/traverse
const traverse = (typeof _traverse === 'function')
  ? _traverse
  : (_traverse as any).default || _traverse;

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
    const namedExports: string[] = [];
    const reExports: ReExportInfo[] = [];
    let defaultExport = false;

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
        ImportDeclaration(path: NodePath<ImportDeclaration>) {
          const specifiers = path.node.specifiers;
          const importInfo: ImportInfo = {
            source: path.node.source.value,
            type: path.node.importKind === 'type' ? 'type-only' : 'static',
            isSideEffect: specifiers.length === 0,
            line: path.node.loc?.start.line,
          };

          // Extract specifier details
          const namedImports: string[] = [];
          for (const spec of specifiers) {
            if (spec.type === 'ImportSpecifier') {
              // Named import: { foo } or { foo as bar }
              const imported = spec.imported;
              const name = imported.type === 'Identifier' ? imported.name : imported.value;
              namedImports.push(name);
            } else if (spec.type === 'ImportDefaultSpecifier') {
              // Default import: import Foo from 'module'
              importInfo.defaultImport = spec.local.name;
            } else if (spec.type === 'ImportNamespaceSpecifier') {
              // Namespace import: import * as foo from 'module'
              importInfo.namespaceImport = spec.local.name;
            }
          }

          if (namedImports.length > 0) {
            importInfo.namedImports = namedImports;
          }

          imports.push(importInfo);
        },

        // Dynamic imports: import('bar')
        Import(path: NodePath<Import>) {
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
        CallExpression(path: NodePath<CallExpression>) {
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

        // Named exports and re-exports: export { foo }, export const bar, export { foo } from 'bar'
        ExportNamedDeclaration(path: NodePath<ExportNamedDeclaration>) {
          const source = path.node.source;

          if (source) {
            // Re-export: export { foo } from 'bar' or export { foo as baz } from 'bar'
            imports.push({
              source: source.value,
              type: 'static',
              isSideEffect: false,
              line: path.node.loc?.start.line,
            });

            // Track re-exported symbols
            for (const spec of path.node.specifiers) {
              if (spec.type === 'ExportSpecifier') {
                const exported = spec.exported;
                const exportedName = exported.type === 'Identifier' ? exported.name : exported.value;
                reExports.push({
                  symbol: exportedName,
                  source: source.value,
                });
              }
            }
          } else {
            // Local named export
            const declaration = path.node.declaration;
            if (declaration) {
              // export function foo() {}, export class Bar {}, export const x = ...
              if (declaration.type === 'FunctionDeclaration' && declaration.id) {
                namedExports.push(declaration.id.name);
              } else if (declaration.type === 'ClassDeclaration' && declaration.id) {
                namedExports.push(declaration.id.name);
              } else if (declaration.type === 'VariableDeclaration') {
                // export const foo = ..., export let bar = ...
                for (const declarator of declaration.declarations) {
                  if (declarator.id.type === 'Identifier') {
                    namedExports.push(declarator.id.name);
                  } else if (declarator.id.type === 'ObjectPattern') {
                    // export const { a, b } = obj
                    for (const prop of declarator.id.properties) {
                      if (prop.type === 'ObjectProperty' && prop.value.type === 'Identifier') {
                        namedExports.push(prop.value.name);
                      } else if (prop.type === 'RestElement' && prop.argument.type === 'Identifier') {
                        namedExports.push(prop.argument.name);
                      }
                    }
                  } else if (declarator.id.type === 'ArrayPattern') {
                    // export const [a, b] = arr
                    for (const element of declarator.id.elements) {
                      if (element && element.type === 'Identifier') {
                        namedExports.push(element.name);
                      }
                    }
                  }
                }
              } else if (declaration.type === 'TSTypeAliasDeclaration') {
                // export type Foo = ...
                namedExports.push(declaration.id.name);
              } else if (declaration.type === 'TSInterfaceDeclaration') {
                // export interface Foo { ... }
                namedExports.push(declaration.id.name);
              } else if (declaration.type === 'TSEnumDeclaration') {
                // export enum Foo { ... }
                namedExports.push(declaration.id.name);
              }
            } else {
              // export { foo, bar }
              for (const spec of path.node.specifiers) {
                if (spec.type === 'ExportSpecifier') {
                  const exported = spec.exported;
                  const name = exported.type === 'Identifier' ? exported.name : exported.value;
                  namedExports.push(name);
                }
              }
            }
          }
        },

        // Re-export all: export * from 'bar'
        ExportAllDeclaration(path: NodePath<ExportAllDeclaration>) {
          imports.push({
            source: path.node.source.value,
            type: 'static',
            isSideEffect: false,
            line: path.node.loc?.start.line,
          });

          // Track as a wildcard re-export
          reExports.push({
            symbol: '*',
            source: path.node.source.value,
          });
        },

        // Default export: export default foo
        ExportDefaultDeclaration(path: NodePath<ExportDefaultDeclaration>) {
          defaultExport = true;
        },
      });

      const exports: ExportInfo = {
        namedExports,
        defaultExport,
        reExports,
      };

      return {
        imports,
        exports,
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
