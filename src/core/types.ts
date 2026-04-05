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

  /** 1-3 tags from TAG_TAXONOMY describing the file's role (reduced for precision) */
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
 * File assignment to a specific task (Level 2.5)
 *
 * Maps a single file to its task with LOC information
 */
export interface FileTaskAssignment {
  /** Relative path from repo root */
  path: string;

  /** Task ID this file belongs to */
  taskId: string;

  /** Lines of code in the file */
  loc: number;

  /** Lines of code to send to LLM (may be trimmed for large files) */
  effectiveLoc: number;

  /** Whether this file was trimmed for LLM context */
  trimmed: boolean;

  /** Programming language */
  language?: string;
}

/**
 * Task with explicit file assignments (Level 2.5)
 *
 * Each task represents one LLM session with specific files
 */
export interface ExplicitTask {
  /** Unique task identifier */
  taskId: string;

  /** Files assigned to this task */
  files: FileTaskAssignment[];

  /** Total LOC in this task (sum of effectiveLoc) */
  totalLoc: number;

  /** Total original LOC before trimming */
  originalLoc: number;

  /** Number of files in this task */
  fileCount: number;

  /** Primary directory for this task (most common directory among files) */
  primaryDirectory: string;

  /** Agent size based on file complexity */
  agentSize: 'small' | 'medium' | 'large';
}

/**
 * Level 2.5 Output: Explicit file-to-task mapping
 *
 * This is a deterministic, algorithmic task division based on LOC.
 * Each file is explicitly assigned to exactly one task.
 */
export interface TaskAssignmentPlan {
  /** All tasks with their file assignments */
  tasks: ExplicitTask[];

  /** Lookup map: file path -> task ID */
  fileToTask: Record<string, string>;

  /** Total files to annotate */
  totalFiles: number;

  /** Total LOC across all files */
  totalLoc: number;

  /** Target LOC per task used for division */
  targetLocPerTask: number;

  /** Number of files that were trimmed */
  trimmedFileCount: number;

  /** Timestamp when plan was created */
  createdAt: string;
}

/**
 * Information about a re-export statement
 */
export interface ReExportInfo {
  /** The symbol being re-exported */
  symbol: string;

  /** The source module (e.g., './bar') */
  source: string;
}

/**
 * Symbol-level import information
 */
export interface SymbolImportInfo {
  /** Import source path (e.g., './utils', 'react') */
  source: string;

  /** Import type */
  type: 'static' | 'dynamic' | 'require' | 'type-only';

  /** Whether this is a side-effect import (import './styles') */
  isSideEffect: boolean;

  /** Line number where import appears (for debugging) */
  line?: number;

  /** Named imports (e.g., import { foo, bar } from './mod') */
  namedImports?: string[];

  /** Default import local name (e.g., import Foo from './mod') */
  defaultImport?: string;

  /** Namespace import local name (e.g., import * as utils from './mod') */
  namespaceImport?: string;
}

/**
 * File-level import/export data for symbol-level analysis
 *
 * Enables function-level dependency graphs and workflow discovery
 */
export interface FileImportData {
  /** Relative path from repo root */
  path: string;

  /** Symbol-level import information */
  imports: SymbolImportInfo[];

  /** Named exports (e.g., export function foo(), export const bar) */
  namedExports: string[];

  /** Whether file has a default export */
  defaultExport: boolean;

  /** Re-exports from other modules */
  reExports: ReExportInfo[];
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

  /** Symbol-level import/export data (when available) */
  import_data?: FileImportData;
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

/**
 * Status of a level in the checkpoint
 */
export type LevelStatus = 'pending' | 'in_progress' | 'completed' | 'interrupted';

/**
 * Checkpoint state for a single level
 */
export interface LevelCheckpoint {
  /** Current status of this level */
  status: LevelStatus;

  /** ISO 8601 timestamp when level started */
  started_at?: string;

  /** ISO 8601 timestamp when level completed */
  completed_at?: string;

  /** Path to saved output file (relative to checkpoint dir) */
  output_file?: string;

  /** Total number of tasks (Level 3 only) */
  tasks_total?: number;

  /** Number of completed tasks (Level 3 only) */
  tasks_completed?: number;

  /** IDs of completed tasks (Level 3 only) */
  completed_task_ids?: string[];

  /** Number of annotations saved to incremental file (Level 3 only) */
  annotations_saved?: number;

  /** ISO 8601 timestamp when annotations were last saved (Level 3 only) */
  last_saved_at?: string;
}

/**
 * Complete checkpoint state for pipeline resume
 */
export interface CheckpointState {
  /** Checkpoint format version */
  version: string;

  /** ISO 8601 timestamp when pipeline started */
  started_at: string;

  /** Git commit hash when pipeline started */
  git_commit: string;

  /** Current level being processed (0-4) */
  current_level: number;

  /** Checkpoint state for each level */
  levels: Record<number, LevelCheckpoint>;
}
