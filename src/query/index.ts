/**
 * Query engine module
 *
 * Provides the core querying interface for rmap's get-context command
 */

// Main query functions
export { queryByTags, queryByFile, queryByPath, hasRepoMap } from './engine.js';
export type { QueryConfig } from './engine.js';

// Filter functions
export {
  expandTagAliases,
  filterFilesByTags,
  filterFilesByPath,
  findFileByPath,
  getFilesFromTagIndex,
} from './filter.js';

// Ranking functions
export {
  rankFilesByRelevance,
  getTopFiles,
  getDependents,
  getDependencies,
  getBlastRadius, // @deprecated - use getDependents instead
} from './ranking.js';
export type { FileScore } from './ranking.js';

// Formatting functions
export {
  formatQueryOutput,
  formatFileQueryOutput,
  formatPathQueryOutput,
} from './formatter.js';
export type { FormatOptions } from './formatter.js';
