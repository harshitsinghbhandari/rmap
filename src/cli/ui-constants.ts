/**
 * UI Display Constants
 *
 * Centralized display constants for CLI output.
 * Supports NO_COLOR environment variable for plain text output.
 */

/**
 * Box drawing characters for CLI borders
 */
export const BOX = {
  TOP_LEFT: '╔',
  TOP_RIGHT: '╗',
  BOTTOM_LEFT: '╚',
  BOTTOM_RIGHT: '╝',
  HORIZONTAL: '═',
  VERTICAL: '║',
  HORIZONTAL_THIN: '─',
} as const;

/**
 * Plain text alternatives for box drawing characters
 */
const BOX_PLAIN = {
  TOP_LEFT: '+',
  TOP_RIGHT: '+',
  BOTTOM_LEFT: '+',
  BOTTOM_RIGHT: '+',
  HORIZONTAL: '=',
  VERTICAL: '|',
  HORIZONTAL_THIN: '-',
} as const;

/**
 * Emoji characters for status indicators
 */
export const EMOJI = {
  CLIPBOARD: '📋',
  CROSS: '❌',
  WARNING: '⚠️',
  FOLDER: '📁',
  CHART: '📊',
  SPARKLES: '✨',
  TRASH: '🗑️',
  RED_CIRCLE: '🔴',
  YELLOW_CIRCLE: '🟡',
  GREEN_CIRCLE: '🟢',
  ARROWS: '🔄',
  CHECK: '✅',
} as const;

/**
 * Plain text alternatives for emoji characters
 */
const EMOJI_PLAIN = {
  CLIPBOARD: '[*]',
  CROSS: '[X]',
  WARNING: '[!]',
  FOLDER: '[F]',
  CHART: '[#]',
  SPARKLES: '[+]',
  TRASH: '[D]',
  RED_CIRCLE: '[!]',
  YELLOW_CIRCLE: '[?]',
  GREEN_CIRCLE: '[✓]',
  ARROWS: '[~]',
  CHECK: '[✓]',
} as const;

/**
 * UI character set interface
 */
export interface UIConstants {
  BOX: {
    TOP_LEFT: string;
    TOP_RIGHT: string;
    BOTTOM_LEFT: string;
    BOTTOM_RIGHT: string;
    HORIZONTAL: string;
    VERTICAL: string;
    HORIZONTAL_THIN: string;
  };
  EMOJI: {
    CLIPBOARD: string;
    CROSS: string;
    WARNING: string;
    FOLDER: string;
    CHART: string;
    SPARKLES: string;
    TRASH: string;
    RED_CIRCLE: string;
    YELLOW_CIRCLE: string;
    GREEN_CIRCLE: string;
    ARROWS: string;
    CHECK: string;
  };
}

/**
 * Check if NO_COLOR environment variable is set
 * @see https://no-color.org/
 */
export function shouldUsePlainText(): boolean {
  return process.env.NO_COLOR !== undefined;
}

/**
 * Whether NO_COLOR mode is enabled
 */
export const NO_COLOR_ENABLED = shouldUsePlainText();

/**
 * Get the appropriate UI constants based on environment
 *
 * Respects NO_COLOR environment variable for plain text output.
 * @returns UI constants with box drawing and emoji characters
 */
export function getUI(): UIConstants {
  if (shouldUsePlainText()) {
    return {
      BOX: BOX_PLAIN,
      EMOJI: EMOJI_PLAIN,
    };
  }

  return {
    BOX,
    EMOJI,
  };
}
