/**
 * Query engine module
 *
 * Provides the core querying interface for rmap's get-context command
 */

// Main query functions
export { queryByFile, queryByPath, hasRepoMap } from './engine.js';
export type { QueryConfig } from './engine.js';

// Filter functions
export {
  filterFilesByPath,
  findFileByPath,
} from './filter.js';

// Ranking functions
export {
  rankFilesByRelevance,
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
