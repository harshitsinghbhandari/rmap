/**
 * Core constants for rmap
 *
 * Defines the tag taxonomy, schema version, aliases, and update thresholds
 */

/**
 * Schema version for the map JSON format
 * Bump this when the structure of the map files changes
 */
export const SCHEMA_VERSION = '1.0';

/**
 * Predefined tag taxonomy
 *
 * Level 3 agents pick from this list only. No freeform tags allowed.
 * A file can have 1-3 tags maximum (reduced to improve precision).
 *
 * Naming convention:
 * - Single-word tags: lowercase (e.g., 'database', 'testing')
 * - Multi-word tags: snake_case (e.g., 'api_endpoint', 'error_handling')
 */
export const TAG_TAXONOMY = [
  // Auth & Identity
  'authentication',
  'authorization',
  'jwt',
  'oauth',
  'session',

  // Data
  'database',
  'orm',
  'query',
  'migration',
  'sql',
  'nosql',
  'cache',

  // API & Communication
  'api_endpoint',
  'graphql',
  'rest',
  'grpc',
  'websocket',
  'webhook',

  // Architecture Patterns
  'model',
  'entity',
  'dto',
  'schema',
  'controller',
  'service',
  'repository',
  'handler',
  'middleware',
  'factory',
  'adapter',
  'interface',

  // Infrastructure
  'utility',
  'helper',
  'config',
  'env',
  'constants',
  'logging',
  'monitoring',
  'metrics',
  'tracing',
  'error_handling',
  'validation',

  // Testing
  'testing',
  'mock',
  'fixture',
  'e2e_test',
  'unit_test',

  // Frontend
  'frontend',
  'ui',
  'component',
  'state',
  'routing',
  'styling',

  // Backend
  'backend',
  'server',
  'cli',
  'daemon',
  'worker',
  'queue',

  // DevOps
  'build',
  'ci',
  'docker',
  'deployment',
  'infra',

  // Docs & Meta
  'documentation',
  'types',
  'generated',
  'vendor',
  'dependency_manifest',
] as const;

/**
 * Type for valid tags from the taxonomy
 */
export type Tag = (typeof TAG_TAXONOMY)[number];

/**
 * Tag aliases for the get-context command
 *
 * When querying with an alias (e.g., "auth"), it expands to all associated tags.
 * This allows agents to use shorthand while still matching all relevant files.
 */
export const TAG_ALIASES: Record<string, Tag[]> = {
  auth: ['authentication', 'authorization', 'jwt', 'oauth', 'session'],
  db: ['database', 'orm', 'query', 'sql', 'nosql'],
  api: ['api_endpoint', 'rest', 'graphql', 'grpc'],
  test: ['testing', 'mock', 'fixture', 'e2e_test', 'unit_test'],
  devops: ['build', 'ci', 'docker', 'deployment', 'infra'],
};

/**
 * Tag Priority Tiers
 *
 * Tags are organized into priority tiers to guide tag selection.
 * When annotating files, prefer higher-tier tags over lower-tier ones.
 *
 * Tier 1: High-signal domain tags (use first)
 *   - Provide specific, meaningful categorization
 *   - Good for retrieval and filtering
 *
 * Tier 2: Architecture pattern tags (use second)
 *   - Describe software architecture patterns
 *   - Useful when domain tags don't apply
 *
 * Tier 3: Low-signal fallback tags (use rarely)
 *   - Generic, often overused
 *   - Should only be used when no specific tags apply
 *   - When half the repo has a tag, it loses meaning
 */
export const TAG_TIERS = {
  /**
   * High-signal domain tags - use these first
   * Specific, meaningful categories that aid retrieval
   */
  HIGH_SIGNAL: [
    // Auth & Identity (high specificity)
    'authentication',
    'authorization',
    'jwt',
    'oauth',
    'session',
    // Data (specific domains)
    'database',
    'orm',
    'migration',
    'sql',
    'nosql',
    'cache',
    // API & Communication (specific protocols)
    'api_endpoint',
    'graphql',
    'rest',
    'grpc',
    'websocket',
    'webhook',
    // Infrastructure (specific concerns)
    'config',
    'env',
    'constants',
    'logging',
    'monitoring',
    'metrics',
    'tracing',
    'error_handling',
    'validation',
    // Testing (specific types)
    'testing',
    'mock',
    'fixture',
    'e2e_test',
    'unit_test',
    // CLI (specific domain)
    'cli',
    // Frontend (specific concerns)
    'component',
    'state',
    'routing',
    'styling',
    // DevOps (specific concerns)
    'build',
    'ci',
    'docker',
    'deployment',
    'infra',
    // Docs & Meta
    'documentation',
    'types',
    'generated',
    'vendor',
    'dependency_manifest',
  ] as const satisfies readonly Tag[],

  /**
   * Architecture pattern tags - use when domain tags don't fit
   * Describe software patterns, still valuable but less specific
   */
  ARCHITECTURE: [
    'model',
    'entity',
    'dto',
    'schema',
    'controller',
    'service',
    'repository',
    'middleware',
    'factory',
    'adapter',
    'query', // data access pattern
    'daemon',
    'worker',
    'queue',
    'server',
    'ui',
    'frontend',
  ] as const satisfies readonly Tag[],

  /**
   * Low-signal fallback tags - use rarely
   * Generic tags that become useless when overused
   * Only use when no specific tags apply
   */
  LOW_SIGNAL: [
    'utility',
    'helper',
    'handler', // often overused when not actually handling events/requests
    'interface', // weak signal on barrel files
    'backend', // too broad for most uses
  ] as const satisfies readonly Tag[],
} as const;

/**
 * Banned tag combinations that add low value
 *
 * These combinations are either redundant or indicate unclear categorization.
 * When detected, the validator suggests removing one or using more specific tags.
 */
export const BANNED_TAG_COMBINATIONS: readonly [Tag, Tag][] = [
  // Redundant combinations
  ['utility', 'helper'], // These mean the same thing
  // Muddy combinations
  ['service', 'handler'], // Usually indicates unclear purpose
  // Overly broad combinations
  ['backend', 'server'], // Server implies backend
  ['frontend', 'ui'], // UI implies frontend
];

/**
 * Tags that should not be used on barrel/index files
 *
 * Barrel files (index.ts, index.js, etc.) that only re-export from other files
 * should not get domain tags just because they re-export those domains.
 */
export const BARREL_FILE_DISCOURAGED_TAGS: readonly Tag[] = [
  'interface', // Common but low-value on barrels
  'utility',
  'helper',
  'service',
  'handler',
];

/**
 * Update strategy thresholds
 *
 * Determines whether to do a delta update or full rebuild based on
 * the number of files changed since the last map.
 *
 * Strategy selection:
 * - files < MIN_DELTA_WITH_VALIDATION: delta update only
 * - files >= MIN_DELTA_WITH_VALIDATION and <= MAX_DELTA_UPDATE: delta update with validation
 * - files > MAX_DELTA_UPDATE: force full rebuild
 */
export const UPDATE_THRESHOLDS = {
  /** Minimum files to trigger validation (delta-only if below this) */
  MIN_DELTA_WITH_VALIDATION: 20,
  /** Maximum files for delta update (full rebuild if above this) */
  MAX_DELTA_UPDATE: 100,

  /**
   * @deprecated Use MIN_DELTA_WITH_VALIDATION instead.
   * Kept for backward compatibility with earlier UPDATE_THRESHOLDS API.
   */
  DELTA_WITH_VALIDATION: 20,
  /**
   * @deprecated Use MAX_DELTA_UPDATE instead.
   * Kept for backward compatibility with earlier UPDATE_THRESHOLDS API.
   */
  FULL_REBUILD: 100,
  /**
   * @deprecated No direct equivalent; use MIN_DELTA_WITH_VALIDATION to
   * calculate delta-only thresholds. Kept for backward compatibility
   * with earlier UPDATE_THRESHOLDS API.
   */
  DELTA_ONLY: 0,
} as const;

/**
 * Maximum number of tags per file
 * Reduced to 3 to improve tag precision and reduce over-tagging
 */
export const MAX_TAGS_PER_FILE = 3;

/**
 * Maximum number of files per Level 3 annotation task
 */
export const MAX_FILES_PER_TASK = 50;

/**
 * Checkpoint directory name (within .repo_map)
 */
export const CHECKPOINT_DIR = '.checkpoint';

/**
 * Checkpoint format version
 */
export const CHECKPOINT_VERSION = '1.0';

/**
 * Checkpoint file names
 */
export const CHECKPOINT_FILES = {
  STATE: 'state.json',
  LEVEL0: 'level0.json',
  LEVEL1: 'level1.json',
  LEVEL2: 'level2.json',
  LEVEL2_5: 'level2_5_task_plan.json',
  LEVEL3_PROGRESS: 'level3_progress.json',
  LEVEL3_TASKS: 'level3_tasks.json',
  LEVEL3_INCREMENTAL: 'level3_annotations.jsonl',
} as const;
