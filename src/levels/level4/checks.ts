/**
 * Level 4 - Consistency Checks
 *
 * Script-based checks that validate map consistency without using LLMs
 */

import type { FileAnnotation, GraphJson, ValidationIssue } from '../../core/types.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Check if all imported files exist in the map
 *
 * Validates that every file referenced in imports[] exists in the annotations
 */
export function checkImportsExist(
  annotations: FileAnnotation[],
  repoRoot: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const annotationPaths = new Set(annotations.map((a) => a.path));

  for (const annotation of annotations) {
    for (const importPath of annotation.imports) {
      // Check if import exists in annotations
      if (!annotationPaths.has(importPath)) {
        issues.push({
          severity: 'error',
          type: 'missing_import',
          file: annotation.path,
          message: `Imports "${importPath}" which is not in the map`,
        });
      }
    }
  }

  return issues;
}

/**
 * Check if imported_by relationships are symmetric with imports
 *
 * Validates that if A imports B, then B has A in its imported_by list
 */
export function checkGraphSymmetry(
  graph: GraphJson,
  annotations: FileAnnotation[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const annotationPaths = new Set(annotations.map((a) => a.path));

  for (const filePath in graph) {
    const node = graph[filePath];
    // Check each import has corresponding imported_by
    for (const importPath of node.imports) {
      const importedNode = graph[importPath];

      if (!importedNode) {
        issues.push({
          severity: 'error',
          type: 'broken_graph_reference',
          file: filePath,
          message: `Graph references "${importPath}" which doesn't exist in graph`,
        });
        continue;
      }

      // Check if imported file has this file in its imported_by list
      if (!importedNode.imported_by.includes(filePath)) {
        issues.push({
          severity: 'error',
          type: 'asymmetric_graph',
          file: filePath,
          message: `Imports "${importPath}" but "${importPath}" doesn't list it in imported_by`,
        });
      }
    }

    // Check each imported_by has corresponding import
    for (const importerPath of node.imported_by) {
      const importerNode = graph[importerPath];

      if (!importerNode) {
        issues.push({
          severity: 'error',
          type: 'broken_graph_reference',
          file: filePath,
          message: `Graph lists "${importerPath}" in imported_by but it doesn't exist in graph`,
        });
        continue;
      }

      // Check if importer has this file in its imports list
      if (!importerNode.imports.includes(filePath)) {
        issues.push({
          severity: 'error',
          type: 'asymmetric_graph',
          file: filePath,
          message: `Listed in "${importerPath}" imported_by but "${importerPath}" doesn't import it`,
        });
      }
    }
  }

  return issues;
}

/**
 * Check if all map entries point to existing files on disk
 *
 * Validates that files in the map haven't been deleted
 */
export function checkFilesExist(
  annotations: FileAnnotation[],
  repoRoot: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const annotation of annotations) {
    const fullPath = join(repoRoot, annotation.path);

    if (!existsSync(fullPath)) {
      issues.push({
        severity: 'error',
        type: 'deleted_file',
        file: annotation.path,
        message: `File in map but doesn't exist on disk`,
      });
    }
  }

  return issues;
}

/**
 * Check if graph entries match annotation imports
 *
 * Validates that graph.json imports match the imports in annotations
 */
export function checkGraphMatchesAnnotations(
  graph: GraphJson,
  annotations: FileAnnotation[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const annotationMap = new Map(annotations.map((a) => [a.path, a]));

  for (const [filePath, graphNode] of Object.entries(graph)) {
    const annotation = annotationMap.get(filePath);

    if (!annotation) {
      issues.push({
        severity: 'error',
        type: 'graph_annotation_mismatch',
        file: filePath,
        message: `File exists in graph but not in annotations`,
      });
      continue;
    }

    // Check if imports match
    const annotationImports = new Set(annotation.imports);
    const graphImports = new Set(graphNode.imports);

    // Check for imports in graph but not in annotation
    for (const imp of graphImports) {
      if (!annotationImports.has(imp)) {
        issues.push({
          severity: 'warning',
          type: 'graph_annotation_mismatch',
          file: filePath,
          message: `Graph lists import "${imp}" but annotation doesn't`,
        });
      }
    }

    // Check for imports in annotation but not in graph
    for (const imp of annotationImports) {
      if (!graphImports.has(imp)) {
        issues.push({
          severity: 'warning',
          type: 'graph_annotation_mismatch',
          file: filePath,
          message: `Annotation lists import "${imp}" but graph doesn't`,
        });
      }
    }
  }

  // Check for annotations not in graph
  for (const annotation of annotations) {
    if (!graph[annotation.path]) {
      issues.push({
        severity: 'error',
        type: 'graph_annotation_mismatch',
        file: annotation.path,
        message: `File exists in annotations but not in graph`,
      });
    }
  }

  return issues;
}

/**
 * Run all consistency checks
 *
 * Aggregates all check results into a single list of issues
 */
export function runConsistencyChecks(
  annotations: FileAnnotation[],
  graph: GraphJson,
  repoRoot: string
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Run all checks
  issues.push(...checkImportsExist(annotations, repoRoot));
  issues.push(...checkGraphSymmetry(graph, annotations));
  issues.push(...checkFilesExist(annotations, repoRoot));
  issues.push(...checkGraphMatchesAnnotations(graph, annotations));

  return issues;
}
