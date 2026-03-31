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

## Requirements

- **Node.js** >= 20.0.0
- **Git repository** (uses git for change detection)
- **Anthropic API key** (for LLM-based analysis)

## Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=your-api-key-here

# Optional (defaults shown)
RMAP_MAX_FILES_PER_TASK=50  # Max files per annotation task
RMAP_AGENT_SIZE=small       # LLM size: small, medium, large
```

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
- **NPM Package**: https://www.npmjs.com/package/rmap
- **Issues**: https://github.com/yourusername/rmap/issues

## Acknowledgments

Built with:
- [Anthropic Claude](https://www.anthropic.com/) for LLM-powered analysis
- [Commander.js](https://github.com/tj/commander.js) for CLI
- [TypeScript](https://www.typescriptlang.org/) for type safety

---

**Made for AI agents, by developers** 🤖✨
