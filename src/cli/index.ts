/**
 * rmap CLI entry point
 *
 * Provides commands for building and querying repository maps
 */

import { Command } from 'commander';
import { version } from '../version.js';

const program = new Command();

program
  .name('rmap')
  .description('A semantic repository map builder for coding agents')
  .version(version);

// Commands will be added here once implemented
// program.addCommand(mapCommand);
// program.addCommand(getContextCommand);

// Placeholder commands for initial setup
program
  .command('map')
  .description('Build or update repository map')
  .option('--full', 'Force full rebuild')
  .option('--status', 'Show map status')
  .option('--update', 'Update based on git changes')
  .action((options) => {
    console.log('Map command not yet implemented');
    console.log('Options:', options);
  });

program
  .command('get-context')
  .description('Query repository context')
  .argument('[tags...]', 'Tags to search for')
  .option('--file <path>', 'Query by file path')
  .option('--path <dir>', 'Query by directory')
  .action((tags, options) => {
    console.log('Get-context command not yet implemented');
    console.log('Tags:', tags);
    console.log('Options:', options);
  });

program.parse();
