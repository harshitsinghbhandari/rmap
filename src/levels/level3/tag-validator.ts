/**
 * Tag Validation with Retry Logic and Quality Checks
 *
 * Validates LLM tag output against taxonomy, checks for banned combinations,
 * handles barrel files specially, and supports retry with feedback.
 */

import {
  TAG_TAXONOMY,
  TAG_TIERS,
  BANNED_TAG_COMBINATIONS,
  BARREL_FILE_DISCOURAGED_TAGS,
  type Tag,
} from '../../core/constants.js';
import { FILE } from '../../config/index.js';
import * as path from 'node:path';

/**
 * Tag quality warning types
 */
export type TagWarningType =
  | 'banned_combination'
  | 'barrel_file_discouraged'
  | 'low_signal_tag'
  | 'too_many_low_signal';

/**
 * Individual tag quality warning
 */
export interface TagWarning {
  type: TagWarningType;
  message: string;
  tags: Tag[];
}

/**
 * Result of tag validation with quality information
 */
export interface TagValidationResult {
  /** Tags that are in the taxonomy */
  valid: Tag[];
  /** Tags that are not in the taxonomy */
  invalid: string[];
  /** Whether all tags were valid (in taxonomy) */
  isValid: boolean;
  /** Quality warnings (banned combinations, barrel file issues, etc.) */
  warnings: TagWarning[];
  /** Whether the tags pass quality checks (no critical warnings) */
  passesQualityChecks: boolean;
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
 * Check if a file path represents a barrel file (index.ts, index.js, etc.)
 *
 * Barrel files are entry points that re-export from other files.
 * They typically have low semantic value on their own.
 *
 * @param filePath - File path to check
 * @returns True if the file is a barrel file
 */
export function isBarrelFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  const basenameWithoutExt = basename.replace(/\.[^.]+$/, '');

  // Common barrel file patterns
  const barrelPatterns = ['index', 'mod', 'barrel', '__init__'];

  return barrelPatterns.includes(basenameWithoutExt.toLowerCase());
}

/**
 * Get the tier of a tag (1 = high signal, 2 = architecture, 3 = low signal)
 *
 * @param tag - Tag to check
 * @returns Tier number (1, 2, or 3)
 */
export function getTagTier(tag: Tag): 1 | 2 | 3 {
  if ((TAG_TIERS.HIGH_SIGNAL as readonly Tag[]).includes(tag)) {
    return 1;
  }
  if ((TAG_TIERS.ARCHITECTURE as readonly Tag[]).includes(tag)) {
    return 2;
  }
  // Default to tier 3 (low signal) if not found in other tiers
  return 3;
}

/**
 * Check for banned tag combinations
 *
 * @param tags - Tags to check
 * @returns Array of detected banned combinations
 */
export function detectBannedCombinations(tags: Tag[]): [Tag, Tag][] {
  const detected: [Tag, Tag][] = [];

  for (const [tag1, tag2] of BANNED_TAG_COMBINATIONS) {
    if (tags.includes(tag1) && tags.includes(tag2)) {
      detected.push([tag1, tag2]);
    }
  }

  return detected;
}

/**
 * Check for discouraged tags on barrel files
 *
 * @param tags - Tags to check
 * @param filePath - File path
 * @returns Array of discouraged tags found on barrel file
 */
export function detectBarrelFileDiscouragedTags(tags: Tag[], filePath: string): Tag[] {
  if (!isBarrelFile(filePath)) {
    return [];
  }

  return tags.filter((tag) => BARREL_FILE_DISCOURAGED_TAGS.includes(tag));
}

/**
 * Get all low-signal tags from a tag list
 *
 * @param tags - Tags to check
 * @returns Array of low-signal tags
 */
export function getLowSignalTags(tags: Tag[]): Tag[] {
  return tags.filter((tag) => (TAG_TIERS.LOW_SIGNAL as readonly Tag[]).includes(tag));
}

/**
 * Validate tags from LLM response with quality checks
 *
 * Separates valid and invalid tags, removes duplicates, enforces limits,
 * and checks for quality issues like banned combinations and barrel file problems.
 *
 * @param tags - Tags from LLM response
 * @param filePath - File path for context-aware validation
 * @returns Validation result with valid and invalid tags plus quality warnings
 */
export function validateTagsWithDetails(
  tags: string[],
  filePath: string
): TagValidationResult {
  const validTags: Tag[] = [];
  const invalidTags: string[] = [];
  const seenInvalidLower = new Set<string>();
  const warnings: TagWarning[] = [];

  // First pass: validate against taxonomy
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

  // Quality check 1: Banned combinations
  const bannedCombos = detectBannedCombinations(finalValidTags);
  for (const [tag1, tag2] of bannedCombos) {
    warnings.push({
      type: 'banned_combination',
      message: `Banned combination: "${tag1}" + "${tag2}" - these tags together provide low value. Consider using more specific tags.`,
      tags: [tag1, tag2],
    });
  }

  // Quality check 2: Barrel file discouraged tags
  const barrelDiscouraged = detectBarrelFileDiscouragedTags(finalValidTags, filePath);
  if (barrelDiscouraged.length > 0) {
    warnings.push({
      type: 'barrel_file_discouraged',
      message: `Barrel file "${path.basename(filePath)}" has generic tags that provide low value: ${barrelDiscouraged.join(', ')}. Barrel files should only get domain tags if they truly define those things, not just re-export them.`,
      tags: barrelDiscouraged,
    });
  }

  // Quality check 3: Low-signal tags
  const lowSignalTags = getLowSignalTags(finalValidTags);
  if (lowSignalTags.length > 0) {
    // Warn if low-signal tags are used
    warnings.push({
      type: 'low_signal_tag',
      message: `Low-signal tags detected: ${lowSignalTags.join(', ')}. These tags are often overused. Consider if more specific tags apply.`,
      tags: lowSignalTags,
    });
  }

  // Quality check 4: Too many low-signal tags
  if (lowSignalTags.length > 1) {
    warnings.push({
      type: 'too_many_low_signal',
      message: `Multiple low-signal tags (${lowSignalTags.join(', ')}) suggest unclear categorization. A file should have at most one generic fallback tag.`,
      tags: lowSignalTags,
    });
  }

  // Determine if quality checks pass (no critical warnings)
  // Critical warnings are: banned combinations, too many low-signal tags
  const passesQualityChecks = !warnings.some(
    (w) => w.type === 'banned_combination' || w.type === 'too_many_low_signal'
  );

  return {
    valid: finalValidTags,
    invalid: invalidTags,
    isValid: invalidTags.length === 0,
    warnings,
    passesQualityChecks,
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
  // Format taxonomy for display with tier information
  const highSignalList = TAG_TIERS.HIGH_SIGNAL.map((tag, i) => {
    const num = (i + 1).toString().padStart(2, ' ');
    return `${num}. ${tag}`;
  }).join('\n');

  const architectureList = TAG_TIERS.ARCHITECTURE.map((tag, i) => {
    const num = (i + 1).toString().padStart(2, ' ');
    return `${num}. ${tag}`;
  }).join('\n');

  const lowSignalList = TAG_TIERS.LOW_SIGNAL.map((tag, i) => {
    const num = (i + 1).toString().padStart(2, ' ');
    return `${num}. ${tag}`;
  }).join('\n');

  return `Your previous response contained invalid tags that are not in the taxonomy.

Invalid tags: ${invalidTags.map((t) => `"${t}"`).join(', ')}

Valid Tag Taxonomy (you must only use these tags):

=== HIGH-SIGNAL DOMAIN TAGS (prefer these) ===
${highSignalList}

=== ARCHITECTURE PATTERN TAGS (use if domain tags don't fit) ===
${architectureList}

=== LOW-SIGNAL FALLBACK TAGS (use rarely, only 1 per file max) ===
${lowSignalList}

Your previous response:
${originalResponse}

Please correct your response by replacing the invalid tags with appropriate tags from the taxonomy above.
- Pick 1-${FILE.MAX_TAGS_PER_FILE} of the MOST DEFINING tags
- Prefer high-signal domain tags over generic fallback tags
- Avoid using multiple low-signal tags together
Respond with valid JSON in the same structure, using only tags from the taxonomy.`;
}

/**
 * Build a quality improvement prompt for tags that pass validation but have quality issues
 *
 * @param warnings - Quality warnings from validation
 * @param originalResponse - The original response from the LLM
 * @returns Correction prompt to send back to the LLM
 */
export function buildTagQualityPrompt(
  warnings: TagWarning[],
  originalResponse: string
): string {
  const warningMessages = warnings.map((w) => `- ${w.message}`).join('\n');

  return `Your previous response contained valid tags, but they have quality issues:

${warningMessages}

Guidelines for better tag selection:
1. Pick the 1-${FILE.MAX_TAGS_PER_FILE} MOST DEFINING tags, not all applicable tags
2. Prefer specific domain tags (authentication, database, api_endpoint, config, testing, etc.)
3. Use architecture tags (service, controller, middleware) only when domain tags don't apply
4. Avoid generic fallback tags (utility, helper, handler, interface, backend) unless truly necessary
5. Never use more than one low-signal tag per file
6. Barrel files (index.ts) should only get tags if they define functionality, not just re-export it

Your previous response:
${originalResponse}

Please improve your tag selection to be more precise and meaningful.
Respond with valid JSON in the same structure.`;
}
