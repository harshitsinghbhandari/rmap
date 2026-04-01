# Developer Testing Guide

This guide explains how to test rmap before publishing to npm.

---

## 1. Install Dependencies

```bash
pnpm install
```

---

## 2. Run Unit Tests

```bash
# Run all tests
pnpm test

# Run lint/typecheck
pnpm lint
```

---

## 3. Build the Package

```bash
# Build to dist/
pnpm build

# Verify dist/ was created
ls -la dist/
```

---

## 4. Test CLI Locally

### Option A: Link globally (recommended)

```bash
pnpm link --global

# Now you can use rmap anywhere
rmap --help
rmap map --status
```

### Option B: Run directly via tsx

```bash
pnpm dev --help
pnpm dev map --status
```

---

## 5. Test on a Real Repository

```bash
# Set your API key (required for LLM-based levels)
export ANTHROPIC_API_KEY=your-key-here

# Navigate to any repository
cd /path/to/some/project

# Build the map
rmap map

# Query the map
rmap get-context auth
rmap get-context --file src/index.ts
rmap get-context --path src/
```

---

## 6. Test Package as if Published

```bash
# Create a tarball (simulates npm pack)
pnpm pack

# Install it in another location to test
cd /tmp
npm install /path/to/rmap-1.0.0.tgz

# Test the installed package
npx rmap --help
```

---

## 7. Dry Run Publish

```bash
# See what would be published without actually publishing
npm publish --dry-run
```

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `pnpm install` | Install dependencies |
| `pnpm lint` | Run TypeScript typecheck |
| `pnpm test` | Run all unit tests |
| `pnpm build` | Build to dist/ |
| `pnpm link --global` | Link CLI globally for testing |
| `pnpm dev` | Run CLI directly via tsx |
| `pnpm pack` | Create npm tarball |
| `npm publish --dry-run` | Preview publish without publishing |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes (for map building) | API key for Claude LLM calls |

---

## Checklist Before Publishing

- [ ] `pnpm install` completes without errors
- [ ] `pnpm lint` passes (no type errors)
- [ ] `pnpm test` passes (all tests green)
- [ ] `pnpm build` creates dist/ successfully
- [ ] `rmap --help` works after linking
- [ ] `rmap map` works on a test repository
- [ ] `rmap get-context` returns expected output
- [ ] `npm publish --dry-run` shows correct files
