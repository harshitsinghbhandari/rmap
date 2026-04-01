/**
 * Map Coordinator
 *
 * Main orchestrator that runs the full Level 0-4 pipeline
 * and assembles the .repo_map/ output directory.
 *
 * This is the primary entry point for the `rmap map` command.
 */

import { runPipeline, type PipelineOptions } from './pipeline.js';
import { assembleMap, type AssemblerOptions } from './assembler.js';
import { buildGraph, updateGraph, getGraphStats } from './graph.js';
import { ProgressTracker } from './progress.js';

// Re-export types and functions
export { runPipeline, type PipelineOptions } from './pipeline.js';
export { assembleMap, readExistingMeta, type AssemblerOptions } from './assembler.js';
export { buildGraph, updateGraph, getGraphStats } from './graph.js';
export { ProgressTracker } from './progress.js';

/**
 * Options for building the map
 */
export interface BuildMapOptions {
  /** Repository root path (absolute) */
  repoRoot: string;
  /** Output directory (defaults to .repo_map) */
  outputDir?: string;
  /** Force full rebuild even if delta would be possible */
  forceFullRebuild?: boolean;
  /** Enable auto-fix of validation issues */
  autofix?: boolean;
  /** Run Level 3 tasks in parallel (default: true) */
  parallel?: boolean;
  /** Resume from checkpoint if available (default: true) */
  resume?: boolean;
}

/**
 * Result of building the map
 */
export interface BuildMapResult {
  /** Path to the output directory */
  outputPath: string;
  /** Paths to all written files */
  filesWritten: string[];
  /** Build statistics */
  stats: {
    filesAnnotated: number;
    buildTimeMinutes: number;
    agentsUsed: number;
    validationIssues: number;
  };
}

/**
 * Main function to build a repository map
 *
 * Runs the complete pipeline (Level 0-4) and writes all output files
 * to the .repo_map/ directory.
 *
 * @param options - Build options
 * @returns Build result with output paths and statistics
 */
export async function buildMap(options: BuildMapOptions): Promise<BuildMapResult> {
  const {
    repoRoot,
    outputDir = '.repo_map',
    forceFullRebuild = false,
    autofix = true,
    parallel = true,
    resume = true,
  } = options;

  // Run the pipeline
  const pipelineResult = await runPipeline({
    repoRoot,
    forceFullRebuild,
    autofix,
    parallel,
    resume,
  });

  // Assemble and write all map files
  console.log('\nWriting map files...');
  const assemblerResult = assembleMap(
    pipelineResult.annotations,
    pipelineResult.graph,
    pipelineResult.meta,
    pipelineResult.stats,
    pipelineResult.validation,
    {
      repoRoot,
      outputDir,
    }
  );

  console.log(`\n✓ Map written to: ${assemblerResult.outputPath}`);
  console.log(`✓ Files written: ${assemblerResult.filesWritten.length}`);

  return {
    outputPath: assemblerResult.outputPath,
    filesWritten: assemblerResult.filesWritten,
    stats: {
      filesAnnotated: pipelineResult.stats.files_annotated,
      buildTimeMinutes: pipelineResult.stats.build_time_minutes,
      agentsUsed: pipelineResult.stats.agents_used,
      validationIssues: pipelineResult.stats.validation_issues,
    },
  };
}
