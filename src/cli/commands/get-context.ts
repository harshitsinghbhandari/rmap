/**
 * rmap get-context command
 *
 * Queries the repository map for relevant context
 */

import { Command } from 'commander';

export const getContextCommand = new Command('get-context')
  .description('Query repository context by tags, file, or path')
  .argument('[tags...]', 'Tags to search for (e.g., auth middleware)')
  .option('--file <path>', 'Query context for a specific file')
  .option('--path <dir>', 'Query context for a directory')
  .action(async (tags: string[], options) => {
    try {
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
      if (options.file) {
        await queryByFile(options.file);
      } else if (options.path) {
        await queryByPath(options.path);
      } else {
        await queryByTags(tags);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

/**
 * Query context by tags
 */
async function queryByTags(tags: string[]): Promise<void> {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║       Querying by Tags                ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log();
  console.log(`Tags: ${tags.join(', ')}`);
  console.log();
  console.log('Note: Tag querying is not yet implemented.');
  console.log('This will:');
  console.log('  • Expand tag aliases (auth → authentication, authorization, jwt)');
  console.log('  • Find files with matching tags');
  console.log('  • Rank by relevance and graph connectivity');
  console.log('  • Show blast radius (files that depend on results)');
  console.log('  • Format output under token budget (450-800 tokens)');
  console.log();
  console.log('Expected output format:');
  console.log('═══ REPO CONTEXT ═══');
  console.log('[repo name, purpose, stack, entry points]');
  console.log();
  console.log(`═══ RELEVANT FILES [${tags.join(', ')}] ═══`);
  console.log('[file paths with purpose and exports]');
  console.log();
  console.log('═══ BLAST RADIUS ═══');
  console.log('[files that import the relevant files]');
  console.log();
  console.log('═══ CONVENTIONS ═══');
  console.log('[project conventions]');
}

/**
 * Query context for a specific file
 */
async function queryByFile(filePath: string): Promise<void> {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║       Querying by File                ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log();
  console.log(`File: ${filePath}`);
  console.log();
  console.log('Note: File querying is not yet implemented.');
  console.log('This will:');
  console.log('  • Show file purpose, tags, and exports');
  console.log('  • List files this file imports');
  console.log('  • List files that import this file (blast radius)');
  console.log('  • Show relevant project conventions');
}

/**
 * Query context for a directory
 */
async function queryByPath(dirPath: string): Promise<void> {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║       Querying by Path                ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log();
  console.log(`Path: ${dirPath}`);
  console.log();
  console.log('Note: Path querying is not yet implemented.');
  console.log('This will:');
  console.log('  • Aggregate all files in the directory');
  console.log('  • Show module purpose and structure');
  console.log('  • List key exports from the directory');
  console.log('  • Show blast radius (external dependencies)');
}
