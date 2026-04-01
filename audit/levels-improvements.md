# Levels Implementation: Refactoring Roadmap

**Generated:** 2026-04-01
**Target:** `src/levels/` directory improvements
**Priority:** Critical issues first, then systematic improvements

---

## 🎯 Strategic Goals

1. **Performance:** Reduce processing time by 7x through parallelization and caching
2. **Reliability:** Improve error recovery and data quality
3. **Maintainability:** Eliminate code duplication and improve type safety
4. **Flexibility:** Enable provider-agnostic LLM integration
5. **Observability:** Add metrics, cost tracking, and progress reporting

---

## 📊 Improvement Phases

### Phase 1: Critical Fixes (Blocking Issues)
**Timeline:** 2-3 days
**Impact:** Immediate usability improvements

### Phase 2: Core Refactoring (Architecture)
**Timeline:** 1 week
**Impact:** Long-term maintainability

### Phase 3: Enhancement (Polish)
**Timeline:** 3-4 days
**Impact:** User experience and flexibility

---

## Phase 1: Critical Fixes 🔥

### 1.1 Parallelize Level 3 Annotation
**Priority:** P0 - CRITICAL
**Impact:** 5-7x performance improvement
**Effort:** Medium (1 day)
**Files:** `src/levels/level3/annotator.ts`

#### Current State
```typescript
// Sequential processing - SLOW
for (let i = 0; i < files.length; i++) {
  const annotation = await annotateFile(...);
  await sleep(RETRY_CONFIG.REQUEST_DELAY_MS);
}
```

#### Proposed Solution
```typescript
/**
 * New file: src/core/concurrency-pool.ts
 */
export class ConcurrencyPool<T, R> {
  constructor(
    private maxConcurrency: number,
    private rateLimitDelay: number = 0
  ) {}

  async process(
    items: T[],
    handler: (item: T) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = [];
    const queue = [...items];

    async function worker(): Promise<void> {
      while (queue.length > 0) {
        const item = queue.shift()!;
        const result = await handler(item);
        results.push(result);

        if (this.rateLimitDelay > 0 && queue.length > 0) {
          await sleep(this.rateLimitDelay);
        }
      }
    }

    await Promise.all(
      Array.from({ length: this.maxConcurrency }, () => worker())
    );

    return results;
  }
}
```

#### Implementation in `annotator.ts`
```typescript
import { ConcurrencyPool } from '../../core/concurrency-pool.js';

export async function annotateFiles(
  files: RawFileMetadata[],
  options: AnnotationOptions
): Promise<FileAnnotation[]> {
  // ... setup code ...

  const pool = new ConcurrencyPool<RawFileMetadata, FileAnnotation | null>(
    10, // Max 10 parallel requests
    RETRY_CONFIG.REQUEST_DELAY_MS
  );

  const annotations = await pool.process(files, async (metadata) => {
    const absolutePath = path.join(repoRoot, metadata.path);
    return await annotateFile(absolutePath, metadata, client, model, repoRoot);
  });

  return annotations.filter((a) => a !== null) as FileAnnotation[];
}
```

#### Configuration
Add to `src/config/models.ts`:
```typescript
export const CONCURRENCY_CONFIG = {
  // Adjust based on API tier
  ANTHROPIC_MAX_PARALLEL: process.env.RMAP_MAX_PARALLEL
    ? parseInt(process.env.RMAP_MAX_PARALLEL)
    : 10,

  // Per-provider limits
  PROVIDERS: {
    anthropic: { maxConcurrent: 10, requestDelay: 100 },
    openai: { maxConcurrent: 20, requestDelay: 50 },
  }
};
```

#### Testing
- Unit test: `ConcurrencyPool` with mock handlers
- Integration test: Annotate 100 files, verify all processed
- Performance test: Measure actual speedup

---

### 1.2 Extract Duplicate Retry Logic
**Priority:** P0 - CRITICAL
**Impact:** DRY principle, easier bug fixes
**Effort:** Small (4 hours)
**Files:** `src/core/llm-client.ts` (new)

#### Current State
Same retry logic duplicated in:
- `level1/detector.ts:142-194`
- `level2/divider.ts:34-86`
- `level3/annotator.ts:74-127`

#### Proposed Solution
```typescript
/**
 * New file: src/core/llm-client.ts
 *
 * Centralized LLM client with retry logic
 */

import Anthropic from '@anthropic-ai/sdk';
import { RETRY_CONFIG } from '../config/models.js';

export interface LLMClientOptions {
  apiKey: string;
  maxRetries?: number;
  baseBackoff?: number;
}

export interface LLMRequest {
  model: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}

export class LLMClient {
  private client: Anthropic;
  private maxRetries: number;
  private baseBackoff: number;

  constructor(options: LLMClientOptions) {
    this.client = new Anthropic({ apiKey: options.apiKey });
    this.maxRetries = options.maxRetries ?? RETRY_CONFIG.MAX_RETRIES;
    this.baseBackoff = options.baseBackoff ?? RETRY_CONFIG.BASE_BACKOFF_MS;
  }

  async call(request: LLMRequest): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client.messages.create({
          model: request.model,
          max_tokens: request.maxTokens ?? 2000,
          temperature: request.temperature ?? 0,
          messages: [{ role: 'user', content: request.prompt }],
        });

        const content = response.content[0];
        if (content.type !== 'text') {
          throw new Error('Unexpected response type from Claude');
        }

        return content.text;
      } catch (error) {
        lastError = error as Error;

        if (error instanceof Anthropic.RateLimitError && attempt < this.maxRetries) {
          const waitTime = Math.pow(2, attempt) * this.baseBackoff;
          console.log(`Rate limit hit. Retrying in ${waitTime / 1000}s... (${attempt}/${this.maxRetries})`);
          await this.sleep(waitTime);
          continue;
        }

        if (error instanceof Anthropic.APIError) {
          throw new Error(`Claude API error: ${error.message}`);
        }

        throw error;
      }
    }

    throw new Error(`Failed after ${this.maxRetries} retries: ${lastError?.message}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Singleton instance
let defaultClient: LLMClient | null = null;

export function getDefaultLLMClient(): LLMClient {
  if (!defaultClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }
    defaultClient = new LLMClient({ apiKey });
  }
  return defaultClient;
}
```

#### Update All Levels
**Level 1:**
```typescript
import { getDefaultLLMClient } from '../../core/llm-client.js';

export async function detectStructure(...): Promise<Level1Output> {
  const client = getDefaultLLMClient();
  const prompt = buildPrompt(level0, repoRoot);

  const responseText = await client.call({
    model: DETECTION_MODEL,
    prompt,
    maxTokens: 2000,
  });

  return parseAndValidateResponse(responseText);
}
```

**Repeat for Level 2 and Level 3** - removes ~150 lines of duplicate code.

---

### 1.3 Add LLM Response Caching
**Priority:** P0 - CRITICAL
**Impact:** 50% faster on delta updates, cost savings
**Effort:** Medium (1 day)
**Files:** `src/core/cache.ts` (new)

#### Current State
Every run calls LLM for all files, even unchanged ones.

#### Proposed Solution
```typescript
/**
 * New file: src/core/cache.ts
 *
 * Hash-based caching for LLM responses
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CacheOptions {
  cacheDir: string;
  ttlMs?: number; // Time to live
}

export class LLMCache {
  private cacheDir: string;
  private ttlMs: number;

  constructor(options: CacheOptions) {
    this.cacheDir = options.cacheDir;
    this.ttlMs = options.ttlMs ?? 7 * 24 * 60 * 60 * 1000; // 7 days default

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Generate cache key from prompt and model
   */
  private getCacheKey(prompt: string, model: string): string {
    const hash = crypto
      .createHash('sha256')
      .update(`${model}:${prompt}`)
      .digest('hex');
    return hash;
  }

  /**
   * Get cached response if available and fresh
   */
  get(prompt: string, model: string): string | null {
    const key = this.getCacheKey(prompt, model);
    const cacheFile = path.join(this.cacheDir, `${key}.json`);

    if (!fs.existsSync(cacheFile)) {
      return null;
    }

    try {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      const age = Date.now() - cached.timestamp;

      if (age > this.ttlMs) {
        // Expired - delete and return null
        fs.unlinkSync(cacheFile);
        return null;
      }

      return cached.response;
    } catch (error) {
      // Corrupted cache file
      return null;
    }
  }

  /**
   * Store response in cache
   */
  set(prompt: string, model: string, response: string): void {
    const key = this.getCacheKey(prompt, model);
    const cacheFile = path.join(this.cacheDir, `${key}.json`);

    const data = {
      timestamp: Date.now(),
      model,
      response,
    };

    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
  }

  /**
   * Clear old cache entries
   */
  cleanup(): number {
    let deleted = 0;
    const files = fs.readdirSync(this.cacheDir);

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(this.cacheDir, file);
      try {
        const cached = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const age = Date.now() - cached.timestamp;

        if (age > this.ttlMs) {
          fs.unlinkSync(filePath);
          deleted++;
        }
      } catch (error) {
        // Corrupted - delete
        fs.unlinkSync(filePath);
        deleted++;
      }
    }

    return deleted;
  }
}
```

#### Integration with LLMClient
```typescript
// Update src/core/llm-client.ts

export class LLMClient {
  private cache?: LLMCache;

  constructor(options: LLMClientOptions & { cache?: LLMCache }) {
    // ... existing code ...
    this.cache = options.cache;
  }

  async call(request: LLMRequest, useCache = true): Promise<string> {
    // Check cache first
    if (useCache && this.cache) {
      const cached = this.cache.get(request.prompt, request.model);
      if (cached) {
        console.log('✓ Cache hit');
        return cached;
      }
    }

    // ... existing retry logic ...
    const response = /* call API */;

    // Store in cache
    if (useCache && this.cache) {
      this.cache.set(request.prompt, request.model, response);
    }

    return response;
  }
}
```

#### Configuration
```typescript
// Add to src/config/models.ts
export const CACHE_CONFIG = {
  ENABLED: process.env.RMAP_CACHE !== 'false',
  DIR: process.env.RMAP_CACHE_DIR || '.repo_map/.cache',
  TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
};
```

---

## Phase 2: Core Refactoring 🏗️

### 2.1 Abstract LLM Provider Interface
**Priority:** P1 - HIGH
**Impact:** Provider flexibility, future-proofing
**Effort:** Large (2 days)
**Files:** `src/core/llm/` (new directory)

#### Goal
Support multiple LLM providers: Anthropic, OpenAI, local models, etc.

#### Proposed Structure
```
src/core/llm/
├── types.ts          # Shared interfaces
├── base-provider.ts  # Abstract base class
├── anthropic.ts      # Anthropic implementation
├── openai.ts         # OpenAI implementation
├── factory.ts        # Provider factory
└── index.ts          # Public exports
```

#### Interface Definition
```typescript
// src/core/llm/types.ts

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  model: string;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed?: {
    input: number;
    output: number;
    total: number;
  };
  cost?: {
    input: number;
    output: number;
    total: number;
  };
}

export interface LLMProvider {
  name: string;

  /**
   * Call the LLM with retry logic
   */
  call(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Get available models for this provider
   */
  getAvailableModels(): string[];

  /**
   * Estimate cost for a request
   */
  estimateCost(request: LLMRequest): Promise<number>;
}
```

#### Base Provider Implementation
```typescript
// src/core/llm/base-provider.ts

import type { LLMProvider, LLMRequest, LLMResponse } from './types.js';
import { RETRY_CONFIG } from '../../config/models.js';

export abstract class BaseLLMProvider implements LLMProvider {
  abstract name: string;
  protected maxRetries: number;
  protected baseBackoff: number;

  constructor() {
    this.maxRetries = RETRY_CONFIG.MAX_RETRIES;
    this.baseBackoff = RETRY_CONFIG.BASE_BACKOFF_MS;
  }

  /**
   * Subclasses implement the actual API call
   */
  protected abstract callAPI(request: LLMRequest): Promise<LLMResponse>;

  /**
   * Subclasses define if an error is retryable
   */
  protected abstract isRetryable(error: Error): boolean;

  /**
   * Common retry logic for all providers
   */
  async call(request: LLMRequest): Promise<LLMResponse> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.callAPI(request);
      } catch (error) {
        lastError = error as Error;

        if (this.isRetryable(error) && attempt < this.maxRetries) {
          const waitTime = Math.pow(2, attempt) * this.baseBackoff;
          console.log(`Retrying in ${waitTime / 1000}s... (${attempt}/${this.maxRetries})`);
          await this.sleep(waitTime);
          continue;
        }

        throw error;
      }
    }

    throw new Error(`Failed after ${this.maxRetries} retries: ${lastError?.message}`);
  }

  abstract getAvailableModels(): string[];
  abstract estimateCost(request: LLMRequest): Promise<number>;

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

#### Anthropic Implementation
```typescript
// src/core/llm/anthropic.ts

import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider } from './base-provider.js';
import type { LLMRequest, LLMResponse } from './types.js';

export class AnthropicProvider extends BaseLLMProvider {
  name = 'anthropic';
  private client: Anthropic;

  constructor(apiKey: string) {
    super();
    this.client = new Anthropic({ apiKey });
  }

  protected async callAPI(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 2000,
      temperature: request.temperature ?? 0,
      messages: request.messages,
      stop_sequences: request.stopSequences,
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    return {
      content: content.text,
      model: response.model,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      },
      cost: this.calculateCost(response.model, response.usage),
    };
  }

  protected isRetryable(error: Error): boolean {
    return error instanceof Anthropic.RateLimitError;
  }

  getAvailableModels(): string[] {
    return [
      'claude-3-haiku-20240307',
      'claude-3-sonnet-20240229',
      'claude-3-opus-20240229',
    ];
  }

  async estimateCost(request: LLMRequest): Promise<number> {
    // Rough estimation based on average token counts
    const avgInputTokens = request.messages.reduce(
      (sum, m) => sum + m.content.length / 4,
      0
    );
    const avgOutputTokens = (request.maxTokens ?? 2000) / 2;

    return this.calculateCost(request.model, {
      input_tokens: avgInputTokens,
      output_tokens: avgOutputTokens,
    });
  }

  private calculateCost(
    model: string,
    usage: { input_tokens: number; output_tokens: number }
  ): { input: number; output: number; total: number } {
    // Prices per million tokens (as of 2024)
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
      'claude-3-sonnet-20240229': { input: 3, output: 15 },
      'claude-3-opus-20240229': { input: 15, output: 75 },
    };

    const prices = pricing[model] || pricing['claude-3-haiku-20240307'];

    const inputCost = (usage.input_tokens / 1_000_000) * prices.input;
    const outputCost = (usage.output_tokens / 1_000_000) * prices.output;

    return {
      input: inputCost,
      output: outputCost,
      total: inputCost + outputCost,
    };
  }
}
```

#### Provider Factory
```typescript
// src/core/llm/factory.ts

import type { LLMProvider } from './types.js';
import { AnthropicProvider } from './anthropic.js';

export type ProviderType = 'anthropic' | 'openai';

export function createProvider(type: ProviderType): LLMProvider {
  switch (type) {
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY not set');
      }
      return new AnthropicProvider(apiKey);
    }

    case 'openai':
      throw new Error('OpenAI provider not yet implemented');

    default:
      throw new Error(`Unknown provider: ${type}`);
  }
}

// Default provider
let defaultProvider: LLMProvider | null = null;

export function getDefaultProvider(): LLMProvider {
  if (!defaultProvider) {
    const type = (process.env.RMAP_LLM_PROVIDER as ProviderType) || 'anthropic';
    defaultProvider = createProvider(type);
  }
  return defaultProvider;
}
```

#### Migration
Update all levels to use the new provider interface:
```typescript
// Before (Level 1)
const client = new Anthropic({ apiKey });
const response = await client.messages.create({ ... });

// After (Level 1)
const provider = getDefaultProvider();
const response = await provider.call({
  messages: [{ role: 'user', content: prompt }],
  model: DETECTION_MODEL,
  maxTokens: 2000,
});
```

---

### 2.2 Improve Import Extraction (Level 0)
**Priority:** P1 - HIGH
**Impact:** Better data quality from the start
**Effort:** Large (2 days)
**Files:** `src/levels/level0/parsers/` (new)

#### Current Problem
Regex-based parsing misses:
- Dynamic imports
- Multi-line imports
- Template literal imports

#### Proposed Solution: Use Tree-sitter

**Add dependency:**
```json
{
  "dependencies": {
    "tree-sitter": "^0.20.0",
    "tree-sitter-javascript": "^0.20.0",
    "tree-sitter-typescript": "^0.20.0",
    "tree-sitter-python": "^0.20.0"
  }
}
```

**New structure:**
```
src/levels/level0/parsers/
├── types.ts           # Common interfaces
├── base-parser.ts     # Base parser class
├── javascript.ts      # JS/TS parser with tree-sitter
├── python.ts          # Python parser with tree-sitter
├── regex-fallback.ts  # Fallback for unsupported languages
└── index.ts           # Parser factory
```

**Implementation:**
```typescript
// src/levels/level0/parsers/javascript.ts

import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';
import TypeScript from 'tree-sitter-typescript';

export class JavaScriptParser {
  private parser: Parser;

  constructor(isTypeScript: boolean = false) {
    this.parser = new Parser();
    this.parser.setLanguage(isTypeScript ? TypeScript.typescript : JavaScript);
  }

  extractImports(content: string): string[] {
    const tree = this.parser.parse(content);
    const imports: string[] = [];

    // Query for import statements
    const cursor = tree.walk();

    function traverse(node: any) {
      // import ... from 'module'
      if (node.type === 'import_statement') {
        const source = node.childForFieldName('source');
        if (source) {
          const modulePath = source.text.slice(1, -1); // Remove quotes
          imports.push(modulePath);
        }
      }

      // require('module')
      if (node.type === 'call_expression') {
        const func = node.childForFieldName('function');
        if (func && func.text === 'require') {
          const args = node.childForFieldName('arguments');
          if (args && args.namedChildCount > 0) {
            const firstArg = args.namedChild(0);
            if (firstArg && firstArg.type === 'string') {
              const modulePath = firstArg.text.slice(1, -1);
              imports.push(modulePath);
            }
          }
        }
      }

      // import('module') - dynamic import
      if (node.type === 'import_call') {
        const args = node.childForFieldName('arguments');
        if (args && args.namedChildCount > 0) {
          const firstArg = args.namedChild(0);
          if (firstArg && firstArg.type === 'string') {
            const modulePath = firstArg.text.slice(1, -1);
            imports.push(modulePath);
          }
        }
      }

      for (let i = 0; i < node.namedChildCount; i++) {
        traverse(node.namedChild(i));
      }
    }

    traverse(tree.rootNode);

    return [...new Set(imports)];
  }
}
```

**Update harvester.ts:**
```typescript
import { createParser } from './parsers/index.js';

function extractImports(content: string, language: string): string[] {
  const parser = createParser(language);
  return parser.extractImports(content);
}
```

---

### 2.3 Add Metrics and Cost Tracking
**Priority:** P1 - HIGH
**Impact:** User awareness, debugging
**Effort:** Medium (1 day)
**Files:** `src/core/metrics.ts` (new)

#### Proposed Solution
```typescript
// src/core/metrics.ts

export interface LevelMetrics {
  level: number;
  started: number;
  completed?: number;
  durationMs?: number;
  tokensUsed?: {
    input: number;
    output: number;
    total: number;
  };
  cost?: number;
  apiCalls?: number;
  itemsProcessed?: number;
  errors?: number;
}

export class MetricsCollector {
  private metrics: Map<number, LevelMetrics> = new Map();
  private totalCost = 0;
  private totalTokens = 0;
  private totalApiCalls = 0;

  startLevel(level: number): void {
    this.metrics.set(level, {
      level,
      started: Date.now(),
    });
  }

  completeLevel(
    level: number,
    data: {
      tokensUsed?: LevelMetrics['tokensUsed'];
      cost?: number;
      apiCalls?: number;
      itemsProcessed?: number;
      errors?: number;
    }
  ): void {
    const metric = this.metrics.get(level);
    if (!metric) return;

    metric.completed = Date.now();
    metric.durationMs = metric.completed - metric.started;
    metric.tokensUsed = data.tokensUsed;
    metric.cost = data.cost;
    metric.apiCalls = data.apiCalls;
    metric.itemsProcessed = data.itemsProcessed;
    metric.errors = data.errors;

    if (data.cost) this.totalCost += data.cost;
    if (data.tokensUsed) this.totalTokens += data.tokensUsed.total;
    if (data.apiCalls) this.totalApiCalls += data.apiCalls;
  }

  getSummary() {
    return {
      levels: Array.from(this.metrics.values()),
      totals: {
        cost: this.totalCost,
        tokens: this.totalTokens,
        apiCalls: this.totalApiCalls,
      },
    };
  }

  printSummary(): void {
    console.log('\n═══ PIPELINE METRICS ═══\n');

    for (const metric of this.metrics.values()) {
      if (!metric.completed) continue;

      const duration = ((metric.durationMs || 0) / 1000).toFixed(2);
      const cost = metric.cost ? `$${metric.cost.toFixed(4)}` : 'N/A';
      const tokens = metric.tokensUsed?.total || 0;

      console.log(`Level ${metric.level}:`);
      console.log(`  Duration: ${duration}s`);
      console.log(`  API Calls: ${metric.apiCalls || 0}`);
      console.log(`  Tokens: ${tokens.toLocaleString()}`);
      console.log(`  Cost: ${cost}`);
      if (metric.errors) {
        console.log(`  Errors: ${metric.errors}`);
      }
      console.log('');
    }

    console.log('TOTALS:');
    console.log(`  API Calls: ${this.totalApiCalls}`);
    console.log(`  Tokens: ${this.totalTokens.toLocaleString()}`);
    console.log(`  Cost: $${this.totalCost.toFixed(4)}`);
    console.log('');
  }
}
```

**Integration:**
Update each level to track metrics via the collector.

---

## Phase 3: Enhancements 💎

### 3.1 Configuration System
**Priority:** P2 - MEDIUM
**Effort:** Small (4 hours)
**Files:** `src/config/user-config.ts` (new)

#### Goal
Allow users to customize behavior via config file.

```typescript
// Example: .rmaprc.json
{
  "concurrency": {
    "level3": 10
  },
  "cache": {
    "enabled": true,
    "ttlDays": 7
  },
  "llm": {
    "provider": "anthropic",
    "costLimit": 10.0,  // Stop if cost exceeds $10
    "retries": 3
  },
  "levels": {
    "level0": {
      "skipDirs": ["custom_build", "vendor"],
      "useTreeSitter": true
    },
    "level2": {
      "maxFilesPerTask": 75
    }
  }
}
```

---

### 3.2 Improved Error Recovery
**Priority:** P2 - MEDIUM
**Effort:** Medium (1 day)

#### Strategies
1. **Fallback prompts:** If JSON parsing fails, try simpler prompt
2. **Partial success:** If 80% of files succeed, continue with warnings
3. **Error classification:** Distinguish retryable vs fatal errors
4. **Graceful degradation:** Use regex if tree-sitter fails

---

### 3.3 Enhanced Validation Auto-fixes
**Priority:** P2 - MEDIUM
**Effort:** Small (4 hours)

#### New Auto-fixes
1. **Orphan files:** Suggest adding to entry points if used
2. **Missing exports:** Re-analyze files with zero exports
3. **Circular dependencies:** Suggest refactoring patterns

---

### 3.4 Smart Content Truncation
**Priority:** P3 - LOW
**Effort:** Small (4 hours)

#### Goal
Instead of naive 70/30 split, intelligently truncate:

```typescript
function smartTruncate(content: string, language: string): string {
  const tree = parseWithTreeSitter(content, language);

  // Extract: imports, exports, type definitions, function signatures
  const important = extractImportantNodes(tree);

  // If still too large, keep first/last blocks
  return condenseContent(important);
}
```

---

## 📋 Implementation Checklist

### Phase 1: Critical Fixes (Week 1)
- [ ] Implement ConcurrencyPool class
- [ ] Update Level 3 annotator to use pool
- [ ] Test with 100, 500, 1000 files
- [ ] Measure actual performance improvement
- [ ] Extract LLMClient with retry logic
- [ ] Update Levels 1, 2, 3 to use LLMClient
- [ ] Remove duplicate code
- [ ] Implement LLMCache class
- [ ] Integrate cache with LLMClient
- [ ] Test cache hit rates

### Phase 2: Core Refactoring (Week 2)
- [ ] Design LLM provider interface
- [ ] Implement BaseLLMProvider
- [ ] Implement AnthropicProvider
- [ ] Create provider factory
- [ ] Migrate all levels to new interface
- [ ] Add tree-sitter dependency
- [ ] Implement JavaScriptParser
- [ ] Implement PythonParser
- [ ] Update Level 0 to use new parsers
- [ ] Implement MetricsCollector
- [ ] Integrate metrics in pipeline
- [ ] Add cost estimation
- [ ] Print summary after runs

### Phase 3: Enhancements (Week 3)
- [ ] Design config file format
- [ ] Implement config loader
- [ ] Update all levels to respect config
- [ ] Document configuration options
- [ ] Classify error types
- [ ] Implement fallback strategies
- [ ] Add partial success handling
- [ ] Implement new auto-fix rules
- [ ] Test auto-fixes on real repos
- [ ] Implement smart truncation
- [ ] Benchmark quality improvement

---

## 🎯 Success Metrics

### Performance
- [ ] Level 3 processes 500 files in <5 minutes (currently ~17 min)
- [ ] Delta updates with 50 changed files complete in <1 minute
- [ ] Cache hit rate >60% on second runs

### Code Quality
- [ ] Zero duplicate retry logic (currently 4 copies)
- [ ] <5% type assertions (currently ~15%)
- [ ] Test coverage >80% for core modules

### User Experience
- [ ] Users can swap LLM providers via config
- [ ] Cost estimates shown before expensive operations
- [ ] Clear progress indicators at each level

---

## 🚀 Quick Wins (Do First)

If time is limited, prioritize these 3 improvements for maximum impact:

1. **Parallelize Level 3** (~1 day) → 5-7x faster
2. **Add LLM caching** (~1 day) → 50% cost savings on re-runs
3. **Extract retry logic** (~4 hours) → Easier maintenance

These 3 changes alone will transform user experience.

---

## 📚 Additional Resources

### Testing Strategy
- Unit tests for all new utilities (ConcurrencyPool, LLMCache, parsers)
- Integration tests for full pipeline with mocks
- Performance benchmarks on repos of varying sizes
- Regression tests for data quality (annotations should not degrade)

### Documentation Needs
- Architecture diagram showing level dependencies
- Configuration guide with examples
- Migration guide for provider switching
- Performance tuning guide

### Future Considerations
- Streaming responses for better UX
- Incremental updates (watch mode)
- Plugin system for custom parsers
- Web UI for exploring maps

---

**End of Roadmap**

This roadmap prioritizes the most impactful improvements while maintaining backward compatibility. Each phase can be implemented independently, allowing for iterative progress.
