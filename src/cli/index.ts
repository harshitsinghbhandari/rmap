/**
 * rmap CLI entry point
 *
 * Provides commands for building and querying repository maps
 */

import { Command } from 'commander';
import { version } from '../version.js';
import { mapCommand, getContextCommand } from './commands/index.js';
import { initPromptLogger, displayLoggingWarning } from '../core/prompt-logger.js';

const program = new Command();

// Configure main program
program
  .name('rmap')
  .description('A semantic repository map builder for coding agents')
  .version(version)
  .option('--log-prompts', 'boolean  Log all prompts sent to Claude API (can use significant disk space)')
  .option('--log-response', 'boolean  Log all responses from Claude API (can use significant disk space)')
  .addHelpText('after', `
Examples:
  rmap map
  rmap map --status
  rmap get-context --file src/index.ts
  rmap map --log-prompts --log-response
`);

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

// Check for logging flags before parsing to initialize logger
const hasLogPrompts = process.argv.includes('--log-prompts');
const hasLogResponse = process.argv.includes('--log-response');

if (hasLogPrompts || hasLogResponse) {
  const repoRoot = process.cwd();

  // Display warning and wait for confirmation
  await displayLoggingWarning(hasLogPrompts, hasLogResponse);

  // Initialize the logger
  initPromptLogger(repoRoot, hasLogPrompts, hasLogResponse);
}

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
