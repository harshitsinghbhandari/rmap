/**
 * rmap get-context command
 *
 * Queries the repository map for relevant context
 */

import { Command } from 'commander';
import {
  queryByTags as queryByTagsEngine,
  queryByFile as queryByFileEngine,
  queryByPath as queryByPathEngine,
  hasRepoMap,
} from '../../query/index.js';
import { displayGetContextResult, displayError } from '../display.js';
import type { GetContextResult } from '../types.js';

interface GetContextOptions {
  file?: string;
  path?: string;
  json?: boolean;
  limit?: string;
}

export const getContextCommand = new Command('get-context')
  .description('Query repository context by tags, file, or path')
  .argument('[tags...]', 'Tags to search for (e.g., auth middleware)')
  .option('--file <path>', 'Query context for a specific file')
  .option('--path <dir>', 'Query context for a directory')
  .option('--json', 'Output results in JSON format for machine consumption')
  .option('--limit <n>', 'Maximum number of results to return (default: 10)')
  .action(async (tags: string[], options: GetContextOptions) => {
    try {
      const result = await computeGetContext(tags, options);
      displayGetContextResult(result, { json: options.json });
    } catch (error) {
      displayError(error instanceof Error ? error : String(error));
      process.exit(1);
    }
  });

/**
 * Compute get-context query (pure business logic)
 */
export async function computeGetContext(
  tags: string[],
  options: GetContextOptions
): Promise<GetContextResult> {
  // Check if repository map exists
  if (!(await hasRepoMap())) {
    throw new Error(
      'Repository map not found.\n\nPlease run "rmap map" to build the repository map first.'
    );
  }

  // Validate that at least one query type is provided
  if (tags.length === 0 && !options.file && !options.path) {
    throw new Error(
      'Please provide at least one query parameter\n\n' +
        'Usage:\n' +
        '  rmap get-context auth middleware    # Query by tags\n' +
        '  rmap get-context --file src/auth.ts # Query by file\n' +
        '  rmap get-context --path src/auth/   # Query by directory'
    );
  }

  // Parse limit option
  const limit = options.limit ? parseInt(options.limit, 10) : 10;
  if (isNaN(limit) || limit <= 0) {
    throw new Error('--limit must be a positive number');
  }

  // Determine query type and execute
  let output: string;
  let queryType: 'tags' | 'file' | 'path';
  let query: string | string[];

  if (options.file) {
    queryType = 'file';
    query = options.file;
    output = await queryByFileEngine(options.file, {
      formatOptions: {
        maxFiles: limit,
        outputFormat: options.json ? 'json' : 'text',
      },
    });
  } else if (options.path) {
    queryType = 'path';
    query = options.path;
    output = await queryByPathEngine(options.path, {
      formatOptions: {
        maxFiles: limit,
        outputFormat: options.json ? 'json' : 'text',
      },
    });
  } else {
    queryType = 'tags';
    query = tags;
    output = await queryByTagsEngine(tags, {
      formatOptions: {
        maxFiles: limit,
        outputFormat: options.json ? 'json' : 'text',
      },
    });
  }

  return {
    success: true,
    queryType,
    query,
    output,
    limit,
  };
}
