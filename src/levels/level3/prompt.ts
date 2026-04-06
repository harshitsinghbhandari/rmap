import type { RawFileMetadata } from '../../core/types.js';
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
     * "Configuration constants for the API client"

2. **exports**: Functions, classes, types, constants, or variables exported from this file
   - List only the exported names (e.g., ["UserService", "createUser", "UserSchema"])
   - Include type exports, class names, function names, constants
   - Exclude private/internal symbols that aren't exported
   - For languages without explicit exports, list main public symbols

Note: Import information is extracted separately via static analysis, so you do not need to provide imports.

Guidelines:
- Skip binary files, generated files, or files with no semantic content

Respond with valid JSON in this exact structure:
{
  "purpose": "string (max ${TOKEN.MAX_PURPOSE_CHARS} chars)",
  "exports": ["symbol1", "symbol2"]
}

Important:
- Respond with valid JSON only (no markdown, no explanation)`;
}
