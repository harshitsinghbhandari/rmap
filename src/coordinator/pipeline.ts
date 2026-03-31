/**
 * Pipeline Orchestrator
 *
 * Runs the complete Level 0 → Level 4 pipeline:
 * 1. Level 0: Metadata harvester (pure script)
 * 2. Level 1: Structure detector (small LLM)
 * 3. Level 2: Work divider (large LLM)
 * 4. Level 3: Deep file annotator (parallel agents)
 * 5. Level 4: Consistency validator (script + optional LLM)
 */

import type {
  Level0Output,
  Level1Output,
  TaskDelegation,
  FileAnnotation,
  GraphJson,
  MetaJson,
  StatsJson,
  ValidationJson,
} from '../core/types.js';
import { SCHEMA_VERSION } from '../core/constants.js';
import { harvest } from '../levels/level0/index.js';
import { detectStructure } from '../levels/level1/index.js';
import { divideWork } from '../levels/level2/index.js';
import { annotateTask } from '../levels/level3/index.js';
import { validateMap } from '../levels/level4/index.js';
import { buildGraph } from './graph.js';
import { ProgressTracker } from './progress.js';
import { readExistingMeta } from './assembler.js';

/**
 * Pipeline options
 */
export interface PipelineOptions {
  /** Repository root path (absolute) */
  repoRoot: string;
  /** Force full rebuild even if delta would be possible */
  forceFullRebuild?: boolean;
  /** Enable auto-fix of validation issues */
  autofix?: boolean;
  /** Run Level 3 tasks in parallel (default: true) */
  parallel?: boolean;
}

/**
 * Pipeline result
 */
export interface PipelineResult {
  /** File annotations from Level 3 */
  annotations: FileAnnotation[];
  /** Dependency graph */
  graph: GraphJson;
  /** Repository metadata */
  meta: MetaJson;
  /** Build statistics */
  stats: StatsJson;
  /** Validation results */
  validation: ValidationJson;
  /** Progress tracker (for final stats) */
  tracker: ProgressTracker;
}

/**
 * Run the complete map building pipeline
 *
 * @param options - Pipeline options
 * @returns Pipeline result with all generated data
 */
export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const { repoRoot, forceFullRebuild = false, autofix = true, parallel = true } = options;
  const tracker = new ProgressTracker();

  console.log('\n🗺️  Starting rmap pipeline...');
  console.log(`Repository: ${repoRoot}`);
  console.log(`Mode: ${forceFullRebuild ? 'FULL REBUILD' : 'AUTO'}`);

  // ===== LEVEL 0: Metadata Harvester =====
  tracker.startLevel('Level 0: Metadata Harvester');
  const level0: Level0Output = await harvest(repoRoot);
  tracker.completeLevel('Level 0: Metadata Harvester');

  // ===== LEVEL 1: Structure Detector =====
  tracker.startLevel('Level 1: Structure Detector');
  const level1: Level1Output = await detectStructure(level0, repoRoot);
  tracker.trackLLMCall(); // Track LLM usage (actual token count would come from API response)
  tracker.completeLevel('Level 1: Structure Detector');

  // ===== LEVEL 2: Work Divider =====
  tracker.startLevel('Level 2: Work Divider');
  const delegation: TaskDelegation = await divideWork(level0, level1);
  tracker.trackLLMCall(); // Track LLM usage
  tracker.completeLevel('Level 2: Work Divider');

  tracker.logProgress(
    `Work division: ${delegation.tasks.length} tasks, ${delegation.execution} execution`
  );

  // ===== LEVEL 3: Deep File Annotator =====
  tracker.startLevel('Level 3: Deep File Annotator');

  let annotations: FileAnnotation[];

  if (parallel && delegation.execution === 'parallel') {
    // Run tasks in parallel
    tracker.logProgress(`Running ${delegation.tasks.length} tasks in parallel...`);
    const taskPromises = delegation.tasks.map((task) =>
      annotateTask(task, level0.files, repoRoot)
    );
    const results = await Promise.all(taskPromises);
    annotations = results.flat();
    tracker.trackLLMCall(delegation.tasks.length); // Track multiple LLM calls
  } else {
    // Run tasks sequentially
    tracker.logProgress(`Running ${delegation.tasks.length} tasks sequentially...`);
    annotations = [];
    for (const task of delegation.tasks) {
      const taskAnnotations = await annotateTask(task, level0.files, repoRoot);
      annotations.push(...taskAnnotations);
      tracker.trackLLMCall(); // Track LLM usage per task
      tracker.logProgress(
        `Completed task ${delegation.tasks.indexOf(task) + 1}/${delegation.tasks.length}`
      );
    }
  }

  tracker.completeLevel('Level 3: Deep File Annotator');
  tracker.logProgress(`Annotated ${annotations.length} files`);

  // ===== Build Dependency Graph =====
  tracker.logProgress('Building dependency graph...');
  const graph: GraphJson = buildGraph(annotations);

  // ===== Build Metadata =====
  const existingMeta = readExistingMeta(repoRoot);
  const meta: MetaJson = buildMetadata(level0, level1, existingMeta, forceFullRebuild);

  // ===== LEVEL 4: Consistency Validator =====
  tracker.startLevel('Level 4: Consistency Validator');
  const validatorResult = await validateMap(annotations, graph, meta, {
    repoRoot,
    autofix,
    includeInfo: false,
  });
  tracker.completeLevel('Level 4: Consistency Validator');

  // Extract validation data
  const validation = validatorResult.validation;

  // Use fixed annotations and graph if autofix was applied
  const finalAnnotations = validatorResult.annotations;
  const finalGraph = validatorResult.graph;

  // ===== Build Statistics =====
  const stats: StatsJson = {
    files_annotated: finalAnnotations.length,
    build_time_minutes: tracker.getElapsedMinutes(),
    levels_completed: [0, 1, 2, 3, 4],
    agents_used: delegation.tasks.length,
    validation_issues: validation.issues.length,
    last_delta_files: meta.update_type === 'delta' ? meta.files_changed : null,
  };

  // Print summary
  tracker.printSummary({
    filesAnnotated: stats.files_annotated,
    agentsUsed: stats.agents_used,
    validationIssues: stats.validation_issues,
  });

  return {
    annotations: finalAnnotations,
    graph: finalGraph,
    meta,
    stats,
    validation,
    tracker,
  };
}

/**
 * Build metadata from pipeline outputs
 *
 * @param level0 - Level 0 output
 * @param level1 - Level 1 output
 * @param existingMeta - Existing metadata (if any)
 * @param forceFullRebuild - Whether this is a forced full rebuild
 * @returns Complete metadata
 */
function buildMetadata(
  level0: Level0Output,
  level1: Level1Output,
  existingMeta: MetaJson | null,
  forceFullRebuild: boolean
): MetaJson {
  const now = new Date().toISOString();

  // Determine version and update type
  let mapVersion = 1;
  let parentVersion: number | null = null;
  let updateType: 'full' | 'delta' = 'full';
  let filesChanged: number | null = null;
  let createdAt = now;

  if (existingMeta) {
    mapVersion = existingMeta.map_version + 1;
    createdAt = existingMeta.created_at;

    if (!forceFullRebuild && existingMeta.git_commit !== level0.git_commit) {
      // This could be a delta update (actual delta logic would check file changes)
      // For now, we treat all updates as full rebuilds
      updateType = 'full';
      parentVersion = existingMeta.map_version;
    }
  }

  return {
    schema_version: SCHEMA_VERSION,
    map_version: mapVersion,
    git_commit: level0.git_commit,
    created_at: createdAt,
    last_updated: now,
    parent_version: parentVersion,
    update_type: updateType,
    files_changed: filesChanged,
    repo_name: level1.repo_name,
    purpose: level1.purpose,
    stack: level1.stack,
    languages: level1.languages,
    entrypoints: level1.entrypoints,
    modules: level1.modules,
    config_files: level1.config_files,
    conventions: level1.conventions,
  };
}
