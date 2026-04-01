/**
 * Output formatter for query results
 *
 * Formats query results in the standardized rmap output format
 */

import type { FileAnnotation, MetaJson } from '../core/types.js';
import type { FileScore } from './ranking.js';
import { OUTPUT } from '../config/index.js';

/**
 * Format options for output
 */
export interface FormatOptions {
  /** Maximum number of files to show in each section */
  maxFiles?: number;

  /** Maximum number of exports to show per file */
  maxExports?: number;

  /** Whether to show full file paths or relative paths */
  fullPaths?: boolean;

  /** Maximum number of conventions to show */
  maxConventions?: number;
}

/**
 * Default format options
 */
const DEFAULT_OPTIONS: Required<FormatOptions> = {
  maxFiles: OUTPUT.MAX_FILES_PER_SECTION,
  maxExports: OUTPUT.MAX_EXPORTS_PER_FILE,
  fullPaths: true,
  maxConventions: OUTPUT.MAX_CONVENTIONS,
};

/**
 * Format the repository context section
 *
 * @param meta - Repository metadata
 * @returns Formatted repo context string
 */
function formatRepoContext(meta: MetaJson): string {
  const lines = ['═══ REPO CONTEXT ═══', ''];

  lines.push(`Repository: ${meta.repo_name}`);
  lines.push(`Purpose: ${meta.purpose}`);
  lines.push(`Stack: ${meta.stack}`);
  lines.push('');

  if (meta.entrypoints.length > 0) {
    lines.push('Entry Points:');
    meta.entrypoints.forEach((ep) => {
      lines.push(`  • ${ep}`);
    });
    lines.push('');
  }

  if (meta.modules.length > 0) {
    lines.push('Structure:');
    meta.modules.forEach((module) => {
      lines.push(`  • ${module.path}: ${module.description}`);
    });
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format a file annotation
 *
 * @param file - File annotation
 * @param options - Format options
 * @returns Formatted file string
 */
function formatFile(
  file: FileAnnotation,
  options: Required<FormatOptions>
): string {
  const lines: string[] = [];

  // File path and purpose
  lines.push(`${file.path}`);
  lines.push(`  ${file.purpose}`);

  // Tags
  if (file.tags.length > 0) {
    lines.push(`  Tags: ${file.tags.join(', ')}`);
  }

  // Exports
  if (file.exports.length > 0) {
    const exports = file.exports.slice(0, options.maxExports);
    const remaining = file.exports.length - exports.length;

    lines.push(`  Exports: ${exports.join(', ')}${remaining > 0 ? ` ... and ${remaining} more` : ''}`);
  }

  return lines.join('\n');
}

/**
 * Format the relevant files section
 *
 * @param files - Ranked file scores
 * @param queryTags - Tags that were queried
 * @param options - Format options
 * @returns Formatted relevant files string
 */
function formatRelevantFiles(
  files: FileScore[],
  queryTags: string[],
  options: Required<FormatOptions>
): string {
  const lines = [
    `═══ RELEVANT FILES [${queryTags.join(', ')}] ═══`,
    '',
  ];

  if (files.length === 0) {
    lines.push('No matching files found.');
    lines.push('');
    return lines.join('\n');
  }

  const filesToShow = files.slice(0, options.maxFiles);
  const remaining = files.length - filesToShow.length;

  filesToShow.forEach((fileScore, index) => {
    if (index > 0) {
      lines.push('');
    }
    lines.push(formatFile(fileScore.file, options));
  });

  if (remaining > 0) {
    lines.push('');
    lines.push(`... and ${remaining} more file${remaining > 1 ? 's' : ''}`);
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Format the blast radius section
 *
 * @param blastRadiusFiles - Files in the blast radius
 * @param options - Format options
 * @returns Formatted blast radius string
 */
function formatBlastRadius(
  blastRadiusFiles: FileAnnotation[],
  options: Required<FormatOptions>
): string {
  const lines = ['═══ BLAST RADIUS ═══', ''];

  if (blastRadiusFiles.length === 0) {
    lines.push('No files import the results above.');
    lines.push('');
    return lines.join('\n');
  }

  const filesToShow = blastRadiusFiles.slice(0, options.maxFiles);
  const remaining = blastRadiusFiles.length - filesToShow.length;

  lines.push(
    `${blastRadiusFiles.length} file${blastRadiusFiles.length > 1 ? 's' : ''} import the results above:`
  );
  lines.push('');

  filesToShow.forEach((file) => {
    lines.push(`${file.path}`);
    lines.push(`  ${file.purpose}`);
  });

  if (remaining > 0) {
    lines.push('');
    lines.push(`... and ${remaining} more file${remaining > 1 ? 's' : ''}`);
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Format the conventions section
 *
 * @param meta - Repository metadata
 * @param options - Format options
 * @returns Formatted conventions string
 */
function formatConventions(
  meta: MetaJson,
  options: Required<FormatOptions>
): string {
  const lines = ['═══ CONVENTIONS ═══', ''];

  if (meta.conventions.length === 0) {
    lines.push('No conventions documented.');
    lines.push('');
    return lines.join('\n');
  }

  const conventionsToShow = meta.conventions.slice(0, options.maxConventions);
  const remaining = meta.conventions.length - conventionsToShow.length;

  conventionsToShow.forEach((convention) => {
    lines.push(`• ${convention}`);
  });

  if (remaining > 0) {
    lines.push(`... and ${remaining} more convention${remaining > 1 ? 's' : ''}`);
  }

  lines.push('');

  return lines.join('\n');
}

/**
 * Format complete query output
 *
 * Assembles all sections into the final output format
 *
 * @param params - Query result parameters
 * @param options - Format options
 * @returns Formatted output string
 */
export function formatQueryOutput(
  params: {
    meta: MetaJson;
    relevantFiles: FileScore[];
    queryTags: string[];
    blastRadiusFiles: FileAnnotation[];
  },
  options: Partial<FormatOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const sections = [
    formatRepoContext(params.meta),
    formatRelevantFiles(params.relevantFiles, params.queryTags, opts),
    formatBlastRadius(params.blastRadiusFiles, opts),
    formatConventions(params.meta, opts),
  ];

  return sections.join('\n');
}

/**
 * Format file query output (for --file queries)
 *
 * @param params - File query result parameters
 * @param options - Format options
 * @returns Formatted output string
 */
export function formatFileQueryOutput(
  params: {
    meta: MetaJson;
    file: FileAnnotation;
    dependencies: FileAnnotation[];
    dependents: FileAnnotation[];
  },
  options: Partial<FormatOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const lines = [
    '═══ REPO CONTEXT ═══',
    '',
    `Repository: ${params.meta.repo_name}`,
    `Purpose: ${params.meta.purpose}`,
    '',
    '═══ FILE DETAILS ═══',
    '',
    formatFile(params.file, opts),
    '',
  ];

  // Dependencies
  lines.push('═══ DEPENDENCIES ═══', '');
  if (params.dependencies.length === 0) {
    lines.push('This file has no internal dependencies.');
  } else {
    lines.push(`This file imports ${params.dependencies.length} file${params.dependencies.length > 1 ? 's' : ''}:`);
    lines.push('');
    params.dependencies.slice(0, opts.maxFiles).forEach((dep) => {
      lines.push(`${dep.path}`);
      lines.push(`  ${dep.purpose}`);
    });
    const remaining = params.dependencies.length - opts.maxFiles;
    if (remaining > 0) {
      lines.push('');
      lines.push(`... and ${remaining} more file${remaining > 1 ? 's' : ''}`);
    }
  }
  lines.push('');

  // Dependents (blast radius)
  lines.push('═══ BLAST RADIUS ═══', '');
  if (params.dependents.length === 0) {
    lines.push('No files import this file.');
  } else {
    lines.push(`${params.dependents.length} file${params.dependents.length > 1 ? 's' : ''} import this file:`);
    lines.push('');
    params.dependents.slice(0, opts.maxFiles).forEach((dep) => {
      lines.push(`${dep.path}`);
      lines.push(`  ${dep.purpose}`);
    });
    const remaining = params.dependents.length - opts.maxFiles;
    if (remaining > 0) {
      lines.push('');
      lines.push(`... and ${remaining} more file${remaining > 1 ? 's' : ''}`);
    }
  }
  lines.push('');

  // Conventions
  lines.push(...formatConventions(params.meta, opts).split('\n'));

  return lines.join('\n');
}

/**
 * Format path query output (for --path queries)
 *
 * @param params - Path query result parameters
 * @param options - Format options
 * @returns Formatted output string
 */
export function formatPathQueryOutput(
  params: {
    meta: MetaJson;
    path: string;
    files: FileScore[];
    externalDependents: FileAnnotation[];
  },
  options: Partial<FormatOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const lines = [
    '═══ REPO CONTEXT ═══',
    '',
    `Repository: ${params.meta.repo_name}`,
    `Purpose: ${params.meta.purpose}`,
    '',
    `═══ DIRECTORY: ${params.path} ═══`,
    '',
  ];

  if (params.files.length === 0) {
    lines.push('No files found in this directory.');
    lines.push('');
  } else {
    lines.push(`${params.files.length} file${params.files.length > 1 ? 's' : ''} in this directory:`);
    lines.push('');

    params.files.slice(0, opts.maxFiles).forEach((fileScore) => {
      lines.push(formatFile(fileScore.file, opts));
      lines.push('');
    });

    const remaining = params.files.length - opts.maxFiles;
    if (remaining > 0) {
      lines.push(`... and ${remaining} more file${remaining > 1 ? 's' : ''}`);
      lines.push('');
    }
  }

  // External dependents
  lines.push('═══ EXTERNAL DEPENDENCIES ═══', '');
  if (params.externalDependents.length === 0) {
    lines.push('No files outside this directory import files from here.');
  } else {
    lines.push(
      `${params.externalDependents.length} file${params.externalDependents.length > 1 ? 's' : ''} outside this directory import from here:`
    );
    lines.push('');
    params.externalDependents.slice(0, opts.maxFiles).forEach((dep) => {
      lines.push(`${dep.path}`);
      lines.push(`  ${dep.purpose}`);
    });
    const remaining = params.externalDependents.length - opts.maxFiles;
    if (remaining > 0) {
      lines.push('');
      lines.push(`... and ${remaining} more file${remaining > 1 ? 's' : ''}`);
    }
  }
  lines.push('');

  // Conventions
  lines.push(...formatConventions(params.meta, opts).split('\n'));

  return lines.join('\n');
}
