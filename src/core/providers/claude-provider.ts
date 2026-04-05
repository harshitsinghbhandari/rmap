/**
 * Claude Provider Implementation
 *
 * Implements the LLMProvider interface for Anthropic's Claude models.
 * Wraps the @anthropic-ai/sdk to provide a consistent interface.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMProviderCallOptions, LLMProviderResponse } from './types.js';

/**
 * Default temperature for Claude API calls
 */
const DEFAULT_TEMPERATURE = 0;

/**
 * Default max tokens if not specified
 */
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Claude/Anthropic LLM Provider
 *
 * Provides access to Anthropic's Claude models through the standard
 * LLMProvider interface. Handles all Claude-specific API details.
 *
 * @example
 * ```typescript
 * const provider = new ClaudeProvider();
 * const response = await provider.call({
 *   prompt: 'What is TypeScript?',
 *   model: 'claude-haiku-4-5-20251001',
 *   maxTokens: 1000
 * });
 * ```
 */
export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;

  /**
   * Create a new Claude provider
   *
   * @param apiKey - Optional API key (uses ANTHROPIC_API_KEY env var if not provided)
   * @param client - Optional pre-configured Anthropic client (useful for testing or custom config)
   */
  constructor(apiKey?: string, client?: Anthropic) {
    if (client) {
      this.client = client;
    } else {
      this.client = new Anthropic({ apiKey });
    }
  }

  /**
   * Make an API call to Claude
   *
   * @param options - Call options including prompt, model, and parameters
   * @returns Normalized response with content and usage metrics
   * @throws Error if the API call fails or returns unexpected content type
   */
  async call(options: LLMProviderCallOptions): Promise<LLMProviderResponse> {
    const response = await this.client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: options.temperature ?? DEFAULT_TEMPERATURE,
      system: options.systemPrompt,
      messages: [
        {
          role: 'user',
          content: options.prompt,
        },
      ],
      stop_sequences: options.stopSequences,
    });

    // Extract text content from response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error(`Unexpected response type from Claude: ${content.type}`);
    }

    // Map Claude stop reasons to our normalized format
    const stopReason = this.mapStopReason(response.stop_reason);

    return {
      content: content.text,
      stopReason,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  /**
   * Get the provider name
   *
   * @returns "anthropic"
   */
  getName(): string {
    return 'anthropic';
  }

  /**
   * Get supported Claude models
   *
   * Returns the list of Claude models that can be used with this provider.
   * This list should be updated as new models become available.
   *
   * @returns Array of model identifiers
   */
  getSupportedModels(): string[] {
    return [
      // Claude 4.5 models
      'claude-sonnet-4-5-20250929',
      'claude-haiku-4-5-20251001',
      // Claude 3.5 models
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      // Claude 3 models
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ];
  }

  /**
   * Get the underlying Anthropic client
   *
   * Useful for direct API access when the provider abstraction
   * is not sufficient for a specific use case.
   *
   * @returns The Anthropic SDK client instance
   */
  getClient(): Anthropic {
    return this.client;
  }

  /**
   * Map Claude's stop reason to our normalized format
   *
   * @param stopReason - Claude API stop reason
   * @returns Normalized stop reason
   */
  private mapStopReason(
    stopReason: string | null
  ): 'end_turn' | 'max_tokens' | 'stop_sequence' {
    switch (stopReason) {
      case 'end_turn':
        return 'end_turn';
      case 'max_tokens':
        return 'max_tokens';
      case 'stop_sequence':
        return 'stop_sequence';
      default:
        // Default to end_turn for unknown reasons
        return 'end_turn';
    }
  }
}
