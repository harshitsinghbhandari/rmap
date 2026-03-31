# Contributing to rmap

Thank you for your interest in contributing to `rmap`! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Testing](#testing)
- [Code Style](#code-style)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Release Process](#release-process)

## Code of Conduct

This project adheres to a Code of Conduct that all contributors are expected to follow:

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Assume good intentions
- Respect differing viewpoints and experiences

## Getting Started

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** (recommended) or npm
- **Git**
- **Anthropic API key** (for testing LLM features)

### First Contribution?

Look for issues labeled:
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention needed
- `documentation` - Documentation improvements

## Development Setup

1. **Fork and clone**:

```bash
git clone https://github.com/YOUR_USERNAME/rmap.git
cd rmap
```

2. **Install dependencies**:

```bash
pnpm install
```

3. **Set up environment**:

```bash
# Create .env file (optional, for testing)
echo "ANTHROPIC_API_KEY=your-key-here" > .env
```

4. **Build the project**:

```bash
pnpm build
```

5. **Link for local testing**:

```bash
pnpm link --global

# Now you can test with:
rmap --version
```

6. **Run tests**:

```bash
pnpm test
```

## Project Structure

```
rmap/
├── src/
│   ├── cli/              # Command-line interface
│   │   ├── commands/     # Command implementations
│   │   │   ├── map.ts
│   │   │   └── get-context.ts
│   │   └── index.ts      # CLI entry point
│   ├── levels/           # Pipeline levels
│   │   ├── level0/       # Metadata harvester (no LLM)
│   │   ├── level1/       # Structure detector (Haiku)
│   │   ├── level2/       # Work divider (Sonnet)
│   │   ├── level3/       # Deep annotator (Haiku/Sonnet)
│   │   └── level4/       # Validator (mostly script)
│   ├── query/            # Query engine for get-context
│   │   ├── index.ts      # Main orchestrator
│   │   ├── filter.ts     # Tag filtering
│   │   ├── ranking.ts    # Relevance ranking
│   │   └── formatter.ts  # Output formatting
│   ├── coordinator/      # Pipeline orchestration
│   │   ├── index.ts      # Main coordinator
│   │   ├── pipeline.ts   # Level execution
│   │   ├── delta.ts      # Delta update logic
│   │   ├── graph.ts      # Graph building
│   │   └── assembler.ts  # Final assembly
│   ├── core/             # Core types and constants
│   │   ├── types.ts      # TypeScript interfaces
│   │   ├── constants.ts  # Tag taxonomy, thresholds
│   │   └── index.ts
│   ├── index.ts          # Package entry point
│   └── version.ts        # Version info
├── tests/                # Test files (mirrors src/)
│   ├── query/
│   ├── levels/
│   └── coordinator/
├── docs/                 # Documentation
│   ├── CLI.md
│   └── ARCHITECTURE.md
├── examples/             # Example outputs
├── package.json
├── tsconfig.json
├── tsup.config.ts        # Build configuration
└── README.md
```

## Development Workflow

### 1. Create a branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

Branch naming conventions:
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation changes
- `refactor/` - Code refactoring
- `test/` - Test additions/changes
- `chore/` - Maintenance tasks

### 2. Make your changes

Follow the [Code Style](#code-style) guidelines.

### 3. Test your changes

```bash
# Run all tests
pnpm test

# Run specific test
pnpm test tests/query/filter.test.ts

# Type check
pnpm lint

# Build
pnpm build

# Test CLI locally
rmap map --help
```

### 4. Commit your changes

Follow the [Commit Messages](#commit-messages) guidelines.

```bash
git add .
git commit -m "feat: add support for custom tag taxonomies"
```

### 5. Push and create PR

```bash
git push origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## Testing

### Test Structure

Tests are colocated by functionality:

```
tests/
├── query/
│   ├── filter.test.ts
│   ├── ranking.test.ts
│   └── formatter.test.ts
├── levels/
│   ├── level0/
│   │   └── harvester.test.ts
│   ├── level3/
│   │   └── annotator.test.ts
│   └── level4/
│       ├── validator.test.ts
│       ├── checks.test.ts
│       └── autofix.test.ts
└── coordinator/
    ├── graph.test.ts
    └── delta.test.ts
```

### Writing Tests

We use Node.js built-in test runner:

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Tag Filter', () => {
  it('should expand aliases correctly', () => {
    const result = expandAliases(['auth']);
    assert.deepStrictEqual(result, [
      'authentication',
      'authorization',
      'jwt',
      'oauth',
      'session'
    ]);
  });

  it('should handle multiple tags', () => {
    const result = expandAliases(['auth', 'db']);
    assert.ok(result.includes('authentication'));
    assert.ok(result.includes('database'));
  });
});
```

### Test Guidelines

1. **Unit tests**: Test individual functions in isolation
2. **Integration tests**: Test pipeline levels end-to-end
3. **Mock LLM calls**: Use fixtures for LLM responses (don't make real API calls in tests)
4. **Test edge cases**: Empty inputs, missing files, invalid data
5. **Test error handling**: Ensure errors are caught and handled gracefully

### Running Tests

```bash
# All tests
pnpm test

# Specific file
pnpm test tests/query/filter.test.ts

# With coverage (future)
pnpm test:coverage
```

### Test Coverage Goals

- **Query engine**: 90%+ (critical path)
- **Validators**: 90%+ (data integrity)
- **Coordinators**: 80%+
- **CLI commands**: 70%+

## Code Style

### TypeScript Guidelines

1. **Type everything**: Avoid `any`, use proper types
2. **Interfaces over types**: Prefer `interface` for object shapes
3. **Explicit return types**: Always specify function return types
4. **JSDoc comments**: Document public APIs

```typescript
/**
 * Expands tag aliases to their full tag lists
 *
 * @param aliases - Array of tag aliases (e.g., ['auth', 'db'])
 * @returns Array of expanded tags
 *
 * @example
 * ```typescript
 * expandAliases(['auth']); // ['authentication', 'authorization', 'jwt', ...]
 * ```
 */
export function expandAliases(aliases: string[]): Tag[] {
  // Implementation
}
```

### Formatting

- **Indentation**: 2 spaces (no tabs)
- **Line length**: 100 characters max (soft limit)
- **Semicolons**: Use them
- **Quotes**: Single quotes for strings, backticks for templates
- **Trailing commas**: Use them in multi-line arrays/objects

### Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `tag-filter.ts`)
- **Classes**: `PascalCase` (e.g., `FileAnnotator`)
- **Functions**: `camelCase` (e.g., `expandAliases`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `TAG_TAXONOMY`)
- **Interfaces**: `PascalCase` (e.g., `FileAnnotation`)
- **Types**: `PascalCase` (e.g., `ValidationSeverity`)

### Error Handling

Always provide helpful error messages:

```typescript
// Bad
throw new Error('Error');

// Good
throw new Error(
  `File not found in map: ${filePath}\n` +
  `Suggestion: Run 'rmap map --update' if this is a new file.`
);
```

### Async/Await

Prefer `async/await` over callbacks or raw promises:

```typescript
// Bad
fetchData().then(data => processData(data)).catch(err => handleError(err));

// Good
try {
  const data = await fetchData();
  await processData(data);
} catch (err) {
  handleError(err);
}
```

## Commit Messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring (no functional changes)
- `test`: Test additions/changes
- `chore`: Maintenance tasks (deps, build, etc.)
- `perf`: Performance improvements
- `style`: Code style changes (formatting, etc.)

### Examples

**Simple feature:**
```
feat: add support for Go language detection
```

**Bug fix with scope:**
```
fix(query): handle empty tag results gracefully
```

**Breaking change:**
```
feat(api)!: change tag taxonomy structure

BREAKING CHANGE: Tag aliases now require explicit mapping
in .rmaprc instead of using default aliases.

Migration guide: https://...
```

**Documentation:**
```
docs: add CLI examples for get-context command
```

**With issue reference:**
```
fix(validator): detect circular imports correctly

Fixes #123
```

### Commit Message Guidelines

1. **Subject line**:
   - Max 72 characters
   - Imperative mood ("add" not "added")
   - No period at the end
   - Lowercase (except proper nouns)

2. **Body** (optional):
   - Wrap at 72 characters
   - Explain *what* and *why*, not *how*
   - Separate from subject with blank line

3. **Footer** (optional):
   - Reference issues: `Fixes #123`, `Closes #456`
   - Breaking changes: `BREAKING CHANGE: description`

## Pull Request Process

### Before Submitting

- [ ] Tests pass: `pnpm test`
- [ ] Build succeeds: `pnpm build`
- [ ] Types check: `pnpm lint`
- [ ] Code follows style guidelines
- [ ] Commits follow convention
- [ ] Documentation updated (if needed)

### PR Title

Use the same format as commit messages:

```
feat: add support for custom tag taxonomies
fix(query): handle empty results correctly
docs: update CLI reference
```

### PR Description

Use this template:

```markdown
## Description
Brief description of changes

## Motivation
Why is this change needed?

## Changes
- List of changes made
- Bullet points

## Testing
How was this tested?

## Screenshots (if applicable)
[Add screenshots]

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Breaking changes documented
- [ ] Ready for review
```

### Review Process

1. **Automated checks**: CI must pass (tests, build, lint)
2. **Code review**: At least one maintainer approval required
3. **Feedback**: Address review comments or discuss
4. **Squash & merge**: PRs are squashed before merging

### Review Etiquette

**As a reviewer**:
- Be respectful and constructive
- Explain *why* changes are needed
- Approve when ready, request changes when not
- Use "nit" for minor/optional suggestions

**As an author**:
- Be open to feedback
- Ask questions if unclear
- Mark conversations as resolved
- Thank reviewers

## Release Process

(For maintainers)

### Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **Major** (1.0.0 → 2.0.0): Breaking changes
- **Minor** (1.0.0 → 1.1.0): New features (backward compatible)
- **Patch** (1.0.0 → 1.0.1): Bug fixes

### Release Steps

1. **Update version**:

```bash
# Patch release
npm version patch

# Minor release
npm version minor

# Major release
npm version major
```

2. **Update CHANGELOG.md**:

Document all changes since last release.

3. **Create release tag**:

```bash
git tag v1.2.3
git push origin v1.2.3
```

4. **GitHub Actions**: Automatically builds and publishes to npm

5. **Create GitHub Release**:

- Go to GitHub Releases
- Create release from tag
- Copy changelog entry
- Publish

## Common Tasks

### Adding a new tag

1. Edit `src/core/constants.ts`:

```typescript
export const TAG_TAXONOMY = [
  // ...existing tags
  'new_tag',
] as const;
```

2. Update docs: `docs/ARCHITECTURE.md` (tag taxonomy section)
3. Add tests: Ensure tag filtering works
4. Update README if it's a major addition

### Adding a new CLI command

1. Create `src/cli/commands/your-command.ts`:

```typescript
import { Command } from 'commander';

export function createYourCommand(): Command {
  return new Command('your-command')
    .description('Your command description')
    .action(async () => {
      // Implementation
    });
}
```

2. Register in `src/cli/commands/index.ts`:

```typescript
export { createYourCommand } from './your-command.js';
```

3. Add to CLI in `src/cli/index.ts`:

```typescript
import { createYourCommand } from './commands/index.js';

program.addCommand(createYourCommand());
```

4. Add tests: `tests/cli/commands/your-command.test.ts`
5. Document in `docs/CLI.md`

### Modifying file formats

1. **Check compatibility**: Will this break existing maps?
2. **Bump schema version** if breaking: `SCHEMA_VERSION` in `constants.ts`
3. **Add migration logic**: Handle old format → new format
4. **Update types**: `src/core/types.ts`
5. **Update tests**: Ensure validation catches issues
6. **Document**: Update `docs/ARCHITECTURE.md` (file formats section)

## Getting Help

- **Questions**: Open a [Discussion](https://github.com/yourusername/rmap/discussions)
- **Bugs**: Open an [Issue](https://github.com/yourusername/rmap/issues)
- **Chat**: Join our [Discord](#) (if available)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to `rmap`! 🎉
