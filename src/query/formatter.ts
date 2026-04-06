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

  /** Output format: 'text' for human-readable, 'json' for machine-readable */
  outputFormat?: 'text' | 'json';
}

/**
 * Default format options
 */
const DEFAULT_OPTIONS: Required<FormatOptions> = {
  maxFiles: OUTPUT.MAX_FILES_PER_SECTION,
  maxExports: OUTPUT.MAX_EXPORTS_PER_FILE,
  fullPaths: true,
  maxConventions: OUTPUT.MAX_CONVENTIONS,
  outputFormat: 'text',
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
      lines.push(`  • ${module.path} — ${module.description}`);
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
 * @param options - Format options
 * @returns Formatted relevant files string
 */
function formatRelevantFiles(
  files: FileScore[],
  options: Required<FormatOptions>
): string {
  const lines = [
    `═══ RELEVANT FILES ═══`,
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
    lines.push('No direct dependents found in current graph.');
    lines.push('');
    return lines.join('\n');
  }

  const filesToShow = blastRadiusFiles.slice(0, options.maxFiles);
  const remaining = blastRadiusFiles.length - filesToShow.length;

  lines.push(
    `${blastRadiusFiles.length} direct dependent${blastRadiusFiles.length > 1 ? 's' : ''} in current graph:`
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
    blastRadiusFiles: FileAnnotation[];
  },
  options: Partial<FormatOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Return JSON format if requested
  if (opts.outputFormat === 'json') {
    const jsonOutput = {
      repository: {
        name: params.meta.repo_name,
        purpose: params.meta.purpose,
        stack: params.meta.stack,
        languages: params.meta.languages,
      },
      relevantFiles: params.relevantFiles.slice(0, opts.maxFiles).map((scored) => ({
        path: scored.file.path,
        language: scored.file.language,
        purpose: scored.file.purpose,
        exports: scored.file.exports.slice(0, opts.maxExports),
        relevanceScore: scored.score,
      })),
      blastRadius: params.blastRadiusFiles.slice(0, opts.maxFiles).map((file) => ({
        path: file.path,
        language: file.language,
        purpose: file.purpose,
      })),
      conventions: params.meta.conventions.slice(0, opts.maxConventions),
    };
    return JSON.stringify(jsonOutput, null, 2);
  }

  // Default text format
  const sections = [
    formatRepoContext(params.meta),
    formatRelevantFiles(params.relevantFiles, opts),
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

  // Return JSON format if requested
  if (opts.outputFormat === 'json') {
    const jsonOutput = {
      repository: {
        name: params.meta.repo_name,
        purpose: params.meta.purpose,
      },
      file: {
        path: params.file.path,
        language: params.file.language,
        purpose: params.file.purpose,
        exports: params.file.exports.slice(0, opts.maxExports),
        sizeBytes: params.file.size_bytes,
        lineCount: params.file.line_count,
      },
      dependencies: params.dependencies.slice(0, opts.maxFiles).map((file) => ({
        path: file.path,
        language: file.language,
        purpose: file.purpose,
      })),
      dependents: params.dependents.slice(0, opts.maxFiles).map((file) => ({
        path: file.path,
        language: file.language,
        purpose: file.purpose,
      })),
    };
    return JSON.stringify(jsonOutput, null, 2);
  }

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
    lines.push('No direct dependents found in current graph.');
  } else {
    lines.push(`${params.dependents.length} direct dependent${params.dependents.length > 1 ? 's' : ''} in current graph:`);
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

  // Return JSON format if requested
  if (opts.outputFormat === 'json') {
    const jsonOutput = {
      repository: {
        name: params.meta.repo_name,
        purpose: params.meta.purpose,
      },
      query: {
        path: params.path,
      },
      files: params.files.slice(0, opts.maxFiles).map((scored) => ({
        path: scored.file.path,
        language: scored.file.language,
        purpose: scored.file.purpose,
        exports: scored.file.exports.slice(0, opts.maxExports),
        relevanceScore: scored.score,
      })),
      externalDependents: params.externalDependents.slice(0, opts.maxFiles).map((file) => ({
        path: file.path,
        language: file.language,
        purpose: file.purpose,
      })),
    };
    return JSON.stringify(jsonOutput, null, 2);
  }

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
  lines.push('═══ EXTERNAL DEPENDENTS ═══', '');
  if (params.externalDependents.length === 0) {
    lines.push('No external dependents found in current graph.');
  } else {
    lines.push(
      `${params.externalDependents.length} external dependent${params.externalDependents.length > 1 ? 's' : ''} in current graph:`
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
