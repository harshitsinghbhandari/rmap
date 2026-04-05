#!/bin/bash
#
# Task Preview Script
#
# Previews the Level 3 task breakdown based on Level 0 metadata and Level 2 division.
# Shows exact files in each task with LOC statistics.
#
# Usage:
#   ./scripts/preview-tasks.sh [repo-path]
#
# If no repo-path is provided, uses current directory.
#
# Requirements:
#   - Node.js >= 20
#   - tsx (TypeScript executor)
#
# The script will:
# 1. Try to load existing checkpoint data (Level 0 + Level 2)
# 2. If no checkpoint exists, run Level 0 harvester (no LLM needed)
# 3. If Level 2 is missing, show directory groups instead of tasks
#

set -e

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Check if tsx is available
if ! command -v tsx &> /dev/null; then
    echo "Error: tsx is required but not installed."
    echo "Install it with: npm install -g tsx"
    echo "Or run: npx tsx scripts/preview-tasks.ts"
    exit 1
fi

# Run the TypeScript preview script
exec tsx "$SCRIPT_DIR/preview-tasks.ts" "$@"
