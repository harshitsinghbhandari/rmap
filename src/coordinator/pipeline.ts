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

import { execSync } from 'node:child_process';
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
import { SCHEMA_VERSION, CHECKPOINT_FILES } from '../core/constants.js';
import { harvest } from '../levels/level0/index.js';
import { detectStructure } from '../levels/level1/index.js';
import { divideWork } from '../levels/level2/index.js';
import { annotateTask } from '../levels/level3/index.js';
import { validateMap } from '../levels/level4/index.js';
import { buildGraph } from './graph.js';
import { ProgressTracker } from './progress.js';
import { readExistingMeta } from './assembler.js';
import { CheckpointOrchestrator } from './checkpoint-orchestrator.js';
import { GracefulShutdownHandler } from './shutdown-handler.js';
import { MetricsCollector, writeMetricsLog, printCompactSummary } from '../core/index.js';

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
  /** Resume from checkpoint if available (default: true) */
  resume?: boolean;
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
  /** Metrics collector with usage data */
  metrics: MetricsCollector;
}

/**
 * Get current git commit hash
 *
 * @param repoRoot - Absolute path to repository root
 * @returns Git commit hash or 'unknown' if not a git repository
 */
function getGitCommit(repoRoot: string): string {
  try {
    const commit = execSync('git rev-parse HEAD', {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    return commit;
  } catch (error) {
    console.warn('Warning: Could not get git commit hash. Not a git repository?');
    return 'unknown';
  }
}


/**
 * Run the complete map building pipeline
 *
 * @param options - Pipeline options
 * @returns Pipeline result with all generated data
 */
export async function runPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const { repoRoot, forceFullRebuild = false, autofix = true, parallel = true, resume = true } = options;
  const tracker = new ProgressTracker();
  const metrics = new MetricsCollector();

  console.log('\n🗺️  Starting rmap pipeline...');
  console.log(`Repository: ${repoRoot}`);
  console.log(`Mode: ${forceFullRebuild ? 'FULL REBUILD' : 'AUTO'}`);

  // Get current git commit for checkpoint
  const currentCommit = getGitCommit(repoRoot);

  // Initialize checkpoint orchestrator
  const checkpointer = new CheckpointOrchestrator(repoRoot, currentCommit);

  // Try to load existing checkpoint
  let level0: Level0Output | null = null;
  let level1: Level1Output | null = null;
  let delegation: TaskDelegation | null = null;
  let level3Annotations: FileAnnotation[] = [];
  let completedTaskIds: Set<string> = new Set();

  const checkpointValidation = checkpointer.tryLoadCheckpoint(currentCommit, resume);
  if (checkpointValidation.valid) {
    console.log('📋 Found valid checkpoint, resuming from last completed level...');

    // Load completed levels
    level0 = checkpointer.loadCompletedLevel<Level0Output>(0);
    if (level0) console.log('  ✓ Level 0 already completed');

    level1 = checkpointer.loadCompletedLevel<Level1Output>(1);
    if (level1) console.log('  ✓ Level 1 already completed');

    delegation = checkpointer.loadCompletedLevel<TaskDelegation>(2);
    if (delegation) console.log('  ✓ Level 2 already completed');

    // Load Level 3 partial progress if interrupted
    const checkpoint = checkpointer.getCheckpoint();
    if (checkpoint.levels[3]?.status === 'in_progress') {
      // Load incremental annotations from JSONL file
      level3Annotations = await checkpointer.loadIncrementalProgress();
      completedTaskIds = checkpointer.getCompletedTaskIds();
      if (completedTaskIds.size > 0) {
        console.log(`  ⏸️  Level 3 partially completed: ${completedTaskIds.size} tasks done`);
        console.log(`  📦 Loaded ${level3Annotations.length} previously saved annotations`);
      }
    } else if (checkpoint.levels[3]?.status === 'completed') {
      console.log('  ✓ Level 3 already completed');
    }
  } else if (resume) {
    console.log(`⚠️  Checkpoint invalid: ${checkpointValidation.error}`);
    console.log('   Starting fresh...');
  }

  // ===== Set up graceful shutdown handler =====
  const shutdownHandler = new GracefulShutdownHandler();

  // Note: Hoisted to function scope so shutdown handler can access it
  let annotations: FileAnnotation[] = [];

  shutdownHandler.onShutdown(async () => {
    // Mark current level as interrupted
    const currentLevel = checkpointer.getCurrentLevel();
    if (currentLevel < 5) {
      checkpointer.interruptLevel(currentLevel);
    }

    // For Level 3, save partial progress if we have annotations
    if (currentLevel === 3 && annotations.length > 0) {
      checkpointer.saveLevel3Progress(annotations);
      const totalSaved = await checkpointer.loadIncrementalProgress();
      console.log(`✓ Saved ${totalSaved.length} annotations from ${completedTaskIds.size} completed tasks`);
    }
  });

  shutdownHandler.register();

  // ===== LEVEL 0: Metadata Harvester =====
  if (!level0) {
    tracker.startLevel('Level 0: Metadata Harvester');
    metrics.startLevel(0, 'Level 0: Metadata Harvester');
    checkpointer.startLevel(0);

    level0 = await harvest(repoRoot);

    checkpointer.completeLevel(0, level0, 'level0.json');
    metrics.endLevel(0);
    tracker.completeLevel('Level 0: Metadata Harvester');
  }

  // ===== LEVEL 1: Structure Detector =====
  if (!level1) {
    tracker.startLevel('Level 1: Structure Detector');
    metrics.startLevel(1, 'Level 1: Structure Detector');
    checkpointer.startLevel(1);

    level1 = await detectStructure(level0, repoRoot, metrics);
    tracker.trackLLMCall();

    checkpointer.completeLevel(1, level1, 'level1.json');
    metrics.endLevel(1);
    tracker.completeLevel('Level 1: Structure Detector');
  }

  // ===== LEVEL 2: Work Divider =====
  if (!delegation) {
    tracker.startLevel('Level 2: Work Divider');
    metrics.startLevel(2, 'Level 2: Work Divider');
    checkpointer.startLevel(2);

    delegation = await divideWork(level0, level1, metrics);
    tracker.trackLLMCall();

    checkpointer.completeLevel(2, delegation, 'level2.json');
    metrics.endLevel(2);
    tracker.completeLevel('Level 2: Work Divider');
  }

  tracker.logProgress(
    `Work division: ${delegation.tasks.length} tasks, ${delegation.execution} execution`
  );

  // ===== LEVEL 3: Deep File Annotator =====
  const checkpoint = checkpointer.getCheckpoint();

  if (checkpoint.levels[3]?.status === 'completed') {
    // Load completed annotations from checkpoint
    annotations = checkpointer.loadCompletedLevel<FileAnnotation[]>(3) || [];
    tracker.logProgress(`Loaded ${annotations.length} annotations from checkpoint`);
  } else {
    tracker.startLevel('Level 3: Deep File Annotator');
    metrics.startLevel(3, 'Level 3: Deep File Annotator');

    // Initialize Level 3 checkpoint if not already started
    if (checkpoint.levels[3]?.status !== 'in_progress') {
      checkpointer.initializeLevel3(delegation.tasks.length);
      // Clear any old incremental data when starting fresh
      await checkpointer.clearIncrementalProgress();
    }

    // Filter out completed tasks for resume
    const remainingTasks = checkpointer.filterRemainingTasks(delegation.tasks, delegation);

    if (remainingTasks.length < delegation.tasks.length) {
      tracker.logProgress(
        `Resuming Level 3: ${remainingTasks.length} tasks remaining (${completedTaskIds.size} already completed)`
      );
    }

    // Start with previously completed annotations
    annotations = [...level3Annotations];

    if (parallel && delegation.execution === 'parallel') {
      // Run remaining tasks in parallel with incremental saves
      tracker.logProgress(`Running ${remainingTasks.length} tasks in parallel...`);

      // Process tasks in parallel but save incrementally as each completes
      const taskPromises = remainingTasks.map(async (task) => {
        const taskAnnotations = await annotateTask(task, level0.files, repoRoot, metrics);

        // Save this task's annotations incrementally
        await checkpointer.saveAnnotationsIncremental(taskAnnotations);

        // Mark this task as completed
        checkpointer.markTaskCompleted(task, delegation, completedTaskIds);

        tracker.logProgress(
          `Completed task ${completedTaskIds.size}/${delegation.tasks.length} (${taskAnnotations.length} files)`
        );

        return taskAnnotations;
      });

      const results = await Promise.all(taskPromises);
      const newAnnotations = results.flat();
      annotations.push(...newAnnotations);

      // Also save to level3_progress.json for backward compatibility
      checkpointer.saveLevel3Progress(annotations);

      tracker.trackLLMCall(remainingTasks.length);
    } else {
      // Run tasks sequentially with checkpointing after each
      tracker.logProgress(`Running ${remainingTasks.length} tasks sequentially...`);

      for (const task of remainingTasks) {
        const taskAnnotations = await annotateTask(task, level0.files, repoRoot, metrics);
        annotations.push(...taskAnnotations);

        // Save annotations incrementally
        await checkpointer.saveAnnotationsIncremental(taskAnnotations);

        // Checkpoint this task's completion
        checkpointer.markTaskCompleted(task, delegation, completedTaskIds);
        checkpointer.saveLevel3Progress(annotations);

        tracker.trackLLMCall();
        tracker.logProgress(
          `Completed task ${completedTaskIds.size}/${delegation.tasks.length}`
        );
      }
    }

    // Mark Level 3 as completed and save final output
    checkpointer.completeLevel(3, annotations, CHECKPOINT_FILES.LEVEL3_PROGRESS);

    // Clean up incremental file - no longer needed after successful completion
    // annotations.json will be written by assembler with the final annotations array
    await checkpointer.clearIncrementalProgress();

    metrics.recordFilesProcessed(3, annotations.length);
    metrics.endLevel(3);
    tracker.completeLevel('Level 3: Deep File Annotator');
    tracker.logProgress(`Annotated ${annotations.length} files`);
  }

  // ===== Build Dependency Graph =====
  tracker.logProgress('Building dependency graph...');
  const graph: GraphJson = buildGraph(annotations);

  // ===== Build Metadata =====
  const existingMeta = readExistingMeta(repoRoot);
  const meta: MetaJson = buildMetadata(level0, level1, existingMeta, forceFullRebuild);

  // ===== LEVEL 4: Consistency Validator =====
  tracker.startLevel('Level 4: Consistency Validator');
  metrics.startLevel(4, 'Level 4: Consistency Validator');
  const validatorResult = await validateMap(annotations, graph, meta, {
    repoRoot,
    autofix,
    includeInfo: false,
  });
  metrics.endLevel(4);
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

  // ===== Complete metrics and write log =====
  metrics.complete();
  const metricsSummary = metrics.getSummary();
  const logPath = writeMetricsLog(repoRoot, metricsSummary);

  // Print compact metrics summary
  printCompactSummary(metricsSummary, stats.files_annotated, logPath);

  // ===== Clean up signal handlers =====
  shutdownHandler.unregister();

  return {
    annotations: finalAnnotations,
    graph: finalGraph,
    meta,
    stats,
    validation,
    tracker,
    metrics,
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
