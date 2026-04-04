/**
 * Level 3 Deep File Annotator
 *
 * Core annotation engine that reads files and produces semantic annotations
 * using Claude Haiku (small) or Sonnet (medium) based on complexity
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FileAnnotation, RawFileMetadata, DelegationTask } from '../../core/types.js';
import { ConcurrencyPool } from '../../core/concurrency.js';
import { buildAnnotationPrompt } from './prompt.js';
import {
  parseAnnotationResponse,
  parseAnnotationResponseWithDetails,
  processRawImports,
  AnnotationValidationError,
} from './parser.js';
import { buildTagCorrectionPrompt } from './tag-validator.js';
import {
  ANNOTATION_MODEL_MAP,
  CONCURRENCY_CONFIG,
  FILE,
  TOKEN,
  RETRY,
  OUTPUT,
} from '../../config/index.js';
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
 * Annotate a single file with tag validation and retry logic
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

  const maxRetries = RETRY.TAG_VALIDATION_RETRIES;
  let lastInvalidTags: string[] = [];
  let lastResponse = '';

  // Process raw imports from Level 0 parsers (only if available)
  // This uses the accurate Babel AST or regex-based extraction instead of asking the LLM
  // If raw_imports is empty/missing, fall back to LLM-extracted imports
  const hasRawImports =
    Array.isArray(metadata.raw_imports) && metadata.raw_imports.length > 0;
  const processedImports = hasRawImports
    ? processRawImports(metadata.raw_imports, metadata.path, repoRoot)
    : undefined;

  // Each iteration makes exactly one LLM call
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Build prompt: initial annotation or correction based on last attempt
      const prompt =
        attempt === 0
          ? buildAnnotationPrompt(metadata.path, content, metadata)
          : buildTagCorrectionPrompt(lastInvalidTags, lastResponse);

      // Call LLM once per attempt
      const response = await llmClient.sendMessage(prompt, {
        model,
        maxTokens: TOKEN.MAX_TOKENS_LEVEL3,
        logContext: {
          level: 'level3',
          purpose:
            attempt === 0
              ? `File annotation - extracts purpose, tags, exports, and imports for: ${metadata.path}`
              : `Tag correction retry ${attempt}/${maxRetries} for: ${metadata.path}`,
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

      lastResponse = response.text;

      // Parse and validate response with detailed tag validation
      // Pass processedImports from Level 0 to override LLM-extracted imports
      const parseResult = parseAnnotationResponseWithDetails(
        response.text,
        metadata,
        repoRoot,
        processedImports
      );

      // Check if we have invalid tags
      if (parseResult.tagValidation.invalid.length > 0) {
        console.warn(
          `Invalid tags detected for ${metadata.path}: ${parseResult.tagValidation.invalid.join(', ')}`
        );

        // If we've exhausted retries, use valid tags if we have any
        if (attempt >= maxRetries) {
          if (parseResult.annotation !== null) {
            console.warn(
              `Max retries (${maxRetries}) exceeded for ${metadata.path}. Using ${parseResult.tagValidation.valid.length} valid tags.`
            );
            return parseResult.annotation;
          } else {
            console.error(
              `No valid tags found for ${metadata.path} after ${maxRetries} retries. Invalid tags: ${parseResult.tagValidation.invalid.join(', ')}`
            );
            return null;
          }
        }

        // Store invalid tags for next correction prompt
        lastInvalidTags = parseResult.tagValidation.invalid;
        console.log(
          `Retrying ${metadata.path} (attempt ${attempt + 2}/${maxRetries + 1}) with tag correction feedback...`
        );
        continue; // Next iteration will use correction prompt
      }

      // No invalid tags - success!
      if (parseResult.annotation !== null) {
        if (attempt > 0) {
          console.log(`✓ Tag validation retry successful for ${metadata.path}`);
        }
        return parseResult.annotation;
      } else {
        console.error(`Failed to parse annotation for ${metadata.path} (no valid tags)`);
        return null;
      }
    } catch (error) {
      if (error instanceof AnnotationValidationError) {
        console.error(`Validation error for ${metadata.path}: ${error.message}`);

        // For structural validation errors (malformed JSON, missing fields, etc.)
        // retry once with stricter prompt (only on first attempt)
        if (attempt === 0) {
          try {
            console.log(`Retrying with stricter prompt for structural validation error...`);
            const stricterPrompt =
              buildAnnotationPrompt(metadata.path, content, metadata) +
              '\n\nIMPORTANT: Your previous response was malformed. Please respond with valid JSON only.';

            const retryResponse = await llmClient.sendMessage(stricterPrompt, {
              model,
              maxTokens: TOKEN.MAX_TOKENS_LEVEL3,
              retryConfig: { maxRetries: RETRY.VALIDATION_ERROR_RETRIES },
              logContext: {
                level: 'level3',
                purpose: `File annotation (retry after structural validation error) for: ${metadata.path}`,
                model,
              },
            });

            // Record retry metrics
            if (metrics) {
              metrics.recordLLMCall({
                model: retryResponse.model,
                inputTokens: retryResponse.inputTokens,
                outputTokens: retryResponse.outputTokens,
              });
            }

            const annotation = parseAnnotationResponse(retryResponse.text, metadata, repoRoot, processedImports);

            console.log(`✓ Structural validation retry successful for ${metadata.path}`);
            return annotation;
          } catch (retryError) {
            console.error(
              `Structural validation retry failed for ${metadata.path}: ${retryError instanceof Error ? retryError.message : String(retryError)}`
            );
            return null;
          }
        }

        return null;
      }

      console.error(
        `Failed to annotate ${metadata.path}: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }

  // Should not reach here, but for safety
  console.error(`Unexpected: Exceeded retry loop for ${metadata.path}`);
  return null;
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

  // Initialize client if not provided
  let llmClient = providedLLMClient;
  if (!llmClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    const anthropicClient = new Anthropic({ apiKey });
    llmClient = new LLMClient(anthropicClient);
  }

  // Select model
  const model = ANNOTATION_MODEL_MAP[agentSize];

  // Only print header when not in quiet mode (not called from annotateTask)
  if (!quiet) {
    console.log(`Starting Level 3 annotation...`);
    console.log(`Agent size: ${agentSize} (${model})`);
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
