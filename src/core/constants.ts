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
 * A file can have 1-5 tags maximum.
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
 * Update strategy thresholds
 *
 * Determines whether to do a delta update or full rebuild based on
 * the number of files changed since the last map.
 */
export const UPDATE_THRESHOLDS = {
  /** Below this: delta update only */
  DELTA_ONLY: 20,
  /** Between DELTA_ONLY and FULL_REBUILD: delta update + validation */
  DELTA_WITH_VALIDATION: 100,
  /** Above FULL_REBUILD: force full rebuild */
  FULL_REBUILD: 100,
} as const;

/**
 * Maximum number of tags per file
 */
export const MAX_TAGS_PER_FILE = 5;

/**
 * Maximum number of files per Level 3 annotation task
 */
export const MAX_FILES_PER_TASK = 50;
