/**
 * Level 2 Work Divider
 *
 * Uses Claude Sonnet (large LLM) to intelligently divide annotation work
 * into tasks for Level 3 agents.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Level0Output, Level1Output, TaskDelegation, DelegationTask } from '../../core/types.js';
import { MAX_FILES_PER_TASK } from '../../core/constants.js';
import { buildWorkDivisionPrompt } from './prompt.js';

/**
 * Validation error for task delegation
 */
export class DivisionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DivisionValidationError';
  }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call Claude API with retry logic for rate limits
 */
async function callClaudeWithRetry(
  client: Anthropic,
  prompt: string,
  maxRetries: number = 3
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
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
          const waitTime = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
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
 * Validate a single delegation task
 */
function validateDelegationTask(task: unknown): DelegationTask {
  if (typeof task !== 'object' || task === null) {
    throw new DivisionValidationError('Task must be an object');
  }

  const obj = task as Record<string, unknown>;

  // Validate scope
  if (typeof obj.scope !== 'string' || obj.scope.trim().length === 0) {
    throw new DivisionValidationError('Task scope must be a non-empty string');
  }

  // Validate agent_size
  if (obj.agent_size !== 'small' && obj.agent_size !== 'medium' && obj.agent_size !== 'large') {
    throw new DivisionValidationError(
      `Task agent_size must be "small", "medium", or "large", got: ${obj.agent_size}`
    );
  }

  // Validate estimated_files
  if (typeof obj.estimated_files !== 'number' || obj.estimated_files < 1) {
    throw new DivisionValidationError('Task estimated_files must be a positive number');
  }

  if (obj.estimated_files > MAX_FILES_PER_TASK) {
    throw new DivisionValidationError(
      `Task estimated_files (${obj.estimated_files}) exceeds maximum (${MAX_FILES_PER_TASK})`
    );
  }

  return {
    scope: obj.scope,
    agent_size: obj.agent_size as 'small' | 'medium' | 'large',
    estimated_files: obj.estimated_files,
  };
}

/**
 * Validate task delegation structure
 */
function validateTaskDelegation(data: unknown, totalFiles: number): TaskDelegation {
  if (typeof data !== 'object' || data === null) {
    throw new DivisionValidationError('Response must be a JSON object');
  }

  const obj = data as Record<string, unknown>;

  // Validate tasks array
  if (!Array.isArray(obj.tasks)) {
    throw new DivisionValidationError('Field "tasks" must be an array');
  }

  if (obj.tasks.length === 0) {
    throw new DivisionValidationError('Field "tasks" must contain at least one task');
  }

  const tasks = obj.tasks.map(validateDelegationTask);

  // Validate execution strategy
  if (obj.execution !== 'parallel' && obj.execution !== 'sequential') {
    throw new DivisionValidationError('Field "execution" must be "parallel" or "sequential"');
  }

  // Validate estimated_total_minutes
  if (typeof obj.estimated_total_minutes !== 'number' || obj.estimated_total_minutes < 1) {
    throw new DivisionValidationError('Field "estimated_total_minutes" must be a positive number');
  }

  // Validate total files estimation
  const totalEstimatedFiles = tasks.reduce((sum, task) => sum + task.estimated_files, 0);
  const deviation = Math.abs(totalEstimatedFiles - totalFiles) / totalFiles;

  // Allow up to 10% deviation in file count estimation
  if (deviation > 0.1) {
    console.warn(
      `Warning: Total estimated files (${totalEstimatedFiles}) differs from actual (${totalFiles}) by ${(deviation * 100).toFixed(1)}%`
    );
  }

  return {
    tasks,
    execution: obj.execution as 'parallel' | 'sequential',
    estimated_total_minutes: obj.estimated_total_minutes,
  };
}

/**
 * Parse and validate JSON response from LLM
 */
function parseAndValidateResponse(responseText: string, totalFiles: number): TaskDelegation {
  // Remove markdown code blocks if present
  let jsonText = responseText.trim();

  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new DivisionValidationError(
      `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Validate structure
  return validateTaskDelegation(parsed, totalFiles);
}

/**
 * Divide annotation work using Claude Sonnet
 *
 * @param level0 - Output from Level 0 metadata harvester
 * @param level1 - Output from Level 1 structure detector
 * @returns TaskDelegation plan for Level 3 agents
 */
export async function divideWork(
  level0: Level0Output,
  level1: Level1Output
): Promise<TaskDelegation> {
  // Check for API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }

  // Initialize Anthropic client
  const client = new Anthropic({ apiKey });

  console.log('Starting Level 2 work division...');
  console.log('Using Claude Sonnet for intelligent task planning');
  console.log(`Total files to process: ${level0.total_files}`);

  // Build prompt
  const prompt = buildWorkDivisionPrompt(level0, level1);

  // Call Claude with retry logic
  const responseText = await callClaudeWithRetry(client, prompt);

  // Parse and validate response
  const delegation = parseAndValidateResponse(responseText, level0.total_files);

  console.log('✓ Work division complete');
  console.log(`  Tasks created: ${delegation.tasks.length}`);
  console.log(`  Execution strategy: ${delegation.execution}`);
  console.log(`  Estimated time: ${delegation.estimated_total_minutes} minutes`);

  // Log task breakdown
  console.log('\nTask breakdown:');
  for (let i = 0; i < delegation.tasks.length; i++) {
    const task = delegation.tasks[i];
    console.log(`  ${i + 1}. ${task.scope} (${task.agent_size}, ~${task.estimated_files} files)`);
  }

  return delegation;
}
