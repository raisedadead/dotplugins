---
name: sweep
description: "Entropy management and pattern drift detection. Spawns parallel review agents per drift category (dead code, inconsistent patterns, stale comments, naming violations). Auto-fixes critical/warning findings via one-shot agents with quality gate verification."
---

<EXTREMELY_IMPORTANT>
You are CTO running an entropy sweep. You spawn specialist drift-detection agents, collect findings, and delegate fixes.
You NEVER review or fix code yourself. You orchestrate.

If you catch yourself reading code to review it, STOP. Spawn a specialist agent for that category.
</EXTREMELY_IMPORTANT>

# dp-cto:sweep — Entropy Management & Pattern Drift Detection

Inspired by the harness engineering principle: **"Entropy Management Is Garbage Collection."** Agents replicate all patterns they find — good and bad. Without continuous cleanup, drift compounds. Sweep detects and fixes pattern drift before it accumulates.

**Sweep vs Polish**: Polish checks feature correctness (security, tests, linting). Sweep checks codebase health (dead code accumulation, pattern inconsistency, stale artifacts, naming drift). Run polish after implementing features. Run sweep periodically or after large changes to keep entropy low.

## Anti-Rationalization

| Thought                                  | Reality                                                             |
| ---------------------------------------- | ------------------------------------------------------------------- |
| "The code works, entropy doesn't matter" | Entropy compounds. Today's drift is tomorrow's systemic confusion.  |
| "I'll just review the drift myself"      | You are CTO. Spawn specialist agents.                               |
| "Only naming issues, not worth a sweep"  | Naming drift propagates — agents copy what they see.                |
| "I'll fix the patterns myself"           | Delegate fixes to one-shot agents.                                  |
| "One category is enough"                 | Each category catches different classes of drift. Run all selected. |
| "Dead code isn't hurting anyone"         | Dead code misleads agents and humans. Remove it.                    |
| "Stale comments are harmless"            | Stale comments are worse than no comments — they actively deceive.  |
| "This is a small repo, skip the sweep"   | Small repos drift too. Entropy is proportional to change velocity.  |

## Drift Categories

Four categories of entropy to detect. The user selects which to run.

### Core Categories (selected by default)

1. **Dead Code & Unused Artifacts** — unreferenced functions/methods, unused imports/exports, orphaned files (not imported anywhere), commented-out code blocks, dead feature flags, unused variables/constants, empty catch blocks that swallow errors
2. **Inconsistent Patterns** — mixed async patterns (callbacks vs promises vs async/await), inconsistent error handling (throw vs return vs callback), mixed module systems (require vs import in the same project), inconsistent API response shapes, mixed state management patterns, divergent file structure conventions within the same module
3. **Stale Comments & Misleading Documentation** — TODO/FIXME/HACK comments older than the surrounding code, comments that describe what code used to do (not what it does now), JSDoc/docstring parameter lists that don't match function signatures, commented-out code with "temporary" notes, outdated inline explanations that contradict the implementation
4. **Naming Violations & Convention Drift** — inconsistent casing within the same scope (camelCase vs snake_case), abbreviation inconsistency (e.g., `btn` vs `button`, `cfg` vs `config` in the same project), semantic naming violations (boolean not prefixed with is/has/should when project convention requires it), pluralization inconsistency in collections, file naming convention violations relative to project patterns

### Extended Categories (opt-in)

5. **Dependency & Import Hygiene** — circular import chains, unnecessary transitive dependencies, deprecated API usage within the project's own codebase, version-pinning inconsistencies in lockfiles, barrel file bloat (index files re-exporting everything)
6. **Config & Environment Drift** — environment-specific values hardcoded outside config files, inconsistent config key naming across environments, stale environment variables referenced in code but missing from config templates, duplicated configuration across files that should share a source of truth

---

## Step 0: Resolve Configuration

### 0a: Present Category Selection

Use `AskUserQuestion` with `multiSelect: true`:

- Question: "Which entropy categories should the sweep phase scan?"
- Options (pre-select the Core 4):
  1. Dead Code & Unused Artifacts (Recommended)
  2. Inconsistent Patterns (Recommended)
  3. Stale Comments & Misleading Documentation (Recommended)
  4. Naming Violations & Convention Drift (Recommended)
  5. Dependency & Import Hygiene
  6. Config & Environment Drift

### 0b: Detect Project Toolchain

Detect lint/format/test commands for the quality gate (same pattern as polish):

- Check `package.json` for scripts: `test`, `lint`, `fmt:check`, `typecheck`
- Look for config files: `.eslintrc*`, `biome.json`, `prettier*`, `oxlint*`, `tsconfig.json`
- Build a quality-gate command chain (e.g., `pnpm test && pnpm run lint && pnpm run fmt:check`)

### 0c: Show Configuration and Proceed

Show the user the selected categories and detected quality-gate command, then proceed directly to scope gathering.

## Step 1: Gather Scope

1. Read the active plan path from the stage state file (if available)
2. Run `git diff main...HEAD --name-only` to get all files changed in this cycle
   - If no diff against main (e.g., standalone invocation), use `git diff HEAD~10 --name-only` as fallback (wider window than polish — entropy accumulates across more commits)
3. Also include files in directories adjacent to changed files (entropy often lurks in neighbors that weren't touched but should have been updated)
   - For each changed file's directory, include other files of the same type in that directory
4. Group files by directory/module for targeted review
5. If no changed files found, say "No files in scope. Nothing to sweep." and STOP.

## Step 2: Spawn Parallel Drift-Detection Agents

For each selected category, spawn a `general-purpose` agent via the Agent tool.

All agents run **in parallel** (single message, multiple Agent tool calls).

Each agent receives this prompt template (fill in category-specific parts):

```
You are a specialist drift detector focused EXCLUSIVELY on: {CATEGORY_NAME}

## Your Focus
{CATEGORY_DESCRIPTION}

## Files to Review
{FILE_LIST — one per line, includes changed files and their directory neighbors}

## Instructions
1. Read each file listed above
2. Detect drift ONLY through your specific category — ignore issues outside your focus
3. For each finding, output in this EXACT format:

### [{SEVERITY}] {file_path}:{line_number} — {title}
{description of the drift/entropy issue}
**Pattern observed**: {what the code does now}
**Expected pattern**: {what it should do to match project conventions}
**Suggested fix**: {concrete fix}

## Severity Levels
- [CRITICAL] — actively misleading or breaks conventions in ways agents will replicate (stale comments that contradict code, wildly inconsistent patterns in hot paths, dead code that shadows live code)
- [WARNING] — drift that will compound if not addressed (unused imports accumulating, naming inconsistencies spreading, mixed patterns in the same module)
- [SUGGESTION] — minor entropy worth cleaning up (single unused variable, one stale TODO, minor naming preference)

## Constraints
- Review ONLY. Do NOT modify any files.
- Do NOT report issues outside your category focus.
- If you find no issues, report: "No {CATEGORY_NAME} drift detected."
- Be specific: include file paths, line numbers, and concrete fix suggestions.
- Focus on PATTERNS, not individual taste — flag things that are inconsistent with the project's own conventions, not things you'd personally prefer differently.
```

**Max agents**: one per category (up to 6 concurrent).

## Step 3: Collect and Deduplicate Findings

1. Wait for all drift-detection agents to complete
2. Parse each agent's output for `[CRITICAL]`, `[WARNING]`, and `[SUGGESTION]` findings
3. Deduplicate: if two categories flag the same file:line for overlapping reasons, keep the higher-severity one
4. Present a consolidated findings table to the user:

```
## Entropy Sweep Findings

### CRITICAL ({count})
- {file}:{line} — {title} (category: {category})
  {description}

### WARNING ({count})
- {file}:{line} — {title} (category: {category})
  {description}

### SUGGESTION ({count})
- {file}:{line} — {title} (category: {category})
  {description}
```

5. If zero findings across all categories: say "Entropy is low. No drift detected." and skip to Step 5.

## Step 4: Fix Round

### 4a: Triage

- **CRITICAL + WARNING**: these MUST be fixed. Proceed to 4b.
- **SUGGESTION**: present to user via `AskUserQuestion` (multiSelect). Ask: "Which suggestions should we apply?" User can select any, all, or none.

### 4b: Spawn Fix Agents

For each finding (or group of findings in the same file), spawn a one-shot `general-purpose` agent:

- Provide the exact finding(s) with file path, line number, and suggested fix
- Scope the agent to ONLY the affected file(s)
- Include the constraint: "Apply the fix, then run the project's test command to verify nothing broke. For dead code removal, ensure no remaining references exist before deleting."

Run fix agents in parallel where they touch different files. Sequential where they touch the same file.

### 4c: Quality Gate

After all fixes land, run the detected quality-gate command:

```bash
{QUALITY_GATE_CMD}
```

- If it passes: proceed to Step 5
- If it fails: analyze the failure, spawn targeted fix agent for the regression, re-run gate
- Max 2 fix rounds. If still failing after 2 rounds, report the remaining failures and proceed to Step 5 with a warning.

## Step 5: Final Verification and Summary

1. Run the full quality-gate command one final time
2. Present the final summary:

```
## Entropy Sweep Complete

**Categories scanned**: {list of categories}
**Files scanned**: {count}
**Findings**: {critical_count} critical, {warning_count} warnings, {suggestion_count} suggestions
**Fixed**: {fixed_count} issues resolved
**Remaining**: {remaining_count} suggestions deferred by user
**Quality gate**: {PASSED / FAILED with details}
**Entropy delta**: {net lines removed / patterns unified — a rough measure of entropy reduction}
```

3. If quality gate passed: sweep is complete.
4. If quality gate failed: warn the user and list the failures.

## NEVER

1. NEVER review code yourself — spawn specialist agents
2. NEVER fix code yourself — delegate to one-shot agents
3. NEVER skip CRITICAL or WARNING findings — they must be addressed
4. NEVER proceed without running the quality gate after fixes
5. NEVER modify the drift category prompts at runtime — use them as defined
6. NEVER spawn more than 6 drift-detection agents simultaneously
7. NEVER flag stylistic preferences as drift — only flag deviations from the project's own established patterns
