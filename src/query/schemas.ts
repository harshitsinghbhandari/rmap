/**
 * Zod schemas for JSON validation in the query engine
 *
 * Validates the structure of .repo_map/*.json files to prevent runtime errors
 * from malformed or incomplete data
 */

import { z } from 'zod';

/**
 * Module schema for top-level modules/directories
 * /Users/harshitsinghbhandari/Downloads/side-quests/rmap/src/query/schemas.ts:17
 */
const ModuleSchema = z.object({
  path: z.string(),
  description: z.string(),
});

/**
 * Schema for meta.json
 *
 * Repository metadata and conventions
 */
export const MetaJsonSchema = z.object({
  schema_version: z.string(),
  map_version: z.number().int().nonnegative(),
  git_commit: z.string(),
  created_at: z.string().datetime(),
  last_updated: z.string().datetime(),
  parent_version: z.number().int().nonnegative().nullable(),
  update_type: z.enum(['full', 'delta']),
  files_changed: z.number().int().nonnegative().nullable(),
  repo_name: z.string(),
  purpose: z.string(),
  stack: z.string(),
  languages: z.array(z.string()),
  entrypoints: z.array(z.string()),
  modules: z.array(ModuleSchema),
  config_files: z.array(z.string()),
  conventions: z.array(z.string()),
});

/**
 * Schema for a single node in the dependency graph
 */
const GraphNodeSchema = z.object({
  imports: z.array(z.string()),
  imported_by: z.array(z.string()),
});

/**
 * Schema for graph.json
 *
 * Full dependency graph mapping file paths to their imports/importers
 */
export const GraphJsonSchema = z.record(z.string(), GraphNodeSchema);

/**
 * Schema for a single file annotation
 * /Users/harshitsinghbhandari/Downloads/side-quests/rmap/src/query/schemas.ts:76
 */
const FileAnnotationSchema = z.object({
  path: z.string(),
  language: z.string(),
  size_bytes: z.number().int().nonnegative(),
  line_count: z.number().int().nonnegative(),
  purpose: z.string(),
  exports: z.array(z.string()),
  imports: z.array(z.string()),
});

/**
 * Schema for annotations.json
 *
 * Array of file annotations with semantic information
 */
export const AnnotationsJsonSchema = z.array(FileAnnotationSchema);

/**
 * Type inference from schemas (for convenience)
 */
export type ValidatedMetaJson = z.infer<typeof MetaJsonSchema>;
export type ValidatedGraphJson = z.infer<typeof GraphJsonSchema>;
export type ValidatedTagsJson = z.infer<typeof TagsJsonSchema>;
export type ValidatedAnnotationsJson = z.infer<typeof AnnotationsJsonSchema>;
