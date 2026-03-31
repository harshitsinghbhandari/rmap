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
import { buildAnnotationPrompt } from './prompt.js';
import { parseAnnotationResponse, AnnotationValidationError } from './parser.js';

/**
 * Model selection based on agent size
 */
const MODEL_MAP = {
  small: 'claude-haiku-4-20250318',
  medium: 'claude-sonnet-4-20250514',
  large: 'claude-sonnet-4-20250514', // Use Sonnet for large as well
} as const;

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
 * Call Claude API with retry logic
 */
async function callClaudeWithRetry(
  client: Anthropic,
  prompt: string,
  model: string,
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: 2000,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Extract text from response
      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      return content.text;
    } catch (error) {
      lastError = error as Error;

      // Check if it's a rate limit error
      if (error instanceof Anthropic.RateLimitError) {
        if (attempt < maxRetries) {
          const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`Rate limit hit. Retrying in ${waitTime / 1000}s... (attempt ${attempt}/${maxRetries})`);
          await sleep(waitTime);
          continue;
        }
      }

      // For other API errors, don't retry
      if (error instanceof Anthropic.APIError) {
        throw new Error(`Claude API error: ${error.message}`);
      }

      // For non-API errors, throw immediately
      throw error;
    }
  }

  throw new Error(`Failed after ${maxRetries} retries: ${lastError?.message}`);
}

/**
 * Annotate a single file
 *
 * @param filePath - Absolute path to the file
 * @param metadata - File metadata from Level 0
 * @param client - Anthropic client
 * @param model - Claude model to use
 * @param repoRoot - Repository root path
 * @returns FileAnnotation or null if file cannot be annotated
 */
async function annotateFile(
  filePath: string,
  metadata: RawFileMetadata,
  client: Anthropic,
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
    const responseText = await callClaudeWithRetry(client, prompt, model);

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

        const responseText = await callClaudeWithRetry(client, retryPrompt, model, 1);
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

  /** Anthropic API client (optional, will be created if not provided) */
  client?: Anthropic;
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
  const { agentSize, repoRoot, client: providedClient } = options;

  // Initialize client if not provided
  let client = providedClient;
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    client = new Anthropic({ apiKey });
  }

  // Select model
  const model = MODEL_MAP[agentSize];

  console.log(`Starting Level 3 annotation...`);
  console.log(`Agent size: ${agentSize} (${model})`);
  console.log(`Files to annotate: ${files.length}`);

  const annotations: FileAnnotation[] = [];
  let successCount = 0;
  let failCount = 0;

  // Process files sequentially (to avoid rate limits)
  for (let i = 0; i < files.length; i++) {
    const metadata = files[i];
    const absolutePath = path.join(repoRoot, metadata.path);

    console.log(`[${i + 1}/${files.length}] Annotating ${metadata.path}...`);

    const annotation = await annotateFile(absolutePath, metadata, client, model, repoRoot);

    if (annotation) {
      annotations.push(annotation);
      successCount++;
    } else {
      failCount++;
    }

    // Small delay to avoid rate limits (100ms between requests)
    if (i < files.length - 1) {
      await sleep(100);
    }
  }

  console.log(`✓ Level 3 annotation complete`);
  console.log(`  Success: ${successCount}/${files.length}`);
  if (failCount > 0) {
    console.log(`  Failed: ${failCount}/${files.length}`);
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
