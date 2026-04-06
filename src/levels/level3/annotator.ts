/**
 * Level 3 Deep File Annotator
 *
 * Core annotation engine that reads files and produces semantic annotations.
 * Uses fast models (Claude Haiku/Gemini Flash) for simple files and capable
 * models (Claude Sonnet/Gemini Pro) for complex files based on agent size.
 * The LLM provider is configurable via rmap.yaml or environment variables.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FileAnnotation, RawFileMetadata, DelegationTask, ExplicitTask } from '../../core/types.js';
import { ConcurrencyPool } from '../../core/concurrency.js';
import { buildAnnotationPrompt } from './prompt.js';
import {
  parseAnnotationResponse,
  processRawImports,
  AnnotationValidationError,
} from './parser.js';
import {
  CONCURRENCY_CONFIG,
  FILE,
  TOKEN,
  RETRY,
  OUTPUT,
  LLM_PROVIDER,
} from '../../config/index.js';
import { getAnnotationModel } from '../../config/models.js';
import { LLMClient, MetricsCollector } from '../../core/index.js';

/**
 * Check if a file is binary
 *
 * Simple heuristic: read first 8KB and check for null bytes
 */
function isBinaryFile(filePath: string): boolean {
  try {
    const buffer = Buffer.alloc(FILE.BINARY_DETECTION_BUFFER_SIZE);
    const fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buffer, 0, FILE.BINARY_DETECTION_BUFFER_SIZE, 0);
    fs.closeSync(fd);

    // Check for null bytes in the first 8KB
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }

    return false;
  } catch (error) {
    // If we can't read it, assume it's binary
    return true;
  }
}

/**
 * Read file content safely
 *
 * @param filePath - Absolute path to file
 * @returns File content or null if binary/unreadable
 */
function readFileContent(filePath: string): string | null {
  try {
    // Check if binary
    if (isBinaryFile(filePath)) {
      console.log(`Skipping binary file: ${filePath}`);
      return null;
    }

    // Read content
    return fs.readFileSync(filePath, 'utf-8');
  } catch (error) {
    console.error(`Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Annotate a single file
 *
 * @param filePath - Absolute path to the file
 * @param metadata - File metadata from Level 0
 * @param llmClient - LLM client with retry logic
 * @param model - Claude model to use
 * @param repoRoot - Repository root path
 * @param metrics - Optional metrics collector for tracking token usage
 * @returns FileAnnotation or null if file cannot be annotated
 */
async function annotateFile(
  filePath: string,
  metadata: RawFileMetadata,
  llmClient: LLMClient,
  model: string,
  repoRoot: string,
  metrics?: MetricsCollector
): Promise<FileAnnotation | null> {
  // Read file content
  const content = readFileContent(filePath);
  if (content === null) {
    return null; // Skip binary or unreadable files
  }

  // Process raw imports from Level 0 parsers (only if available)
  const hasRawImports =
    Array.isArray(metadata.raw_imports) && metadata.raw_imports.length > 0;
  const processedImports = hasRawImports
    ? processRawImports(metadata.raw_imports, metadata.path, repoRoot)
    : undefined;

  try {
    const prompt = buildAnnotationPrompt(metadata.path, content, metadata);

    // Call LLM
    const response = await llmClient.sendMessage(prompt, {
      model,
      maxTokens: TOKEN.MAX_TOKENS_LEVEL3,
      logContext: {
        level: 'level3',
        purpose: `File annotation - extracts purpose and exports for: ${metadata.path}`,
        model,
      },
    });

    // Record metrics
    if (metrics) {
      metrics.recordLLMCall({
        model: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
      });
    }

    // Parse and validate response
    const annotation = parseAnnotationResponse(
      response.text,
      metadata,
      repoRoot,
      processedImports
    );

    return annotation;
  } catch (error) {
    if (error instanceof AnnotationValidationError) {
      console.error(`Validation error for ${metadata.path}: ${error.message}`);
      return null;
    }

    console.error(
      `Failed to annotate ${metadata.path}: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

/**
 * Options for annotation
 */
export interface AnnotationOptions {
  /** Agent size (determines which model to use) */
  agentSize: 'small' | 'medium' | 'large';

  /** Repository root path */
  repoRoot: string;

  /** LLM client (optional, will be created if not provided) */
  llmClient?: LLMClient;

  /** Metrics collector (optional, for tracking token usage) */
  metrics?: MetricsCollector;

  /**
   * Quiet mode - suppresses header/footer logging.
   * Used when called from annotateTask() to avoid redundant output.
   */
  quiet?: boolean;
}

/**
 * Annotate multiple files using Claude
 *
 * @param files - Array of file metadata to annotate
 * @param options - Annotation options
 * @returns Array of FileAnnotation (excludes failed files)
 */
export async function annotateFiles(
  files: RawFileMetadata[],
  options: AnnotationOptions
): Promise<FileAnnotation[]> {
  const { agentSize, repoRoot, llmClient: providedLLMClient, metrics, quiet = false } = options;

  // Get provider configuration
  const providerType = LLM_PROVIDER.LEVEL3;

  // Initialize client if not provided
  let llmClient = providedLLMClient;
  if (!llmClient) {
    llmClient = LLMClient.withProvider(providerType);
  }

  // Select model based on provider and agent size
  const model = getAnnotationModel(providerType, agentSize);

  // Only print header when not in quiet mode (not called from annotateTask)
  if (!quiet) {
    console.log(`Starting Level 3 annotation...`);
    console.log(`Using ${providerType} provider with ${model} (agent size: ${agentSize})`);
    console.log(`Concurrency: ${CONCURRENCY_CONFIG.MAX_CONCURRENT_ANNOTATIONS} parallel tasks\n`);
  }

  // Import progress UI (dynamic to avoid issues if not available)
  const { PercentageProgressBar } = await import('../../cli/progress-ui.js');

  // Create progress bar showing percentage only (only when not in quiet mode)
  const progressBar = quiet ? null : new PercentageProgressBar(files.length, 'Level 3: Deep File Annotator');

  try {
    // Create concurrency pool for parallel processing
    // Type: ConcurrencyPool<input type, output type>
    const pool = new ConcurrencyPool<RawFileMetadata, FileAnnotation>({
      concurrency: CONCURRENCY_CONFIG.MAX_CONCURRENT_ANNOTATIONS,
      delayBetweenTasks: CONCURRENCY_CONFIG.TASK_START_DELAY_MS,
      stopOnError: false, // Continue processing even if some files fail
    });

    // Track progress
    let completedCount = 0;
    const totalCount = files.length;

    // Process files concurrently
    const { successes: annotations, failures } = await pool.runWithStats(
      files,
      async (metadata, index): Promise<FileAnnotation> => {
        const absolutePath = path.join(repoRoot, metadata.path);

        const annotation = await annotateFile(absolutePath, metadata, llmClient, model, repoRoot, metrics);

        completedCount++;
        // Update progress bar (shows percentage only)
        progressBar?.increment();

        if (annotation === null) {
          throw new Error(`Failed to annotate ${metadata.path}`);
        }

        return annotation;
      }
    );

    // Only print summary when not in quiet mode
    if (!quiet) {
      console.log(`\n✓ Level 3 annotation complete`);
      console.log(`  Success: ${annotations.length}/${files.length}`);
      if (failures.length > 0) {
        console.log(`  Failed: ${failures.length}/${files.length}`);
      }
    }

    return annotations;
  } finally {
    // Always stop progress bar to restore cursor
    progressBar?.stop();
  }
}

/**
 * Task annotation options
 */
export interface TaskAnnotationOptions {
  /** Delegation task from Level 2 */
  task: DelegationTask;
  /** All file metadata from Level 0 */
  allFiles: RawFileMetadata[];
  /** Repository root path */
  repoRoot: string;
  /** Optional metrics collector for tracking token usage */
  metrics?: MetricsCollector;
  /**
   * Optional callback for progress tracking.
   * Called with status updates during task processing.
   */
  onProgress?: (status: 'start' | 'complete' | 'error', taskName: string) => void;
}

/**
 * Annotate files based on a delegation task
 *
 * @param task - Delegation task from Level 2
 * @param allFiles - All file metadata from Level 0
 * @param repoRoot - Repository root path
 * @param metrics - Optional metrics collector for tracking token usage
 * @returns Array of FileAnnotation
 */
export async function annotateTask(
  task: DelegationTask,
  allFiles: RawFileMetadata[],
  repoRoot: string,
  metrics?: MetricsCollector
): Promise<FileAnnotation[]>;

/**
 * Annotate files based on a delegation task (with options object)
 *
 * @param options - Task annotation options
 * @returns Array of FileAnnotation
 */
export async function annotateTask(options: TaskAnnotationOptions): Promise<FileAnnotation[]>;

/**
 * Annotate files based on a delegation task
 * Supports both legacy positional args and new options object
 */
export async function annotateTask(
  taskOrOptions: DelegationTask | TaskAnnotationOptions,
  allFiles?: RawFileMetadata[],
  repoRoot?: string,
  metrics?: MetricsCollector
): Promise<FileAnnotation[]> {
  // Handle both call signatures
  let task: DelegationTask;
  let files: RawFileMetadata[];
  let root: string;
  let metricsCollector: MetricsCollector | undefined;
  let onProgress: ((status: 'start' | 'complete' | 'error', taskName: string) => void) | undefined;

  if ('task' in taskOrOptions) {
    // New options object signature
    task = taskOrOptions.task;
    files = taskOrOptions.allFiles;
    root = taskOrOptions.repoRoot;
    metricsCollector = taskOrOptions.metrics;
    onProgress = taskOrOptions.onProgress;
  } else {
    // Legacy positional args signature
    task = taskOrOptions;
    files = allFiles!;
    root = repoRoot!;
    metricsCollector = metrics;
  }

  // Import UI constants for consistent emoji/plain-text handling
  const { getUI } = await import('../../cli/ui-constants.js');
  const UI = getUI();

  // Notify progress callback if provided
  onProgress?.('start', task.scope);

  // Filter files that match the task scope
  const scopeFiles = files.filter((file) => {
    // If scope is a directory, match files in that directory
    if (task.scope.endsWith('/')) {
      return file.path.startsWith(task.scope);
    }
    // If scope is a file pattern, match against it
    return file.path.includes(task.scope);
  });

  if (scopeFiles.length === 0) {
    // Only log warning if no progress callback (backward compatibility)
    if (!onProgress) {
      console.warn(`${UI.EMOJI.WARNING} Warning: No files found for scope ${task.scope}`);
    }
    onProgress?.('complete', task.scope);
    return [];
  }

  try {
    // Annotate the files in quiet mode (no duplicate headers)
    const result = await annotateFiles(scopeFiles, {
      agentSize: task.agent_size,
      repoRoot: root,
      metrics: metricsCollector,
      quiet: !!onProgress, // Quiet mode when progress callback is provided
    });

    onProgress?.('complete', task.scope);
    return result;
  } catch (error) {
    onProgress?.('error', task.scope);
    throw error;
  }
}

/**
 * Options for explicit task annotation (Level 2.5)
 */
export interface ExplicitTaskAnnotationOptions {
  /** Explicit task from Level 2.5 with file list */
  task: ExplicitTask;
  /** All file metadata from Level 0 */
  allFiles: RawFileMetadata[];
  /** Repository root path */
  repoRoot: string;
  /** Optional metrics collector for tracking token usage */
  metrics?: MetricsCollector;
  /**
   * Optional callback for progress tracking.
   * Called with status updates during task processing.
   */
  onProgress?: (status: 'start' | 'complete' | 'error', taskName: string) => void;
}

/**
 * Annotate files based on an explicit task from Level 2.5
 *
 * This function uses the explicit file list from the task plan,
 * rather than filtering files by scope.
 *
 * @param options - Explicit task annotation options
 * @returns Array of FileAnnotation
 */
export async function annotateExplicitTask(
  options: ExplicitTaskAnnotationOptions
): Promise<FileAnnotation[]> {
  const { task, allFiles, repoRoot, metrics, onProgress } = options;

  // Import UI constants for consistent emoji/plain-text handling
  const { getUI } = await import('../../cli/ui-constants.js');
  const UI = getUI();

  // Notify progress callback if provided
  onProgress?.('start', task.taskId);

  // Get exact files for this task from the explicit file list
  const taskFilePaths = new Set(task.files.map((f) => f.path));
  const taskFiles = allFiles.filter((file) => taskFilePaths.has(file.path));

  if (taskFiles.length === 0) {
    if (!onProgress) {
      console.warn(`${UI.EMOJI.WARNING} Warning: No files found for task ${task.taskId}`);
    }
    onProgress?.('complete', task.taskId);
    return [];
  }

  try {
    // Annotate the files in quiet mode (no duplicate headers)
    const result = await annotateFiles(taskFiles, {
      agentSize: task.agentSize,
      repoRoot,
      metrics,
      quiet: !!onProgress, // Quiet mode when progress callback is provided
    });

    onProgress?.('complete', task.taskId);
    return result;
  } catch (error) {
    onProgress?.('error', task.taskId);
    throw error;
  }
}
