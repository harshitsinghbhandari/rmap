/**
 * Level 4 - Consistency Validator
 *
 * Main validator that runs all checks, applies auto-fixes, and produces validation.json
 */

import type { FileAnnotation, GraphJson, MetaJson, ValidationJson, ValidationIssue } from '../../core/types.js';
import { runConsistencyChecks } from './checks.js';
import { runOrphanChecks } from './orphans.js';
import { runAutofix, type AutofixResult } from './autofix.js';

/**
 * Options for validation
 */
export interface ValidatorOptions {
  /** Repository root path */
  repoRoot: string;

  /** Whether to apply auto-fixes (default: true) */
  autofix?: boolean;

  /** Whether to include info-level issues (default: false) */
  includeInfo?: boolean;
}

/**
 * Result from validation
 */
export interface ValidatorResult {
  /** Validation results for validation.json */
  validation: ValidationJson;

  /** Updated annotations (if autofix was applied) */
  annotations: FileAnnotation[];

  /** Updated graph (if autofix was applied) */
  graph: GraphJson;

  /** Whether any fixes were applied */
  wasFixed: boolean;
}

/**
 * Main validation function
 *
 * Runs all consistency checks, orphan detection, and optionally applies auto-fixes
 */
export async function validateMap(
  annotations: FileAnnotation[],
  graph: GraphJson,
  meta: MetaJson,
  options: ValidatorOptions
): Promise<ValidatorResult> {
  const { repoRoot, autofix = true, includeInfo = false } = options;

  let currentAnnotations = annotations;
  let currentGraph = graph;
  let autofixResult: AutofixResult | null = null;

  // Step 1: Apply auto-fixes if enabled
  if (autofix) {
    autofixResult = runAutofix(currentAnnotations, currentGraph, repoRoot);
    currentAnnotations = autofixResult.annotations;
    currentGraph = autofixResult.graph;
  }

  // Step 2: Run consistency checks on the (possibly fixed) data
  const consistencyIssues = runConsistencyChecks(currentAnnotations, currentGraph, repoRoot);

  // Step 3: Run orphan and structural checks
  const orphanIssues = runOrphanChecks(currentAnnotations, currentGraph, meta);

  // Step 4: Combine all issues
  let allIssues: ValidationIssue[] = [
    ...consistencyIssues,
    ...orphanIssues,
  ];

  // Add autofix issues if any
  if (autofixResult && autofixResult.fixed.length > 0) {
    allIssues = [...autofixResult.fixed, ...allIssues];
  }

  // Step 5: Filter out info-level issues if not requested
  if (!includeInfo) {
    allIssues = allIssues.filter((issue) => issue.severity !== 'info');
  }

  // Step 6: Count issues by severity
  const errorCount = allIssues.filter((issue) => issue.severity === 'error').length;
  const warningCount = allIssues.filter((issue) => issue.severity === 'warning').length;

  // Step 7: Create validation result
  const validation: ValidationJson = {
    issues: allIssues,
    auto_fixed: autofixResult?.fixCount || 0,
    requires_attention: errorCount + warningCount,
  };

  return {
    validation,
    annotations: currentAnnotations,
    graph: currentGraph,
    wasFixed: autofixResult !== null && autofixResult.fixCount > 0,
  };
}

/**
 * Get validation summary statistics
 *
 * Provides a human-readable summary of validation results
 */
export function getValidationSummary(validation: ValidationJson): {
  errors: number;
  warnings: number;
  info: number;
  total: number;
  autoFixed: number;
  requiresAttention: number;
} {
  const errors = validation.issues.filter((i) => i.severity === 'error').length;
  const warnings = validation.issues.filter((i) => i.severity === 'warning').length;
  const info = validation.issues.filter((i) => i.severity === 'info').length;

  return {
    errors,
    warnings,
    info,
    total: validation.issues.length,
    autoFixed: validation.auto_fixed,
    requiresAttention: validation.requires_attention,
  };
}

/**
 * Group validation issues by type
 *
 * Useful for reporting and debugging
 */
export function groupIssuesByType(validation: ValidationJson): Map<string, ValidationIssue[]> {
  const grouped = new Map<string, ValidationIssue[]>();

  for (const issue of validation.issues) {
    if (!grouped.has(issue.type)) {
      grouped.set(issue.type, []);
    }
    grouped.get(issue.type)!.push(issue);
  }

  return grouped;
}

/**
 * Group validation issues by file
 *
 * Useful for fixing issues file by file
 */
export function groupIssuesByFile(validation: ValidationJson): Map<string, ValidationIssue[]> {
  const grouped = new Map<string, ValidationIssue[]>();

  for (const issue of validation.issues) {
    if (!grouped.has(issue.file)) {
      grouped.set(issue.file, []);
    }
    grouped.get(issue.file)!.push(issue);
  }

  return grouped;
}
