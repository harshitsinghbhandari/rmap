/**
 * Level 4 - Orphan File Detection
 *
 * Identifies files that are not imported by anything and are not entry points
 */

import type { FileAnnotation, GraphJson, ValidationIssue, MetaJson } from '../../core/types.js';

/**
 * Find orphan files in the codebase
 *
 * An orphan file is one that:
 * 1. Has no importers (empty imported_by list)
 * 2. Is not listed as an entry point
 * 3. Is not a config file
 *
 * Orphan files may indicate dead code or files that should be documented as entry points
 */
export function findOrphanFiles(
  annotations: FileAnnotation[],
  graph: GraphJson,
  meta: MetaJson
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Create sets for quick lookup
  const entryPoints = new Set(meta.entrypoints);
  const configFiles = new Set(meta.config_files);

  for (const annotation of annotations) {
    const filePath = annotation.path;
    const graphNode = graph[filePath];

    // Skip if not in graph (will be caught by other checks)
    if (!graphNode) {
      continue;
    }

    // Check if file is an orphan
    const hasImporters = graphNode.imported_by.length > 0;
    const isEntryPoint = entryPoints.has(filePath);
    const isConfigFile = configFiles.has(filePath);

    // File is orphan if it has no importers and isn't an entry point or config
    if (!hasImporters && !isEntryPoint && !isConfigFile) {
      issues.push({
        severity: 'warning',
        type: 'orphan_file',
        file: filePath,
        message: `File is not imported by anything and is not an entry point (possible dead code)`,
      });
    }
  }

  return issues;
}

/**
 * Find circular dependencies in the import graph
 *
 * Detects cycles where A imports B, B imports C, C imports A
 * These aren't necessarily errors but can indicate design issues
 */
export function findCircularDependencies(graph: GraphJson): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function detectCycle(filePath: string, path: string[]): string[] | null {
    visited.add(filePath);
    recursionStack.add(filePath);

    const node = graph[filePath];
    if (!node) {
      return null;
    }

    for (const importPath of node.imports) {
      if (!visited.has(importPath)) {
        const cycle = detectCycle(importPath, [...path, filePath]);
        if (cycle) {
          return cycle;
        }
      } else if (recursionStack.has(importPath)) {
        // Found a cycle
        return [...path, filePath, importPath];
      }
    }

    recursionStack.delete(filePath);
    return null;
  }

  // Track detected cycles to avoid duplicates
  const detectedCycles = new Set<string>();

  for (const filePath of Object.keys(graph)) {
    if (!visited.has(filePath)) {
      const cycle = detectCycle(filePath, []);
      if (cycle) {
        // Create a normalized cycle key to avoid duplicates
        const sortedCycle = [...cycle].sort();
        const cycleKey = sortedCycle.join(' -> ');

        if (!detectedCycles.has(cycleKey)) {
          detectedCycles.add(cycleKey);
          issues.push({
            severity: 'info',
            type: 'circular_dependency',
            file: cycle[0],
            message: `Circular dependency detected: ${cycle.join(' -> ')}`,
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Find files with no exports
 *
 * Files with no exports might be:
 * - Side-effect only files (migrations, startup scripts)
 * - Tests
 * - Entry points
 * - Incorrectly annotated
 */
export function findFilesWithNoExports(
  annotations: FileAnnotation[],
  meta: MetaJson
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const entryPoints = new Set(meta.entrypoints);

  for (const annotation of annotations) {
    // Skip entry points and test files
    if (entryPoints.has(annotation.path)) {
      continue;
    }

    const isTestFile =
      annotation.path.includes('test') ||
      annotation.path.includes('spec') ||
      annotation.path.includes('__tests__');

    if (isTestFile) {
      continue;
    }

    // Check if file has no exports
    if (annotation.exports.length === 0 && annotation.imports.length > 0) {
      issues.push({
        severity: 'info',
        type: 'no_exports',
        file: annotation.path,
        message: `File imports but exports nothing (may be side-effect only or incorrectly annotated)`,
      });
    }
  }

  return issues;
}

/**
 * Run all orphan and structural checks
 *
 * Aggregates orphan detection, circular dependencies, and export checks
 */
export function runOrphanChecks(
  annotations: FileAnnotation[],
  graph: GraphJson,
  meta: MetaJson
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  issues.push(...findOrphanFiles(annotations, graph, meta));
  issues.push(...findCircularDependencies(graph));
  issues.push(...findFilesWithNoExports(annotations, meta));

  return issues;
}
