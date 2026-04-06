# Refactoring Improvements Roadmap

## Critical Refactors
Critical issues that bloat the codebase, hurt maintainability, or introduce potential memory leaks and blocking behavior.

### Refactor: Deduplicate LLM Retry Logic
- **Location**: `src/core/llm-client.ts` (`sendMessage` and `withRetry` functions)
- **Problem**: The explicit `for` loop governing backoff delays, rate-limit catching, and exponential sleep logic is perfectly duplicated between `LLMClient.sendMessage` and the standalone `withRetry` function.
- **Impact**: Any bug fix to the rate-limit or exponential backoff behavior must be changed in two places. It violates DRY.
- **Suggested Approach**: Wrap `this.provider.call` inside `LLMClient.sendMessage` with the `withRetry` utility function. Remove the duplicate loop logic from `sendMessage` entirely.
  ```typescript
  async sendMessage(prompt: string, options: LLMCallOptions): Promise<LLMResponse> {
    return withRetry(async () => {
       // logic for rate limiter and provider call
       return this.provider.call({...});
    }, options.retryConfig);
  }
  ```

### Refactor: Provider Factory OCP Violation
- **Location**: `src/core/providers/factory.ts` (`createProvider` function)
- **Problem**: The `createProvider` method uses a hardcoded `switch` statement to instantiate providers (`anthropic`, `gemini`, `openai`). Adding a new provider requires modifying this core file.
- **Impact**: Violates the Open/Closed Principle. Makes it harder for external contributors or downstream modules to inject their own custom LLM providers.
- **Suggested Approach**: Implement a provider registry pattern.
  ```typescript
  const providerRegistry = new Map<ProviderType, ProviderConstructor>();

  export function registerProvider(type: ProviderType, constructor: ProviderConstructor) {
      providerRegistry.set(type, constructor);
  }
  ```

## Medium Priority Improvements
Issues that degrade performance under heavy scale or introduce tech debt through legacy compatibility.

### Refactor: Decouple Legacy Anthropic Client
- **Location**: `src/core/llm-client.ts` (Constructor)
- **Problem**: `LLMClient` holds a `legacyClient: Anthropic | null` state and features a custom `isAnthropicClient` type guard to determine if it should wrap the client in `ClaudeProvider` or accept it as an `LLMProvider`.
- **Impact**: Muddies the responsibilities of `LLMClient`, forcing it to know about specific provider types instead of cleanly relying on the `LLMProvider` interface.
- **Suggested Approach**: Deprecate the constructor overload that accepts an Anthropic client. Force users to wrap legacy clients in a `ClaudeProvider` *before* passing them to `LLMClient`. Move the compatibility layer to a specific factory method if absolutely needed (e.g., `LLMClient.fromLegacyAnthropic()`).

### Refactor: Rate Limiter Timer Optimization
- **Location**: `src/core/rate-limiter.ts` (`TokenBucket.ensureRefillTimer`)
- **Problem**: The token bucket continuously polls at a fixed 100ms interval (`setInterval`) as long as requests are pending.
- **Impact**: While acceptable for low loads, high concurrency creates an active polling loop that wastes CPU cycles.
- **Suggested Approach**: Calculate the exact `Date.now()` timestamp when enough tokens will be available for the next request in the queue, and use a single `setTimeout` to wake up exactly at that moment.

## Nice-to-Have Enhancements
Modernization polishes and minor robustness improvements.

### Enhancement: Async Git Utils
- **Location**: `src/core/git-utils.ts`
- **Description**: The safe git execution functions rely on `child_process.execSync` (as hinted by their standard behavior, though implemented under the hood in a safe wrapper).
- **Benefit**: Changing these to use asynchronous `child_process.execFile` and returning Promises will prevent blocking the Node.js event loop when computing massive diffs or traversing deep rev-lists.
- **Suggested Approach**: Convert `safeGitExec` and the wrapping functions (`getGitDiffSafe`, `getCommitCountSafe`, etc.) to be `async/await` and update their consumers to `await` the results.
