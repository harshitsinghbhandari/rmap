/**
 * Core TypeScript interfaces for rmap
 *
 * Defines the structure of all JSON files in the .repo_map/ directory
 * and internal data structures used during map generation
 */

import type { Tag } from './constants.js';

/**
 * File annotation produced by Level 3 agents
 *
 * Contains semantic information about a single file in the codebase
 */
export interface FileAnnotation {
  /** Relative path from repo root (e.g., "src/auth/jwt.py") */
  path: string;

  /** Programming language detected (e.g., "Python", "TypeScript") */
  language: string;

  /** File size in bytes */
  size_bytes: number;

  /** Number of lines in the file */
  line_count: number;

  /** One-line description of what this file does */
  purpose: string;

  /** 1-5 tags from TAG_TAXONOMY describing the file's role */
  tags: Tag[];

  /** Exported functions, classes, types, or constants */
  exports: string[];

  /** Internal imports (repo-root-relative paths, external deps excluded) */
  imports: string[];
}

/**
 * Module description in the codebase structure
 */
export interface Module {
  /** Path to the module directory (e.g., "src/auth") */
  path: string;

  /** One-line description of the module's purpose */
  description: string;
}

/**
 * Repository metadata and conventions
 *
 * Stored in .repo_map/meta.json
 */
export interface MetaJson {
  /** Schema version of the map format (e.g., "1.0") */
  schema_version: string;

  /** Incrementing version number for this map */
  map_version: number;

  /** Git commit hash the map was built from */
  git_commit: string;

  /** ISO 8601 timestamp when the map was first created */
  created_at: string;

  /** ISO 8601 timestamp of the last update */
  last_updated: string;

  /** Version this was built from (null for full rebuilds) */
  parent_version: number | null;

  /** How this version was generated */
  update_type: 'full' | 'delta';

  /** Number of files changed in delta updates (null for full) */
  files_changed: number | null;

  /** Repository name */
  repo_name: string;

  /** One-line description of what this repository is */
  purpose: string;

  /** Primary technology stack (e.g., "TypeScript, Node.js") */
  stack: string;

  /** Programming languages detected in the repo */
  languages: string[];

  /** Main entry points of the application */
  entrypoints: string[];

  /** Top-level modules/directories with descriptions */
  modules: Module[];

  /** Important configuration files */
  config_files: string[];

  /** Project-specific conventions and rules */
  conventions: string[];
}

/**
 * File entry in the dependency graph
 */
export interface GraphNode {
  /** Files this file imports (internal only, repo-root-relative) */
  imports: string[];

  /** Files that import this file */
  imported_by: string[];
}

/**
 * Full dependency graph
 *
 * Stored in .repo_map/graph.json
 * Maps file path → {imports, imported_by}
 */
export interface GraphJson {
  [filePath: string]: GraphNode;
}

/**
 * Tag index for fast lookup
 *
 * Stored in .repo_map/tags.json
 */
export interface TagsJson {
  /** Version of the tag taxonomy used */
  taxonomy_version: string;

  /** Alias mappings for shorthand queries */
  aliases: Record<string, Tag[]>;

  /** Tag → list of file paths that have that tag */
  index: Record<Tag, string[]>;
}

/**
 * Build statistics and metadata
 *
 * Stored in .repo_map/stats.json
 */
export interface StatsJson {
  /** Total number of files annotated */
  files_annotated: number;

  /** Time taken to build the map (in minutes) */
  build_time_minutes: number;

  /** Levels completed (e.g., [0, 1, 2, 3, 4]) */
  levels_completed: number[];

  /** Number of Level 3 agents spawned */
  agents_used: number;

  /** Number of validation issues found */
  validation_issues: number;

  /** Number of files in last delta update (null if full build) */
  last_delta_files: number | null;
}

/**
 * Validation issue severity level
 */
export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * Single validation issue
 */
export interface ValidationIssue {
  /** Severity level of the issue */
  severity: ValidationSeverity;

  /** Type of issue (e.g., "missing_file", "orphan_file", "broken_import") */
  type: string;

  /** File path related to this issue */
  file: string;

  /** Human-readable message describing the issue */
  message: string;
}

/**
 * Validation results
 *
 * Stored in .repo_map/validation.json
 */
export interface ValidationJson {
  /** List of issues found during validation */
  issues: ValidationIssue[];

  /** Number of issues automatically fixed */
  auto_fixed: number;

  /** Number of issues requiring manual attention */
  requires_attention: number;
}

/**
 * Single task in the work delegation plan
 */
export interface DelegationTask {
  /** Scope of files for this task (e.g., "src/auth/", "src/utils/") */
  scope: string;

  /** Agent size to use (small = Haiku, medium = Sonnet) */
  agent_size: 'small' | 'medium' | 'large';

  /** Estimated number of files in this task */
  estimated_files: number;
}

/**
 * Work delegation plan from Level 2
 *
 * Divides annotation work into tasks for parallel/sequential execution
 */
export interface TaskDelegation {
  /** List of tasks to execute */
  tasks: DelegationTask[];

  /** Execution strategy */
  execution: 'parallel' | 'sequential';

  /** Estimated total time in minutes */
  estimated_total_minutes: number;
}

/**
 * Level 0 metadata (raw file information)
 *
 * Produced by the metadata harvester before LLM processing
 */
export interface RawFileMetadata {
  /** File name with extension */
  name: string;

  /** Relative path from repo root */
  path: string;

  /** File extension (e.g., ".ts", ".py") */
  extension: string;

  /** File size in bytes */
  size_bytes: number;

  /** Number of lines in the file */
  line_count: number;

  /** Programming language (if detected) */
  language?: string;

  /** Raw import/require/from statements extracted via regex */
  raw_imports: string[];
}

/**
 * Output from Level 0 metadata harvester
 *
 * Contains the complete result of the harvesting process
 */
export interface Level0Output {
  /** Array of file metadata for all files in the repository */
  files: RawFileMetadata[];

  /** Git commit hash at the time of harvesting */
  git_commit: string;

  /** ISO 8601 timestamp when harvesting was performed */
  timestamp: string;

  /** Total number of files processed */
  total_files: number;

  /** Total size of all files in bytes */
  total_size_bytes: number;
}

/**
 * Output from Level 1 structure detector
 *
 * Contains high-level repository structure and conventions identified by LLM
 */
export interface Level1Output {
  /** Repository name extracted from package.json or directory name */
  repo_name: string;

  /** One-line description of what this repository is */
  purpose: string;

  /** Primary technology stack (e.g., "TypeScript, Node.js") */
  stack: string;

  /** Programming languages detected in the repo */
  languages: string[];

  /** Main entry points of the application */
  entrypoints: string[];

  /** Top-level modules/directories with descriptions */
  modules: Module[];

  /** Important configuration files */
  config_files: string[];

  /** Project-specific conventions and rules */
  conventions: string[];
}
