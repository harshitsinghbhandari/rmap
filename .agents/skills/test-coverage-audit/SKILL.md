---
name: test-coverage-audit
description: Comprehensive test suite audit that combines ruthless analysis with a solution-focused roadmap. Reads test suites (unit, integration, e2e) and source code, produces a brutal audit report of test quality and gaps, and generates prioritized testing improvements.
---

## Overview

This skill provides a two-phase review of testing strategies and test coverage:

1. **Audit Phase** (Sukuna mindset): Cold, systematic dissecting of test quality, missing coverage paths, and strategy coherence. Identifies brittle tests or logic gaps with surgical precision.
2. **Improvements Phase** (Gojo mindset): Elegant, comprehensive testing strategy roadmap organized by priority. Offers perceptive solutions to improve the testing pyramid.

Both outputs are produced in a single run, enabling teams to understand their testing weaknesses and how to shore up their defenses systematically.

## Activation Rules

**Explicit triggers only.** This skill activates ONLY when the user explicitly mentions:
- "audit tests"
- "test coverage audit"
- "brutal test review"
- "review testing strategy"
- Similar explicit phrases requesting a test suite review.

**Required input:** User must provide or reference the test files and the corresponding source code files. If no files are provided, politely request: "Please provide the test and source files you'd like audited."

**File format:** All audited content is source and test code. 

## Phase 1: Test Audit Report (`audit.md`)

### Mindset: Ruthless, Direct, Factual

The audit phase adopts a no-nonsense, penetrating analytical approach:
- Direct language: Identify exactly where tests fail to validate behavior.
- Systematic: Analyze coverage gaps, assertion quality, and mock overuses.
- Evidence-based: Every claim is backed by specific test function names or lines.
- No sugar-coating: Call out tests that pass without actually testing anything.

### Output Structure

Generate `audit.md` with this exact structure:

```markdown
# Test Coverage & Strategy Audit Report

## Executive Summary
- **Overall Score**: X/1000
- **Testing Pyramid Health**: [Healthy / Inverted / Missing Layers]
- **Primary Strengths**: ...
- **Critical Weaknesses**: ...

## File/Module Scores
| Source Module | Test Coverage/Quality Score /100 | Assessment |
|---------------|----------------------------------|------------|
| [module] | [score] | [one-line verdict] |

## Detailed Findings

### Coverage Gaps
[Analysis of untested happy paths, missing edge cases, and neglected error conditions]

### Test Quality & Assertions
[Are tests actually validating behavior or just executing code? Assessment of assertion strength.]

### Mocking & Coupling
[Overuse of mocks that hide integration issues, tests too tightly coupled to implementation details]

### Maintainability & Structure
[Brittle tests, duplicated setup logic, setup/teardown health, slow tests]

### Strategy Coherence
[Do the tests align with the system's risk priorities? Is the unit/integration/e2e ratio sensible?]

## Final Verdict
[Summary of the overall testing posture and confidence level]
```

### Scoring Methodology

**Per-file quality scores (/100):**
- 90–100: Robust, behavioral tests; high confidence, handles edge cases
- 70–89: Solid tests but missing edge cases or relying too much on implementation details
- 50–69: Tests exist but are brittle, overly mocked, or lack meaningful assertions
- <50: Dangerous; tests provide false confidence, entirely missing layers

**Overall score (/1000):**
- Weighted average, with heavy penalties (-100 to -400) for inverted testing pyramids, critical untested paths, or tests that don't assert anything.

**Evaluation criteria:**
- Are error conditions and edge cases tested?
- Are tests behavioral (testing inputs/outputs) rather than structural (testing private internals)?
- Are fixtures and setups DRY?
- Are there assertions, or are they just "does not crash" tests?

### Standards for Analysis

- **Reference everything**: Use exact test names and assertions.
- **Look for false confidence**: Actively seek out tests that look comprehensive but mock everything related to the database or external services without integration tests to back them up.
- **Explain the impact**: (e.g., "This test mocks the core business logic, meaning if the logic changes, the test still passes but production breaks.")

## Phase 2: Improvements Roadmap (`improvements.md`)

### Mindset: Perceptive, Solution-Focused, Comprehensive

The improvements phase adopts a calm, methodical, strategic mindset:
- Clarity of vision: See where the testing net has holes and prioritize patches.
- Elegance: Offer robust, maintainable testing strategies.
- Actionability: Provide clear direction for writing the missing tests.

### Output Structure

Generate `improvements.md` with this exact structure:

```markdown
# Testing Strategy Improvements Roadmap

## Critical Test Additions & Fixes
[Untested critical paths or tests that must be rewritten immediately because they are brittle/useless]

### Improvement: [Name]
- **Target**: [File/function]
- **Problem**: [Clear description of missing coverage or bad test]
- **Impact**: [Why this is critical to catch bugs]
- **Suggested Approach**: [How to write/rewrite the test, including what to assert]

## Medium Priority Testing Enhancements
[Broadening edge cases, reducing mock usage, improving test setup]

### Improvement: [Name]
- **Target**: [File/module]
- **Problem**: [Clear description]
- **Impact**: [Why this makes tests better]
- **Suggested Approach**: [Solution outline]

## Nice-to-Have Enhancements
[Test speed optimizations, parametrization, CI/CD improvements]

### Enhancement: [Name]
- **Target**: [Test suite]
- **Description**: [What could be improved]
- **Benefit**: [Why it's worth doing]
- **Suggested Approach**: [Solution outline]
```

### Standards for Improvements

- **Prioritize based on risk**: Business logic and security paths are Critical. Utilities are Medium. Speed is Nice-to-Have.
- **Provide actionable test outlines**: Instead of "write more tests for X," tell them "Add a parametrized test for X that inputs A, B, C and asserts it throws Y."
- **No full test generation yet**: Provide the strategy and structure, but do not write the entire 500-line test suite file.

## Workflow

1. **User triggers**: User provides tests/code and says "audit tests" or "review test coverage".
2. **Agent reads files**: Parse all provided tested and source code.
3. **Sukuna phase**: Produce `audit.md` with ruthless, systematic breakdown of testing flaws.
4. **Gojo phase**: Produce `improvements.md` with solution-focused testing roadmap.
5. **Deliver both**: Present both files, written to disk, and ask if the user wants to implement specific tests.

## Quality Assurance

- Do not invoke this skill unless explicitly triggered.
- Keep output highly professional.
- Do not auto-generate the actual test implementations without asking.

## Example Trigger Phrases

- "Audit these tests"
- "Review my test coverage for these python files"
- "Give me a brutal test review"
- "Audit test strategy for [list of files]"
