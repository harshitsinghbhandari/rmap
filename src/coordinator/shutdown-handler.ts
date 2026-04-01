/**
 * Graceful Shutdown Handler
 *
 * Manages signal handlers (SIGINT, SIGTERM) for graceful pipeline shutdown.
 * Ensures cleanup callbacks are executed and state is preserved on interrupt.
 */

/**
 * Cleanup callback function signature
 */
export type CleanupCallback = () => void | Promise<void>;

/**
 * Handles graceful shutdown on SIGINT/SIGTERM signals
 */
export class GracefulShutdownHandler {
  private isShuttingDown = false;
  private cleanupCallbacks: CleanupCallback[] = [];
  private sigintHandler: (() => void) | null = null;
  private sigtermHandler: (() => void) | null = null;

  /**
   * Register a cleanup callback to be called on shutdown
   *
   * @param callback - Function to execute during shutdown
   */
  onShutdown(callback: CleanupCallback): void {
    this.cleanupCallbacks.push(callback);
  }

  /**
   * Register signal handlers for graceful shutdown
   *
   * Sets up SIGINT and SIGTERM handlers that execute all registered cleanup callbacks.
   */
  register(): void {
    this.sigintHandler = () => this.handleShutdown('SIGINT');
    this.sigtermHandler = () => this.handleShutdown('SIGTERM');

    process.on('SIGINT', this.sigintHandler);
    process.on('SIGTERM', this.sigtermHandler);
  }

  /**
   * Unregister signal handlers
   *
   * Call this after pipeline completes successfully to prevent memory leaks
   * and interference with other processes.
   */
  unregister(): void {
    if (this.sigintHandler) {
      process.removeListener('SIGINT', this.sigintHandler);
      this.sigintHandler = null;
    }

    if (this.sigtermHandler) {
      process.removeListener('SIGTERM', this.sigtermHandler);
      this.sigtermHandler = null;
    }
  }

  /**
   * Handle shutdown signal
   *
   * Executes all registered cleanup callbacks and exits the process.
   *
   * @param signal - Signal name (SIGINT or SIGTERM)
   */
  private async handleShutdown(signal: string): Promise<void> {
    // Prevent multiple signals from being handled
    if (this.isShuttingDown) {
      return;
    }
    this.isShuttingDown = true;

    console.log(`\n⚠️  Received ${signal}, saving checkpoint...`);

    try {
      // Execute all cleanup callbacks
      for (const callback of this.cleanupCallbacks) {
        await callback();
      }

      console.log('✓ Checkpoint saved. Run again to resume.');
      process.exit(0);
    } catch (error) {
      console.error(`Error during shutdown: ${error}`);
      process.exit(1);
    }
  }
}
