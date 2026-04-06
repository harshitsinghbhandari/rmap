/**
 * Graph Repair for Delta Updates
 *
 * Updates the dependency graph when files change, ensuring imported_by
 * references remain consistent.
 */

import type { FileAnnotation, GraphJson } from '../core/types.js';
import { updateGraph as graphUpdateUtil } from './graph.js';

/**
 * Options for graph repair
 */
export interface GraphRepairOptions {
  /** Existing dependency graph */
  existingGraph: GraphJson;
  /** Updated file annotations */
  updatedAnnotations: FileAnnotation[];
  /** List of deleted file paths */
  deletedFiles: string[];
  /** All current annotations (after delta update) */
  allAnnotations: FileAnnotation[];
}

/**
 * Result of graph repair
 */
export interface GraphRepairResult {
  /** Repaired dependency graph */
  graph: GraphJson;
  /** Number of graph edges updated */
  edgesUpdated: number;
  /** Number of broken references removed */
  brokenReferencesRemoved: number;
}

/**
 * Repair the dependency graph after delta update
 *
 * Updates imported_by relationships for affected files and removes
 * broken references from deleted files.
 *
 * @param options - Graph repair options
 * @returns Repaired graph
 */
export function repairGraph(options: GraphRepairOptions): GraphRepairResult {
  const { existingGraph, updatedAnnotations, deletedFiles } = options;

  console.log('\n🔧 Repairing dependency graph...');

  // Use the existing graph update utility
  const repairedGraph = graphUpdateUtil(existingGraph, updatedAnnotations, deletedFiles);

  // Count broken references that were removed
  const brokenReferencesRemoved = countRemovedReferences(existingGraph, deletedFiles);

  // Count edges that were updated
  const edgesUpdated = countUpdatedEdges(existingGraph, repairedGraph);

  console.log(`   • Updated ${edgesUpdated} graph edges`);
  console.log(`   • Removed ${brokenReferencesRemoved} broken references`);

  return {
    graph: repairedGraph,
    edgesUpdated,
    brokenReferencesRemoved,
  };
}

/**
 * Count how many broken references were removed
 *
 * @param existingGraph - Graph before repair
 * @param deletedFiles - Files that were deleted
 * @returns Number of broken references
 */
function countRemovedReferences(existingGraph: GraphJson, deletedFiles: string[]): number {
  let count = 0;
  const deletedSet = new Set(deletedFiles);

  for (const [filePath, node] of Object.entries(existingGraph)) {
    // Count imports that point to deleted files
    for (const imported of node.imports) {
      if (deletedSet.has(imported)) {
        count++;
      }
    }

    // Count imported_by entries from deleted files
    for (const importer of node.imported_by) {
      if (deletedSet.has(importer)) {
        count++;
      }
    }
  }

  return count;
}

/**
 * Count how many edges were updated between graphs
 *
 * @param oldGraph - Original graph
 * @param newGraph - Updated graph
 * @returns Number of edges that changed
 */
function countUpdatedEdges(oldGraph: GraphJson, newGraph: GraphJson): number {
  let count = 0;

  // Get all file paths from both graphs
  const allPaths = new Set([...Object.keys(oldGraph), ...Object.keys(newGraph)]);

  for (const filePath of allPaths) {
    const oldNode = oldGraph[filePath];
    const newNode = newGraph[filePath];

    // If node was added or removed, count all its edges
    if (!oldNode || !newNode) {
      if (oldNode) {
        count += oldNode.imports.length + oldNode.imported_by.length;
      }
      if (newNode) {
        count += newNode.imports.length + newNode.imported_by.length;
      }
      continue;
    }

    // Count changes in imports
    const oldImports = new Set(oldNode.imports);
    const newImports = new Set(newNode.imports);

    for (const imp of newImports) {
      if (!oldImports.has(imp)) {
        count++;
      }
    }

    for (const imp of oldImports) {
      if (!newImports.has(imp)) {
        count++;
      }
    }

    // Count changes in imported_by
    const oldImportedBy = new Set(oldNode.imported_by);
    const newImportedBy = new Set(newNode.imported_by);

    for (const imp of newImportedBy) {
      if (!oldImportedBy.has(imp)) {
        count++;
      }
    }

    for (const imp of oldImportedBy) {
      if (!newImportedBy.has(imp)) {
        count++;
      }
    }
  }

  return count;
}

/**
 * Validate graph consistency after repair
 *
 * Ensures that all imported_by relationships are bidirectional
 * and that no references point to non-existent files.
 *
 * @param graph - Graph to validate
 * @returns True if graph is consistent
 */
export function validateGraphConsistency(graph: GraphJson): boolean {
  const allFiles = new Set(Object.keys(graph));

  for (const [filePath, node] of Object.entries(graph)) {
    // Check that all imports exist in the graph
    for (const imported of node.imports) {
      if (!allFiles.has(imported)) {
        console.warn(`Warning: ${filePath} imports non-existent file: ${imported}`);
        return false;
      }

      // Check bidirectional relationship
      if (!graph[imported].imported_by.includes(filePath)) {
        console.warn(
          `Warning: Missing reverse edge: ${imported} should list ${filePath} in imported_by`
        );
        return false;
      }
    }

    // Check that all imported_by entries are valid
    for (const importer of node.imported_by) {
      if (!allFiles.has(importer)) {
        console.warn(`Warning: ${filePath} listed as imported by non-existent file: ${importer}`);
        return false;
      }

      // Check bidirectional relationship
      if (!graph[importer].imports.includes(filePath)) {
        console.warn(
          `Warning: Missing forward edge: ${importer} should list ${filePath} in imports`
        );
        return false;
      }
    }
  }

  return true;
}
