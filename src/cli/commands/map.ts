/**
 * rmap map command
 *
 * Builds or updates the repository map
 */

import { Command } from 'commander';
import * as path from 'node:path';
import { buildMap } from '../../coordinator/index.js';
import { readExistingMeta } from '../../coordinator/assembler.js';

export const mapCommand = new Command('map')
  .description('Build or update repository map')
  .option('--full', 'Force full rebuild of the entire map')
  .option('--status', 'Show current map status and staleness')
  .option('--update', 'Update map based on git changes (delta update)')
  .action(async (options) => {
    try {
      // Determine which operation to perform
      if (options.status) {
        await showMapStatus();
      } else if (options.full) {
        await buildFullMap();
      } else if (options.update) {
        await updateMap();
      } else {
        // Default: delta update if map exists, otherwise full build
        await buildOrUpdateMap();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  });

/**
 * Show map status and staleness information
 */
async function showMapStatus(): Promise<void> {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║       Repository Map Status           ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log();
  console.log('Map version: [not yet implemented]');
  console.log('Schema: [not yet implemented]');
  console.log('Built from: [not yet implemented]');
  console.log('Current HEAD: [not yet implemented]');
  console.log('Files changed since map: [not yet implemented]');
  console.log('Verdict: [not yet implemented]');
  console.log();
  console.log('Note: Map status checking is not yet implemented.');
  console.log('This will show map version, last commit, and staleness analysis.');
}

/**
 * Force a full rebuild of the map
 */
async function buildFullMap(): Promise<void> {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║       Building Repository Map         ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log();

  const repoRoot = process.cwd();

  const result = await buildMap({
    repoRoot,
    forceFullRebuild: true,
    autofix: true,
    parallel: true,
  });

  console.log('\n✨ Map build complete!');
  console.log(`📁 Output: ${result.outputPath}`);
  console.log(`📊 Stats:`);
  console.log(`   - Files: ${result.stats.filesAnnotated}`);
  console.log(`   - Time: ${result.stats.buildTimeMinutes.toFixed(1)} minutes`);
  console.log(`   - Agents: ${result.stats.agentsUsed}`);
  console.log(`   - Issues: ${result.stats.validationIssues}`);
}

/**
 * Update existing map based on git changes
 */
async function updateMap(): Promise<void> {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║       Updating Repository Map         ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log();
  console.log('Starting delta update...');
  console.log();
  console.log('Note: Delta update is not yet implemented.');
  console.log('This will:');
  console.log('  • Detect changed files via git diff');
  console.log('  • Re-annotate only changed files');
  console.log('  • Repair dependency graph');
  console.log('  • Update map version');
}

/**
 * Default behavior: delta update if map exists, otherwise full build
 */
async function buildOrUpdateMap(): Promise<void> {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║       Repository Map Builder          ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log();

  const repoRoot = process.cwd();

  // Check if map exists
  const existingMeta = readExistingMeta(repoRoot);

  if (existingMeta) {
    console.log(`Found existing map (version ${existingMeta.map_version})`);
    console.log('Note: Delta update logic not yet implemented, doing full rebuild');
    console.log();
  } else {
    console.log('No existing map found, building from scratch...');
    console.log();
  }

  const result = await buildMap({
    repoRoot,
    forceFullRebuild: false, // Will do delta if possible (when implemented)
    autofix: true,
    parallel: true,
  });

  console.log('\n✨ Map build complete!');
  console.log(`📁 Output: ${result.outputPath}`);
  console.log(`📊 Stats:`);
  console.log(`   - Files: ${result.stats.filesAnnotated}`);
  console.log(`   - Time: ${result.stats.buildTimeMinutes.toFixed(1)} minutes`);
  console.log(`   - Agents: ${result.stats.agentsUsed}`);
  console.log(`   - Issues: ${result.stats.validationIssues}`);
}
