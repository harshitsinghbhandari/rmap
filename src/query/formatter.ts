/**
 * Output formatter for query results
 *
 * Formats query results in the standardized rmap output format
 */

import type { FileAnnotation, MetaJson } from '../core/types.js';
import type { FileScore } from './ranking.js';
import { OUTPUT } from '../config/index.js';
import { TAG_TIERS } from '../core/constants.js';

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

  /** Maximum number of tags to display per file (filters to highest-signal tags) */
  maxDisplayTags?: number;
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
  maxDisplayTags: OUTPUT.MAX_DISPLAY_TAGS,
};

/**
 * Filter tags to show only the highest-signal ones for display
 *
 * Uses TAG_TIERS to prioritize:
 * 1. HIGH_SIGNAL tags (most specific, best for retrieval)
 * 2. ARCHITECTURE tags (pattern-based, still valuable)
 * 3. LOW_SIGNAL tags (generic, only when no better options)
 *
 * @param tags - All tags assigned to the file
 * @param maxTags - Maximum tags to display
 * @returns Filtered array of highest-signal tags
 */
function filterDisplayTags(tags: string[], maxTags: number): string[] {
  if (tags.length <= maxTags) {
    return tags;
  }

  // Score each tag based on its tier
  const tagScores = tags.map((tag) => {
    let score = 0;
    if (TAG_TIERS.HIGH_SIGNAL.includes(tag as (typeof TAG_TIERS.HIGH_SIGNAL)[number])) {
      score = 3; // Highest priority
    } else if (TAG_TIERS.ARCHITECTURE.includes(tag as (typeof TAG_TIERS.ARCHITECTURE)[number])) {
      score = 2; // Medium priority
    } else if (TAG_TIERS.LOW_SIGNAL.includes(tag as (typeof TAG_TIERS.LOW_SIGNAL)[number])) {
      score = 1; // Lowest priority
    } else {
      score = 0; // Unknown tags get lowest priority
    }
    return { tag, score };
  });

  // Sort by score descending, then by original order for stability
  tagScores.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return tags.indexOf(a.tag) - tags.indexOf(b.tag);
  });

  // Return top N tags
  return tagScores.slice(0, maxTags).map((t) => t.tag);
}

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

  // Tags - filter to highest-signal tags for display
  if (file.tags.length > 0) {
    const displayTags = filterDisplayTags(file.tags, options.maxDisplayTags);
    lines.push(`  Tags: ${displayTags.join(', ')}`);
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
    queryTags: string[];
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
      query: {
        tags: params.queryTags,
      },
      relevantFiles: params.relevantFiles.slice(0, opts.maxFiles).map((scored) => ({
        path: scored.file.path,
        language: scored.file.language,
        purpose: scored.file.purpose,
        tags: filterDisplayTags(scored.file.tags, opts.maxDisplayTags),
        exports: scored.file.exports.slice(0, opts.maxExports),
        relevanceScore: scored.score,
      })),
      blastRadius: params.blastRadiusFiles.slice(0, opts.maxFiles).map((file) => ({
        path: file.path,
        language: file.language,
        purpose: file.purpose,
        tags: filterDisplayTags(file.tags, opts.maxDisplayTags),
      })),
      conventions: params.meta.conventions.slice(0, opts.maxConventions),
    };
    return JSON.stringify(jsonOutput, null, 2);
  }

  // Default text format
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
        tags: filterDisplayTags(params.file.tags, opts.maxDisplayTags),
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
        tags: filterDisplayTags(scored.file.tags, opts.maxDisplayTags),
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
