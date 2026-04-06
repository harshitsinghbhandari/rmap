import {
  TAG_TAXONOMY,
  TAG_TIERS,
  BANNED_TAG_COMBINATIONS,
  BARREL_FILE_DISCOURAGED_TAGS,
  MAX_TAGS_PER_FILE,
  type Tag,
} from '../../core/constants.js';

export interface TagValidationWarning {
  type: 'banned_combination' | 'barrel_file_discouraged' | 'low_signal_tag' | 'too_many_low_signal';
  message: string;
  tags: Tag[];
}

export interface TagValidationResult {
  valid: Tag[];
  invalid: string[];
  isValid: boolean;
  passesQualityChecks: boolean;
  warnings: TagValidationWarning[];
}

/**
 * Validates a single tag against the taxonomy.
 */
export function validateTag(tag: string): Tag | null {
  if (TAG_TAXONOMY.includes(tag as Tag)) {
    return tag as Tag;
  }
  return null;
}

/**
 * Checks if a file is a barrel file (e.g., index.ts, index.js).
 */
export function isBarrelFile(filepath: string): boolean {
  return /index\.(ts|js|tsx|jsx)$/.test(filepath);
}

/**
 * Returns low-signal tags from a list of tags.
 */
export function getLowSignalTags(tags: Tag[]): Tag[] {
  return tags.filter((tag) => (TAG_TIERS.LOW_SIGNAL as readonly Tag[]).includes(tag));
}

/**
 * Returns discouraged tags present in a barrel file's tags.
 */
export function detectBarrelFileDiscouragedTags(tags: Tag[], filepath: string): Tag[] {
  if (!isBarrelFile(filepath)) return [];
  return tags.filter((tag) => (BARREL_FILE_DISCOURAGED_TAGS as readonly Tag[]).includes(tag));
}

/**
 * Validates a list of tags and checks for quality issues.
 */
export function validateTagsWithDetails(tags: string[], filepath: string): TagValidationResult {
  const valid: Tag[] = [];
  const invalid: string[] = [];
  const warnings: TagValidationWarning[] = [];

  // Categorize valid vs invalid
  for (const tag of tags) {
    const validTag = validateTag(tag);
    if (validTag) {
      valid.push(validTag);
    } else {
      invalid.push(tag);
    }
  }

  // Quality checks on valid tags
  let passesQualityChecks = true;

  // 1. Banned combinations
  for (const combo of BANNED_TAG_COMBINATIONS) {
    if (valid.includes(combo[0]) && valid.includes(combo[1])) {
      warnings.push({
        type: 'banned_combination',
        message: `Banned combination: "${combo[0]}" + "${combo[1]}"`,
        tags: [combo[0], combo[1]],
      });
      passesQualityChecks = false;
    }
  }

  // 2. Barrel file discouraged tags
  const barrelTags = detectBarrelFileDiscouragedTags(valid, filepath);
  if (barrelTags.length > 0) {
    warnings.push({
      type: 'barrel_file_discouraged',
      message: `Discouraged tags for barrel file: ${barrelTags.join(', ')}`,
      tags: barrelTags,
    });
    // Doesn't strictly fail quality checks for now, but warned
  }

  // 3. Low-signal tags
  const lowSignalTags = getLowSignalTags(valid);
  if (lowSignalTags.length > 0) {
    warnings.push({
      type: 'low_signal_tag',
      message: `Low-signal tags detected: ${lowSignalTags.join(', ')}`,
      tags: lowSignalTags,
    });

    // If there are too many low signal tags
    if (lowSignalTags.length >= 2) {
      warnings.push({
        type: 'too_many_low_signal',
        message: `Too many low-signal tags: ${lowSignalTags.join(', ')}`,
        tags: lowSignalTags,
      });
      passesQualityChecks = false;
    }
  }

  return {
    valid,
    invalid,
    isValid: invalid.length === 0,
    passesQualityChecks,
    warnings,
  };
}

/**
 * Builds a prompt explaining tag validity errors to the LLM.
 */
export function buildTagCorrectionPrompt(invalidTags: string[], originalResponse: string): string {
  return `
Your previous response contained invalid tags. The following tags are not in the allowed taxonomy:
${invalidTags.map((tag) => `- ${tag}`).join('\n')}

Please provide 1-${MAX_TAGS_PER_FILE} tags from the taxonomy below. Choose the MOST DEFINING tags.

HIGH-SIGNAL DOMAIN TAGS:
${TAG_TIERS.HIGH_SIGNAL.map((t) => `- ${t}`).join('\n')}

ARCHITECTURE PATTERN TAGS:
${TAG_TIERS.ARCHITECTURE.map((t) => `- ${t}`).join('\n')}

LOW-SIGNAL FALLBACK TAGS:
${TAG_TIERS.LOW_SIGNAL.map((t) => `- ${t}`).join('\n')}

Your previous response:
${originalResponse}
`.trim();
}

/**
 * Builds a prompt explaining tag quality warnings to the LLM.
 */
export function buildTagQualityPrompt(warnings: TagValidationWarning[], originalResponse: string): string {
  const warningMessages = warnings.map((w) => `- ${w.message}`).join('\n');
  return `
Your previous response contained tags with quality warnings:
${warningMessages}

Please revise your tags. Choose the MOST DEFINING tags (1-${MAX_TAGS_PER_FILE}).
Prefer specific domain tags over generic ones.
Barrel files should not use domain tags if they only re-export them.

Your previous response:
${originalResponse}
`.trim();
}
