/**
 * Dependency Graph Builder
 *
 * Builds the imported_by reverse graph from file annotations
 * and assembles the graph.json structure
 */

import type { FileAnnotation, GraphJson, GraphNode } from '../core/types.js';

/**
 * Build the dependency graph from file annotations
 *
 * Creates a bidirectional graph where each file lists:
 * - imports: files it depends on
 * - imported_by: files that depend on it
 *
 * @param annotations - Array of file annotations from Level 3
 * @returns Complete dependency graph
 */
export function buildGraph(annotations: FileAnnotation[]): GraphJson {
  const graph: GraphJson = {};

  // Initialize graph nodes for all files
  for (const annotation of annotations) {
    graph[annotation.path] = {
      imports: [...annotation.imports], // Copy to avoid mutation
      imported_by: [],
    };
  }

  // Build reverse edges (imported_by)
  for (const annotation of annotations) {
    const importer = annotation.path;

    for (const imported of annotation.imports) {
      // If the imported file exists in our graph, add reverse edge
      if (graph[imported]) {
        if (!graph[imported].imported_by.includes(importer)) {
          graph[imported].imported_by.push(importer);
        }
      } else {
        // Imported file doesn't exist in graph (could be external or missing)
        // We'll still track it in imports but won't create a node for it
        // The validator will catch this as an issue
      }
    }
  }

  // Sort arrays for consistent output
  for (const node of Object.values(graph)) {
    node.imports.sort();
    node.imported_by.sort();
  }

  return graph;
}

/**
 * Update the graph when annotations change (for delta updates)
 *
 * @param existingGraph - Current graph
 * @param updatedAnnotations - Annotations that changed
 * @param deletedPaths - File paths that were deleted
 * @returns Updated graph
 */
export function updateGraph(
  existingGraph: GraphJson,
  updatedAnnotations: FileAnnotation[],
  deletedPaths: string[] = []
): GraphJson {
  const graph: GraphJson = { ...existingGraph };

  // Remove deleted files from graph
  for (const deletedPath of deletedPaths) {
    delete graph[deletedPath];

    // Remove references to deleted files from other nodes
    for (const node of Object.values(graph)) {
      node.imports = node.imports.filter((imp) => imp !== deletedPath);
      node.imported_by = node.imported_by.filter((imp) => imp !== deletedPath);
    }
  }

  // Clear old reverse edges for updated files
  for (const annotation of updatedAnnotations) {
    const path = annotation.path;

    // Remove this file from all imported_by arrays
    for (const node of Object.values(graph)) {
      node.imported_by = node.imported_by.filter((imp) => imp !== path);
    }

    // Update or create the node
    graph[path] = {
      imports: [...annotation.imports],
      imported_by: [],
    };
  }

  // Rebuild reverse edges for updated files
  for (const annotation of updatedAnnotations) {
    const importer = annotation.path;

    for (const imported of annotation.imports) {
      if (graph[imported]) {
        if (!graph[imported].imported_by.includes(importer)) {
          graph[imported].imported_by.push(importer);
        }
      }
    }
  }

  // Sort arrays for consistent output
  for (const node of Object.values(graph)) {
    node.imports.sort();
    node.imported_by.sort();
  }

  return graph;
}

/**
 * Get graph statistics
 *
 * @param graph - Dependency graph
 * @returns Statistics about the graph
 */
export function getGraphStats(graph: GraphJson) {
  let totalImports = 0;
  let maxImports = 0;
  let maxImportedBy = 0;
  let orphanCount = 0;

  for (const [path, node] of Object.entries(graph)) {
    totalImports += node.imports.length;
    maxImports = Math.max(maxImports, node.imports.length);
    maxImportedBy = Math.max(maxImportedBy, node.imported_by.length);

    if (node.imported_by.length === 0 && node.imports.length === 0) {
      orphanCount++;
    }
  }

  return {
    totalFiles: Object.keys(graph).length,
    totalImports,
    avgImportsPerFile: totalImports / Object.keys(graph).length,
    maxImports,
    maxImportedBy,
    orphanCount,
  };
}
