/**
 * Level 4 - Auto-fix Capabilities
 *
 * Automatically repairs common validation issues
 */

import type { FileAnnotation, GraphJson, ValidationIssue } from '../../core/types.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Result of auto-fix operations
 */
export interface AutofixResult {
  /** Updated annotations after fixes */
  annotations: FileAnnotation[];

  /** Updated graph after fixes */
  graph: GraphJson;

  /** Issues that were automatically fixed */
  fixed: ValidationIssue[];

  /** Count of fixes applied */
  fixCount: number;
}

/**
 * Remove map entries for deleted files
 *
 * Removes annotations and graph entries for files that no longer exist on disk
 */
export function removeDeletedFiles(
  annotations: FileAnnotation[],
  graph: GraphJson,
  repoRoot: string
): AutofixResult {
  const fixed: ValidationIssue[] = [];
  let fixCount = 0;

  // Find deleted files
  const deletedFiles = new Set<string>();
  for (const annotation of annotations) {
    const fullPath = join(repoRoot, annotation.path);
    if (!existsSync(fullPath)) {
      deletedFiles.add(annotation.path);
    }
  }

  // Remove deleted files from annotations
  const updatedAnnotations = annotations.filter((annotation) => {
    if (deletedFiles.has(annotation.path)) {
      fixed.push({
        severity: 'error',
        type: 'deleted_file',
        file: annotation.path,
        message: `Removed deleted file from map`,
      });
      fixCount++;
      return false;
    }
    return true;
  });

  // Remove deleted files from graph
  const updatedGraph: GraphJson = {};
  for (const [filePath, node] of Object.entries(graph)) {
    if (!deletedFiles.has(filePath)) {
      updatedGraph[filePath] = node;
    }
  }

  return {
    annotations: updatedAnnotations,
    graph: updatedGraph,
    fixed,
    fixCount,
  };
}

/**
 * Fix broken imported_by references
 *
 * Ensures graph symmetry: if A imports B, then B.imported_by includes A
 */
export function fixBrokenImportedBy(
  annotations: FileAnnotation[],
  graph: GraphJson
): AutofixResult {
  const fixed: ValidationIssue[] = [];
  let fixCount = 0;

  // Create a deep copy of the graph to modify
  const updatedGraph: GraphJson = {};
  for (const [filePath, node] of Object.entries(graph)) {
    updatedGraph[filePath] = {
      imports: [...node.imports],
      imported_by: [...node.imported_by],
    };
  }

  // Build correct imported_by relationships from imports
  const correctImportedBy = new Map<string, Set<string>>();

  // Initialize all files with empty sets
  for (const filePath of Object.keys(updatedGraph)) {
    correctImportedBy.set(filePath, new Set());
  }

  // Build imported_by from imports
  for (const [filePath, node] of Object.entries(updatedGraph)) {
    for (const importPath of node.imports) {
      if (!correctImportedBy.has(importPath)) {
        correctImportedBy.set(importPath, new Set());
      }
      correctImportedBy.get(importPath)!.add(filePath);
    }
  }

  // Update graph with correct imported_by
  for (const [filePath, node] of Object.entries(updatedGraph)) {
    const correctSet = correctImportedBy.get(filePath) || new Set();
    const currentSet = new Set(node.imported_by);

    // Check if they differ
    const added = [...correctSet].filter((x) => !currentSet.has(x));
    const removed = [...currentSet].filter((x) => !correctSet.has(x));

    if (added.length > 0 || removed.length > 0) {
      node.imported_by = [...correctSet].sort();

      for (const addedFile of added) {
        fixed.push({
          severity: 'error',
          type: 'asymmetric_graph',
          file: filePath,
          message: `Added missing imported_by reference from "${addedFile}"`,
        });
        fixCount++;
      }

      for (const removedFile of removed) {
        fixed.push({
          severity: 'error',
          type: 'asymmetric_graph',
          file: filePath,
          message: `Removed incorrect imported_by reference from "${removedFile}"`,
        });
        fixCount++;
      }
    }
  }

  return {
    annotations,
    graph: updatedGraph,
    fixed,
    fixCount,
  };
}

/**
 * Remove imports to non-existent files
 *
 * Cleans up imports that reference files not in the map
 */
export function fixBrokenImports(
  annotations: FileAnnotation[],
  graph: GraphJson
): AutofixResult {
  const fixed: ValidationIssue[] = [];
  let fixCount = 0;

  const validPaths = new Set(annotations.map((a) => a.path));

  // Fix annotations
  const updatedAnnotations = annotations.map((annotation) => {
    const validImports = annotation.imports.filter((imp) => {
      if (!validPaths.has(imp)) {
        fixed.push({
          severity: 'error',
          type: 'missing_import',
          file: annotation.path,
          message: `Removed import to non-existent file "${imp}"`,
        });
        fixCount++;
        return false;
      }
      return true;
    });

    return {
      ...annotation,
      imports: validImports,
    };
  });

  // Fix graph
  const updatedGraph: GraphJson = {};
  for (const [filePath, node] of Object.entries(graph)) {
    updatedGraph[filePath] = {
      imports: node.imports.filter((imp) => validPaths.has(imp)),
      imported_by: node.imported_by.filter((imp) => validPaths.has(imp)),
    };
  }

  return {
    annotations: updatedAnnotations,
    graph: updatedGraph,
    fixed,
    fixCount,
  };
}

/**
 * Run all auto-fix operations
 *
 * Applies all fixes in sequence and returns the final result
 */
export function runAutofix(
  annotations: FileAnnotation[],
  graph: GraphJson,
  repoRoot: string
): AutofixResult {
  let currentAnnotations = annotations;
  let currentGraph = graph;
  const allFixed: ValidationIssue[] = [];
  let totalFixCount = 0;

  // 1. Remove deleted files
  const deleteResult = removeDeletedFiles(currentAnnotations, currentGraph, repoRoot);
  currentAnnotations = deleteResult.annotations;
  currentGraph = deleteResult.graph;
  allFixed.push(...deleteResult.fixed);
  totalFixCount += deleteResult.fixCount;

  // 2. Fix broken imports
  const importResult = fixBrokenImports(currentAnnotations, currentGraph);
  currentAnnotations = importResult.annotations;
  currentGraph = importResult.graph;
  allFixed.push(...importResult.fixed);
  totalFixCount += importResult.fixCount;

  // 3. Fix imported_by (should be last to ensure symmetry)
  const importedByResult = fixBrokenImportedBy(currentAnnotations, currentGraph);
  currentAnnotations = importedByResult.annotations;
  currentGraph = importedByResult.graph;
  allFixed.push(...importedByResult.fixed);
  totalFixCount += importedByResult.fixCount;

  return {
    annotations: currentAnnotations,
    graph: currentGraph,
    fixed: allFixed,
    fixCount: totalFixCount,
  };
}
