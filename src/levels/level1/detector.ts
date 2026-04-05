/**
 * Level 1 Structure Detector
 *
 * Uses a fast LLM (Claude Haiku or Gemini Flash) to identify repository structure and conventions.
 * Takes Level 0 metadata and produces high-level understanding of the codebase.
 * The LLM provider is configurable via rmap.yaml or environment variables.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import type { Level0Output, Level1Output, Module } from '../../core/types.js';
import { validateLevel1Output, ValidationError } from './validation.js';
import { TOKEN, LLM_PROVIDER } from '../../config/index.js';
import { getDetectionModel } from '../../config/models.js';
import { LLMClient, MetricsCollector, ConfigError } from '../../core/index.js';
import { extractJson, fixCommonJsonIssues } from '../../core/json-utils.js';

/**
 * Build a file tree structure for the LLM prompt
 * Groups files by directory and includes size information
 */
function buildFileTree(level0: Level0Output): string {
  // Group files by directory
  const dirMap = new Map<string, Array<{ name: string; size: number; language?: string }>>();

  for (const file of level0.files) {
    const dir = path.dirname(file.path) || '.';
    if (!dirMap.has(dir)) {
      dirMap.set(dir, []);
    }
    dirMap.get(dir)!.push({
      name: path.basename(file.path),
      size: file.size_bytes,
      language: file.language,
    });
  }

  // Sort directories
  const sortedDirs = Array.from(dirMap.keys()).sort();

  // Build tree string
  let tree = '';
  for (const dir of sortedDirs) {
    const files = dirMap.get(dir)!;
    tree += `\n${dir}/\n`;

    // Sort files by name
    files.sort((a, b) => a.name.localeCompare(b.name));

    for (const file of files) {
      const sizeKb = (file.size / 1024).toFixed(1);
      const langInfo = file.language ? ` [${file.language}]` : '';
      tree += `  ${file.name}${langInfo} (${sizeKb} KB)\n`;
    }
  }

  return tree;
}

/**
 * Get repository name from package.json or directory
 */
function getRepoName(repoRoot: string): string {
  try {
    const packageJsonPath = path.join(repoRoot, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (pkg.name) {
        return pkg.name;
      }
    }
  } catch (error) {
    // Fall through to directory name
  }

  return path.basename(repoRoot);
}

/**
 * Build the LLM prompt for structure detection
 */
function buildPrompt(level0: Level0Output, repoRoot: string): string {
  const fileTree = buildFileTree(level0);
  const totalFiles = level0.total_files;
  const totalSizeMb = (level0.total_size_bytes / 1024 / 1024).toFixed(2);

  return `You are analyzing a code repository to identify its structure and conventions.

Repository Overview:
- Total files: ${totalFiles}
- Total size: ${totalSizeMb} MB
- Git commit: ${level0.git_commit}

File Tree:
${fileTree}

Your task is to analyze this repository and provide:

1. **repo_name**: The repository name (extract from package.json, go.mod, pyproject.toml, or use directory name)
2. **purpose**: A concise product-facing description (max 20 words) explaining what this tool does for users, not how it works internally
   - Good: "Builds a queryable repository map so coding agents can get focused context."
   - Bad: "A multi-level code analysis and processing system that harvests, detects, divides, annotates..."
3. **stack**: Primary technology stack (e.g., "TypeScript, Node.js, Express" or "Python, FastAPI, PostgreSQL")
4. **languages**: List of programming languages used (e.g., ["TypeScript", "JavaScript"])
5. **entrypoints**: Main entry points of the application (e.g., ["src/index.ts", "src/cli/index.ts"])
6. **modules**: Top-level modules/directories with SHORT descriptions (5-10 words max). Format as array of {path, description}.
   - Only include significant directories (src/*, lib/*, etc.)
   - Keep descriptions brief: "CLI commands and terminal UI" not "Command-line interface with commands for context retrieval and code mapping, including progress UI and display utilities."
7. **config_files**: Important configuration files (e.g., ["package.json", "tsconfig.json", ".env.example"])
8. **conventions**: Operational coding conventions - actionable rules for how to write code in this repo (not architecture summaries)
   - Good: "Use barrel exports (index.ts) for module interfaces"
   - Good: "Tests live in tests/ mirroring src/ structure"
   - Good: "Env parsing goes through src/config/env.ts"
   - Bad: "Uses barrel exports (index.ts) for module organization across all directories"
   - Bad: "Test files colocated with source code in parallel tests/ directory structure"

Guidelines:
- Be extremely concise - agents scan output quickly
- Purpose should be product-facing (what it does for users), not architecture-facing (how it's built)
- Module descriptions: one short phrase (5-10 words), not a sentence
- Conventions: tell agents HOW to behave, not just summarize what exists
- Focus on the actual structure, not speculation
- List only files and paths that exist in the file tree above

Respond with valid JSON in this exact structure:
{
  "repo_name": "string",
  "purpose": "string",
  "stack": "string",
  "languages": ["string"],
  "entrypoints": ["string"],
  "modules": [
    {
      "path": "string",
      "description": "string"
    }
  ],
  "config_files": ["string"],
  "conventions": ["string"]
}`;
}


// Removed redundant extractJson function that is now in json-utils.ts

/**
 * Parse and validate JSON response from LLM
 */
function parseAndValidateResponse(responseText: string): Level1Output {
  const jsonText = extractJson(responseText);

  // Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    // Try to fix common JSON issues from LLMs
    try {
      parsed = JSON.parse(fixCommonJsonIssues(jsonText));
    } catch {
      // If still failing, throw original error with context
      const preview = jsonText.slice(0, 200);
      throw new ValidationError(
        `Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}\n` +
        `Response preview: ${preview}...`
      );
    }
  }

  // Validate structure
  return validateLevel1Output(parsed);
}

/**
 * Detect repository structure using the configured LLM provider
 *
 * @param level0 - Output from Level 0 metadata harvester
 * @param repoRoot - Absolute path to repository root
 * @param metrics - Optional metrics collector for tracking token usage
 * @returns Level1Output with structure and conventions
 */
export async function detectStructure(
  level0: Level0Output,
  repoRoot: string,
  metrics?: MetricsCollector
): Promise<Level1Output> {
  // Get provider configuration
  const providerType = LLM_PROVIDER.LEVEL1;
  const model = getDetectionModel(providerType);

  // Initialize LLM client with configured provider
  const llmClient = LLMClient.withProvider(providerType);

  console.log('Starting Level 1 structure detection...');
  console.log(`Using ${providerType} provider with ${model}`);

  // Build prompt
  const prompt = buildPrompt(level0, repoRoot);

  // Call LLM with retry logic
  const response = await llmClient.sendMessage(prompt, {
    model,
    maxTokens: TOKEN.MAX_TOKENS_LEVEL1,
    logContext: {
      level: 'level1',
      purpose: 'Repository structure detection - identifies repo name, purpose, stack, languages, entry points, modules, and conventions',
      model,
    },
  });

  // Record metrics if collector provided
  if (metrics) {
    metrics.recordLLMCall({
      model: response.model,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
    });
  }

  // Parse and validate response
  const result = parseAndValidateResponse(response.text);

  console.log('✓ Structure detection complete');
  console.log(`  Repository: ${result.repo_name}`);
  console.log(`  Stack: ${result.stack}`);
  console.log(`  Entry points: ${result.entrypoints.length}`);
  console.log(`  Modules: ${result.modules.length}`);

  return result;
}
