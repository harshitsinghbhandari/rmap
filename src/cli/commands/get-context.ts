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
      // Check if repository map exists
      if (!(await hasRepoMap())) {
        console.error('Error: Repository map not found.');
        console.error('');
        console.error('Please run "rmap map" to build the repository map first.');
        process.exit(1);
      }

      // Validate that at least one query type is provided
      if (tags.length === 0 && !options.file && !options.path) {
        console.error('Error: Please provide at least one query parameter');
        console.error('');
        console.error('Usage:');
        console.error('  rmap get-context auth middleware    # Query by tags');
        console.error('  rmap get-context --file src/auth.ts # Query by file');
        console.error('  rmap get-context --path src/auth/   # Query by directory');
        process.exit(1);
      }

      // Parse limit option
      const limit = options.limit ? parseInt(options.limit, 10) : 10;
      if (isNaN(limit) || limit <= 0) {
        console.error('Error: --limit must be a positive number');
        process.exit(1);
      }

      // Determine query type and execute
      let output: string;

      if (options.file) {
        output = await queryByFileEngine(options.file, {
          formatOptions: {
            maxFiles: limit,
            outputFormat: options.json ? 'json' : 'text',
          },
        });
      } else if (options.path) {
        output = await queryByPathEngine(options.path, {
          formatOptions: {
            maxFiles: limit,
            outputFormat: options.json ? 'json' : 'text',
          },
        });
      } else {
        output = await queryByTagsEngine(tags, {
          formatOptions: {
            maxFiles: limit,
            outputFormat: options.json ? 'json' : 'text',
          },
        });
      }

      // Print the formatted output
      console.log(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });
