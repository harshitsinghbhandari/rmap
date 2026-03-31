# rmap

A semantic repository map builder for coding agents.

## Overview

`rmap` generates structured, queryable maps of codebases to provide context-aware file selection and dependency understanding. It helps AI coding agents understand project structure, conventions, and relationships without needing to read entire codebases.

## Installation

```bash
npm install -g rmap
# or
pnpm add -g rmap
```

## Usage

### Building a Repository Map

```bash
# Create or update map (delta update if map exists)
rmap map

# Force full rebuild
rmap map --full

# Check map status
rmap map --status

# Update based on git changes
rmap map --update
```

### Querying the Map

```bash
# Query by tags
rmap get-context auth middleware

# Query by file
rmap get-context --file src/db/users.py

# Query by directory
rmap get-context --path src/auth/
```

## Output Structure

`rmap` creates a `.repo_map/` directory containing:

- `meta.json` - Repository metadata, entry points, and conventions
- `graph.json` - Import/dependency graph
- `tags.json` - Searchable tag index
- `stats.json` - Build statistics
- `validation.json` - Consistency check results

## Features

- **Fast Delta Updates**: Only re-processes changed files
- **Tag-Based Search**: Find files by semantic tags
- **Dependency Tracking**: Understand import relationships and blast radius
- **Convention Detection**: Automatically identifies project patterns
- **Multi-Language Support**: Works with JavaScript, TypeScript, Python, Go, and more

## Requirements

- Node.js >= 20.0.0
- Git repository
- Anthropic API key (for LLM-based analysis)

## Environment Variables

```bash
ANTHROPIC_API_KEY=your-api-key-here
```

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run in development mode
pnpm dev map --help

# Run tests
pnpm test

# Type check
pnpm lint
```

## License

MIT

## Contributing

Contributions are welcome! Please read the contributing guidelines before submitting PRs.
