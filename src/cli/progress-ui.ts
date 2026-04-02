/**
 * Enhanced Progress UI
 *
 * Provides modern terminal UI with spinners, progress bars, and rolling logs.
 * Respects NO_COLOR environment variable.
 */

import * as clack from '@clack/prompts';
import cliProgress from 'cli-progress';
import logUpdate from 'log-update';
import { NO_COLOR_ENABLED } from './ui-constants.js';

/**
 * Level spinner for showing progress of a pipeline level
 */
export class LevelSpinner {
  private spinner: ReturnType<typeof clack.spinner> | null = null;
  private level: string;
  private startTime: number;

  constructor(level: string) {
    this.level = level;
    this.startTime = Date.now();

    if (!NO_COLOR_ENABLED) {
      this.spinner = clack.spinner();
      this.spinner.start(level);
    } else {
      // Plain text fallback for NO_COLOR
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Starting ${level}`);
      console.log('='.repeat(60));
    }
  }

  /**
   * Update spinner message
   */
  message(msg: string): void {
    if (this.spinner) {
      this.spinner.message(msg);
    } else {
      const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
      console.log(`[${elapsed}s] ${msg}`);
    }
  }

  /**
   * Stop spinner with success
   */
  stop(message?: string): void {
    const duration = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const finalMessage = message || `${this.level} complete (${duration}s)`;

    if (this.spinner) {
      this.spinner.stop(finalMessage);
    } else {
      console.log(`✓ ${finalMessage}`);
    }
  }

  /**
   * Stop spinner with error
   */
  error(message: string): void {
    if (this.spinner) {
      this.spinner.stop(message);
    } else {
      console.error(`✗ ${message}`);
    }
  }
}

/**
 * Progress bar for showing percentage-based progress
 */
export class PercentageProgressBar {
  private bar: cliProgress.SingleBar | null = null;
  private total: number;
  private current: number = 0;
  private lastUpdateTime: number = 0;
  private readonly UPDATE_INTERVAL_MS = 200; // Update at most every 200ms

  constructor(total: number, title: string = 'Progress') {
    this.total = total;

    if (!NO_COLOR_ENABLED) {
      this.bar = new cliProgress.SingleBar({
        format: `${title} |{bar}| {percentage}% complete`,
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
        clearOnComplete: true,
        stopOnComplete: true,
      });
      this.bar.start(100, 0); // Always show 0-100%
    } else {
      // Plain text fallback
      console.log(`\n${title}: Starting...`);
    }
  }

  /**
   * Update progress (incremental)
   */
  increment(): void {
    this.current++;
    this.update();
  }

  /**
   * Set progress to specific value
   */
  setProgress(current: number): void {
    this.current = current;
    this.update();
  }

  /**
   * Update the progress bar display
   */
  private update(): void {
    const now = Date.now();

    // Throttle updates to avoid terminal flickering
    if (now - this.lastUpdateTime < this.UPDATE_INTERVAL_MS && this.current < this.total) {
      return;
    }

    this.lastUpdateTime = now;
    const percentage = Math.min(100, Math.floor((this.current / this.total) * 100));

    if (this.bar) {
      this.bar.update(percentage);
    } else {
      // Plain text fallback - only log every 10%
      if (percentage % 10 === 0 || this.current === this.total) {
        console.log(`Progress: ${percentage}% complete`);
      }
    }
  }

  /**
   * Complete the progress bar
   */
  stop(): void {
    if (this.bar) {
      this.bar.update(100);
      this.bar.stop();
    } else {
      console.log(`Progress: 100% complete`);
    }
  }
}

/**
 * Rolling log viewport for preventing terminal flooding
 * Shows only the last N lines of output
 */
export class RollingLogViewport {
  private logs: string[] = [];
  private maxLines: number;
  private title: string;
  private enabled: boolean;

  constructor(title: string, maxLines: number = 10) {
    this.title = title;
    this.maxLines = maxLines;
    // Disable rolling logs in NO_COLOR mode to avoid terminal issues
    this.enabled = !NO_COLOR_ENABLED;
  }

  /**
   * Add a new log line
   */
  log(message: string): void {
    if (!this.enabled) {
      // In NO_COLOR mode, just print directly (but limit verbosity)
      return;
    }

    this.logs.push(message);

    // Keep only the last N lines
    if (this.logs.length > this.maxLines) {
      this.logs.shift();
    }

    this.render();
  }

  /**
   * Render the rolling viewport
   */
  private render(): void {
    if (!this.enabled) return;

    const width = 60;
    const topBorder = `┌─ ${this.title} ${'\u2500'.repeat(Math.max(0, width - this.title.length - 4))}┐`;
    const bottomBorder = `└${'─'.repeat(width)}┘`;

    const content = this.logs
      .map(line => {
        // Truncate lines that are too long
        const truncated = line.length > width - 2 ? line.slice(0, width - 5) + '...' : line;
        return `│ ${truncated.padEnd(width - 2)} │`;
      })
      .join('\n');

    // Pad with empty lines if we have fewer than maxLines
    const emptyLines = this.maxLines - this.logs.length;
    const padding = emptyLines > 0
      ? Array(emptyLines).fill(`│ ${' '.repeat(width - 2)} │`).join('\n') + '\n'
      : '';

    logUpdate(`${topBorder}\n${content}\n${padding}${bottomBorder}`);
  }

  /**
   * Clear the viewport and stop updating
   */
  clear(): void {
    if (!this.enabled) return;
    logUpdate.clear();
  }

  /**
   * Stop updating but leave final state visible
   */
  done(): void {
    if (!this.enabled) return;
    logUpdate.done();
  }
}

/**
 * Print a visual header for a pipeline level
 */
export function printLevelHeader(level: string): void {
  if (!NO_COLOR_ENABLED) {
    console.log('\n' + clack.intro(level));
  } else {
    const width = 60;
    console.log(`\n${'╔'}${'═'.repeat(width)}${'╗'}`);
    console.log(`${'║'}  ${level.padEnd(width - 2)}${'║'}`);
    console.log(`${'╚'}${'═'.repeat(width)}${'╝'}`);
  }
}

/**
 * Print final summary with visual styling
 */
export function printFinalSummary(stats: {
  filesAnnotated: number;
  agentsUsed: number;
  llmCalls: number;
  tokens: number;
  validationIssues: number;
  buildTime: string;
}): void {
  if (!NO_COLOR_ENABLED) {
    console.log('\n' + clack.outro('MAP BUILD COMPLETE'));
    console.log(`\nFiles annotated: ${stats.filesAnnotated}`);
    console.log(`Agents used: ${stats.agentsUsed}`);
    console.log(`LLM calls: ${stats.llmCalls}`);
    console.log(`Tokens used: ${stats.tokens.toLocaleString()}`);
    console.log(`Validation issues: ${stats.validationIssues}`);
    console.log(`Build time: ${stats.buildTime} minutes`);
  } else {
    console.log(`\n${'═'.repeat(60)}`);
    console.log('MAP BUILD COMPLETE');
    console.log('═'.repeat(60));
    console.log(`Files annotated: ${stats.filesAnnotated}`);
    console.log(`Agents used: ${stats.agentsUsed}`);
    console.log(`LLM calls: ${stats.llmCalls}`);
    console.log(`Tokens used: ${stats.tokens.toLocaleString()}`);
    console.log(`Validation issues: ${stats.validationIssues}`);
    console.log(`Build time: ${stats.buildTime} minutes`);
    console.log('═'.repeat(60));
  }
}
