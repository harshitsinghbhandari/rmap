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
| `--resume` | Explicitly resume from checkpoint (error if none exists) |
| `--no-resume` | Ignore checkpoint and start fresh |

#### Examples

**Initial map creation:**
```bash
cd /path/to/your/project
rmap map
```

**Delta update (automatic):**
```bash
# Make some changes to your code
git commit -am "Add new auth feature"

# Run map again - it will automatically do a delta update
rmap map
```

**Check map status:**
```bash
rmap map --status
```

#### Output Files

After running `rmap map`, the `.repo_map/` directory contains:

```
.repo_map/
├── meta.json          # Repository metadata
├── graph.json         # Dependency graph
├── stats.json         # Build statistics
├── validation.json    # Validation results
└── logs/              # Performance & cost metrics
    ├── run-{timestamp}.json  # Detailed metrics for each run
    └── latest.json           # Most recent run metrics
```

---

### rmap get-context

Query the repository map to get relevant context for AI agents.

#### Synopsis

```bash
rmap get-context [options]
```

#### Description

The `get-context` command is designed to provide compact, semantically relevant context to AI coding agents. It queries the map and returns:

1. **Repository overview** (purpose, stack, conventions)
2. **Relevant files** (matching the query)
3. **Blast radius** (files that depend on the relevant files)
4. **Conventions** (project-specific rules and patterns)

**Output is optimized for token efficiency**: typically 450-800 tokens.

#### Options

| Option | Description |
|--------|-------------|
| `--file <path>` | Get context for a specific file |
| `--path <dir>` | Get context for all files in a directory |
| `--limit <n>` | Maximum number of files to return (default: 10) |
| `--json` | Output in JSON format instead of human-readable |

#### Examples

**Get context for a specific file:**
```bash
rmap get-context --file src/auth/jwt.ts
```

Output includes:
- File details (purpose, exports)
- What it imports
- What imports it (blast radius)

**Get context for a directory:**
```bash
rmap get-context --path src/api/
```

Aggregates all files in `src/api/` and shows their relationships.

**Limit output:**
```bash
rmap get-context --path src/db/ --limit 5
```

Returns only the top 5 most relevant files.

**JSON output (for programmatic use):**
```bash
rmap get-context --file src/auth/jwt.ts --json
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

═══ RELEVANT FILES ═══
[Matching files with purpose, exports]

═══ BLAST RADIUS ═══
[Files that import the relevant files]

═══ CONVENTIONS ═══
[Project conventions]
```

**Ranking**:
- Files are ranked by relevance:
  1. Import/export count (central files ranked higher)
  2. File size (smaller files preferred for equal scores)

**Capping**:
- Default: Top 10 files
- If more matches exist: Shows "... and N more"
- Use `--limit` to adjust

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

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | Anthropic API key (required) | - |
| `RMAP_MAX_FILES_PER_TASK` | Max files per Level 3 task | 50 |
| `RMAP_AGENT_SIZE` | Default LLM size (small/medium/large) | small |
| `RMAP_OUTPUT_DIR` | Custom map directory | .repo_map |

---

## Tips & Best Practices

### When to Run `rmap map`

- **Daily**: If actively developing (delta updates are fast)
- **After major changes**: Merges, refactors, new modules
- **Before AI agent tasks**: Ensure agents have up-to-date context

### Query Tips

- **Use directory queries for modules**: `rmap get-context --path src/auth/`
- **Check blast radius before changes**: See what will be affected
- **Use JSON output for scripting**: `--json` flag for programmatic access

### Performance Tips

- **Delta updates**: Commit often, update map regularly (stays fast)
- **Smaller agents**: Use `RMAP_AGENT_SIZE=small` for most repos (faster, cheaper)
- **Rate limiting**: Adjust `RMAP_MAX_FILES_PER_TASK` if hitting API limits
