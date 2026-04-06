# Refactoring Improvements Roadmap

## Critical Refactors
These issues must be resolved immediately to prevent fragile CI pipelines and untangle tightly coupled script logic.

### Refactor: Eliminate GitHub Actions Duplication
- **Location**: `.github/workflows/*.yml`
- **Problem**: Every workflow file duplicates the checkout, pnpm setup, Node.js setup, and dependency installation steps.
- **Impact**: Upgrading Node.js versions, pnpm versions, or altering caching strategies requires making identical edits across six different files, virtually guaranteeing a future drift bug.
- **Suggested Approach**: Create a local composite action in `.github/actions/setup-node-pnpm/action.yml`. Move the checkout, pnpm setup, and `pnpm install` logic into this reusable action, and replace the boilerplate in all workflows with a single `uses: ./.github/actions/setup-node-pnpm` step.

### Refactor: Decouple Logic and I/O in `preview-tasks.ts`
- **Location**: `scripts/preview-tasks.ts` (`printTaskPlan` function, lines 112-205)
- **Problem**: The `printTaskPlan` function mixes complex data aggregations (averages, ratios, distribution tallies) with direct `console.log` statements.
- **Impact**: The statistics logic is untestable. The function is overly long and violates the project's strict architecture rule separating business logic from UI side-effects.
- **Suggested Approach**: Extract all data crunching into a pure function `computeTaskStatistics(taskPlan, level0): TaskStats`. The UI function should only accept this data object and handle the terminal output.

## Medium Priority Improvements
Issues that degrade maintainability and type safety over time.

### Refactor: Remove O(N) Redundancy and `any` Types
- **Location**: `scripts/preview-tasks.ts` (lines 125-132)
- **Problem**: O(3N) filtering for agent sizes and widespread use of the `any` type (`t: any`).
- **Impact**: Defeats TypeScript compilation safety and wastes CPU cycles, albeit minor for small arrays.
- **Suggested Approach**: Replace the three `.filter` calls with a single `.reduce` pass to tally sizes. Import or define strict interfaces for `taskPlan` and `level0` to replace `any`, ensuring schema safety.
```typescript
const sizes = taskPlan.tasks.reduce((acc, t) => {
  acc[t.agentSize] = (acc[t.agentSize] || 0) + 1;
  return acc;
}, { small: 0, medium: 0, large: 0 });
```

### Refactor: Consolidate Shell Script Execution Wrappers
- **Location**: `scripts/setup.sh` (lines 160-240)
- **Problem**: Repetitive `cd "$PROJECT_ROOT"` and identical verbose output checking logic inside every individual build function.
- **Impact**: Bloats the script with noisy, repetitive boilerplate.
- **Suggested Approach**: Create a higher-order executor function `run_step "Step Name" "command" "success_msg" "fail_msg"`. The executor handles the `cd`, the verbose branching, and error handling, reducing the build functions to simple one-liners.

## Nice-to-Have Enhancements
Modernization and minor polish.

### Enhancement: Extract Magic Numbers
- **Location**: `scripts/preview-tasks.ts` (lines 173, 192)
- **Problem**: Hardcoded constants like `2000`, `50`, and `5` are embedded directly in conditionals.
- **Benefit**: Centralizing configuration improves readability and makes tuning thresholds significantly easier.
- **Suggested Approach**: Move these thresholds to a config block at the top of the file alongside `LARGE_FILE_LOC_THRESHOLD`.
```typescript
const CONFIG = {
  MAX_LOC_PER_TASK: 2000,
  MAX_IMBALANCE_RATIO: 5,
  LEGACY_FILES_PER_TASK: 50
};
```