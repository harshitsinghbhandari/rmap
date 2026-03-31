/**
 * Progress Tracking and Statistics
 *
 * Provides progress reporting, cost tracking, and statistics collection
 * during the map building process.
 */

/**
 * Progress tracking for the pipeline
 */
export class ProgressTracker {
  private startTime: number;
  private levelStartTimes: Map<string, number> = new Map();
  private tokenCount: number = 0;
  private llmCallCount: number = 0;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Start tracking a level
   */
  startLevel(level: string): void {
    this.levelStartTimes.set(level, Date.now());
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`Starting ${level}`);
    console.log('═'.repeat(60));
  }

  /**
   * Complete tracking a level
   */
  completeLevel(level: string): void {
    const startTime = this.levelStartTimes.get(level);
    if (startTime) {
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`✓ ${level} complete (${duration}s)`);
    }
  }

  /**
   * Track an LLM call
   */
  trackLLMCall(tokens: number = 0): void {
    this.llmCallCount++;
    this.tokenCount += tokens;
  }

  /**
   * Get elapsed time in minutes
   */
  getElapsedMinutes(): number {
    return (Date.now() - this.startTime) / (1000 * 60);
  }

  /**
   * Get total elapsed time in seconds
   */
  getElapsedSeconds(): number {
    return (Date.now() - this.startTime) / 1000;
  }

  /**
   * Get LLM call statistics
   */
  getStats() {
    return {
      llmCallCount: this.llmCallCount,
      tokenCount: this.tokenCount,
      elapsedMinutes: this.getElapsedMinutes(),
    };
  }

  /**
   * Log progress update
   */
  logProgress(message: string): void {
    const elapsed = this.getElapsedSeconds().toFixed(1);
    console.log(`[${elapsed}s] ${message}`);
  }

  /**
   * Log a warning
   */
  logWarning(message: string): void {
    console.warn(`⚠ ${message}`);
  }

  /**
   * Log an error
   */
  logError(message: string): void {
    console.error(`✗ ${message}`);
  }

  /**
   * Print final summary
   */
  printSummary(stats: {
    filesAnnotated: number;
    agentsUsed: number;
    validationIssues: number;
  }): void {
    const elapsed = this.getElapsedMinutes().toFixed(1);
    console.log(`\n${'═'.repeat(60)}`);
    console.log('MAP BUILD COMPLETE');
    console.log('═'.repeat(60));
    console.log(`Files annotated: ${stats.filesAnnotated}`);
    console.log(`Agents used: ${stats.agentsUsed}`);
    console.log(`LLM calls: ${this.llmCallCount}`);
    console.log(`Tokens used: ${this.tokenCount.toLocaleString()}`);
    console.log(`Validation issues: ${stats.validationIssues}`);
    console.log(`Build time: ${elapsed} minutes`);
    console.log('═'.repeat(60));
  }
}
