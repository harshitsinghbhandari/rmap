/**
 * Default .rmapignore patterns
 *
 * These patterns are used when creating a new .rmapignore file
 * or when no .rmapignore file exists.
 */

export const DEFAULT_RMAPIGNORE = `# Build artifacts
dist/
build/
.next/
.nuxt/
out/

# Dependencies
node_modules/
vendor/

# Logs
*.log
logs/
*.log.*

# OS files
.DS_Store
Thumbs.db

# IDE/Editor
.vscode/
.idea/
*.swp
*.swo

# Lock files (too large, limited semantic value)
pnpm-lock.yaml
package-lock.json
yarn.lock
Cargo.lock

# Generated/compiled files
*.min.js
*.bundle.js
*.map

# Test coverage
coverage/
.nyc_output/

# Temporary files
*.tmp
*.temp
.cache/

# Python
__pycache__/
.pytest_cache/
.mypy_cache/
venv/
.venv/

# Build outputs
target/
bin/
obj/
`;

/**
 * Patterns that should always be ignored regardless of user configuration.
 * These are directories that rmap uses internally.
 */
export const ALWAYS_IGNORE_PATTERNS = ['.git/', '.repo_map/'];
