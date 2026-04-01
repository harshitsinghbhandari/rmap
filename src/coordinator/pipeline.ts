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
  CheckpointState,
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
import {
  initCheckpoint,
  loadCheckpoint,
  validateCheckpoint,
  saveLevelOutput,
  loadLevelOutput,
  markLevelStarted,
  markLevelCompleted,
  updateLevelCheckpoint,
} from './checkpoint.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

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
 * Generate a stable task ID from task index and scope
 *
 * @param index - Task index in delegation.tasks array
 * @param scope - Task scope (e.g., "src/auth/")
 * @returns Stable task ID
 */
function getTaskId(index: number, scope: string): string {
  // Use index and sanitized scope to create stable ID
  const sanitizedScope = scope.replace(/[^a-zA-Z0-9]/g, '_');
  return `task_${index}_${sanitizedScope}`;
}

/**
 * Get path to Level 3 progress file
 *
 * @param repoPath - Absolute path to repository root
 * @returns Absolute path to level3_progress.json
 */
function getLevel3ProgressPath(repoPath: string): string {
  return path.join(repoPath, '.repo_map', '.checkpoint', CHECKPOINT_FILES.LEVEL3_PROGRESS);
}

/**
 * Load saved Level 3 annotations from checkpoint
 *
 * @param repoPath - Absolute path to repository root
 * @returns Array of previously completed annotations or empty array
 */
function loadLevel3Progress(repoPath: string): FileAnnotation[] {
  const progressPath = getLevel3ProgressPath(repoPath);
  if (!fs.existsSync(progressPath)) {
    return [];
  }

  try {
    const content = fs.readFileSync(progressPath, 'utf8');
    return JSON.parse(content) as FileAnnotation[];
  } catch (error) {
    console.warn(`Warning: Failed to load Level 3 progress: ${error}`);
    return [];
  }
}

/**
 * Save Level 3 annotations to checkpoint
 *
 * @param repoPath - Absolute path to repository root
 * @param annotations - Annotations to save
 */
function saveLevel3Progress(repoPath: string, annotations: FileAnnotation[]): void {
  const progressPath = getLevel3ProgressPath(repoPath);
  const dir = path.dirname(progressPath);

  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write atomically using temp file
  const tempPath = path.join(dir, `.${path.basename(progressPath)}.tmp`);
  const json = JSON.stringify(annotations, null, 2);
  fs.writeFileSync(tempPath, json + '\n', 'utf8');
  fs.renameSync(tempPath, progressPath);
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

  console.log('\n🗺️  Starting rmap pipeline...');
  console.log(`Repository: ${repoRoot}`);
  console.log(`Mode: ${forceFullRebuild ? 'FULL REBUILD' : 'AUTO'}`);

  // Get current git commit for checkpoint
  const currentCommit = getGitCommit(repoRoot);

  // Try to load existing checkpoint
  let checkpoint: CheckpointState | null = null;
  let level0: Level0Output | null = null;
  let level1: Level1Output | null = null;
  let delegation: TaskDelegation | null = null;
  let level3Annotations: FileAnnotation[] = [];
  let completedTaskIds: Set<string> = new Set();

  if (resume) {
    checkpoint = loadCheckpoint(repoRoot);

    if (checkpoint) {
      const validation = validateCheckpoint(checkpoint, currentCommit);

      if (validation.valid) {
        console.log('📋 Found valid checkpoint, resuming from last completed level...');

        // Load completed levels
        if (checkpoint.levels[0]?.status === 'completed') {
          level0 = loadLevelOutput<Level0Output>(repoRoot, 0);
          console.log('  ✓ Level 0 already completed');
        }

        if (checkpoint.levels[1]?.status === 'completed') {
          level1 = loadLevelOutput<Level1Output>(repoRoot, 1);
          console.log('  ✓ Level 1 already completed');
        }

        if (checkpoint.levels[2]?.status === 'completed') {
          delegation = loadLevelOutput<TaskDelegation>(repoRoot, 2);
          console.log('  ✓ Level 2 already completed');
        }

        // Load Level 3 partial progress if interrupted
        if (checkpoint.levels[3]?.status === 'in_progress') {
          level3Annotations = loadLevel3Progress(repoRoot);
          completedTaskIds = new Set(checkpoint.levels[3].completed_task_ids || []);
          if (completedTaskIds.size > 0) {
            console.log(
              `  ⏸️  Level 3 partially completed: ${completedTaskIds.size} tasks done`
            );
          }
        } else if (checkpoint.levels[3]?.status === 'completed') {
          // Level 3 fully completed - will be skipped
          console.log('  ✓ Level 3 already completed');
        }
      } else {
        console.log(`⚠️  Checkpoint invalid: ${validation.error}`);
        console.log('   Starting fresh...');
        checkpoint = null;
      }
    }
  }

  // Initialize new checkpoint if none exists or resume is disabled
  if (!checkpoint) {
    checkpoint = initCheckpoint(repoRoot, currentCommit);
  }

  // ===== LEVEL 0: Metadata Harvester =====
  if (!level0) {
    tracker.startLevel('Level 0: Metadata Harvester');
    markLevelStarted(repoRoot, checkpoint, 0);

    level0 = await harvest(repoRoot);

    saveLevelOutput(repoRoot, 0, level0);
    markLevelCompleted(repoRoot, checkpoint, 0, 'level0.json');
    tracker.completeLevel('Level 0: Metadata Harvester');
  }

  // ===== LEVEL 1: Structure Detector =====
  if (!level1) {
    tracker.startLevel('Level 1: Structure Detector');
    markLevelStarted(repoRoot, checkpoint, 1);

    level1 = await detectStructure(level0, repoRoot);
    tracker.trackLLMCall(); // Track LLM usage (actual token count would come from API response)

    saveLevelOutput(repoRoot, 1, level1);
    markLevelCompleted(repoRoot, checkpoint, 1, 'level1.json');
    tracker.completeLevel('Level 1: Structure Detector');
  }

  // ===== LEVEL 2: Work Divider =====
  if (!delegation) {
    tracker.startLevel('Level 2: Work Divider');
    markLevelStarted(repoRoot, checkpoint, 2);

    delegation = await divideWork(level0, level1);
    tracker.trackLLMCall(); // Track LLM usage

    saveLevelOutput(repoRoot, 2, delegation);
    markLevelCompleted(repoRoot, checkpoint, 2, 'level2.json');
    tracker.completeLevel('Level 2: Work Divider');
  }

  tracker.logProgress(
    `Work division: ${delegation.tasks.length} tasks, ${delegation.execution} execution`
  );

  // ===== LEVEL 3: Deep File Annotator =====
  let annotations: FileAnnotation[];

  // Check if Level 3 is already completed
  if (checkpoint.levels[3]?.status === 'completed') {
    // Load completed annotations from checkpoint
    annotations = loadLevelOutput<FileAnnotation[]>(repoRoot, 3) || [];
    tracker.logProgress(`Loaded ${annotations.length} annotations from checkpoint`);
  } else {
    tracker.startLevel('Level 3: Deep File Annotator');

    // Initialize Level 3 checkpoint if not already started
    if (checkpoint.levels[3]?.status !== 'in_progress') {
      markLevelStarted(repoRoot, checkpoint, 3);
      updateLevelCheckpoint(repoRoot, checkpoint, 3, {
        tasks_total: delegation.tasks.length,
        tasks_completed: 0,
        completed_task_ids: [],
      });
    }

    // Filter out completed tasks for resume
    const remainingTasks = delegation.tasks.filter((task, index) => {
      const taskId = getTaskId(index, task.scope);
      return !completedTaskIds.has(taskId);
    });

    if (remainingTasks.length < delegation.tasks.length) {
      tracker.logProgress(
        `Resuming Level 3: ${remainingTasks.length} tasks remaining (${completedTaskIds.size} already completed)`
      );
    }

    // Start with previously completed annotations
    annotations = [...level3Annotations];

    if (parallel && delegation.execution === 'parallel') {
      // Run remaining tasks in parallel
      tracker.logProgress(`Running ${remainingTasks.length} tasks in parallel...`);
      const taskPromises = remainingTasks.map((task) =>
        annotateTask(task, level0.files, repoRoot)
      );
      const results = await Promise.all(taskPromises);
      const newAnnotations = results.flat();
      annotations.push(...newAnnotations);

      // Update checkpoint with all completed tasks
      const allCompletedIds = new Set(completedTaskIds);
      remainingTasks.forEach((task, idx) => {
        const originalIndex = delegation.tasks.findIndex((t) => t.scope === task.scope);
        const taskId = getTaskId(originalIndex, task.scope);
        allCompletedIds.add(taskId);
      });

      updateLevelCheckpoint(repoRoot, checkpoint, 3, {
        tasks_completed: allCompletedIds.size,
        completed_task_ids: Array.from(allCompletedIds),
      });
      saveLevel3Progress(repoRoot, annotations);

      tracker.trackLLMCall(remainingTasks.length); // Track multiple LLM calls
    } else {
      // Run tasks sequentially with checkpointing after each
      tracker.logProgress(`Running ${remainingTasks.length} tasks sequentially...`);

      for (const task of remainingTasks) {
        const taskAnnotations = await annotateTask(task, level0.files, repoRoot);
        annotations.push(...taskAnnotations);

        // Checkpoint this task's completion
        const originalIndex = delegation.tasks.findIndex((t) => t.scope === task.scope);
        const taskId = getTaskId(originalIndex, task.scope);
        completedTaskIds.add(taskId);

        updateLevelCheckpoint(repoRoot, checkpoint, 3, {
          tasks_completed: completedTaskIds.size,
          completed_task_ids: Array.from(completedTaskIds),
        });
        saveLevel3Progress(repoRoot, annotations);

        tracker.trackLLMCall(); // Track LLM usage per task
        tracker.logProgress(
          `Completed task ${completedTaskIds.size}/${delegation.tasks.length}`
        );
      }
    }

    // Mark Level 3 as completed and save final output
    saveLevelOutput(repoRoot, 3, annotations);
    markLevelCompleted(repoRoot, checkpoint, 3, CHECKPOINT_FILES.LEVEL3_PROGRESS);
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
