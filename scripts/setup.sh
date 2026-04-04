#!/usr/bin/env bash
#
# rmap - Build from Source Setup Script
#
# This script automates the full build-from-source pipeline for developers
# who have cloned the rmap repository.
#
# Usage:
#   bash scripts/setup.sh [options]
#
# Options:
#   --help, -h       Show this help message
#   --skip-tests     Skip running tests after build
#   --skip-link      Skip global linking step
#   --verbose, -v    Show verbose output
#

set -euo pipefail

# ============================================================================
# Configuration
# ============================================================================

REQUIRED_NODE_VERSION="20"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output (disabled if not a terminal)
if [[ -t 1 ]]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    BOLD='\033[1m'
    NC='\033[0m' # No Color
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    BOLD=''
    NC=''
fi

# ============================================================================
# Default options
# ============================================================================

SKIP_TESTS=false
SKIP_LINK=false
VERBOSE=false

# ============================================================================
# Helper Functions
# ============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}${BOLD}==> $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "  $1"
}

die() {
    print_error "$1"
    exit 1
}

show_help() {
    cat << EOF
rmap - Build from Source Setup Script

USAGE:
    bash scripts/setup.sh [OPTIONS]

DESCRIPTION:
    This script automates the full build-from-source pipeline for developers
    who have cloned the rmap repository. It checks prerequisites, installs
    dependencies, builds the project, and verifies the build works.

OPTIONS:
    -h, --help       Show this help message and exit
    --skip-tests     Skip running tests after build
    --skip-link      Skip global linking step (pnpm link --global)
    -v, --verbose    Show verbose output

REQUIREMENTS:
    - Node.js >= 20.0.0
    - pnpm (will offer to install if missing)
    - Git (for change detection features)

EXAMPLES:
    # Full setup with tests and linking
    bash scripts/setup.sh

    # Quick setup without tests
    bash scripts/setup.sh --skip-tests

    # Setup without global linking
    bash scripts/setup.sh --skip-link

    # Show detailed output
    bash scripts/setup.sh --verbose

WHAT THIS SCRIPT DOES:
    1. Checks for required tools (Node.js, pnpm)
    2. Installs project dependencies (pnpm install)
    3. Runs type checking (pnpm lint)
    4. Builds the project (pnpm build)
    5. Runs tests (pnpm test) - unless --skip-tests
    6. Links globally (pnpm link --global) - unless --skip-link
    7. Runs a smoke test to verify the CLI works

AFTER SETUP:
    You can use rmap in development mode:
        pnpm dev map --help

    Or if globally linked:
        rmap --help

EOF
    exit 0
}

# ============================================================================
# Argument Parsing
# ============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            -h|--help)
                show_help
                ;;
            --skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            --skip-link)
                SKIP_LINK=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            *)
                die "Unknown option: $1. Use --help for usage information."
                ;;
        esac
    done
}

# ============================================================================
# Prerequisite Checks
# ============================================================================

check_node() {
    print_header "Checking Node.js"

    if ! command -v node &> /dev/null; then
        die "Node.js is not installed. Please install Node.js >= $REQUIRED_NODE_VERSION from https://nodejs.org/"
    fi

    local node_version
    node_version=$(node --version | sed 's/v//')
    local major_version
    major_version=$(echo "$node_version" | cut -d. -f1)

    if [[ "$major_version" -lt "$REQUIRED_NODE_VERSION" ]]; then
        die "Node.js version $node_version is too old. Required: >= $REQUIRED_NODE_VERSION.0.0"
    fi

    print_success "Node.js v$node_version found"
}

check_pnpm() {
    print_header "Checking pnpm"

    if ! command -v pnpm &> /dev/null; then
        print_warning "pnpm is not installed"
        echo ""
        echo "pnpm is the required package manager for this project."
        echo "Would you like to install it now using npm?"
        echo ""
        read -p "Install pnpm? [Y/n] " -n 1 -r
        echo ""

        if [[ $REPLY =~ ^[Nn]$ ]]; then
            die "pnpm is required. Install it with: npm install -g pnpm"
        fi

        print_info "Installing pnpm..."
        npm install -g pnpm || die "Failed to install pnpm"
        print_success "pnpm installed successfully"
    else
        local pnpm_version
        pnpm_version=$(pnpm --version)
        print_success "pnpm v$pnpm_version found"
    fi
}

check_git() {
    print_header "Checking Git"

    if ! command -v git &> /dev/null; then
        print_warning "Git is not installed. Some rmap features (change detection) may not work."
    else
        local git_version
        git_version=$(git --version | sed 's/git version //')
        print_success "Git $git_version found"
    fi
}

check_directory() {
    print_header "Checking project directory"

    if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
        die "package.json not found. Are you running this from the rmap repository?"
    fi

    print_success "Project root: $PROJECT_ROOT"
}

# ============================================================================
# Build Steps
# ============================================================================

install_dependencies() {
    print_header "Installing dependencies"

    cd "$PROJECT_ROOT"

    if [[ "$VERBOSE" == true ]]; then
        pnpm install || die "Failed to install dependencies"
    else
        pnpm install --reporter=silent || die "Failed to install dependencies"
    fi

    print_success "Dependencies installed"
}

run_typecheck() {
    print_header "Running type check"

    cd "$PROJECT_ROOT"

    if [[ "$VERBOSE" == true ]]; then
        pnpm lint || die "Type check failed"
    else
        pnpm lint 2>&1 | tail -5 || die "Type check failed"
    fi

    print_success "Type check passed"
}

build_project() {
    print_header "Building project"

    cd "$PROJECT_ROOT"

    if [[ "$VERBOSE" == true ]]; then
        pnpm build || die "Build failed"
    else
        pnpm build 2>&1 | grep -E "(CLI|DTS|ESM|Build|error)" || true
        # Check if build was successful
        if [[ ! -d "$PROJECT_ROOT/dist" ]]; then
            die "Build failed - dist directory not created"
        fi
    fi

    print_success "Build completed"
    print_info "Output: $PROJECT_ROOT/dist/"
}

run_tests() {
    if [[ "$SKIP_TESTS" == true ]]; then
        print_header "Skipping tests (--skip-tests)"
        return
    fi

    print_header "Running tests"

    cd "$PROJECT_ROOT"

    if [[ "$VERBOSE" == true ]]; then
        pnpm test || die "Tests failed"
    else
        if pnpm test 2>&1 | tail -20; then
            :
        else
            die "Tests failed"
        fi
    fi

    print_success "All tests passed"
}

link_globally() {
    if [[ "$SKIP_LINK" == true ]]; then
        print_header "Skipping global link (--skip-link)"
        return
    fi

    print_header "Linking globally"

    cd "$PROJECT_ROOT"

    if [[ "$VERBOSE" == true ]]; then
        pnpm link --global || die "Failed to link globally"
    else
        pnpm link --global 2>&1 | tail -3 || die "Failed to link globally"
    fi

    print_success "Linked globally - 'rmap' command is now available"
}

run_smoke_test() {
    print_header "Running smoke test"

    cd "$PROJECT_ROOT"

    # Test the built CLI directly
    local cli_path="$PROJECT_ROOT/dist/cli/index.mjs"

    if [[ ! -f "$cli_path" ]]; then
        die "CLI not found at $cli_path"
    fi

    # Run --help to verify CLI works
    if node "$cli_path" --help > /dev/null 2>&1; then
        print_success "CLI responds to --help"
    else
        die "CLI smoke test failed"
    fi

    # Check version output
    local version_output
    version_output=$(node "$cli_path" --version 2>&1 || true)
    print_info "Version: $version_output"

    print_success "Smoke test passed"
}

# ============================================================================
# Main
# ============================================================================

main() {
    echo ""
    echo -e "${BOLD}rmap - Build from Source${NC}"
    echo "=============================="

    # Parse command line arguments
    parse_args "$@"

    # Change to project root
    cd "$PROJECT_ROOT"

    # Run prerequisite checks
    check_directory
    check_node
    check_pnpm
    check_git

    # Run build steps
    install_dependencies
    run_typecheck
    build_project
    run_tests
    link_globally
    run_smoke_test

    # Success message
    echo ""
    echo -e "${GREEN}${BOLD}Setup completed successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "  - Run in development mode:  pnpm dev map --help"
    if [[ "$SKIP_LINK" != true ]]; then
        echo "  - Use global command:       rmap --help"
    fi
    echo "  - Run tests:                pnpm test"
    echo "  - Build again:              pnpm build"
    echo ""
}

main "$@"
