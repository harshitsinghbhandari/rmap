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
  TaskAssignmentPlan,
  FileAnnotation,
  GraphJson,
  MetaJson,
  StatsJson,
  ValidationJson,
} from '../core/types.js';
import { SCHEMA_VERSION, CHECKPOINT_FILES } from '../core/constants.js';
import { harvest } from '../levels/level0/index.js';
import { detectStructure } from '../levels/level1/index.js';
import { divideWork, buildTaskAssignmentPlan, printTaskPlanSummary } from '../levels/level2/index.js';
import { annotateTask, annotateFiles, annotateExplicitTask } from '../levels/level3/index.js';
import { validateMap } from '../levels/level4/index.js';
import { buildGraph } from './graph.js';
import { ProgressTracker } from './progress.js';
import { readExistingMeta } from './assembler.js';
import { CheckpointOrchestrator } from './checkpoint-orchestrator.js';
import { GracefulShutdownHandler } from './shutdown-handler.js';
import {
  MetricsCollector,
  writeMetricsLog,
  printCompactSummary,
  printLatencyAnalysis,
  globalLatencyTracker,
  getCurrentCommitSafe,
} from '../core/index.js';
import { TaskProgressTracker, printLevelHeader } from '../cli/progress-ui.js';
import { ANNOTATION_MODEL_MAP, CONCURRENCY_CONFIG } from '../config/index.js';
import { getUI } from '../cli/ui-constants.js';

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
  /**
   * Use LOC-based task division (Level 2.5) instead of LLM-based division
   * This is a deterministic algorithm that groups files by LOC (~500 per task)
   * @default true
   */
  useLocBasedDivision?: boolean;
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
    return getCurrentCommitSafe(repoRoot);
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
  const {
    repoRoot,
    forceFullRebuild = false,
    autofix = true,
    parallel = true,
    resume = true,
    useLocBasedDivision = true,  // Default to LOC-based division
  } = options;
  const tracker = new ProgressTracker();
  const metrics = new MetricsCollector();

  // Reset latency tracker for fresh run
  globalLatencyTracker.reset();

  console.log('\n🗺️  Starting rmap pipeline...');
  console.log(`Repository: ${repoRoot}`);
  console.log(`Mode: ${forceFullRebuild ? 'FULL REBUILD' : 'AUTO'}`);
  console.log(`Task division: ${useLocBasedDivision ? 'LOC-based (Level 2.5)' : 'LLM-based (Level 2)'}`);

  // Get current git commit for checkpoint
  const currentCommit = getGitCommit(repoRoot);

  // Initialize checkpoint orchestrator
  const checkpointer = new CheckpointOrchestrator(repoRoot, currentCommit);

  // Try to load existing checkpoint
  let level0: Level0Output | null = null;
  let level1: Level1Output | null = null;
  let delegation: TaskDelegation | null = null;
  let taskPlan: TaskAssignmentPlan | null = null;
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

    // Load Level 3 partial progress if interrupted or in progress
    const checkpoint = checkpointer.getCheckpoint();
    const level3Status = checkpoint.levels[3]?.status;

    if (level3Status === 'in_progress' || level3Status === 'interrupted') {
      // Load incremental annotations from JSONL file
      level3Annotations = await checkpointer.loadIncrementalProgress();

      // Backward compatibility: if JSONL is empty but we have completed tasks,
      // fall back to loading from level3_progress.json (from older checkpoints)
      if (level3Annotations.length === 0) {
        const legacyAnnotations = checkpointer.loadLevel3Progress();
        if (legacyAnnotations.length > 0) {
          level3Annotations = legacyAnnotations;
          console.log(`  📦 Loaded ${level3Annotations.length} annotations from legacy checkpoint`);
          // Migrate to JSONL format for future saves
          await checkpointer.clearIncrementalProgress();
          await checkpointer.saveAnnotationsIncremental(level3Annotations);
        }
      }

      completedTaskIds = checkpointer.getCompletedTaskIds();
      if (completedTaskIds.size > 0) {
        console.log(`  ⏸️  Level 3 partially completed: ${completedTaskIds.size} tasks done`);
        console.log(`  📦 Loaded ${level3Annotations.length} previously saved annotations`);
      }
    } else if (level3Status === 'completed') {
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

  // ===== LEVEL 2 / 2.5: Work Divider =====
  if (useLocBasedDivision) {
    // Level 2.5: LOC-based algorithmic task division (no LLM)
    tracker.startLevel('Level 2.5: LOC-based Task Builder');
    metrics.startLevel(2, 'Level 2.5: LOC-based Task Builder');
    checkpointer.startLevel(2);

    taskPlan = buildTaskAssignmentPlan(level0);

    // Print task plan summary
    printTaskPlanSummary(taskPlan);

    // Convert to TaskDelegation for compatibility with rest of pipeline
    delegation = {
      tasks: taskPlan.tasks.map((t) => ({
        scope: t.taskId,  // Use taskId as scope for explicit lookup
        agent_size: t.agentSize,
        estimated_files: t.fileCount,
      })),
      execution: 'parallel',
      estimated_total_minutes: Math.ceil(taskPlan.tasks.length * 0.5),  // Rough estimate
    };

    // Save both the task plan and delegation
    checkpointer.completeLevel(2, { taskPlan, delegation }, 'level2.json');
    metrics.endLevel(2);
    tracker.completeLevel('Level 2.5: LOC-based Task Builder');

    tracker.logProgress(
      `LOC-based division: ${taskPlan.tasks.length} tasks, ~${taskPlan.targetLocPerTask} LOC/task`
    );
  } else {
    // Level 2: LLM-based work division (original behavior)
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
  }

  // ===== LEVEL 3: Deep File Annotator =====
  const checkpoint = checkpointer.getCheckpoint();
  const UI = getUI();

  if (checkpoint.levels[3]?.status === 'completed') {
    // Load completed annotations from checkpoint
    annotations = checkpointer.loadCompletedLevel<FileAnnotation[]>(3) || [];
    tracker.logProgress(`Loaded ${annotations.length} annotations from checkpoint`);
  } else {
    tracker.startLevel('Level 3: Deep File Annotator');
    metrics.startLevel(3, 'Level 3: Deep File Annotator');

    // Initialize Level 3 checkpoint if not already started or interrupted
    const level3Status = checkpoint.levels[3]?.status;

    if (level3Status !== 'in_progress' && level3Status !== 'interrupted') {
      // Fresh start: initialize and clear old data
      checkpointer.initializeLevel3(delegation.tasks.length);
      await checkpointer.clearIncrementalProgress();
    }
    // For interrupted/in_progress, keep existing incremental data

    // Filter out completed tasks for resume
    const remainingTasks = checkpointer.filterRemainingTasks(delegation.tasks, delegation);

    if (remainingTasks.length < delegation.tasks.length) {
      tracker.logProgress(
        `Resuming Level 3: ${remainingTasks.length} tasks remaining (${completedTaskIds.size} already completed)`
      );
    }

    // Start with previously completed annotations
    annotations = [...level3Annotations];

    // Determine execution mode info for header
    const executionMode = parallel && delegation.execution === 'parallel' ? 'parallel' : 'sequential';

    // Print level header once with configuration info
    printLevelHeader('Level 3: Deep File Annotator');
    console.log(`  Execution: ${executionMode}`);
    console.log(`  Concurrency: ${CONCURRENCY_CONFIG.MAX_CONCURRENT_ANNOTATIONS} parallel annotations`);
    console.log(`  Tasks: ${remainingTasks.length}/${delegation.tasks.length}\n`);
    console.log(`${UI.EMOJI.PENDING} Level 3: Deep annotation in progress\n`);

    // Create task progress tracker for rolling viewport
    const taskTracker = new TaskProgressTracker(delegation.tasks.length, 5);

    // Mark already completed tasks in the tracker
    for (const taskId of completedTaskIds) {
      taskTracker.completeTask(taskId);
    }

    if (useLocBasedDivision && taskPlan) {
      // ===== LOC-based division: Use explicit task assignments =====
      // Filter to remaining tasks (not yet completed)
      const remainingExplicitTasks = taskPlan.tasks.filter(
        (t) => !completedTaskIds.has(t.taskId)
      );

      if (parallel) {
        // Run explicit tasks in parallel
        const taskPromises = remainingExplicitTasks.map(async (explicitTask) => {
          const taskAnnotations = await annotateExplicitTask({
            task: explicitTask,
            allFiles: level0.files,
            repoRoot,
            metrics,
            onProgress: (status, taskName) => {
              if (status === 'start') {
                taskTracker.startTask(taskName);
              } else if (status === 'complete') {
                taskTracker.completeTask(taskName);
              } else if (status === 'error') {
                taskTracker.errorTask(taskName);
              }
            },
          });

          // Save this task's annotations incrementally
          await checkpointer.saveAnnotationsIncremental(taskAnnotations);

          // Mark task completed using taskId
          completedTaskIds.add(explicitTask.taskId);
          checkpointer.updateCheckpoint(3, {
            tasks_completed: completedTaskIds.size,
            completed_task_ids: Array.from(completedTaskIds),
          });

          return taskAnnotations;
        });

        const results = await Promise.all(taskPromises);
        const newAnnotations = results.flat();
        annotations.push(...newAnnotations);

        // Save to level3_progress.json for backward compatibility
        checkpointer.saveLevel3Progress(annotations);

        tracker.trackLLMCall(remainingExplicitTasks.length);
      } else {
        // Run explicit tasks sequentially
        for (const explicitTask of remainingExplicitTasks) {
          const taskAnnotations = await annotateExplicitTask({
            task: explicitTask,
            allFiles: level0.files,
            repoRoot,
            metrics,
            onProgress: (status, taskName) => {
              if (status === 'start') {
                taskTracker.startTask(taskName);
              } else if (status === 'complete') {
                taskTracker.completeTask(taskName);
              } else if (status === 'error') {
                taskTracker.errorTask(taskName);
              }
            },
          });

          annotations.push(...taskAnnotations);

          // Save annotations incrementally
          await checkpointer.saveAnnotationsIncremental(taskAnnotations);

          // Mark task completed
          completedTaskIds.add(explicitTask.taskId);
          checkpointer.updateCheckpoint(3, {
            tasks_completed: completedTaskIds.size,
            completed_task_ids: Array.from(completedTaskIds),
          });
          checkpointer.saveLevel3Progress(annotations);

          tracker.trackLLMCall();
        }
      }
    } else if (parallel && delegation.execution === 'parallel') {
      // ===== LLM-based division: Original scope-based matching =====
      // Run remaining tasks in parallel with incremental saves and progress tracking
      const taskPromises = remainingTasks.map(async (task) => {
        const taskAnnotations = await annotateTask({
          task,
          allFiles: level0.files,
          repoRoot,
          metrics,
          onProgress: (status, taskName) => {
            if (status === 'start') {
              taskTracker.startTask(taskName);
            } else if (status === 'complete') {
              taskTracker.completeTask(taskName);
            } else if (status === 'error') {
              taskTracker.errorTask(taskName);
            }
          },
        });

        // Save this task's annotations incrementally
        await checkpointer.saveAnnotationsIncremental(taskAnnotations);

        // Mark this task as completed
        checkpointer.markTaskCompleted(task, delegation, completedTaskIds);

        return taskAnnotations;
      });

      const results = await Promise.all(taskPromises);
      const newAnnotations = results.flat();
      annotations.push(...newAnnotations);

      // Also save to level3_progress.json for backward compatibility
      checkpointer.saveLevel3Progress(annotations);

      tracker.trackLLMCall(remainingTasks.length);
    } else {
      // ===== LLM-based division: Sequential execution =====
      for (const task of remainingTasks) {
        const taskAnnotations = await annotateTask({
          task,
          allFiles: level0.files,
          repoRoot,
          metrics,
          onProgress: (status, taskName) => {
            if (status === 'start') {
              taskTracker.startTask(taskName);
            } else if (status === 'complete') {
              taskTracker.completeTask(taskName);
            } else if (status === 'error') {
              taskTracker.errorTask(taskName);
            }
          },
        });

        annotations.push(...taskAnnotations);

        // Save annotations incrementally
        await checkpointer.saveAnnotationsIncremental(taskAnnotations);

        // Checkpoint this task's completion
        checkpointer.markTaskCompleted(task, delegation, completedTaskIds);
        checkpointer.saveLevel3Progress(annotations);

        tracker.trackLLMCall();
      }
    }

    // Finalize progress tracker
    taskTracker.done();

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

  // Print LLM latency analysis
  printLatencyAnalysis();

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
