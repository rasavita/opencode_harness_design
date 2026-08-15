# opencode_harness_design

An [opencode](https://opencode.ai) harness for autonomous long-running application development, ported from the Claude Code harness engine.

## What This Is

A GAN-inspired harness combining Karpathy ratcheting + harness engineering best practices:
- Generator-Evaluator architecture (no self-evaluation bias)
- Agent teams for parallel story execution
- Session chaining for multi-context-window builds
- Three-layer evaluation (API + Playwright + Vision with weighted scoring)
- 2 execution modes: Full, Lean

## Installation

1. Clone: `git clone <repo-url> ~/opencode_harness_design`
2. Open the repo in opencode: `cd ~/opencode_harness_design && opencode`
3. Scaffold a project: `/scaffold`

## How the opencode Integration Works

- **`opencode.json`** — native opencode config: permission model (Bash allowlist ported from the Claude `permissions.allow` list) and the `harness-nav` MCP server.
- **`.opencode/plugins/harness.js`** — the plugin adapter. It reads the declarative hook manifest in `.opencode/settings.json#hooks` (logical event → tool matcher → hook command) and runs each hook script as a child process with the canonical JSON envelope on stdin. An exit code 2 from a `PreToolUse` hook becomes a thrown error in `tool.execute.before` — a true pre-execution veto. `PostToolUse`, `UserPromptSubmit`, `Stop`, and `SubagentStop` vetoes cannot undo work, so they are surfaced back into the session as corrective prompts. `Stop`/`SubagentStop` hooks fire on the `session.idle` event, which requires a persistent opencode process (TUI or `opencode serve`) — a one-shot `opencode run` exits before the idle event, so stop hooks do not run there.
- **`.opencode/settings.json`** — harness-internal manifest (NOT read by opencode itself): env flags (`HARNESS_AGENT_TEAMS`, `HARNESS_AUTO_CONTINUE`), the hook wiring consumed by the plugin, and the vertical-pack registry (`enabledPlugins`).
- **`.opencode/agents/*.md`** — subagent definitions (opencode frontmatter: `description`, `mode: subagent`, `model`, `permission`). Model pins are stamped by `node .opencode/scripts/model-tier.js <tier> --apply .opencode/agents` and the model ids are configurable via `HARNESS_MODEL_JUDGMENT` / `HARNESS_MODEL_GENERATION` / `HARNESS_MODEL_EXPLORATION` (opencode `provider/model` format).
- **`.opencode/commands/*.md`** — slash commands. Entry points (`/build`, `/auto`, `/feature`, `/gate`, …) are thin wrappers that inline the corresponding skill via `@.opencode/skills/<name>/SKILL.md`.
- **`.opencode/skills/*/SKILL.md`** — the skill library, with progressive-loading `references/` directories. Internal pipeline stages are marked in their descriptions and are invoked by the entry points, not typed by users.

## Commands & Agents

The full Commands table and the agent team (roles + model tiers) live in `README.md` (sections *Command reference*, *Agent team*). They are reference material, not always-on rules. Read `README.md` when you need the command/agent inventory.

## Coding Principles (Karpathy Guidelines)

These behavioral rules apply to all code generation — in agents, skills, and direct responses.

### Controlled Vibe Coding

Use `/vibe` for small, low-risk changes where the full SDLC pipeline would be disproportionate. `/vibe` still requires a micro-contract, narrow scope, targeted verification, and reviewer enforcement. Escalate to `/change` (add `--issue N` for a GitHub bug), `/refactor`, or the full pipeline for new workflows, public API changes, migrations, auth/security/privacy work, ambiguous requirements, or changes likely to touch more than 3 source files.

### Brownfield Discovery

Use `/brownfield` before broad planning, refactoring, or feature work in existing codebases. It creates factual architecture, test, risk, and change-strategy maps under `specs/brownfield/` so agents preserve existing contracts and choose the right lane. `/vibe` may still be used for tiny low-risk fixes, but it must respect any brownfield risk map already present. For end-to-end existing-code work (request → reviewed PR), use `/feature`, which runs `/brownfield` discovery, keeps the committed DeepWiki current, and routes to `/change` (single story) or `/spec`→`/design`→`/auto` (epic) behind three human gates.

### Disposable Artifacts (Non-Product Work)

UI mockups, architecture / ARB (Architecture Review Board) narrative documents, and research or analysis reports are **disposable artifacts**, not product code. They explain, explore, or persuade — they do not ship. They must **not** go through the generator/evaluator (GAN) loop, the ratchet gates, security review, or TDD, and you must **not** invoke `/build`, `/auto`, `/implement`, `/change`, `/refactor`, or `/scaffold` to produce them. Use the lightweight lane instead:

| Artifact | Lane |
|----------|------|
| UI mockup / component / page | direct authoring (no pipeline) |
| Architecture / ARB / design narrative | `/design --doc-only` (single authored document; no planner/generator/evaluator, no `specs/design/` schema set) |
| Research / deep dive / analysis | direct research (no pipeline) |

These lanes skip contracts, ratcheting, and reviewer enforcement **by design** — abstaining from the pipeline is correct behavior here, not a shortcut. Only escalate to the SDLC pipeline if the artifact is being turned into shipped product code (e.g., a mockup becoming a real component). When in doubt about whether something is product code, ask. For a fully insulated workspace where the SDLC machinery is absent entirely, load the **harness-lite** loadout (`harness-lite/`) instead of this one. For small but *shippable* code, use `/build --lite` inside the full harness.

### 1. Think Before Coding
- State assumptions explicitly. If uncertain, ask — don't guess.
- When a request is ambiguous, present multiple interpretations and let the user choose.
- Push back on unnecessary complexity. "Do you actually need X, or is Y sufficient?"

### 2. Simplicity First
- Minimum code that solves the stated problem. Nothing speculative.
- No unrequested features, single-use abstractions, premature flexibility, or speculative error handling.
- The bar: would an experienced engineer consider this overcomplicated?
- Avoid fake abstractions: a module should hide useful behavior behind a small interface, not just forward calls.

### 3. Surgical Changes
- Modify only what the request requires. Don't "improve" adjacent code, comments, or formatting.
- Match existing style conventions in the file being edited.
- When your changes orphan imports or variables, remove only what *your* changes made unused — not pre-existing dead code.
- Every altered line must trace directly to the user's request.

### 4. Goal-Driven Execution
- Transform vague goals into verifiable success criteria before writing code.
- "Add validation" → "Write tests for invalid inputs, then make them pass."
- Plan multi-step work with clear checkpoints. Loop toward measurable outcomes.
- Tests verify public behavior through API routes, UI flows, CLIs, or exported module interfaces. Do not couple tests to private helpers or internal call order.

### 5. Verify Independently, at the Branch Level
- The final whole-branch review on the most capable model is load-bearing, not a formality: per-task reviews tend to inherit the builder's mental model and miss the defects it encodes. Run an independent whole-branch review before merging non-trivial work — it has repeatedly caught Criticals the per-task pass cleared.
- Integration/contract tests must round-trip the **real** artifact through its **real** validator/schema, never hand-built fixtures. A fixture that encodes the wrong shape keeps every test green while the feature is inert — "tests pass" ≠ "feature works." (A gate once shipped reading a *flat* contract while real sprint contracts nest checks under a `contract` key; flat-fixture tests hid it until the whole-branch review + a `validate-contract` round-trip caught it.)

> These guidelines bias toward caution over speed. Success = fewer unnecessary diffs, simpler code on first attempt, clarifying questions before implementation.

## Large Codebase Best Practices

- **Hierarchical AGENTS.md** — Root AGENTS.md for project-wide rules; subdirectory AGENTS.md files for scoped test/lint commands (generated by `/scaffold` Step 5.B for multi-module projects). opencode reads `AGENTS.md` as its primary project instruction file.
- **Read-only exploration** — Use the `codebase-explorer` agent for discovery before editing; separates exploration from modification.
- **Session learnings** — Stop hook (`review-on-stop.js`) reviews accumulated rules and suggests AGENTS.md updates.
- **State archival** — Run `node .opencode/scripts/archive-state.js` to archive oversized state files to `.opencode/state/archive/`.
- **Codebase map** — `CODEBASE_MAP.md` documents top-level directory structure for navigation.
- **Context-first navigation** — when `specs/brownfield/code-graph.json` is real, run `node .opencode/scripts/nav-query.js pack --diff --budget 1600 "<question>"` (or `/context`) before broad source reads; use `read_next` line ranges, not whole files. Refresh secondary indexes with `nav-query.js refresh`.
- **LSP integration** — `/scaffold` auto-detects LSP servers from the stack (pyright, typescript-language-server, gopls, etc.), writes them to `project-manifest.json`, and checks availability in `init.sh`.
- **MCP servers** — configured in `opencode.json#mcp` (dogfood: `harness-nav` via `nav-mcp-server.js`; settle before long runs).
- **Subdirectory commands** — Scope test/lint commands per module to avoid running full suites on minor changes.

## Prompt Stability

Long agentic sessions depend on provider prompt caching: the request prefix (system prompt + tools → `AGENTS.md` → session context) is cached and reused across turns. A change anywhere in the prefix invalidates everything after it. Three rules keep the prefix stable during a run:

1. **Don't churn tools mid-session.** Adding/removing a plugin or MCP server during a run rebuilds the whole cache. Settle `opencode.json#mcp` *before* long `/auto` runs.
2. **Don't edit `AGENTS.md` mid-session.** The `session-learnings` Stop hook only *suggests* updates — apply them between sessions, not during a build.
3. **Don't swap the orchestrator's model mid-session.** Model changes happen via subagents with their own frontmatter pins (see the Agents table), never by switching the main session's model mid-run. Dynamic values (dates, timestamps) belong in messages, never in cached content.

**Enforced:** `pre-write-gate` + `pre-bash-gate` block writes to `AGENTS.md`, `.mcp.json`, and `.opencode/settings*.json` (see `.opencode/hooks/lib/prefix-cache.js`). Escape for intentional inter-session work only: `HARNESS_PREFIX_EDIT=1`.

Telemetry is **off by default** (opt-in) — enable it per the README's "Enable telemetry" section (`HARNESS_ENABLE_TELEMETRY=1` + the OTEL/Pushgateway env vars). Once enabled, `telemetry/cache-alerts.rules.yml` (wired into `telemetry/prometheus.yml`) and `telemetry/grafana/dashboards/cache-health.json` (auto-provisioned) add a hit-rate alert and dashboard on top of it. See `telemetry/CACHE_MONITORING.md`.

## Key Files

- `.opencode/program.md` — Karpathy human-agent bridge (edit to steer /auto)
- `opencode.json` — opencode config: permissions + MCP servers
- `.opencode/settings.json` — harness-internal hook manifest, env flags, vertical-pack registry
- `.opencode/plugins/harness.js` — the opencode plugin adapter (hook dispatch + veto translation)
- `.opencode/workflows/` — Slot for dynamic workflows you author (each `.js` you add becomes a `/<name>` command). Ships empty; `/scaffold` copies the slot to target projects. See `.opencode/workflows/README.md`
- `design.md` — Full architecture reference (copied to target projects)
- `HARNESS.md` + `harness-manifest.json` — Registry of the control system (guides × sensors across maintainability/architecture/behaviour/traceability). Read before adding or changing any gate/sensor/reviewer so the new control gets registered, not orphaned; keep the manifest honest (`node .opencode/scripts/validate-harness-manifest.js`, enforced by `npm test`)
- `README.md` — Installation and usage guide
- `docs/prompting-standards.md` — How to author agent/skill prompts for the current models (read before editing any `.opencode/agents/*` or `.opencode/skills/*` prompt)
