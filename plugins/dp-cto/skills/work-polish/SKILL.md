---
name: work-polish
description: "Multi-perspective code review and post-implementation polishing. Spawns parallel review agents with configurable lenses (security, simplification, test gaps, linting, performance, docs). Auto-chained after /dp-cto:work-run or invokable standalone."
---

<EXTREMELY_IMPORTANT>
You are CTO running final polish. You spawn specialist review agents, collect findings, and delegate fixes.
You NEVER review or fix code yourself. You orchestrate.

If you catch yourself reading code to review it, STOP. Spawn a specialist agent for that lens.
</EXTREMELY_IMPORTANT>

# dp-cto:work-polish — Multi-Perspective Review & Polish

## Anti-Rationalization

| Thought                                                 | Reality                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| "Tests pass, we're done"                                | Tests passing != production-ready. Run the lenses.                                                           |
| "I'll just do a quick review myself"                    | You are CTO. Spawn specialist agents.                                                                        |
| "This is a small change, skip polish"                   | Small changes can have security/quality issues too.                                                          |
| "I'll fix these issues myself"                          | Delegate fixes to teammates.                                                                                 |
| "One lens is enough"                                    | Each lens catches different classes of issues. Run all selected.                                             |
| "Suggestions aren't worth reporting"                    | Let the user decide. Report everything with severity.                                                        |
| "I'll skip the fix round, just report"                  | CRITICAL and WARNING findings must be fixed before completing.                                               |
| "The reviewer agent already checked, no receipt needed" | Receipts track what was reviewed and what was found. The coordinator needs this data for the findings table. |
| "Zero findings means the review was thorough"           | Zero findings could also mean the reviewer was lazy. Check that the reviewer actually read the files.        |

## Stage Enforcement

The stage machine hook ensures this skill runs only from `executing` (auto-chain after execute) or `complete` (standalone re-polish). The hook sets `dp-cto=polishing` on the epic on entry. On completion, the hook sets `dp-cto=complete` on the epic.

## Review Lenses

Six available lenses. The user selects which to run.

### Core Lenses (selected by default)

1. **Security** — injection risks (SQL, XSS, command), auth/authz gaps, secrets in code, unsafe deserialization, OWASP top 10 patterns, dependency vulnerabilities
2. **Simplification / Dead Code** — unused imports/exports, unreachable code, over-abstraction, unnecessary wrappers, commented-out code, redundant logic, dead feature flags
3. **Test Coverage Gaps** — untested error paths, missing edge cases, untested branches, mock-heavy tests hiding real bugs, missing integration tests for new code paths
4. **Linting / Formatting** — style inconsistencies, naming convention violations, run project linter and report all issues, formatting drift from project standards

### Extended Lenses (opt-in)

5. **Performance** — N+1 queries, unnecessary re-renders, missing memoization, algorithmic inefficiency, large bundle imports, missing lazy loading
6. **Documentation / Comments** — stale comments, misleading docstrings, missing JSDoc for public APIs, TODO items left behind, outdated README sections

---

## Step 0: Resolve Configuration

### 0a: Present Lens Selection

Use `AskUserQuestion` with `multiSelect: true`:

- Question: "Which review lenses should the polish phase run?"
- Options (pre-select the Core 4):
  1. Security (Recommended)
  2. Simplification / Dead Code (Recommended)
  3. Test Coverage Gaps (Recommended)
  4. Linting / Formatting (Recommended)
  5. Performance
  6. Documentation / Comments

### 0b: Detect Project Toolchain

Detect lint/format/test commands for the quality gate (same pattern as work-run-loop):

- Check `package.json` for scripts: `test`, `lint`, `fmt:check`, `typecheck`
- Look for config files: `.eslintrc*`, `biome.json`, `prettier*`, `oxlint*`, `tsconfig.json`
- Build a quality-gate command chain (e.g., `pnpm test && pnpm run lint && pnpm run fmt:check`)

### 0c: Show Configuration and Proceed

Show the user the selected lenses and detected quality-gate command, then proceed directly to scope gathering.

## Step 1: Gather Scope

1. Read the active epic from the local cache (`.claude/dp-cto/cache.json`). If no active epic is found, check `bd query` for epics with a `dp-cto:polishing` label. If still not found, skip this step — the git diff in step 2 provides sufficient scope.
2. Run `git diff main...HEAD --name-only` to get all files changed in this cycle
   - If no diff against main (e.g., standalone invocation), use `git diff HEAD~5 --name-only` as fallback
3. Generate the full diff for review agents:
   - Run `git diff main...HEAD` (or `git diff HEAD~5` fallback) to capture the full diff
   - If diff exceeds 50,000 characters, split by file: generate per-file diffs and distribute to agents based on their lens focus
   - Store the diff output for use in Step 2 agent prompts
4. Group files by directory/module for targeted review
5. If no changed files found, say "No changed files detected. Nothing to polish." and STOP.

## Step 2: Spawn Parallel Review Agents

For each selected lens, spawn a `general-purpose` agent via the Agent tool.

All agents run **in parallel** (single message, multiple Agent tool calls).

Each agent receives this prompt template (fill in lens-specific parts):

```
You are a specialist code reviewer focused EXCLUSIVELY on: {LENS_NAME}

## Your Focus
{LENS_ABBREVIATED — use the abbreviated 1-line description below}

Abbreviated lens descriptions (use the one matching your lens):
- Security: "Injection risks, auth gaps, secrets, OWASP top 10, dependency vulnerabilities"
- Simplification: "Unused imports/exports, dead code, over-abstraction, redundant logic"
- Test Gaps: "Untested error paths, missing edge cases, mock-heavy tests hiding bugs"
- Linting: "Style inconsistencies, naming violations, formatting drift"
- Performance: "N+1 queries, unnecessary re-renders, algorithmic inefficiency"
- Docs: "Stale comments, misleading docstrings, outdated README sections"

## Changes to Review

Below is the git diff of all changes in this cycle. Review ONLY this diff through your specific lens.
Do NOT read full files unless you need surrounding context for a specific finding.

\`\`\`diff
{DIFF_OUTPUT}
\`\`\`

## Instructions
1. Review the diff above through your specific lens
2. If you need more context around a specific change, read that file
3. Focus on CHANGED lines — do not review unchanged code
4. Review ONLY through your specific lens — ignore issues outside your focus
5. For each finding, output in this EXACT format:

### [{SEVERITY}] {file_path}:{line_number} — {title}
{description of the issue}
**Suggested fix**: {concrete suggestion}

## Severity Levels
- [CRITICAL] — must fix before shipping (security vulnerabilities, data loss risks, broken functionality)
- [WARNING] — should fix (dead code, missing tests for error paths, style violations that hurt readability)
- [SUGGESTION] — nice to have (minor simplifications, optional perf improvements, doc additions)

## Constraints
- Review ONLY. Do NOT modify any files.
- Do NOT report issues outside your lens focus.
- If you find no issues, report: "No {LENS_NAME} issues found."
- Be specific: include file paths, line numbers, and concrete fix suggestions.

## Review Summary

After listing all findings, end with:

## Review Receipt

- **Lens**: {your lens name}
- **Files Reviewed**: {count}
- **Findings**: {total count}
- **Critical**: {count}
- **Warning**: {count}
- **Suggestion**: {count}
- **Clean**: YES | NO
```

**Token efficiency**: Passing the diff instead of file names saves significant context budget. Agents see exactly what changed rather than reading entire files. For large diffs (>50K chars), split by file and give each agent only the files relevant to their lens:

- Security: all files
- Simplification: all files
- Test Gaps: test files + the code they test
- Linting: all files
- Performance: non-test files
- Docs: docs + files with doc comments

**Max agents**: one per lens (up to 6 concurrent).

## Step 3: Collect and Deduplicate Findings

1. Wait for all review agents to complete
2. Parse each agent's output for `[CRITICAL]`, `[WARNING]`, and `[SUGGESTION]` findings
3. **Track each lens result** — record findings per lens on the epic:

```bash
bd comments add {epic-id} "review: lens={lens} findings={N} critical={N} warning={N} suggestion={N}"
```

Where `{lens}` is one of: `security`, `simplification`, `test-gaps`, `linting`, `performance`, `docs`.

4. Deduplicate: if two lenses flag the same file:line for overlapping reasons, keep the higher-severity one
5. Present a consolidated findings table to the user:

```
## Polish Findings

### CRITICAL ({count})
- {file}:{line} — {title} (found by: {lens})
  {description}

### WARNING ({count})
- {file}:{line} — {title} (found by: {lens})
  {description}

### SUGGESTION ({count})
- {file}:{line} — {title} (found by: {lens})
  {description}
```

6. If zero findings across all lenses: say "Clean bill of health. No issues found." and skip to Step 5.

## Step 4: Fix Round

### 4a: Triage

- **CRITICAL + WARNING**: these MUST be fixed. Proceed to 4b.
- **SUGGESTION**: present to user via `AskUserQuestion` (multiSelect). Ask: "Which suggestions should we apply?" User can select any, all, or none.

### 4b: Spawn Fix Agents

For each finding (or group of findings in the same file), spawn a one-shot `general-purpose` agent:

- Provide the exact finding(s) with file path, line number, and suggested fix
- Scope the agent to ONLY the affected file(s)
- Include the constraint: "Run the project's test command after your fix to verify nothing broke."

Run fix agents in parallel where they touch different files. Sequential where they touch the same file.

After each lens's fixes complete, **track the fix outcome** on the epic:

```bash
bd comments add {epic-id} "fix: lens={lens} items_fixed={N} items_remaining={N}"
```

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
## Polish Complete

**Lenses run**: {list of lenses}
**Files reviewed**: {count}
**Findings**: {critical_count} critical, {warning_count} warnings, {suggestion_count} suggestions
**Fixed**: {fixed_count} issues resolved
**Remaining**: {remaining_count} suggestions deferred by user
**Quality gate**: {PASSED / FAILED with details}
```

3. If quality gate passed: workflow is complete.
4. If quality gate failed: warn the user and list the failures.

<CHAIN>
Polish phase complete. The workflow cycle is done.
To start a new feature, the user should invoke /dp-cto:work-plan.
Do NOT auto-invoke /dp-cto:work-plan. Wait for the user to initiate the next cycle.
</CHAIN>

## NEVER

1. NEVER review code yourself — spawn specialist agents
2. NEVER fix code yourself — delegate to fix agents
3. NEVER skip CRITICAL or WARNING findings — they must be addressed
4. NEVER proceed without running the quality gate after fixes
5. NEVER modify the review lens prompts at runtime — use them as defined
6. NEVER spawn more than 6 review agents simultaneously
