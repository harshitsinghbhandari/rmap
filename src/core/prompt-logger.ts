/**
 * Prompt and Response Logger
 *
 * Logs LLM prompts and responses to JSON files for debugging and analysis.
 * Organizes logs by level in .repo_map/prompts/ directory.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Logging context for each LLM call
 */
export interface PromptLogContext {
  /** Which level this prompt is for (e.g., "level1", "level2", "level3") */
  level: string;
  /** Purpose/reason for this prompt (e.g., "Repository detection", "Work division") */
  purpose: string;
  /** Model being used */
  model: string;
}

/**
 * Log entry structure
 */
interface PromptLogEntry {
  /** ISO timestamp when the prompt was sent */
  timestamp: string;
  /** Level identifier */
  level: string;
  /** Purpose/reason for this call */
  purpose: string;
  /** Model used */
  model: string;
  /** The prompt text (only if --log-prompts is enabled) */
  prompt?: string;
  /** The response text (only if --log-response is enabled) */
  response?: string;
  /** Input tokens used */
  inputTokens?: number;
  /** Output tokens generated */
  outputTokens?: number;
}

/**
 * Global configuration for prompt logging
 */
let loggingConfig = {
  enabled: false,
  logPrompts: false,
  logResponses: false,
  repoRoot: '',
};

/**
 * Initialize prompt logging configuration
 *
 * @param repoRoot - Repository root directory
 * @param logPrompts - Whether to log prompts
 * @param logResponses - Whether to log responses
 */
export function initPromptLogger(
  repoRoot: string,
  logPrompts: boolean,
  logResponses: boolean
): void {
  loggingConfig = {
    enabled: logPrompts || logResponses,
    logPrompts,
    logResponses,
    repoRoot,
  };

  if (loggingConfig.enabled) {
    // Ensure prompts directory exists
    const promptsDir = path.join(repoRoot, '.repo_map', 'prompts');
    fs.mkdirSync(promptsDir, { recursive: true });
  }
}

/**
 * Check if logging is enabled
 */
export function isLoggingEnabled(): boolean {
  return loggingConfig.enabled;
}

/**
 * Get the log file path for a specific level
 *
 * @param level - Level identifier (e.g., "level1", "level2")
 * @returns Path to the log file
 */
function getLogFilePath(level: string): string {
  const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
  const filename = `${level}_${timestamp}.jsonl`;
  return path.join(loggingConfig.repoRoot, '.repo_map', 'prompts', filename);
}

/**
 * Log a prompt/response entry
 *
 * @param context - Context information about the prompt
 * @param prompt - The prompt text
 * @param response - Optional response text
 * @param inputTokens - Input tokens used
 * @param outputTokens - Output tokens generated
 */
export function logPromptResponse(
  context: PromptLogContext,
  prompt: string,
  response?: string,
  inputTokens?: number,
  outputTokens?: number
): void {
  if (!loggingConfig.enabled) {
    return;
  }

  const entry: PromptLogEntry = {
    timestamp: new Date().toISOString(),
    level: context.level,
    purpose: context.purpose,
    model: context.model,
  };

  // Only include prompt if flag is enabled
  if (loggingConfig.logPrompts) {
    entry.prompt = prompt;
  }

  // Only include response if flag is enabled
  if (loggingConfig.logResponses && response) {
    entry.response = response;
  }

  // Add token counts if available
  if (inputTokens !== undefined) {
    entry.inputTokens = inputTokens;
  }
  if (outputTokens !== undefined) {
    entry.outputTokens = outputTokens;
  }

  // Write as JSON Lines format (one JSON object per line)
  const logLine = JSON.stringify(entry) + '\n';
  const logFile = getLogFilePath(context.level);

  try {
    fs.appendFileSync(logFile, logLine, 'utf8');
  } catch (error) {
    // Don't fail the main process if logging fails
    console.warn(`Warning: Failed to write prompt log: ${error}`);
  }
}

/**
 * Display warning about logging and wait for user confirmation
 *
 * @param logPrompts - Whether prompts will be logged
 * @param logResponses - Whether responses will be logged
 * @returns Promise that resolves when user confirms or rejects
 */
export async function displayLoggingWarning(
  logPrompts: boolean,
  logResponses: boolean
): Promise<void> {
  console.log('\n⚠️  WARNING: Prompt/Response Logging Enabled\n');

  if (logPrompts) {
    console.log('  • Prompts will be logged to .repo_map/prompts/');
  }
  if (logResponses) {
    console.log('  • Responses will be logged to .repo_map/prompts/');
  }

  console.log('\n  ⚠️  These logs can become very large and consume significant disk space.');
  console.log('  ⚠️  Logs may contain sensitive code and repository information.');
  console.log('\n  Press Ctrl+C now to cancel if this was unintentional.');
  console.log('  Continuing in 5 seconds...\n');

  // Wait 5 seconds to allow user to cancel
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
