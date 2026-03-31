/**
 * Graph Repair for Delta Updates
 *
 * Updates the dependency graph when files change, ensuring imported_by
 * references remain consistent. Also regenerates the tags.json index.
 */

import type { FileAnnotation, GraphJson, TagsJson } from '../core/types.js';
import type { Tag } from '../core/constants.js';
import { TAG_TAXONOMY, TAG_ALIASES, SCHEMA_VERSION } from '../core/constants.js';
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
  /** Regenerated tags index */
  tags: TagsJson;
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
 * @returns Repaired graph and tags
 */
export function repairGraph(options: GraphRepairOptions): GraphRepairResult {
  const { existingGraph, updatedAnnotations, deletedFiles, allAnnotations } = options;

  console.log('\n🔧 Repairing dependency graph...');

  // Use the existing graph update utility
  const repairedGraph = graphUpdateUtil(existingGraph, updatedAnnotations, deletedFiles);

  // Count broken references that were removed
  const brokenReferencesRemoved = countRemovedReferences(existingGraph, deletedFiles);

  // Count edges that were updated
  const edgesUpdated = countUpdatedEdges(existingGraph, repairedGraph);

  console.log(`   • Updated ${edgesUpdated} graph edges`);
  console.log(`   • Removed ${brokenReferencesRemoved} broken references`);

  // Regenerate tags.json index
  console.log('🏷️  Regenerating tags index...');
  const tags = regenerateTagsIndex(allAnnotations);

  return {
    graph: repairedGraph,
    tags,
    edgesUpdated,
    brokenReferencesRemoved,
  };
}

/**
 * Regenerate the tags.json index from current annotations
 *
 * Rebuilds the tag index from scratch based on all current file annotations.
 *
 * @param annotations - All current file annotations
 * @returns Complete tags index
 */
export function regenerateTagsIndex(annotations: FileAnnotation[]): TagsJson {
  const index: Record<string, string[]> = {};

  // Initialize index with all taxonomy tags
  for (const tag of TAG_TAXONOMY) {
    index[tag] = [];
  }

  // Populate index with file paths
  for (const annotation of annotations) {
    for (const tag of annotation.tags) {
      if (index[tag]) {
        index[tag].push(annotation.path);
      }
    }
  }

  // Sort file paths in each tag for consistent output
  for (const tag in index) {
    index[tag].sort();
  }

  const totalTaggedFiles = new Set(
    Object.values(index)
      .flat()
      .filter((path) => path)
  ).size;

  console.log(`   • Indexed ${totalTaggedFiles} files across ${TAG_TAXONOMY.length} tags`);

  return {
    taxonomy_version: SCHEMA_VERSION,
    aliases: TAG_ALIASES,
    index: index as Record<Tag, string[]>,
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
