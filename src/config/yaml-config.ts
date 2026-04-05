/**
 * YAML Configuration Loader
 *
 * Loads rmap configuration from rmap.yaml file in the repository root.
 * Supports LLM provider selection and other configuration options.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { ProviderType } from '../core/providers/types.js';

/**
 * LLM provider configuration in YAML
 */
export interface YamlLLMConfig {
  /** Default provider for all levels */
  provider?: ProviderType;
  /** Provider overrides per level */
  levels?: {
    level1?: ProviderType;
    level2?: ProviderType;
    level3?: ProviderType;
  };
}

/**
 * Complete YAML configuration schema
 */
export interface YamlConfig {
  /** LLM provider configuration */
  llm?: YamlLLMConfig;
  /** Rate limiting configuration */
  rateLimit?: {
    requestsPerMinute?: number;
    inputTokensPerMinute?: number;
  };
  /** Concurrency configuration */
  concurrency?: {
    maxConcurrentAnnotations?: number;
    taskStartDelayMs?: number;
  };
}

/**
 * Cached YAML config to avoid re-reading the file
 */
let cachedConfig: YamlConfig | null = null;
let cachedConfigPath: string | null = null;

/**
 * Find rmap.yaml in the current directory or parent directories
 *
 * @param startDir - Directory to start searching from (defaults to cwd)
 * @returns Path to rmap.yaml or null if not found
 */
export function findConfigFile(startDir?: string): string | null {
  let dir = startDir || process.cwd();

  // Walk up directory tree looking for rmap.yaml
  while (dir !== path.dirname(dir)) {
    const configPath = path.join(dir, 'rmap.yaml');
    if (fs.existsSync(configPath)) {
      return configPath;
    }

    // Also check for .rmap.yaml (hidden file)
    const hiddenConfigPath = path.join(dir, '.rmap.yaml');
    if (fs.existsSync(hiddenConfigPath)) {
      return hiddenConfigPath;
    }

    dir = path.dirname(dir);
  }

  return null;
}

/**
 * Load and parse rmap.yaml configuration
 *
 * @param configPath - Optional explicit path to config file
 * @returns Parsed YAML config or empty object if not found
 */
export function loadYamlConfig(configPath?: string): YamlConfig {
  // Return cached config if available and path matches
  if (cachedConfig !== null && (configPath === cachedConfigPath || (!configPath && cachedConfigPath === findConfigFile()))) {
    return cachedConfig;
  }

  const resolvedPath = configPath || findConfigFile();

  if (!resolvedPath) {
    cachedConfig = {};
    cachedConfigPath = null;
    return {};
  }

  try {
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    const config = parseYaml(content) as YamlConfig;

    // Validate provider types if present
    if (config.llm?.provider && !isValidProvider(config.llm.provider)) {
      console.warn(`Warning: Invalid LLM provider "${config.llm.provider}" in ${resolvedPath}. Using default.`);
      delete config.llm.provider;
    }

    if (config.llm?.levels) {
      for (const [level, provider] of Object.entries(config.llm.levels)) {
        if (provider && !isValidProvider(provider)) {
          console.warn(`Warning: Invalid LLM provider "${provider}" for ${level} in ${resolvedPath}. Using default.`);
          delete (config.llm.levels as Record<string, unknown>)[level];
        }
      }
    }

    cachedConfig = config;
    cachedConfigPath = resolvedPath;
    return config;
  } catch (error) {
    if (error instanceof Error) {
      console.warn(`Warning: Failed to parse ${resolvedPath}: ${error.message}`);
    }
    cachedConfig = {};
    cachedConfigPath = null;
    return {};
  }
}

/**
 * Check if a provider type is valid
 */
function isValidProvider(provider: string): provider is ProviderType {
  return ['anthropic', 'gemini', 'openai'].includes(provider);
}

/**
 * Get LLM provider from YAML config with fallback to environment variable
 *
 * @param level - Optional level to get provider for (1, 2, or 3)
 * @param envFallback - Environment variable fallback value
 * @returns Provider type
 */
export function getYamlLLMProvider(level?: 1 | 2 | 3, envFallback?: ProviderType): ProviderType {
  const config = loadYamlConfig();

  // Check level-specific override first
  if (level && config.llm?.levels) {
    const levelKey = `level${level}` as keyof typeof config.llm.levels;
    if (config.llm.levels[levelKey]) {
      return config.llm.levels[levelKey]!;
    }
  }

  // Fall back to default provider in YAML
  if (config.llm?.provider) {
    return config.llm.provider;
  }

  // Fall back to environment variable
  return envFallback || 'anthropic';
}

/**
 * Clear the cached config (useful for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  cachedConfigPath = null;
}

/**
 * Get the path to the loaded config file (for debugging)
 */
export function getLoadedConfigPath(): string | null {
  return cachedConfigPath;
}
