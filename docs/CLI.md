# CLI Reference

Complete command-line reference for `rmap`.

## Table of Contents

- [Global Options](#global-options)
- [Commands](#commands)
  - [rmap map](#rmap-map)
  - [rmap get-context](#rmap-get-context)
- [Examples](#examples)
- [Exit Codes](#exit-codes)

## Global Options

These options are available for all commands:

```bash
-h, --help     Display help for command
-V, --version  Output the version number
```

## Commands

### rmap map

Build or update the repository map.

#### Synopsis

```bash
rmap map [options]
```

#### Description

The `map` command is the core of `rmap`. It analyzes your codebase and generates a structured semantic map in the `.repo_map/` directory.

**Behavior**:
- If no map exists: Performs a full build (all 5 levels)
- If map exists: Performs a smart delta update based on git changes
- Uses git to detect changed files since last map

#### Options

| Option | Description |
|--------|-------------|
| `--full` | Force a complete rebuild, ignoring existing map |
| `--update` | Explicit delta update (re-analyzes changed files only) |
| `--status` | Show map status without building/updating |

#### Examples

**Initial map creation:**
```bash
cd /path/to/your/project
rmap map
```

Output:
```
🚀 Building repository map...

[Level 0] Scanning files... ████████████████████ 100% (523 files)
[Level 1] Detecting structure... ✓
[Level 2] Dividing work... ✓ (12 tasks)
[Level 3] Annotating files... ████████████████████ 100%
[Level 4] Validating map... ✓ (3 issues auto-fixed)

✨ Map built successfully!
   Files: 523
   Time: 4.2 minutes
   Version: 1
   Location: .repo_map/
```

**Delta update (automatic):**
```bash
# Make some changes to your code
git commit -am "Add new auth feature"

# Run map again - it will automatically do a delta update
rmap map
```

Output:
```
🔄 Updating repository map...

Changed files detected: 8
Strategy: Delta update

[Level 0] Scanning changes... ████████████████████ 100% (8 files)
[Level 3] Re-annotating... ████████████████████ 100%
[Level 4] Validating... ✓

✨ Map updated successfully!
   Files changed: 8
   Time: 23 seconds
   Version: 2 (delta from v1)
```

**Force full rebuild:**
```bash
rmap map --full
```

Use when:
- Map structure is corrupted
- Schema version has changed
- You want to regenerate everything from scratch

**Check map status:**
```bash
rmap map --status
```

Output:
```
Map Status:
-----------
Version: 14 (delta)
Schema: 1.0
Built from: a1b2c3d (3 days ago)
Current HEAD: f5e6d7c (47 commits ahead)
Files changed: 23

Verdict: UPDATE RECOMMENDED

Run 'rmap map' to update.
```

#### Update Strategy

The `map` command automatically chooses the optimal update strategy:

| Files Changed | Strategy | Description |
|---------------|----------|-------------|
| 0 | None | Map is up-to-date |
| 1-19 | Delta | Re-analyze changed files only (~30s) |
| 20-99 | Delta + Validation | Delta update + full validation pass |
| 100+ | Full Rebuild | Complete map regeneration |
| New top-level directory | Full Rebuild | Structure changed significantly |

#### Output Files

After running `rmap map`, the `.repo_map/` directory contains:

```
.repo_map/
├── meta.json          # Repository metadata
├── graph.json         # Dependency graph
├── tags.json          # Tag index
├── stats.json         # Build statistics
└── validation.json    # Validation results
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed file format specifications.

---

### rmap get-context

Query the repository map to get relevant context for AI agents.

#### Synopsis

```bash
rmap get-context [tags...] [options]
```

#### Description

The `get-context` command is designed to provide compact, semantically relevant context to AI coding agents. It queries the map and returns:

1. **Repository overview** (purpose, stack, conventions)
2. **Relevant files** (matching the query)
3. **Blast radius** (files that depend on the relevant files)
4. **Conventions** (project-specific rules and patterns)

**Output is optimized for token efficiency**: typically 450-800 tokens.

#### Arguments

| Argument | Description |
|----------|-------------|
| `tags...` | One or more tags to search for (space-separated) |

#### Options

| Option | Description |
|--------|-------------|
| `--file <path>` | Get context for a specific file |
| `--path <dir>` | Get context for all files in a directory |
| `--limit <n>` | Maximum number of files to return (default: 10) |
| `--json` | Output in JSON format instead of human-readable |

#### Tag Queries

Tags can be:
- **Exact tags** from the taxonomy (e.g., `authentication`, `database`, `api_endpoint`)
- **Aliases** that expand to multiple tags (e.g., `auth` → `[authentication, authorization, jwt, oauth, session]`)

Available aliases:
- `auth` → authentication, authorization, jwt, oauth, session
- `db` → database, orm, query, sql, nosql
- `api` → api_endpoint, rest, graphql, grpc
- `test` → testing, mock, fixture, e2e_test, unit_test
- `devops` → build, ci, docker, deployment, infra

#### Examples

**Query by single tag:**
```bash
rmap get-context authentication
```

**Query by multiple tags (OR logic):**
```bash
rmap get-context auth middleware
```

Finds files tagged with `authentication`, `authorization`, `jwt`, `oauth`, `session`, OR `middleware`.

**Query by tag alias:**
```bash
rmap get-context auth
```

Automatically expands to: `authentication`, `authorization`, `jwt`, `oauth`, `session`

**Get context for a specific file:**
```bash
rmap get-context --file src/auth/jwt.ts
```

Output includes:
- File details (purpose, tags, exports)
- What it imports
- What imports it (blast radius)

**Get context for a directory:**
```bash
rmap get-context --path src/api/
```

Aggregates all files in `src/api/` and shows their relationships.

**Combine tags with file query:**
```bash
rmap get-context auth --file src/middleware/auth.ts
```

Shows authentication-related files AND focuses on the specific middleware file.

**Limit output:**
```bash
rmap get-context database --limit 5
```

Returns only the top 5 most relevant files.

**JSON output (for programmatic use):**
```bash
rmap get-context auth --json
```

Returns structured JSON instead of formatted text:

```json
{
  "repo": {
    "name": "my-app",
    "purpose": "E-commerce API",
    "stack": "TypeScript, Node.js",
    "entrypoints": ["src/server.ts"]
  },
  "files": [
    {
      "path": "src/auth/jwt.ts",
      "purpose": "JWT token generation and validation",
      "tags": ["authentication", "jwt"],
      "exports": ["generateToken", "verifyToken"]
    }
  ],
  "blast_radius": ["src/api/users.ts", "src/server.ts"],
  "conventions": ["All routes use async/await"]
}
```

#### Output Format

**Human-readable format** (default):

```
═══ REPO CONTEXT ═══
[Repository overview]

═══ RELEVANT FILES [tags] ═══
[Matching files with purpose, tags, exports]

═══ BLAST RADIUS ═══
[Files that import the relevant files]

═══ CONVENTIONS ═══
[Project conventions]
```

**Ranking**:
- Files are ranked by relevance:
  1. Tag match count (more matching tags = higher rank)
  2. Import/export count (central files ranked higher)
  3. File size (smaller files preferred for equal scores)

**Capping**:
- Default: Top 10 files
- If more matches exist: Shows "... and N more"
- Use `--limit` to adjust

#### No Results

If no files match your query:

```bash
rmap get-context nonexistent-tag
```

Output:
```
No files found matching: nonexistent-tag

Suggestions:
- Check available tags: rmap get-context --help
- Try related tags: authentication, authorization, api_endpoint
- Check map status: rmap map --status
```

#### Error Handling

**Map doesn't exist:**
```
Error: No map found. Run 'rmap map' first.
```

**Invalid file path:**
```
Error: File not found in map: src/invalid/path.ts

Try:
- Check file path spelling
- Run 'rmap map --update' if file is new
```

**Invalid directory:**
```
Error: Directory not found: src/invalid/

Suggestion: Run 'rmap map --status' to see available paths.
```

---

## Examples

### Workflow: New Feature Development

You're building a new authentication feature and need context:

```bash
# 1. Get authentication-related files
rmap get-context auth

# 2. Check middleware files
rmap get-context middleware

# 3. See what depends on the auth module
rmap get-context --path src/auth/

# 4. After making changes, update the map
rmap map

# 5. Verify your changes are reflected
rmap get-context auth
```

### Workflow: Bug Investigation

You found a bug in `src/api/users.ts`:

```bash
# 1. Get context for the buggy file
rmap get-context --file src/api/users.ts

# 2. See all database-related code
rmap get-context db

# 3. Check what else imports the buggy file (blast radius)
# (Already shown in step 1 output)

# 4. After fixing, update map
rmap map --update
```

### Workflow: Code Review

Reviewing a PR that touches authentication:

```bash
# 1. Check current auth structure
rmap get-context auth

# 2. See all API endpoints
rmap get-context api_endpoint

# 3. Check conventions
rmap map --status
```

### Integration with AI Agents

```bash
# Generate context for an AI agent
CONTEXT=$(rmap get-context auth --json)

# Use with API call (example)
curl -X POST https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "content-type: application/json" \
  -d "{
    \"model\": \"claude-3-5-sonnet-20241022\",
    \"messages\": [{
      \"role\": \"user\",
      \"content\": \"Here's the codebase context: $CONTEXT\n\nNow, help me implement OAuth support.\"
    }]
  }"
```

---

## Exit Codes

`rmap` uses standard exit codes:

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error (missing map, invalid arguments, etc.) |
| 2 | API error (Anthropic API key missing/invalid, rate limit) |
| 3 | File system error (permissions, disk space) |
| 4 | Validation error (map is corrupted or inconsistent) |

### Examples

```bash
# Check if map exists (in scripts)
if rmap map --status > /dev/null 2>&1; then
  echo "Map exists and is valid"
else
  echo "No map found, creating..."
  rmap map
fi

# Handle errors
rmap get-context auth || {
  echo "Query failed. Run 'rmap map' first."
  exit 1
}
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key (required) | - |
| `RMAP_MAX_FILES_PER_TASK` | Max files per Level 3 task | 50 |
| `RMAP_AGENT_SIZE` | Default LLM size (small/medium/large) | small |
| `RMAP_OUTPUT_DIR` | Custom map directory | .repo_map |

### Examples

```bash
# Use larger agent for complex repos
RMAP_AGENT_SIZE=medium rmap map

# Custom output directory
RMAP_OUTPUT_DIR=.my_custom_map rmap map

# Smaller task batches (for rate limiting)
RMAP_MAX_FILES_PER_TASK=25 rmap map
```

---

## Configuration File

Future versions may support a `.rmaprc` or `rmap.config.js` file for persistent configuration. For now, use environment variables or command-line flags.

---

## Getting Help

- **Command help**: `rmap --help` or `rmap map --help`
- **Documentation**: See [README.md](../README.md) and [ARCHITECTURE.md](ARCHITECTURE.md)
- **Issues**: Report bugs at https://github.com/yourusername/rmap/issues
- **Examples**: See [examples/](../examples/)

---

## Tips & Best Practices

### When to Run `rmap map`

- **Daily**: If actively developing (delta updates are fast)
- **After major changes**: Merges, refactors, new modules
- **Before AI agent tasks**: Ensure agents have up-to-date context
- **In CI**: Keep map updated automatically (see GitHub Actions example)

### Query Tips

- **Start broad, narrow down**: `rmap get-context auth` → `rmap get-context auth jwt`
- **Use directory queries for modules**: `rmap get-context --path src/auth/`
- **Check blast radius before changes**: See what will be affected
- **Use JSON output for scripting**: `--json` flag for programmatic access

### Performance Tips

- **Delta updates**: Commit often, update map regularly (stays fast)
- **Full rebuilds**: Reserve for major refactors or corrupted maps
- **Smaller agents**: Use `RMAP_AGENT_SIZE=small` for most repos (faster, cheaper)
- **Rate limiting**: Adjust `RMAP_MAX_FILES_PER_TASK` if hitting API limits

---

## Advanced Usage

### CI/CD Integration

```yaml
# .github/workflows/update-map.yml
name: Update Map

on:
  push:
    branches: [main]

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm install -g rmap
      - run: rmap map --update
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - run: git add .repo_map/
      - run: git commit -m "chore: update repository map [skip ci]"
      - run: git push
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Update map before committing
if command -v rmap &> /dev/null; then
  echo "Updating repository map..."
  rmap map --update
  git add .repo_map/
fi
```

### Custom Queries Script

```bash
#!/bin/bash
# query.sh - Helper script for common queries

case "$1" in
  backend)
    rmap get-context api_endpoint database service
    ;;
  frontend)
    rmap get-context component ui state
    ;;
  tests)
    rmap get-context testing mock
    ;;
  *)
    echo "Usage: ./query.sh [backend|frontend|tests]"
    exit 1
    ;;
esac
```

---

**Next**: [ARCHITECTURE.md](ARCHITECTURE.md) - Learn how rmap works internally
