/**
 * LLM Provider Interface Types
 *
 * Defines the abstraction layer for LLM providers, allowing multiple
 * providers (Anthropic, Gemini, OpenAI, etc.) to be used interchangeably.
 */

/**
 * Options for making an LLM API call through a provider
 */
export interface LLMProviderCallOptions {
  /** The prompt/message to send to the LLM */
  prompt: string;
  /** Optional system prompt for context */
  systemPrompt?: string;
  /** Model identifier to use */
  model: string;
  /** Maximum tokens in the response */
  maxTokens?: number;
  /** Temperature for response randomness (0 = deterministic) */
  temperature?: number;
  /** Stop sequences to end generation */
  stopSequences?: string[];
}

/**
 * Normalized response from an LLM provider
 */
export interface LLMProviderResponse {
  /** The text content of the response */
  content: string;
  /** Reason the response ended */
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  /** Token usage metrics */
  usage: {
    /** Number of input tokens consumed */
    inputTokens: number;
    /** Number of output tokens generated */
    outputTokens: number;
  };
}

/**
 * LLM Provider interface
 *
 * Abstracts the underlying LLM API, allowing different providers
 * to be used interchangeably. Each provider implementation handles
 * vendor-specific details while exposing a consistent interface.
 *
 * @example
 * ```typescript
 * const provider = new ClaudeProvider();
 * const response = await provider.call({
 *   prompt: 'Analyze this code',
 *   model: 'claude-haiku-4-5-20251001',
 *   maxTokens: 2000
 * });
 * console.log(response.content);
 * ```
 */
export interface LLMProvider {
  /**
   * Make an LLM API call with the given options
   *
   * @param options - Call configuration including prompt, model, and parameters
   * @returns Promise resolving to the normalized response
   * @throws Error if the API call fails
   */
  call(options: LLMProviderCallOptions): Promise<LLMProviderResponse>;

  /**
   * Get the provider identifier
   *
   * @returns Provider name string (e.g., "anthropic", "gemini", "openai")
   */
  getName(): string;

  /**
   * Get the list of models supported by this provider
   *
   * @returns Array of supported model identifiers
   */
  getSupportedModels(): string[];
}

/**
 * Supported LLM provider types
 */
export type ProviderType = 'anthropic' | 'gemini' | 'openai';
