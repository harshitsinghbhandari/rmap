/**
 * Level 2 Work Division Prompt
 *
 * Generates the LLM prompt for intelligent work division
 */

import type { Level0Output, Level1Output } from '../../core/types.js';
import { FILE, OUTPUT } from '../../config/index.js';

/**
 * Group files by directory for prompt
 */
interface DirectoryGroup {
  path: string;
  files: Array<{
    name: string;
    size: number;
    language?: string;
  }>;
  totalFiles: number;
  totalSizeKb: number;
}

/**
 * Build directory groups from Level 0 data
 */
export function buildDirectoryGroups(level0: Level0Output): DirectoryGroup[] {
  const dirMap = new Map<string, DirectoryGroup>();

  for (const file of level0.files) {
    // Extract directory path (use '.' for root files)
    const pathParts = file.path.split('/');
    const dirPath = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : '.';

    if (!dirMap.has(dirPath)) {
      dirMap.set(dirPath, {
        path: dirPath,
        files: [],
        totalFiles: 0,
        totalSizeKb: 0,
      });
    }

    const group = dirMap.get(dirPath)!;
    group.files.push({
      name: file.name,
      size: file.size_bytes,
      language: file.language,
    });
    group.totalFiles++;
    group.totalSizeKb += file.size_bytes / 1024;
  }

  // Sort by path
  return Array.from(dirMap.values()).sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Format directory groups for the prompt
 */
function formatDirectoryGroups(groups: DirectoryGroup[]): string {
  let output = '';

  for (const group of groups) {
    output += `\n${group.path}/ (${group.totalFiles} files, ${group.totalSizeKb.toFixed(1)} KB)\n`;

    // Show first N files as examples
    const filesToShow = group.files.slice(0, OUTPUT.MAX_FILES_IN_PROMPT);
    for (const file of filesToShow) {
      const langInfo = file.language ? ` [${file.language}]` : '';
      output += `  - ${file.name}${langInfo}\n`;
    }

    if (group.files.length > OUTPUT.MAX_FILES_IN_PROMPT) {
      output += `  ... and ${group.files.length - OUTPUT.MAX_FILES_IN_PROMPT} more files\n`;
    }
  }

  return output;
}

/**
 * Build the work division prompt for Claude Sonnet
 */
export function buildWorkDivisionPrompt(
  level0: Level0Output,
  level1: Level1Output
): string {
  const directoryGroups = buildDirectoryGroups(level0);
  const directoryTree = formatDirectoryGroups(directoryGroups);

  const totalFiles = level0.total_files;
  const totalSizeMb = (level0.total_size_bytes / 1024 / 1024).toFixed(2);

  // Build modules summary
  const modulesSummary = level1.modules
    .map((m) => `- ${m.path}: ${m.description}`)
    .join('\n');

  return `You are planning the work division for annotating a code repository.

Repository Overview:
- Name: ${level1.repo_name}
- Purpose: ${level1.purpose}
- Stack: ${level1.stack}
- Total files: ${totalFiles}
- Total size: ${totalSizeMb} MB
- Languages: ${level1.languages.join(', ')}

Entry Points:
${level1.entrypoints.map((e) => `- ${e}`).join('\n') || '- None identified'}

Module Structure:
${modulesSummary || '- No modules identified'}

Directory Structure:
${directoryTree}

Your task is to divide this repository into annotation tasks for Level 3 agents. Each task will be processed by an LLM agent that reads files and produces semantic annotations (purpose, exports, imports).

Division Rules:
1. **Max ${FILE.MAX_FILES_PER_TASK} files per task** - Hard limit for manageable context
2. **Group related files** - Keep files in the same directory together when possible
3. **Consider coupling** - Files that import each other should ideally be in the same task
4. **Balance complexity**:
   - Use "small" agent (fast, cheaper) for simple utility files, configs, tests
   - Use "medium" agent (more capable) for complex business logic, algorithms, integrations
5. **Execution strategy**:
   - Prefer "parallel" for independent modules (faster)
   - Use "sequential" only if there are strong dependencies
6. **Optimize for speed** - More smaller tasks in parallel is better than fewer large sequential tasks

Guidelines for choosing agent_size:
- **small**: Configuration files, simple utilities, test files, straightforward CRUD
- **medium**: Complex business logic, algorithms, API integrations, architectural components

Output a task delegation plan with this exact JSON structure:
{
  "tasks": [
    {
      "scope": "src/auth/",
      "agent_size": "medium",
      "estimated_files": 12
    },
    {
      "scope": "src/utils/",
      "agent_size": "small",
      "estimated_files": 8
    }
  ],
  "execution": "parallel",
  "estimated_total_minutes": 15
}

Important:
- "scope" should be a directory path (e.g., "src/auth/", "tests/") or specific file pattern
- Each task's estimated_files must be ≤ ${FILE.MAX_FILES_PER_TASK}
- Sum of all estimated_files should equal ${totalFiles}
- For execution, use "parallel" unless there's a strong reason for "sequential"
- estimated_total_minutes should account for parallel vs sequential execution
- Aim for 8-12 balanced tasks for a medium-sized repo

Respond with valid JSON only (no markdown, no explanation).`;
}
