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

export const getContextCommand = new Command('get-context')
  .description('Query repository context by tags, file, or path')
  .argument('[tags...]', 'Tags to search for (e.g., auth middleware)')
  .option('--file <path>', 'Query context for a specific file')
  .option('--path <dir>', 'Query context for a directory')
  .action(async (tags: string[], options) => {
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

      // Determine query type and execute
      let output: string;

      if (options.file) {
        output = await queryByFileEngine(options.file);
      } else if (options.path) {
        output = await queryByPathEngine(options.path);
      } else {
        output = await queryByTagsEngine(tags);
      }

      // Print the formatted output
      console.log(output);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });
