# Runtime Validation Layer

The runtime validation layer provides configuration consistency checks to ensure robust operation of rmap.

## Overview

The validation module (`src/core/validation.ts`) validates:

- **Tag Taxonomy**: Ensures no duplicates, valid format (lowercase/snake_case)
- **Threshold Ordering**: Validates `UPDATE_THRESHOLDS` ordering constraints
- **Retry Configuration**: Checks ranges and backoff settings
- **Configuration Consistency**: Validates all config sections for type safety and logical constraints

## Usage

### Automatic Validation

Configuration is automatically validated when the `config` module is imported:

```typescript
import { CONFIG } from './config/index.js';
// Validation runs automatically on import
```

### Manual Validation

You can also run validation manually:

```typescript
import {
  validateConfig,
  validateTagTaxonomy,
  validateThresholds,
  validateFileTags,
  validateAll,
} from './core/validation.js';

// Validate complete configuration
validateConfig(CONFIG);

// Validate specific components
validateTagTaxonomy();
validateThresholds();

// Validate file tags
validateFileTags(['authentication', 'database']);

// Run all validations
validateAll();
```

## Validation Rules

### Tag Taxonomy

- No duplicate tags
- Tags must be lowercase or snake_case (e.g., `api_endpoint`)
- No empty tags
- No leading/trailing underscores
- No consecutive underscores

### Thresholds

- `MIN_DELTA_WITH_VALIDATION` < `MAX_DELTA_UPDATE`
- All values must be positive integers

### Retry Configuration

- `MAX_RETRIES` ≥ 0
- `BASE_BACKOFF_MS` ≤ `MAX_BACKOFF_MS`
- `BASE_BACKOFF_MS` > 0
- `MAX_BACKOFF_MS` > 0

### Validation Configuration

- `MAX_DEVIATION_PERCENT`: 1-100
- `TASK_IMBALANCE_LOW_MULTIPLIER` < `TASK_IMBALANCE_HIGH_MULTIPLIER`
- All threshold values must be positive

### File Configuration

- `TRUNCATION_FIRST_PART_RATIO`: 0.1-0.9
- `MAX_TAGS_PER_FILE`: 1-20
- All limits must be positive

## Error Handling

Validation errors throw `ConfigValidationError` with descriptive messages:

```typescript
try {
  validateConfig(invalidConfig);
} catch (error) {
  if (error instanceof ConfigValidationError) {
    console.error(error.message);
    // Example: "Configuration validation failed: MAX_RETRIES: MAX_RETRIES must be non-negative"
  }
}
```

## Implementation Details

- Uses [Zod](https://github.com/colinhacks/zod) for schema validation
- Validates on module load in non-test environments
- Logs warnings instead of crashing for graceful degradation
- All functions throw descriptive errors for invalid configurations

## Testing

Comprehensive tests are in `tests/core/validation.test.ts`:

```bash
# Run validation tests only
tsx --test tests/core/validation.test.ts

# Run all tests
pnpm test
```

## Environment Variables

Validation respects environment variable overrides. See [CONFIGURATION.md](./CONFIGURATION.md) for details on configuring rmap via environment variables.

## Related

- [Configuration Documentation](./CONFIGURATION.md)
- [Architecture](./ARCHITECTURE.md)
- [Core Constants](../src/core/constants.ts)
- [Default Configuration](../src/config/defaults.ts)
