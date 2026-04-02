# rmap

A semantic repository map builder for coding agents.

[![npm version](https://badge.fury.io/js/rmap.svg)](https://www.npmjs.com/package/rmap)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/rmap.svg)](https://nodejs.org)

## Overview

`rmap` generates structured, queryable maps of codebases to provide context-aware file selection and dependency understanding. It helps AI coding agents understand project structure, conventions, and relationships without needing to read entire codebases.

### Why rmap?

Modern coding agents need context to make informed decisions. Reading an entire codebase is:
- **Expensive**: Thousands of tokens per file
- **Slow**: API rate limits and latency
- **Inefficient**: Most files are irrelevant to the task at hand

`rmap` solves this by creating a semantic map that allows agents to:
- Find relevant files by **semantic tags** (e.g., "auth", "database", "api")
- Understand **dependency relationships** (what imports what)
- Learn **project conventions** automatically
- Get **focused context** in 450-800 tokens instead of thousands

## Installation

```bash
npm install -g rmap
```

Or with pnpm:

```bash
pnpm add -g rmap
```

## Quick Start

1. **Set up your API key** (required for LLM-based analysis):

```bash
export ANTHROPIC_API_KEY=your-api-key-here
```

2. **Build your repository map**:

```bash
cd /path/to/your/project
rmap map
```

This will create a `.repo_map/` directory with structured metadata about your codebase.

3. **Query the map**:

```bash
# Find authentication-related files
rmap get-context auth

# Find files by multiple tags
rmap get-context auth middleware

# Get context for a specific file
rmap get-context --file src/db/users.py

# Get context for a directory
rmap get-context --path src/auth/
```

## Usage

### Building a Repository Map

```bash
# Create or update map (automatic delta update if map exists)
rmap map

# Force full rebuild (ignores existing map)
rmap map --full

# Check map status (shows age, staleness, files changed)
rmap map --status

# Update based on git changes (explicit delta update)
rmap map --update
```

### Debugging with Prompt Logging

For debugging or understanding how `rmap` analyzes your code, you can log the exact prompts and responses sent to/from Claude:

```bash
# Log only prompts (what rmap sends to Claude)
rmap map --log-prompts

# Log only responses (what Claude returns)
rmap map --log-response

# Log both prompts and responses
rmap map --log-prompts --log-response
```

**⚠️  Warning**: These logs can become very large (multiple MB) and may contain sensitive code information. You'll see a warning with a 5-second delay before the process starts.

Logs are saved to `.repo_map/prompts/` organized by level:
- `level1_YYYY-MM-DDTHH-mm-ss.jsonl` - Repository structure detection
- `level2_YYYY-MM-DDTHH-mm-ss.jsonl` - Work division
- `level3_YYYY-MM-DDTHH-mm-ss.jsonl` - File annotations

Each log entry includes:
- `timestamp` - When the prompt was sent
- `level` - Which analysis level (level1, level2, level3)
- `purpose` - What the prompt is for
- `model` - Which Claude model was used
- `prompt` - The full prompt text (if `--log-prompts` enabled)
- `response` - The full response text (if `--log-response` enabled)
- `inputTokens` / `outputTokens` - Token usage

### Querying the Map

The `get-context` command is designed to provide compact, relevant context for AI agents:

```bash
# Query by tags (space-separated)
rmap get-context auth middleware
rmap get-context database orm

# Query by specific file (shows dependencies and dependents)
rmap get-context --file src/auth/jwt.ts

# Query by directory (aggregates all files in directory)
rmap get-context --path src/api/

# Combine tags with file/path queries
rmap get-context auth --file src/middleware/auth.ts
```

### Example Output

When you run `rmap get-context auth`, you get output like this:

```
═══ REPO CONTEXT ═══
Project: my-app
Purpose: E-commerce API with user authentication
Stack: TypeScript, Node.js, Express, PostgreSQL
Entry Points: src/server.ts, src/cli.ts

Structure:
- src/auth/ - Authentication and authorization
- src/db/ - Database models and migrations
- src/api/ - REST API endpoints
- src/utils/ - Shared utilities

═══ RELEVANT FILES [auth] ═══

src/auth/jwt.ts (authentication, jwt)
Purpose: JWT token generation and validation
Exports: generateToken, verifyToken, TokenPayload

src/auth/middleware.ts (authentication, middleware)
Purpose: Express middleware for route protection
Exports: requireAuth, optionalAuth

src/auth/session.ts (authentication, session)
Purpose: Session management and storage
Exports: SessionStore, createSession, destroySession

═══ BLAST RADIUS ═══

Files that import the above:
- src/api/users.ts
- src/api/admin.ts
- src/server.ts
... and 5 more

═══ CONVENTIONS ═══
- All API routes use async/await with error boundaries
- Database queries use transaction wrappers
- Tests colocated with source files (*. test.ts)
```

**Token count**: ~650 tokens (fits comfortably in agent context)

## How It Works

`rmap` uses a 5-level pipeline to build semantic maps:

| Level | Name | Purpose | Uses LLM |
|-------|------|---------|----------|
| **Level 0** | Metadata Harvester | Fast file scanning, extract imports | No |
| **Level 1** | Structure Detector | Identify entry points, modules, conventions | Yes (Haiku) |
| **Level 2** | Work Divider | Divide annotation work into tasks | Yes (Sonnet) |
| **Level 3** | Deep Annotator | Semantic file analysis (purpose, tags, exports) | Yes (Haiku/Sonnet) |
| **Level 4** | Validator | Consistency checks and auto-fixing | Mostly No |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture information.

## Output Structure

`rmap` creates a `.repo_map/` directory containing:

### Core Files

- **`meta.json`** - Repository metadata, entry points, modules, and conventions
- **`graph.json`** - Import/dependency graph (bidirectional)
- **`tags.json`** - Tag index for fast lookups
- **`stats.json`** - Build statistics (time, agents used, files processed)
- **`validation.json`** - Consistency check results

### File Structure Example

```
.repo_map/
├── meta.json          # High-level project info
├── graph.json         # Dependency graph
├── tags.json          # Tag index
├── stats.json         # Build metrics
└── validation.json    # Validation results
```

## Features

### 🚀 Fast Delta Updates

Only re-processes files that changed since the last build:

| Files Changed | Strategy |
|---------------|----------|
| < 20 files | Delta update (~30 seconds) |
| 20-100 files | Delta + re-validation |
| > 100 files | Full rebuild |

### 🏷️ Tag-Based Search

Files are annotated with semantic tags from a predefined taxonomy:

- **Auth**: authentication, authorization, jwt, oauth, session
- **Data**: database, orm, query, migration, sql, nosql, cache
- **API**: api_endpoint, rest, graphql, grpc, websocket
- **Architecture**: controller, service, repository, middleware, handler
- **Testing**: testing, mock, fixture, e2e_test, unit_test

See full taxonomy in [src/core/constants.ts](src/core/constants.ts)

### 🔗 Dependency Tracking

Understands import relationships:
- What a file imports
- What imports a file (reverse dependencies)
- Blast radius analysis for changes

### 📋 Convention Detection

Automatically identifies:
- Project structure and modules
- Entry points
- Coding conventions
- Configuration patterns

### 🌍 Multi-Language Support

Works with:
- JavaScript / TypeScript
- Python
- Go
- Java
- Ruby
- Rust
- And more...

### 📊 Performance & Cost Tracking

Automatically logs detailed metrics for every map build:
- **Token usage** - Input/output tokens per level and total
- **Cost estimation** - Real-time cost tracking based on model pricing
- **Performance metrics** - Per-level timing and API call counts
- **Log files** - Detailed JSON logs in `.repo_map/logs/` for analysis

Example output:
```
Map created successfully (2m 34s)
  Files: 523 processed
  Tokens: 68,450 (input: 54,200, output: 14,250)
  Cost: $0.16
  Log: .repo_map/logs/run-2026-04-01T15-30-22.json
```

## Requirements

- **Node.js** >= 20.0.0
- **Git repository** (uses git for change detection)
- **Anthropic API key** (for LLM-based analysis)

## Environment Variables

### Required

```bash
ANTHROPIC_API_KEY=your-api-key-here
```

### Optional

`rmap` supports many configuration options via `RMAP_*` environment variables:

```bash
# Concurrency
RMAP_CONCURRENCY=10              # Max concurrent annotations (default: 10)
RMAP_TASK_DELAY=100              # Delay between tasks in ms (default: 100)

# Delta updates
RMAP_DELTA_MIN_VALIDATION=20     # Min files for validation (default: 20)
RMAP_DELTA_MAX_UPDATE=100        # Max files for delta update (default: 100)

# File processing
RMAP_FILE_MAX_LINE_COUNT=10000   # Skip files exceeding this (default: 10000)
RMAP_FILE_MAX_PER_TASK=50        # Max files per task (default: 50)

# Retry behavior
RMAP_RETRY_MAX=5                 # Max retry attempts (default: 5)
RMAP_RETRY_BASE_BACKOFF_MS=2000  # Base backoff in ms (default: 2000)

# And many more...
```

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for complete configuration reference with all available options, defaults, and tuning guidance.

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/rmap.git
cd rmap

# Install dependencies
pnpm install

# Build the project
pnpm build

# Link for local testing
pnpm link --global
```

### Development Commands

```bash
# Build (production)
pnpm build

# Run in development mode
pnpm dev map --help

# Run tests
pnpm test

# Type check
pnpm lint
```

### Project Structure

```
rmap/
├── src/
│   ├── cli/              # Command-line interface
│   │   ├── commands/     # Command implementations
│   │   └── index.ts      # CLI entry point
│   ├── levels/           # Pipeline levels 0-4
│   │   ├── level0/       # Metadata harvester
│   │   ├── level1/       # Structure detector
│   │   ├── level2/       # Work divider
│   │   ├── level3/       # Deep annotator
│   │   └── level4/       # Validator
│   ├── query/            # Query engine for get-context
│   ├── coordinator/      # Pipeline orchestration
│   └── core/             # Types, constants, shared code
├── tests/                # Test files
├── examples/             # Example outputs
└── docs/                 # Documentation
```

## Testing

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test tests/query/filter.test.ts
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on writing tests.

## CI/CD

GitHub Actions workflows:
- **Test**: Runs on every push and PR
- **Publish**: Automatically publishes to npm on release tags

## Roadmap

- [ ] Support for more VCS systems (beyond Git)
- [ ] Incremental graph updates (optimize large repos)
- [ ] Custom tag taxonomies
- [ ] Web UI for exploring maps
- [ ] VS Code extension
- [ ] Support for additional LLM providers (OpenAI, Cohere, etc.)

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Development setup
- Code style guidelines
- Testing requirements
- PR submission process

## License

MIT - See [LICENSE](LICENSE) for details

## Links

- **Documentation**: [docs/](docs/)
- **CLI Reference**: [docs/CLI.md](docs/CLI.md)
- **Architecture**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Configuration**: [docs/CONFIGURATION.md](docs/CONFIGURATION.md)
- **NPM Package**: https://www.npmjs.com/package/rmap
- **Issues**: https://github.com/harshitsinghbhandari/rmap/issues

## Acknowledgments

Built with:
- [Anthropic Claude](https://www.anthropic.com/) for LLM-powered analysis
- [Commander.js](https://github.com/tj/commander.js) for CLI
- [TypeScript](https://www.typescriptlang.org/) for type safety

---

**Made for AI agents, by developers** 🤖✨
