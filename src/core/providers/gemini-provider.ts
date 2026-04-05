/**
 * Gemini Provider Implementation
 *
 * Implements the LLMProvider interface for Google's Gemini models.
 * Wraps the @google/genai SDK to provide a consistent interface.
 */

import { GoogleGenAI } from '@google/genai';
import type { LLMProvider, LLMProviderCallOptions, LLMProviderResponse } from './types.js';

/**
 * Default temperature for Gemini API calls
 */
const DEFAULT_TEMPERATURE = 0;

/**
 * Default max tokens if not specified
 */
const DEFAULT_MAX_TOKENS = 4096;

/**
 * Gemini/Google LLM Provider
 *
 * Provides access to Google's Gemini models through the standard
 * LLMProvider interface. Handles all Gemini-specific API details.
 *
 * @example
 * ```typescript
 * const provider = new GeminiProvider();
 * const response = await provider.call({
 *   prompt: 'What is TypeScript?',
 *   model: 'gemini-2.5-flash',
 *   maxTokens: 1000
 * });
 * ```
 */
export class GeminiProvider implements LLMProvider {
  private client: GoogleGenAI;

  /**
   * Create a new Gemini provider
   *
   * @param apiKey - Optional API key (uses GEMINI_API_KEY or GOOGLE_API_KEY env var if not provided)
   * @param client - Optional pre-configured GoogleGenAI client (useful for testing or custom config)
   */
  constructor(apiKey?: string, client?: GoogleGenAI) {
    if (client) {
      this.client = client;
    } else {
      const resolvedApiKey = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!resolvedApiKey) {
        throw new Error(
          'Gemini API key is required. Set GEMINI_API_KEY or GOOGLE_API_KEY environment variable, ' +
          'or pass apiKey to the constructor.'
        );
      }
      this.client = new GoogleGenAI({ apiKey: resolvedApiKey });
    }
  }

  /**
   * Make an API call to Gemini
   *
   * @param options - Call options including prompt, model, and parameters
   * @returns Normalized response with content and usage metrics
   * @throws Error if the API call fails or returns unexpected content
   */
  async call(options: LLMProviderCallOptions): Promise<LLMProviderResponse> {
    const response = await this.client.models.generateContent({
      model: options.model,
      contents: options.prompt,
      config: {
        systemInstruction: options.systemPrompt,
        maxOutputTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
        temperature: options.temperature ?? DEFAULT_TEMPERATURE,
        stopSequences: options.stopSequences,
      },
    });

    // Extract text content from response
    const content = response.text;
    if (content === undefined || content === null) {
      throw new Error('Unexpected empty response from Gemini');
    }

    // Map Gemini finish reason to our normalized format
    const stopReason = this.mapStopReason(response.candidates?.[0]?.finishReason);

    // Extract usage metrics
    const usageMetadata = response.usageMetadata;

    return {
      content,
      stopReason,
      usage: {
        inputTokens: usageMetadata?.promptTokenCount ?? 0,
        outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }

  /**
   * Get the provider name
   *
   * @returns "gemini"
   */
  getName(): string {
    return 'gemini';
  }

  /**
   * Get supported Gemini models
   *
   * Returns the list of Gemini models that can be used with this provider.
   * This list should be updated as new models become available.
   *
   * @returns Array of model identifiers
   */
  getSupportedModels(): string[] {
    return [
      // Gemini 2.5 models (current)
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      // Gemini 3 models (preview)
      'gemini-3-flash-preview',
      'gemini-3.1-pro-preview',
      'gemini-3.1-flash-lite-preview',
    ];
  }

  /**
   * Get the underlying GoogleGenAI client
   *
   * Useful for direct API access when the provider abstraction
   * is not sufficient for a specific use case.
   *
   * @returns The GoogleGenAI SDK client instance
   */
  getClient(): GoogleGenAI {
    return this.client;
  }

  /**
   * Map Gemini's finish reason to our normalized format
   *
   * @param finishReason - Gemini API finish reason
   * @returns Normalized stop reason
   */
  private mapStopReason(
    finishReason: string | undefined | null
  ): 'end_turn' | 'max_tokens' | 'stop_sequence' {
    switch (finishReason) {
      case 'STOP':
        return 'end_turn';
      case 'MAX_TOKENS':
        return 'max_tokens';
      case 'STOP_SEQUENCE':
        return 'stop_sequence';
      default:
        // Default to end_turn for unknown reasons (including SAFETY, RECITATION, etc.)
        return 'end_turn';
    }
  }
}
