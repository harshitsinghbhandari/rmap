# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Prompt and Response Logging**
  - `--log-prompts` flag to log all prompts sent to Claude API
  - `--log-response` flag to log all responses from Claude API
  - Logs saved to `.repo_map/prompts/` directory in JSONL format
  - Level-wise organization (level1, level2, level3)
  - Each log entry includes timestamp, level, purpose, model, token counts
  - Warning message with 5-second delay to prevent accidental large logs
  - Useful for debugging, understanding LLM behavior, and transparency

- **Modern Terminal UI** (#64)
  - Progress tracking with visual indicators
  - Disabled in test environments for clean CI output

- **File Exclusion Support** (#74)
  - `.rmapignore` file support to exclude files from annotation
  - Follows similar patterns to `.gitignore`

- **Incremental Checkpoints** (#75)
  - Incremental checkpoint updates for Level 3 annotations
  - Enables graceful shutdown and resume during long builds

- **Tag Validation** (#65)
  - Validate LLM tag output against taxonomy
  - Automatic retry on invalid tags with configurable retries

- **Global Rate Limiter** (#61)
  - Centralized rate limiting for all API calls
  - Prevents hitting API limits during parallel processing

- **Runtime Validation Layer** (#59)
  - Schema validation for API responses
  - Runtime type checking for critical data structures

- **Comprehensive Test Suite** (#70, #85)
  - Integration and schema validation tests
  - Core, coordinator, and level tests
  - Comprehensive config module tests
  - CI workflow fixes and improvements

### Changed

- **Improved Rate Limit Handling** (#77)
  - Increased rate limit defaults
  - Smarter 429 retry logic with exponential backoff

- **Better Tag Assignment** (#69)
  - Improved tag assignment precision
  - Reduced over-tagging for cleaner results

- **Enhanced Output Formatting** (#70)
  - Improved `get-context` output formatting and display quality
  - Added MAX_DISPLAY_TAGS to OUTPUT config

- **Compressed Level 3 Logs** (#83, #84)
  - Single rolling progress view for Level 3 task logs
  - Cleaner console output during builds

- **Standardized Error Handling** (#57)
  - Consistent error handling patterns across codebase
  - Better error messages and stack traces

### Fixed

- **Dependency Graph Accuracy** (#71)
  - Use Level 0 raw_imports for dependency graph instead of LLM extraction
  - More accurate import/export relationships

- **TypeScript Parser Types** (#62)
  - Added proper TypeScript types to Babel AST path parameters
  - Fixed type safety in parser module

- **CI Workflow Issues** (#70)
  - Resolved CI workflow issues identified in test audit

## [0.1.0] - 2025-04-01

### Added

- **Core Features**
  - 5-level pipeline architecture (Level 0-4) for building semantic repository maps
  - Level 0: Metadata harvester - fast file scanning and import extraction
  - Level 1: Structure detector - LLM-powered repository analysis
  - Level 2: Work divider - intelligent task delegation for parallel processing
  - Level 3: Deep annotator - semantic file analysis with purpose, tags, and exports
  - Level 4: Validator - consistency checks and auto-fixing
  - Delta update system - smart incremental updates based on git changes
  - Tag-based query engine for finding relevant files
  - Bidirectional dependency graph tracking
  - Multi-language support (JavaScript/TypeScript, Python, Go, Java, Ruby, Rust, and more)

- **CLI Commands**
  - `rmap map` - Build or update repository map
    - `--full` - Force full rebuild
    - `--update` - Explicit delta update
    - `--status` - Check map status
  - `rmap get-context` - Query the map for relevant files
    - Tag-based queries
    - File-specific queries with `--file`
    - Directory queries with `--path`

- **Configuration**
  - Comprehensive environment variable support via `RMAP_*` prefix
  - Configurable concurrency, retry behavior, validation thresholds
  - Token limits and file processing thresholds
  - Scoring weights for query ranking
  - See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for full reference

- **Documentation**
  - Comprehensive README with quick start, usage examples, and feature overview
  - Detailed architecture documentation in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
  - Complete configuration reference in [docs/CONFIGURATION.md](docs/CONFIGURATION.md)
  - CLI reference in [docs/CLI.md](docs/CLI.md)
  - Contributing guidelines in [CONTRIBUTING.md](CONTRIBUTING.md)

- **Output Structure**
  - `.repo_map/` directory with structured JSON files
  - `meta.json` - Repository metadata, conventions, modules
  - `graph.json` - Bidirectional dependency graph
  - `tags.json` - Tag index for fast lookups
  - `stats.json` - Build statistics and metrics
  - `validation.json` - Consistency check results

- **Performance Optimizations**
  - Parallel Level 3 annotation processing (configurable concurrency)
  - Delta updates for changed files only
  - Smart retry with exponential backoff
  - Rate limit handling and request delays
  - Checkpoint system for graceful shutdown and resume

### Features Highlights

- **Fast Delta Updates**: Only re-processes changed files (< 30 seconds for < 20 files)
- **Tag-Based Search**: Semantic tags from predefined taxonomy
- **Blast Radius Analysis**: Understand impact of changes via dependency tracking
- **Convention Detection**: Automatically identifies project patterns and conventions
- **Token Efficient**: Query output optimized for LLM context (450-800 tokens typical)

### Technical Details

- **Models Used**:
  - Level 1: Claude Haiku 4.5 (fast structure detection)
  - Level 2: Claude Sonnet 4.5 (intelligent work division)
  - Level 3: Claude Haiku/Sonnet (chosen dynamically based on complexity)

- **Build Performance** (500-file repo):
  - Full build: 4-5 minutes
  - Delta update (< 20 files): ~30 seconds
  - Query time: < 100ms (no LLM needed)

- **Requirements**:
  - Node.js >= 20.0.0
  - Git repository
  - Anthropic API key

### Developer Experience

- TypeScript-first with full type safety
- Built with `tsup` for optimal bundling
- Node.js built-in test runner
- Comprehensive test coverage for query engine and validators
- Clean separation of concerns (levels, coordinator, query engine)

## [Unreleased]

### Planned

- Support for additional VCS systems (beyond Git)
- Custom tag taxonomies
- Web UI for exploring maps
- VS Code extension
- Support for additional LLM providers (OpenAI, Cohere)
- Incremental graph updates for large repositories

---

[0.1.0]: https://github.com/harshitsinghbhandari/rmap/releases/tag/v0.1.0
