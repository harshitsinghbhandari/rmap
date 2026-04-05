/**
 * Tests for LLM Provider Abstraction Layer
 *
 * Tests the provider interface, factory, and Claude provider implementation.
 */

import { test } from 'node:test';
import assert from 'node:assert';

import type {
  LLMProvider,
  LLMProviderCallOptions,
  LLMProviderResponse,
  ProviderType,
} from '../../src/core/providers/types.js';

import {
  createProvider,
  isProviderImplemented,
  getSupportedProviderTypes,
  getImplementedProviderTypes,
} from '../../src/core/providers/factory.js';

import { ClaudeProvider } from '../../src/core/providers/claude-provider.js';
import { GeminiProvider } from '../../src/core/providers/gemini-provider.js';

// ============================================================================
// LLMProviderCallOptions Interface Tests
// ============================================================================

test('LLMProviderCallOptions requires prompt and model', () => {
  const options: LLMProviderCallOptions = {
    prompt: 'Test prompt',
    model: 'claude-haiku-4-5-20251001',
  };

  assert.strictEqual(options.prompt, 'Test prompt');
  assert.strictEqual(options.model, 'claude-haiku-4-5-20251001');
});

test('LLMProviderCallOptions accepts all optional fields', () => {
  const options: LLMProviderCallOptions = {
    prompt: 'Test prompt',
    model: 'claude-sonnet-4-5-20250929',
    systemPrompt: 'You are a helpful assistant',
    maxTokens: 4096,
    temperature: 0.5,
    stopSequences: ['END', 'STOP'],
  };

  assert.strictEqual(options.systemPrompt, 'You are a helpful assistant');
  assert.strictEqual(options.maxTokens, 4096);
  assert.strictEqual(options.temperature, 0.5);
  assert.deepStrictEqual(options.stopSequences, ['END', 'STOP']);
});

// ============================================================================
// LLMProviderResponse Interface Tests
// ============================================================================

test('LLMProviderResponse has all required fields', () => {
  const response: LLMProviderResponse = {
    content: 'Test response',
    stopReason: 'end_turn',
    usage: {
      inputTokens: 100,
      outputTokens: 50,
    },
  };

  assert.strictEqual(response.content, 'Test response');
  assert.strictEqual(response.stopReason, 'end_turn');
  assert.strictEqual(response.usage.inputTokens, 100);
  assert.strictEqual(response.usage.outputTokens, 50);
});

test('LLMProviderResponse stopReason can be max_tokens', () => {
  const response: LLMProviderResponse = {
    content: 'Truncated response...',
    stopReason: 'max_tokens',
    usage: {
      inputTokens: 100,
      outputTokens: 4096,
    },
  };

  assert.strictEqual(response.stopReason, 'max_tokens');
});

test('LLMProviderResponse stopReason can be stop_sequence', () => {
  const response: LLMProviderResponse = {
    content: 'Response before stop',
    stopReason: 'stop_sequence',
    usage: {
      inputTokens: 50,
      outputTokens: 25,
    },
  };

  assert.strictEqual(response.stopReason, 'stop_sequence');
});

// ============================================================================
// ProviderType Tests
// ============================================================================

test('ProviderType includes anthropic', () => {
  const provider: ProviderType = 'anthropic';
  assert.strictEqual(provider, 'anthropic');
});

test('ProviderType includes gemini', () => {
  const provider: ProviderType = 'gemini';
  assert.strictEqual(provider, 'gemini');
});

test('ProviderType includes openai', () => {
  const provider: ProviderType = 'openai';
  assert.strictEqual(provider, 'openai');
});

// ============================================================================
// Provider Factory Tests
// ============================================================================

test('createProvider creates ClaudeProvider for anthropic', () => {
  const provider = createProvider('anthropic');
  assert.ok(provider instanceof ClaudeProvider);
  assert.strictEqual(provider.getName(), 'anthropic');
});

test('createProvider creates GeminiProvider for gemini when API key provided', () => {
  const provider = createProvider('gemini', 'test-api-key');
  assert.ok(provider instanceof GeminiProvider);
  assert.strictEqual(provider.getName(), 'gemini');
});

test('createProvider throws for gemini without API key', () => {
  // Temporarily remove env vars to test the error case
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGoogleKey = process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;

  try {
    assert.throws(
      () => createProvider('gemini'),
      /Gemini API key is required/
    );
  } finally {
    // Restore env vars
    if (originalGeminiKey) process.env.GEMINI_API_KEY = originalGeminiKey;
    if (originalGoogleKey) process.env.GOOGLE_API_KEY = originalGoogleKey;
  }
});

test('createProvider throws for unimplemented openai provider', () => {
  assert.throws(
    () => createProvider('openai'),
    /OpenAI provider not yet implemented/
  );
});

test('isProviderImplemented returns true for anthropic', () => {
  assert.strictEqual(isProviderImplemented('anthropic'), true);
});

test('isProviderImplemented returns true for gemini', () => {
  assert.strictEqual(isProviderImplemented('gemini'), true);
});

test('isProviderImplemented returns false for openai', () => {
  assert.strictEqual(isProviderImplemented('openai'), false);
});

test('getSupportedProviderTypes returns all provider types', () => {
  const types = getSupportedProviderTypes();
  assert.deepStrictEqual(types, ['anthropic', 'gemini', 'openai']);
});

test('getImplementedProviderTypes returns only implemented providers', () => {
  const types = getImplementedProviderTypes();
  assert.deepStrictEqual(types, ['anthropic', 'gemini']);
});

// ============================================================================
// ClaudeProvider Tests
// ============================================================================

test('ClaudeProvider implements LLMProvider interface', () => {
  const provider = new ClaudeProvider();

  // Check that all interface methods exist
  assert.strictEqual(typeof provider.call, 'function');
  assert.strictEqual(typeof provider.getName, 'function');
  assert.strictEqual(typeof provider.getSupportedModels, 'function');
});

test('ClaudeProvider.getName returns anthropic', () => {
  const provider = new ClaudeProvider();
  assert.strictEqual(provider.getName(), 'anthropic');
});

test('ClaudeProvider.getSupportedModels returns array of models', () => {
  const provider = new ClaudeProvider();
  const models = provider.getSupportedModels();

  assert.ok(Array.isArray(models));
  assert.ok(models.length > 0);

  // Check that expected models are included
  assert.ok(models.includes('claude-sonnet-4-5-20250929'));
  assert.ok(models.includes('claude-haiku-4-5-20251001'));
});

test('ClaudeProvider.getClient returns Anthropic client', () => {
  const provider = new ClaudeProvider();
  const client = provider.getClient();

  // Check that it has the Anthropic SDK shape
  assert.ok(client !== null);
  assert.strictEqual(typeof client.messages?.create, 'function');
});

// ============================================================================
// LLMProvider Interface Contract Tests
// ============================================================================

test('LLMProvider interface requires call method', () => {
  // This is a type-level test - if it compiles, the interface is correct
  const mockProvider: LLMProvider = {
    async call(options: LLMProviderCallOptions): Promise<LLMProviderResponse> {
      return {
        content: 'mock response',
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 5 },
      };
    },
    getName(): string {
      return 'mock';
    },
    getSupportedModels(): string[] {
      return ['mock-model'];
    },
  };

  assert.strictEqual(mockProvider.getName(), 'mock');
  assert.deepStrictEqual(mockProvider.getSupportedModels(), ['mock-model']);
});

test('Provider interface allows creating mock providers for testing', async () => {
  // Create a mock provider for testing without API calls
  const mockProvider: LLMProvider = {
    async call(options: LLMProviderCallOptions): Promise<LLMProviderResponse> {
      // Simulate response based on input
      const tokenCount = Math.ceil(options.prompt.length / 4);
      return {
        content: `Response to: ${options.prompt.slice(0, 50)}...`,
        stopReason: 'end_turn',
        usage: {
          inputTokens: tokenCount,
          outputTokens: Math.ceil(tokenCount * 0.5),
        },
      };
    },
    getName(): string {
      return 'mock';
    },
    getSupportedModels(): string[] {
      return ['mock-model-small', 'mock-model-large'];
    },
  };

  const response = await mockProvider.call({
    prompt: 'What is TypeScript?',
    model: 'mock-model-small',
  });

  assert.ok(response.content.includes('Response to:'));
  assert.strictEqual(response.stopReason, 'end_turn');
  assert.ok(response.usage.inputTokens > 0);
  assert.ok(response.usage.outputTokens > 0);
});

// ============================================================================
// Provider Abstraction Design Tests
// ============================================================================

test('Providers can be swapped without changing call signature', () => {
  // This test verifies the abstraction allows provider swapping
  // We use a mock provider to avoid making actual API calls
  const mockProvider: LLMProvider = {
    async call(options: LLMProviderCallOptions): Promise<LLMProviderResponse> {
      return {
        content: 'mock response',
        stopReason: 'end_turn',
        usage: { inputTokens: 10, outputTokens: 5 },
      };
    },
    getName(): string {
      return 'mock';
    },
    getSupportedModels(): string[] {
      return ['mock-model'];
    },
  };

  function makeCall(provider: LLMProvider, prompt: string): Promise<LLMProviderResponse> {
    return provider.call({
      prompt,
      model: provider.getSupportedModels()[0],
      maxTokens: 1000,
    });
  }

  // The function works with any provider implementing the interface
  const result = makeCall(mockProvider, 'test');
  assert.ok(result instanceof Promise); // Returns a Promise
});

test('Provider names are consistent with ProviderType', () => {
  // Use ClaudeProvider directly to avoid triggering API key validation
  const provider = new ClaudeProvider();
  const name = provider.getName();

  // The name should match a valid ProviderType
  const validTypes: ProviderType[] = ['anthropic', 'gemini', 'openai'];
  assert.ok(validTypes.includes(name as ProviderType));
});

// ============================================================================
// GeminiProvider Tests
// ============================================================================

test('GeminiProvider implements LLMProvider interface', () => {
  const provider = new GeminiProvider('test-api-key');

  // Check that all interface methods exist
  assert.strictEqual(typeof provider.call, 'function');
  assert.strictEqual(typeof provider.getName, 'function');
  assert.strictEqual(typeof provider.getSupportedModels, 'function');
});

test('GeminiProvider.getName returns gemini', () => {
  const provider = new GeminiProvider('test-api-key');
  assert.strictEqual(provider.getName(), 'gemini');
});

test('GeminiProvider.getSupportedModels returns array of models', () => {
  const provider = new GeminiProvider('test-api-key');
  const models = provider.getSupportedModels();

  assert.ok(Array.isArray(models));
  assert.ok(models.length > 0);

  // Check that expected models are included
  assert.ok(models.includes('gemini-2.5-flash'));
  assert.ok(models.includes('gemini-2.5-pro'));
});

test('GeminiProvider.getClient returns GoogleGenAI client', () => {
  const provider = new GeminiProvider('test-api-key');
  const client = provider.getClient();

  // Check that it has the GoogleGenAI SDK shape
  assert.ok(client !== null);
  assert.ok(client.models !== undefined);
});

test('GeminiProvider throws without API key', () => {
  // Temporarily remove env vars to test the error case
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGoogleKey = process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;

  try {
    assert.throws(
      () => new GeminiProvider(),
      /Gemini API key is required/
    );
  } finally {
    // Restore env vars
    if (originalGeminiKey) process.env.GEMINI_API_KEY = originalGeminiKey;
    if (originalGoogleKey) process.env.GOOGLE_API_KEY = originalGoogleKey;
  }
});

test('GeminiProvider uses GEMINI_API_KEY env var', () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGoogleKey = process.env.GOOGLE_API_KEY;
  process.env.GEMINI_API_KEY = 'test-gemini-key';
  delete process.env.GOOGLE_API_KEY;

  try {
    const provider = new GeminiProvider();
    assert.strictEqual(provider.getName(), 'gemini');
  } finally {
    // Restore env vars
    if (originalGeminiKey) {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    if (originalGoogleKey) process.env.GOOGLE_API_KEY = originalGoogleKey;
  }
});

test('GeminiProvider uses GOOGLE_API_KEY env var as fallback', () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGoogleKey = process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  process.env.GOOGLE_API_KEY = 'test-google-key';

  try {
    const provider = new GeminiProvider();
    assert.strictEqual(provider.getName(), 'gemini');
  } finally {
    // Restore env vars
    if (originalGeminiKey) process.env.GEMINI_API_KEY = originalGeminiKey;
    if (originalGoogleKey) {
      process.env.GOOGLE_API_KEY = originalGoogleKey;
    } else {
      delete process.env.GOOGLE_API_KEY;
    }
  }
});

test('GeminiProvider name matches ProviderType', () => {
  const provider = new GeminiProvider('test-api-key');
  const name = provider.getName();

  // The name should match a valid ProviderType
  const validTypes: ProviderType[] = ['anthropic', 'gemini', 'openai'];
  assert.ok(validTypes.includes(name as ProviderType));
});
