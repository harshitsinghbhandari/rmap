/**
 * rmap CLI entry point
 *
 * Provides commands for building and querying repository maps
 */

import { Command } from 'commander';
import { version } from '../version.js';
import { mapCommand, getContextCommand } from './commands/index.js';

const program = new Command();

// Configure main program
program
  .name('rmap')
  .description('A semantic repository map builder for coding agents')
  .version(version);

// Register commands
program.addCommand(mapCommand);
program.addCommand(getContextCommand);

// Global error handling
process.on('uncaughtException', (error: Error) => {
  console.error('Fatal error:', error.message);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error('Unhandled promise rejection:', message);
  if (process.env.DEBUG && reason instanceof Error) {
    console.error(reason.stack);
  }
  process.exit(1);
});

// Parse command line arguments
try {
  await program.parseAsync(process.argv);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  if (process.env.DEBUG && error instanceof Error) {
    console.error(error.stack);
  }
  process.exit(1);
}
