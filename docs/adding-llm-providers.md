# Adding New LLM Providers

This guide explains how to add support for new LLM providers (like Gemini, OpenAI, etc.) to rmap.

## Architecture Overview

rmap uses a provider abstraction layer that decouples the application from specific LLM vendors:

```
Pipeline → LLMClient → LLMProvider interface → ConcreteProvider → Vendor API
```

All LLM providers implement the `LLMProvider` interface, making them interchangeable.

## Step 1: Implement the LLMProvider Interface

Create a new file in `src/core/providers/` (e.g., `gemini-provider.ts`):

```typescript
import type { LLMProvider, LLMProviderCallOptions, LLMProviderResponse } from './types.js';

export class GeminiProvider implements LLMProvider {
  private client: GeminiClient; // Your vendor's SDK client

  constructor(apiKey?: string) {
    // Initialize the vendor SDK
    // Use apiKey or fall back to environment variable
    this.client = new GeminiClient({
      apiKey: apiKey || process.env.GEMINI_API_KEY,
    });
  }

  async call(options: LLMProviderCallOptions): Promise<LLMProviderResponse> {
    // Make the API call using the vendor SDK
    const response = await this.client.generateContent({
      model: options.model,
      prompt: options.prompt,
      systemInstruction: options.systemPrompt,
      maxOutputTokens: options.maxTokens,
      temperature: options.temperature,
      stopSequences: options.stopSequences,
    });

    // Normalize the response to our standard format
    return {
      content: response.text,
      stopReason: this.mapStopReason(response.finishReason),
      usage: {
        inputTokens: response.usageMetadata.promptTokenCount,
        outputTokens: response.usageMetadata.candidatesTokenCount,
      },
    };
  }

  getName(): string {
    return 'gemini';
  }

  getSupportedModels(): string[] {
    return [
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-2.0-flash',
    ];
  }

  private mapStopReason(reason: string): 'end_turn' | 'max_tokens' | 'stop_sequence' {
    // Map vendor-specific stop reasons to our standard format
    switch (reason) {
      case 'STOP':
        return 'end_turn';
      case 'MAX_TOKENS':
        return 'max_tokens';
      case 'STOP_SEQUENCE':
        return 'stop_sequence';
      default:
        return 'end_turn';
    }
  }
}
```

## Step 2: Register in the Factory

Update `src/core/providers/factory.ts`:

```typescript
import { GeminiProvider } from './gemini-provider.js';

export function createProvider(type: ProviderType, apiKey?: string): LLMProvider {
  switch (type) {
    case 'anthropic':
      return new ClaudeProvider(apiKey);
    case 'gemini':
      return new GeminiProvider(apiKey);  // Add your provider
    case 'openai':
      throw new Error('OpenAI provider not yet implemented');
    default:
      throw new Error(`Unknown provider type: ${type}`);
  }
}

export function isProviderImplemented(type: ProviderType): boolean {
  switch (type) {
    case 'anthropic':
    case 'gemini':  // Mark as implemented
      return true;
    case 'openai':
      return false;
    default:
      return false;
  }
}
```

## Step 3: Export from Index

Update `src/core/providers/index.ts`:

```typescript
export { GeminiProvider } from './gemini-provider.js';
```

## Step 4: Add Tests

Create tests in `tests/core/providers/gemini-provider.test.ts`:

```typescript
import { test } from 'node:test';
import assert from 'node:assert';
import { GeminiProvider } from '../../src/core/providers/gemini-provider.js';

test('GeminiProvider implements LLMProvider interface', () => {
  const provider = new GeminiProvider();
  assert.strictEqual(typeof provider.call, 'function');
  assert.strictEqual(typeof provider.getName, 'function');
  assert.strictEqual(typeof provider.getSupportedModels, 'function');
});

test('GeminiProvider.getName returns gemini', () => {
  const provider = new GeminiProvider();
  assert.strictEqual(provider.getName(), 'gemini');
});

test('GeminiProvider.getSupportedModels returns array', () => {
  const provider = new GeminiProvider();
  const models = provider.getSupportedModels();
  assert.ok(Array.isArray(models));
  assert.ok(models.length > 0);
});
```

## Step 5: Install Dependencies

Add the vendor SDK to `package.json`:

```bash
npm install @google/generative-ai
```

## LLMProvider Interface Reference

```typescript
interface LLMProvider {
  /**
   * Make an LLM API call
   * @param options - Call configuration
   * @returns Normalized response
   */
  call(options: LLMProviderCallOptions): Promise<LLMProviderResponse>;

  /**
   * Get provider identifier (e.g., "anthropic", "gemini")
   */
  getName(): string;

  /**
   * Get list of supported model identifiers
   */
  getSupportedModels(): string[];
}

interface LLMProviderCallOptions {
  prompt: string;           // The user message
  model: string;            // Model identifier
  systemPrompt?: string;    // System/context prompt
  maxTokens?: number;       // Max response tokens
  temperature?: number;     // Randomness (0-1)
  stopSequences?: string[]; // Stop generation sequences
}

interface LLMProviderResponse {
  content: string;          // Response text
  stopReason: 'end_turn' | 'max_tokens' | 'stop_sequence';
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}
```

## Configuration

Users can select providers via environment variables:

```bash
# Set default provider for all levels
export RMAP_LLM_PROVIDER=gemini

# Or override per level
export RMAP_LEVEL1_PROVIDER=anthropic  # Fast detection with Claude
export RMAP_LEVEL2_PROVIDER=anthropic  # Work division with Claude
export RMAP_LEVEL3_PROVIDER=gemini     # Annotation with Gemini
```

## Usage in Code

```typescript
// Using the factory
const client = LLMClient.withProvider('gemini');

// Or direct instantiation
import { GeminiProvider } from './providers/gemini-provider.js';
const provider = new GeminiProvider();
const client = new LLMClient(provider);
```

## Considerations When Implementing

1. **Error Handling**: Map vendor-specific errors to standard error types or throw descriptive errors.

2. **Rate Limiting**: Each provider may need its own rate limiting configuration. The existing rate limiter works at the LLMClient level.

3. **Token Estimation**: Token counting varies by model. Consider adding a `estimateTokens()` method if needed.

4. **Model Mapping**: Some models have different naming conventions. Consider adding model aliases.

5. **Streaming**: The current interface is request-response. Streaming support would require interface changes.

6. **Pricing**: Update `src/core/metrics.ts` with pricing for new models if cost tracking is needed.

## Example: OpenAI Provider Skeleton

```typescript
import OpenAI from 'openai';
import type { LLMProvider, LLMProviderCallOptions, LLMProviderResponse } from './types.js';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey?: string) {
    this.client = new OpenAI({ apiKey });
  }

  async call(options: LLMProviderCallOptions): Promise<LLMProviderResponse> {
    const response = await this.client.chat.completions.create({
      model: options.model,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      messages: [
        ...(options.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
        { role: 'user' as const, content: options.prompt },
      ],
      stop: options.stopSequences,
    });

    const choice = response.choices[0];
    return {
      content: choice.message.content || '',
      stopReason: this.mapStopReason(choice.finish_reason),
      usage: {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
      },
    };
  }

  getName(): string {
    return 'openai';
  }

  getSupportedModels(): string[] {
    return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  }

  private mapStopReason(reason: string | null): 'end_turn' | 'max_tokens' | 'stop_sequence' {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'length':
        return 'max_tokens';
      case 'stop_sequence':
        return 'stop_sequence';
      default:
        return 'end_turn';
    }
  }
}
```
