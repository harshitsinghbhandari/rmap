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
import { parseAnnotationResponse, AnnotationValidationError } from './parser.js';
import { ANNOTATION_MODEL_MAP, CONCURRENCY_CONFIG } from '../../config/models.js';
import { LLMClient } from '../../core/llm-client.js';

/**
 * Check if a file is binary
 *
 * Simple heuristic: read first 8KB and check for null bytes
 */
function isBinaryFile(filePath: string): boolean {
  try {
    const buffer = Buffer.alloc(8192);
    const fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buffer, 0, 8192, 0);
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
 * @returns FileAnnotation or null if file cannot be annotated
 */
async function annotateFile(
  filePath: string,
  metadata: RawFileMetadata,
  llmClient: LLMClient,
  model: string,
  repoRoot: string
): Promise<FileAnnotation | null> {
  // Read file content
  const content = readFileContent(filePath);
  if (content === null) {
    return null; // Skip binary or unreadable files
  }

  try {
    // Build prompt
    const prompt = buildAnnotationPrompt(metadata.path, content, metadata);

    // Call LLM with retry
    const responseText = await llmClient.sendMessage(prompt, {
      model,
      maxTokens: 2000,
    });

    // Parse and validate response
    const annotation = parseAnnotationResponse(responseText, metadata, repoRoot);

    return annotation;
  } catch (error) {
    if (error instanceof AnnotationValidationError) {
      console.error(`Validation error for ${metadata.path}: ${error.message}`);

      // Retry once with stricter prompt
      try {
        console.log(`Retrying with stricter prompt...`);
        const content = readFileContent(filePath);
        if (content === null) return null;

        const prompt = buildAnnotationPrompt(metadata.path, content, metadata);
        const retryPrompt = prompt + '\n\nIMPORTANT: Your previous response was malformed. Please respond with valid JSON only.';

        const responseText = await llmClient.sendMessage(retryPrompt, {
          model,
          maxTokens: 2000,
          retryConfig: { maxRetries: 1 },
        });
        const annotation = parseAnnotationResponse(responseText, metadata, repoRoot);

        console.log(`✓ Retry successful for ${metadata.path}`);
        return annotation;
      } catch (retryError) {
        console.error(`Retry failed for ${metadata.path}: ${retryError instanceof Error ? retryError.message : String(retryError)}`);
        return null;
      }
    }

    console.error(`Failed to annotate ${metadata.path}: ${error instanceof Error ? error.message : String(error)}`);
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
  const { agentSize, repoRoot, llmClient: providedLLMClient } = options;

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

  console.log(`Starting Level 3 annotation...`);
  console.log(`Agent size: ${agentSize} (${model})`);
  console.log(`Files to annotate: ${files.length}`);
  console.log(`Concurrency: ${CONCURRENCY_CONFIG.MAX_CONCURRENT_ANNOTATIONS} parallel tasks`);

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

      const annotation = await annotateFile(absolutePath, metadata, llmClient, model, repoRoot);

      completedCount++;
      if (completedCount % 10 === 0 || completedCount === totalCount) {
        console.log(`Progress: ${completedCount}/${totalCount} files processed`);
      }

      if (annotation === null) {
        throw new Error(`Failed to annotate ${metadata.path}`);
      }

      return annotation;
    }
  );

  console.log(`✓ Level 3 annotation complete`);
  console.log(`  Success: ${annotations.length}/${files.length}`);
  if (failures.length > 0) {
    console.log(`  Failed: ${failures.length}/${files.length}`);
  }

  return annotations;
}

/**
 * Annotate files based on a delegation task
 *
 * @param task - Delegation task from Level 2
 * @param allFiles - All file metadata from Level 0
 * @param repoRoot - Repository root path
 * @returns Array of FileAnnotation
 */
export async function annotateTask(
  task: DelegationTask,
  allFiles: RawFileMetadata[],
  repoRoot: string
): Promise<FileAnnotation[]> {
  console.log(`\nProcessing task: ${task.scope}`);
  console.log(`Agent size: ${task.agent_size}`);
  console.log(`Estimated files: ${task.estimated_files}`);

  // Filter files that match the task scope
  const scopeFiles = allFiles.filter((file) => {
    // If scope is a directory, match files in that directory
    if (task.scope.endsWith('/')) {
      return file.path.startsWith(task.scope);
    }
    // If scope is a file pattern, match against it
    return file.path.includes(task.scope);
  });

  console.log(`Actual files in scope: ${scopeFiles.length}`);

  if (scopeFiles.length === 0) {
    console.warn(`Warning: No files found for scope ${task.scope}`);
    return [];
  }

  // Annotate the files
  return annotateFiles(scopeFiles, {
    agentSize: task.agent_size,
    repoRoot,
  });
}
