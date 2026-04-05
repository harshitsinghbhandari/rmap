/**
 * LLM Provider Factory
 *
 * Creates LLM provider instances based on provider type.
 * Centralizes provider instantiation and future provider additions.
 */

import type { LLMProvider, ProviderType } from './types.js';
import { ClaudeProvider } from './claude-provider.js';
import { GeminiProvider } from './gemini-provider.js';

/**
 * Create an LLM provider instance
 *
 * Factory function that creates the appropriate provider based on the
 * specified type. This centralizes provider creation and makes it easy
 * to add new providers in the future.
 *
 * @param type - The type of provider to create
 * @param apiKey - Optional API key for the provider
 * @returns An instance of the requested provider
 * @throws Error if the provider type is not implemented
 *
 * @example
 * ```typescript
 * // Create Anthropic/Claude provider
 * const provider = createProvider('anthropic');
 *
 * // Create with explicit API key
 * const provider = createProvider('anthropic', process.env.MY_API_KEY);
 * ```
 */
export function createProvider(type: ProviderType, apiKey?: string): LLMProvider {
  switch (type) {
    case 'anthropic':
      return new ClaudeProvider(apiKey);

    case 'gemini':
      return new GeminiProvider(apiKey);

    case 'openai':
      throw new Error(
        'OpenAI provider not yet implemented. ' +
        'Contributions welcome at https://github.com/harshitsinghbhandari/rmap'
      );

    default: {
      // Type guard to ensure exhaustive handling
      const _exhaustiveCheck: never = type;
      throw new Error(`Unknown provider type: ${_exhaustiveCheck}`);
    }
  }
}

/**
 * Check if a provider type is supported and implemented
 *
 * @param type - The provider type to check
 * @returns true if the provider is implemented and usable
 */
export function isProviderImplemented(type: ProviderType): boolean {
  switch (type) {
    case 'anthropic':
    case 'gemini':
      return true;
    case 'openai':
      return false;
    default:
      return false;
  }
}

/**
 * Get list of all supported provider types
 *
 * @returns Array of all provider type strings
 */
export function getSupportedProviderTypes(): ProviderType[] {
  return ['anthropic', 'gemini', 'openai'];
}

/**
 * Get list of implemented (ready to use) provider types
 *
 * @returns Array of implemented provider type strings
 */
export function getImplementedProviderTypes(): ProviderType[] {
  return getSupportedProviderTypes().filter(isProviderImplemented);
}
