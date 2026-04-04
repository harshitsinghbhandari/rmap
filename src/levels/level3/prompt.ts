/**
 * Level 3 File Annotation Prompt
 *
 * Generates the LLM prompt for annotating individual files
 * Optimized for precision over recall - pick most defining tags, not all applicable
 */

import type { RawFileMetadata } from '../../core/types.js';
import { TAG_TIERS } from '../../core/constants.js';
import { FILE, TOKEN } from '../../config/index.js';
import { isBarrelFile } from './tag-validator.js';

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
 * Format tags by tier for display in prompt
 */
function formatTagTiers(): string {
  const highSignalList = TAG_TIERS.HIGH_SIGNAL.map((tag, i) => {
    const num = (i + 1).toString().padStart(2, ' ');
    return `  ${num}. ${tag}`;
  }).join('\n');

  const architectureList = TAG_TIERS.ARCHITECTURE.map((tag, i) => {
    const num = (i + 1).toString().padStart(2, ' ');
    return `  ${num}. ${tag}`;
  }).join('\n');

  const lowSignalList = TAG_TIERS.LOW_SIGNAL.map((tag, i) => {
    const num = (i + 1).toString().padStart(2, ' ');
    return `  ${num}. ${tag}`;
  }).join('\n');

  return `
=== TIER 1: HIGH-SIGNAL DOMAIN TAGS (prefer these) ===
${highSignalList}

=== TIER 2: ARCHITECTURE PATTERN TAGS (use when domain tags don't fit) ===
${architectureList}

=== TIER 3: LOW-SIGNAL FALLBACK TAGS (use rarely - max 1 per file) ===
${lowSignalList}`;
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

  // Check if this is a barrel file for special guidance
  const isBarrel = isBarrelFile(filePath);

  // Format TAG_TAXONOMY by tiers for display
  const taxonomyByTier = formatTagTiers();

  // Add barrel file specific guidance if applicable
  const barrelGuidance = isBarrel
    ? `
IMPORTANT: This is a barrel/index file. Barrel files that only re-export from other modules should:
- NOT get generic tags like "interface", "utility", "helper", "service", or "handler"
- ONLY get domain tags if the file itself DEFINES functionality (not just re-exports)
- Consider using "types" if it purely exports type definitions
- If it only re-exports, a single domain tag describing the module's purpose is sufficient
`
    : '';

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

2. **tags**: Select 1-${FILE.MAX_TAGS_PER_FILE} tags that BEST DEFINE this file's role

   CRITICAL: Pick the MOST DEFINING tags, NOT all applicable tags.
   - A file doing JWT authentication should get "jwt" and maybe "authentication" - NOT also "service", "handler", "backend"
   - A config file should get "config" - NOT also "utility", "constants", "backend"
   - Quality over quantity: 1-2 precise tags beat 3 vague tags

   Tag Selection Priority:
   - FIRST: Try Tier 1 (high-signal domain tags) - these are most useful for retrieval
   - SECOND: If no domain tags fit well, use Tier 2 (architecture pattern tags)
   - LAST RESORT: Tier 3 (low-signal fallback tags) - use at most ONE, and only if nothing else fits

   Tags to AVOID unless absolutely necessary:
   - "utility" and "helper" - often overused, rarely adds value
   - "handler" - only use for actual event/request handlers
   - "interface" - only use for files defining public interfaces, not barrel files
   - "backend" - too broad, prefer specific domain tags

   BANNED combinations (never use together):
   - "utility" + "helper" (redundant)
   - "service" + "handler" (unclear purpose)
${barrelGuidance}
3. **exports**: Functions, classes, types, constants, or variables exported from this file
   - List only the exported names (e.g., ["UserService", "createUser", "UserSchema"])
   - Include type exports, class names, function names, constants
   - Exclude private/internal symbols that aren't exported
   - For languages without explicit exports, list main public symbols

Note: Import information is extracted separately via static analysis, so you do not need to provide imports.

Available Tag Taxonomy (organized by priority tier):
${taxonomyByTier}

Guidelines:
- Be precise: fewer, better tags beat more, vaguer tags
- Only use tags from the taxonomy above
- Skip binary files, generated files, or files with no semantic content
- If a file is primarily configuration, use "config" tag
- If a file is primarily types/interfaces, use "types" tag

Respond with valid JSON in this exact structure:
{
  "purpose": "string (max ${TOKEN.MAX_PURPOSE_CHARS} chars)",
  "tags": ["tag1", "tag2"],
  "exports": ["symbol1", "symbol2"]
}

Important:
- tags array must contain 1-${FILE.MAX_TAGS_PER_FILE} items, all from the taxonomy
- Prefer 1-2 highly relevant tags over 3 loosely relevant tags
- Respond with valid JSON only (no markdown, no explanation)`;
}
