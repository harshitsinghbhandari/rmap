/**
 * Tag Validation with Retry Logic
 *
 * Validates LLM tag output against taxonomy and supports retry with feedback
 */

import { TAG_TAXONOMY, type Tag } from '../../core/constants.js';
import { FILE } from '../../config/index.js';

/**
 * Result of tag validation
 */
export interface TagValidationResult {
  /** Tags that are in the taxonomy */
  valid: Tag[];
  /** Tags that are not in the taxonomy */
  invalid: string[];
  /** Whether all tags were valid */
  isValid: boolean;
}

/**
 * Validate a single tag against the taxonomy
 *
 * @param tag - Tag to validate
 * @returns The canonical tag from taxonomy, or null if invalid
 */
export function validateTag(tag: string): Tag | null {
  // Check if tag exists in taxonomy (case-insensitive)
  const lowerTag = tag.toLowerCase();
  const validTag = TAG_TAXONOMY.find((t) => t.toLowerCase() === lowerTag);

  return validTag || null;
}

/**
 * Validate tags from LLM response
 *
 * Separates valid and invalid tags, removes duplicates, and enforces limits
 *
 * @param tags - Tags from LLM response
 * @param filePath - File path for logging
 * @returns Validation result with valid and invalid tags
 */
export function validateTagsWithDetails(
  tags: string[],
  filePath: string
): TagValidationResult {
  const validTags: Tag[] = [];
  const invalidTags: string[] = [];
  const seenInvalidLower = new Set<string>();

  for (const tag of tags) {
    const validTag = validateTag(tag);

    if (validTag) {
      // Avoid duplicates
      if (!validTags.includes(validTag)) {
        validTags.push(validTag);
      }
    } else {
      // Track invalid tags (avoid case-insensitive duplicates while preserving original spelling)
      const lowerTag = tag.toLowerCase();
      if (!seenInvalidLower.has(lowerTag)) {
        seenInvalidLower.add(lowerTag);
        invalidTags.push(tag);
      }
    }
  }

  // Limit to max tags
  let finalValidTags = validTags;
  if (validTags.length > FILE.MAX_TAGS_PER_FILE) {
    console.warn(
      `Warning: File ${filePath} has ${validTags.length} valid tags, limiting to ${FILE.MAX_TAGS_PER_FILE}`
    );
    finalValidTags = validTags.slice(0, FILE.MAX_TAGS_PER_FILE);
  }

  return {
    valid: finalValidTags,
    invalid: invalidTags,
    isValid: invalidTags.length === 0,
  };
}

/**
 * Build a correction prompt for invalid tags
 *
 * Informs the model about which tags were invalid and provides the valid taxonomy
 *
 * @param invalidTags - Tags that were not in the taxonomy
 * @param originalResponse - The original response from the LLM
 * @returns Correction prompt to send back to the LLM
 */
export function buildTagCorrectionPrompt(
  invalidTags: string[],
  originalResponse: string
): string {
  // Format taxonomy for display
  const taxonomyList = TAG_TAXONOMY.map((tag, i) => {
    const num = (i + 1).toString().padStart(2, ' ');
    return `${num}. ${tag}`;
  }).join('\n');

  return `Your previous response contained invalid tags that are not in the taxonomy.

Invalid tags: ${invalidTags.map((t) => `"${t}"`).join(', ')}

Valid Tag Taxonomy (you must only use these tags):
${taxonomyList}

Your previous response:
${originalResponse}

Please correct your response by replacing the invalid tags with appropriate tags from the taxonomy above.
Respond with valid JSON in the same structure, using only tags from the taxonomy.`;
}
