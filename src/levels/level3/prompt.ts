/**
 * Level 3 File Annotation Prompt
 *
 * Generates the LLM prompt for annotating individual files
 */

import type { RawFileMetadata } from '../../core/types.js';
import { TAG_TAXONOMY } from '../../core/constants.js';
import { FILE, TOKEN } from '../../config/index.js';

/**
 * Truncate file content if it exceeds max lines
 */
export function truncateContent(content: string, maxLines: number = TOKEN.MAX_LINES_IN_PROMPT): string {
  const lines = content.split('\n');

  if (lines.length <= maxLines) {
    return content;
  }

  // Take first part and last part of allowed lines based on truncation ratio
  const firstPart = Math.floor(maxLines * FILE.TRUNCATION_FIRST_PART_RATIO);
  const lastPart = maxLines - firstPart;

  const truncated = [
    ...lines.slice(0, firstPart),
    '',
    `... [TRUNCATED: ${lines.length - maxLines} lines omitted] ...`,
    '',
    ...lines.slice(-lastPart),
  ].join('\n');

  return truncated;
}

/**
 * Build the file annotation prompt for a single file
 *
 * @param filePath - Path to the file being annotated
 * @param fileContent - Content of the file
 * @param metadata - Metadata from Level 0
 * @returns Formatted prompt string for the LLM
 */
export function buildAnnotationPrompt(
  filePath: string,
  fileContent: string,
  metadata: RawFileMetadata
): string {
  const content = truncateContent(fileContent);
  const language = metadata.language || 'Unknown';
  const lines = metadata.line_count;

  // Format TAG_TAXONOMY for display
  const taxonomyList = TAG_TAXONOMY.map((tag, i) => {
    const num = (i + 1).toString().padStart(2, ' ');
    return `${num}. ${tag}`;
  }).join('\n');

  return `You are analyzing a code file to extract semantic information for a repository map.

File: ${filePath}
Language: ${language}
Lines: ${lines}

File Content:
\`\`\`${language.toLowerCase()}
${content}
\`\`\`

Your task is to analyze this file and extract:

1. **purpose**: A single clear sentence (max ${TOKEN.MAX_PURPOSE_CHARS} chars) describing what this file does
   - Focus on the "what" and "why", not implementation details
   - Examples:
     * "Handles user authentication via JWT tokens"
     * "Defines database schema for the users table"
     * "Utility functions for date formatting and validation"

2. **tags**: 1-${FILE.MAX_TAGS_PER_FILE} tags from the taxonomy below that best describe this file's role
   - Pick tags that help categorize the file semantically
   - Choose the MOST specific tags that apply
   - Use general tags (like "utility" or "backend") only if no specific tags fit

3. **exports**: Functions, classes, types, constants, or variables exported from this file
   - List only the exported names (e.g., ["UserService", "createUser", "UserSchema"])
   - Include type exports, class names, function names, constants
   - Exclude private/internal symbols that aren't exported
   - For languages without explicit exports, list main public symbols

4. **imports**: Internal imports ONLY (files within this repository)
   - Extract import paths for files in the same repository
   - Convert relative imports to repo-root-relative paths
   - EXCLUDE external packages/libraries (e.g., no "express", "react", "numpy")
   - EXCLUDE standard library imports
   - Examples of VALID imports:
     * "src/utils/logger.ts"
     * "lib/database/connection.py"
   - Examples of INVALID imports (exclude these):
     * "express"
     * "react"
     * "@anthropic-ai/sdk"
     * "os"
     * "node:fs"

Available Tag Taxonomy (pick 1-${FILE.MAX_TAGS_PER_FILE}):
${taxonomyList}

Guidelines:
- Be precise and consistent
- Only use tags from the taxonomy above
- Internal imports must be repo-root-relative paths (no "./" or "../")
- Skip binary files, generated files, or files with no semantic content
- If a file is primarily configuration, use "config" tag
- If a file is primarily types/interfaces, use "types" tag

Respond with valid JSON in this exact structure:
{
  "purpose": "string (max ${TOKEN.MAX_PURPOSE_CHARS} chars)",
  "tags": ["tag1", "tag2"],
  "exports": ["symbol1", "symbol2"],
  "imports": ["path/to/file1.ts", "path/to/file2.ts"]
}

Important:
- tags array must contain 1-${FILE.MAX_TAGS_PER_FILE} items, all from the taxonomy
- imports should ONLY include internal repository files
- All paths in imports should be relative to repository root
- Respond with valid JSON only (no markdown, no explanation)`;
}
