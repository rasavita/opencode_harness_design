---
name: scaffold
description: Initialize a new project with the OpenCode Harness Engine v5 scaffold.
---

# /scaffold — Project Initialization

When the user runs this command, follow these steps exactly:

## Invocation modes

`/scaffold` takes optional arguments: `/scaffold [--yes | -y | --non-interactive] [--core | --brownfield | --full] [--telemetry] [--drift-workflow] [<description>]`.

- **Interactive (default — no `--yes`):** the full Infer + Confirm flow below. The normal human path.
- **Non-interactive (`--yes` / `-y` / `--non-interactive`):** for unattended / CI / e2e use where no human is present to answer (e.g. `opencode run`). Never call `AskUserQuestion` in this mode. `--yes` with no `<description>` is an error: print one line asking for a description and stop — do not invent a project. Otherwise do exactly this and nothing else:
  1. Take `<description>` as the Q1 answer and run the **Step 1.B** inference to build the profile. Inference is the *only* judgement you make here — do **not** hand-write project files.
  2. `Write` the inferred profile as JSON to `./.scaffold-profile.json` using the schema documented at the top of `.opencode/scripts/scaffold-apply.js` (`name`, `description`, `stack.backend`/`frontend`/`database`, `projectType` A–D, `verificationMode` A–C, `modelTier`, `scaffoldProfile` core/brownfield/full, `telemetry`, `tracker` A–D, `frameworkPacks`, `lsp`).
  3. Run the deterministic generator — it performs every copy / mkdir / template-write of Steps 2–9, so nothing can be skipped or hallucinated:
     ```bash
     node "${HARNESS_PLUGIN_ROOT}/scripts/scaffold-apply.js" --profile ./.scaffold-profile.json [--scaffold-profile core|brownfield|full] [--telemetry] [--drift-workflow]
     ```
     If it exits non-zero, print its stderr and **STOP — do not fabricate success.** If `${HARNESS_PLUGIN_ROOT}` is unset, use the `PLUGIN_SOURCE` discovery from Step 3 and pass it as `--plugin-source`.
  4. Delete `./.scaffold-profile.json`, then print the Step 10 report describing what the script's stdout says it actually created. **Never print a success summary for files the script did not write.**

  In this mode the prose of Steps 2–9 below is reference for *what the script does* — you do not execute those steps by hand; `scaffold-apply.js` is the single source of truth for generation.

## Step 1: Gather Project Info — Infer + Confirm

> **MANDATORY (interactive mode): Q1 + confirmation card always shown.** Even if the session has a "don't pause for clarifications" / "make the reasonable call and continue" directive, you MUST ask the free-text Q1 below AND show the confirmation card. The user invoked `/scaffold` to configure a project — that is an explicit request for input gathering, not an ambiguous instruction to clarify. **The sole exception is non-interactive mode (`--yes`), where the description arrives as an argument and the inferred profile is accepted without prompts (see Invocation modes above).**
>
> Silently defaulting locks in choices the user can't easily reverse (tracker mode, framework packs, design calibration) — which is why defaulting is allowed *only* when the caller explicitly opts in with `--yes`.

### Step 1.A — Ask the description (Q1, free text)

Ask exactly this question with a normal prompt (no `AskUserQuestion`):

> "What are you building? In 1–3 sentences, include: language/framework, project shape (web app / script / library / brownfield existing code), the primary user surface (CLI / web UI / API / nothing yet), and any team integrations that matter (Linear, Jira, etc.)."

Wait for the answer. It goes verbatim into AGENTS.md and drives the inference in 1.B. **Non-interactive mode (`--yes`): do not ask — use the `<description>` argument verbatim as this answer.**

### Step 1.B — Infer a draft profile from Q1

Apply these rules. Be explicit and conservative — when the description is ambiguous, pick the safer middle option (the user will see and can change everything in 1.C).

**Stack:**
- "FastAPI" + ("React" or "Vite") → preset A
- "FastAPI" + ("Next" or "Next.js") → preset B
- "Express" + "React" → preset C
- "Python" + script/agent/CLI/library indicators → custom Python (3.12 · uv · ruff · mypy · pytest), no frontend, no DB
- "Node" / "TypeScript" + script/CLI indicators → custom Node, no frontend, no DB
- Otherwise → preset A (most common)

**Project type (drives calibration):**
- script · CLI · library · agent · tool · utility → D Minimal (`/build --lite` recommended, no `calibration-profile.json`)
- marketplace · consumer · SaaS · B2C · landing page → A Consumer-facing
- dashboard · admin · internal tool · back-office · B2B internal → B Internal tool
- API-only · backend service · microservice · no UI → C API-only (no UI scoring)
- Otherwise → B Internal tool

**Verification mode:**
- Project type = D Minimal OR C API-only → C Stub
- Mentions Docker / Compose / a full-stack preset → A Docker
- Mentions local dev / no Docker / uvicorn / npm run dev → B Local
- Otherwise → A Docker

**Scaffold profile:** Default to `core` for every project. `core` is the lean product-development spine: `/build`, `/auto`, `/gate`, `/feature`, `/brownfield`, `/code-map`, `/change`, `/refactor`, `/vibe`, and tracker publishing. This keeps Sprint 2+ existing-code work available without copying optional ops/extras. If the user passes `--brownfield`, set `scaffoldProfile: "brownfield"` as a backward-compatible alias for the same lean product spine. If the user passes `--full`, set `scaffoldProfile: "full"` to copy the entire optional harness surface. If the user passes `--core`, set `scaffoldProfile: "core"`.

**Telemetry:** Default OFF. If the user passes `--telemetry`, set `telemetry: true`; otherwise leave it false/absent. The `record-run` hook still records local memory without OTEL/Pushgateway env.

**Drift workflow:** Default OFF. If the user passes `--drift-workflow`, set `quality.drift.workflow: true`. This copies `.opencode/templates/github-workflows/harness-drift.yml` into `.github/workflows/harness-drift.yml` so GitHub Actions can run the slow-cadence drift, flake, harness-coverage, approved-fixtures, contract-drift, and optional SLO checks. Keep it separate from `--telemetry`: telemetry exports data; the drift workflow schedules quality checks.

**Plugins:** For `core` and `brownfield`, the deterministic generator strips the harness-internal `enabledPlugins` vertical-pack registry from the target's settings. Use `full` only when the project should receive the whole optional surface.

**Tracker:** Default to A Local-only unless Q1 explicitly names a tracker:
- Mentions "Linear" → C Publish + sync
- Mentions "Jira" → B Publish-only (Jira sync isn't fully implemented yet)

**Tech-stack pack — keyword match in Q1:**
- "LangChain" / "LangGraph" / "DeepAgents" / "LangSmith" / Python agent framework → A Python AI Agents (local bundled pack — default when the user doesn't ask for the external community pack specifically; it needs no manual install step, see option B below for the tradeoffs of the alternative)
- "ADK" / "Agent Development Kit" / "Gemini Enterprise" / "Vertex AI Agents" → C Google ADK
- Both sets of terms → both packs
- Neither → D None

**Domain vertical — keyword match in Q1:**
- "private equity" / "PE fund" / "deal sourcing" / "portfolio company" / GP/LP fund-management context → Private Equity
- No match → None

Graphify (the former Q6) is no longer asked here. It only matters for brownfield discovery — surface it inside `/brownfield`, not at scaffold time.

### Step 1.C — Show the confirmation card

**Non-interactive mode (`--yes`): skip this card entirely — proceed as if option A ("Scaffold with these choices") was chosen, straight to Step 2.**

Call `AskUserQuestion` ONCE with the inferred profile rendered as the `preview` of option A. Single-select, three options:

- **A) Scaffold with these choices** — accept the inferred profile as-is.
- **B) Change tracker mode only** — quick edit for the field hardest to infer.
- **C) Use the full configuration wizard** — for unusual stacks or full control.

The `preview` for option A must be a markdown block in this exact shape (substitute inferred values):

```
## Inferred profile

  Description     {first 120 chars of Q1}

  Stack           {inferred stack summary, e.g. "Python 3.12 · uv · ruff · mypy · pytest"}
  Project type    {A / B / C / D — display name}
  Verification    {A / B / C — display name}
  Scaffold        {core / brownfield / full}
  Telemetry       {off by default; on only with --telemetry}
  Plugins         Playwright + Superpowers in lean profiles; full optional set only in full
  Tracker         {A / B / C / D — display name}
  Tech-stack pack {A / B / C / D — display name(s)}
  Domain vertical {vertical display name, or "None"}

  (Graphify is no longer asked at scaffold time; surface it via /brownfield.)
```

For option B's `preview`, show the same block but emphasise the Tracker line ("← will change"). For option C, the preview can just say "Falls through to the full configuration wizard. Inferred values become the defaults."

### Step 1.D — Branch on the user's choice

1. **"Scaffold with these choices"** → record all inferred answers as final. Proceed to Step 2.

2. **"Change tracker mode only"** → call `AskUserQuestion` with a single question listing the 4 tracker options (see wizard Q7 in Step 1.E below). Record the answer, then proceed to Step 2. Do NOT loop back to the confirmation card.

3. **"Use the full configuration wizard"** → fall through to Step 1.E. Pre-pend the inferred answer to each question's description (e.g. "Inferred: A — change if needed") so the user sees what would have been picked.

If the user refuses to engage with the confirmation card ("just pick something", "use defaults"), treat that as informed consent for the inferred profile and proceed with option 1.

### Step 1.E — Wizard fallback (only if user picked option C)

Ask the following one at a time, using `AskUserQuestion` for each multi-choice question. Pre-pend the inferred answer in each question's description.

1. "What are you building?" — skip; already captured in Step 1.A.
2. "What's your tech stack?"
   - A) Python (FastAPI) + React (Vite) + PostgreSQL
   - B) Python (FastAPI) + Next.js + PostgreSQL
   - C) Node (Express) + React (Vite) + PostgreSQL
   - D) Custom (I'll specify)
3. "What type of project is this?" (calibration):
   - A) Consumer-facing app (high design bar)
   - B) Internal tool / dashboard (functional focus)
   - C) API-only / backend service (no UI scoring)
   - D) Minimal — CLI / library / single-script (recommends `/build --lite`)

If the user picks D, install the `core` scaffold by default, recommend `/build --lite`, and skip `calibration-profile.json`. `core` still includes the minimal brownfield route because generated code becomes existing code after Sprint 1; the user can request `--full` only when they want the entire optional harness copied.

4. "How will the evaluator reach the running app?":
   - A) Docker Compose (default)
   - B) Local dev servers
   - C) Stub / mock server
5. "Enable browser automation via the Playwright MCP server?"
   (the evaluator's Layer 2 browser checks and the design-critic vision loop drive a browser through Playwright MCP tools; without them, `/evaluate` degrades to API-only checks)
   - A) Yes, add the Playwright MCP server to `opencode.json` (recommended)
   - B) No, skip browser automation
6. "Enable optional external tracker orchestration?"
   - A) No, keep this project local-only
   - B) Publish generated story groups to Linear/Jira only
   - C) Publish + sync proof/status
   - D) Publish + external orchestrator dispatch
7. "Configure agent-framework skill packs?" (multi-select; default: None) — opt-in packs recorded in `project-manifest.json`.
   - A) Python AI Agents (LangGraph / LangChain / DeepAgents) — bundled directly in this harness, copied automatically, no manual install needed
   - B) LangChain / LangGraph / DeepAgents (external community pack) — `cwijayasundara/agent_cli_langchain` (9 skills, installed manually from a normal terminal because agent auto-mode blocks external `npx skills add` installs)
   - C) Google ADK — `google/agents-cli` (7 skills, same manual-install caveat as B)
   - D) None
8. "Enable a domain-vertical plugin?" (single-select; default: None) — reads `.opencode/config/scaffold-packs.json`'s `verticalPacks` array for the list of known verticals; recorded in `project-manifest.json`, installed manually (see the Domain Vertical Plugins section) because agent auto-mode blocks these installs the same way it blocks `npx skills add`.
   - A) Private Equity — `private-equity@claude-for-financial-services`
   - B) None
9. "Enforce bounded-context boundaries between domain modules?" (single-select; default: No) — a *vertical* import rule, distinct from the default-on horizontal layer/import-direction gate (`architecture.layers` in Step 2): two domain modules (e.g. `src/billing`, `src/user`) may not reach into each other's internals except via a public surface or an explicit exception. Enforced by `.opencode/hooks/lib/contexts.js` (gap G8) only when configured — most projects have no bounded contexts and should skip this.
   - A) Yes — I'll list the context root directories
   - B) No, skip bounded-context enforcement (default)

   If A, ask a follow-up free-text question: "Which directories are the bounded-context roots? (comma-separated, e.g. `src/billing, src/user`)". Record the answer as `architecture.contexts.roots` for Step 2. Default `allow` to `[]` (strictest — no cross-context imports permitted until the team adds explicit exceptions) and `public` to `["index","public","__init__"]` unless the user names different entry-point conventions.

## Step 2: Generate project-manifest.json

Based on their answers, write `project-manifest.json` to the project root. Fill in:
- name: from their description
- stack.backend: language, version, framework, package_manager, linter, typechecker, test_runner
- stack.frontend: same fields
- stack.database: primary, secondary
- stack.deployment: method ("docker-compose"), services list
- evaluation: api_base_url, ui_base_url, health_check, design_score_threshold (7), design_max_iterations (10), test_corpus_dir
- execution: default_mode ("full"), max_self_heal_attempts (3), max_auto_iterations (50), coverage_threshold (80), session_chaining (true), agent_team_size ("auto"), teammate_model ("sonnet"), model_tier ("balanced"), latency_budget_ms ({ "read": 300, "write": 800, "regression_pct": 50 } — default per-endpoint latency targets the evaluator measures against; read endpoints are ratcheted on p95 regression, writes get an advisory budget WARN; override per-endpoint in a sprint contract's performance_checks), ceremony ("full" — see docs/adaptive-ceremony.md; "trimmed" skips sprint decomposition for single-story groups and caps the design-critic loop, never the verification gates)
  - `model_tier` sets the cost posture by stamping each agent's `model:` pin (applied in Step 3). `cost` / `enterprise` = Sonnet generation, Haiku exploration, Opus judgment (product default); `balanced` = Sonnet generation + exploration, Opus judgment (monorepo dogfood); `max-quality` = generation bumped to Opus 5. See `docs/model-allocation.md` and `docs/token-cost-playbook.md`.
  - **Product default is cost.** Full-stack (`web-app` / `api-service`) and lite (`cli-or-library`) topologies both stamp `model_tier: "cost"`. Lite also uses `ceremony: "trimmed"` and `verification.mode: "local"`. Override via profile `modelTier`. Never weakens evaluator, security, or deterministic gates.
- lsp: detected language servers and install commands (see below)
- verification: mode, and mode-specific config (see below)
- architecture (optional): controls the one-way layer-import gate. Read by the layer gates (verify-on-save + pre-commit), which otherwise default to the web-app `{"layers": ["types","config","repository","service","api","ui"], "layer_roots": ["src"]}`. Set it in these cases:
  - **Custom layered layout** — give `layers` (the import hierarchy low→high) and `layer_roots` (directory prefixes containing layer dirs).
  - **Non-layered project shape** — for a library, CLI, data pipeline, ML project, or the minimal preset (D), write `"architecture": {"enabled": false}` so the layer gate does not impose a web-app hierarchy on code that has none. **Default to this for project type D and any non-web stack.**
  - **Standard web app** — omit the block entirely to take the 6-layer default.
  - **Bounded contexts (vertical, opt-in, sibling to `layers`)** — set `contexts` when the codebase has distinct domain modules (e.g. `src/billing`, `src/user`) that must not reach into each other's internals except via a public surface or an explicit exception. This is the vertical complement to the horizontal `layers` gate above — enforced by `.opencode/hooks/lib/contexts.js` (gap G8), on every write and at pre-commit, but only when this block is present; unset is the default for most projects (no false positives on unconfigured repos). Config shape: `"architecture": {"contexts": {"roots": ["src/billing","src/user"], "allow": [["billing","user"]], "public": ["index","public","__init__"]}}` — `roots` are the context directories, `allow` is an explicit list of permitted `[from,to]` cross-context import edges (default `[]`, strictest), and `public` names the entry points that count as a context's public surface (defaults shown). Populate this from the wizard's Q9 ("Enforce bounded-context boundaries…", Step 1.E) when the user opts in; otherwise omit the `contexts` key entirely — there is no `"enabled": false` form for it (that flag belongs to `layers` only).

```json
"architecture": {
  "layers": ["domain", "application", "adapters", "handlers"],
  "layer_roots": ["app", "internal"]
}
```

- observability (optional): `"observability": { "enabled": bool, "metrics_path": "/metrics", "red_labels": ["method","route","status"], "slo": {"error_rate_pct": number, "p95_ms": number} } | omitted for lite shapes,`

`observability` (G9): default-on for server shapes; the generator reads the observability code-gen references when `enabled` and the project exposes an HTTP server. Set `enabled:false` to opt out.

- accessibility (optional): `"accessibility": { "enabled": bool } | omitted (default on),`

`accessibility` (G12): default-on axe/WCAG gate for UI stories (contracts with `playwright_checks`). Set `enabled:false` to opt out.

- token_governor: default-on advisory living navigation and compact-output
  guidance. The renderer writes
  `{"enabled":true,"mode":"advisory","living_navigation":true,"context_search_required":true,"max_source_read_lines":300,"tool_output_token_estimates":true,"compress_tool_output":true,"ccr_enabled":true,"preserve_full_outputs":true,"budget_warn_pct":80}`.
  Empty greenfield repos get placeholder code-map/wiki artifacts; source-bearing
  repos get an immediate lean DeepWiki/code-map bootstrap.

- **Topology:** the manifest records a detected `topology` (`web-app` / `api-service` / `cli-or-library`) and applies its preset bundle of harness knobs (architecture, observability, verification mode, ceremony, model tier). Print the detected topology and its `summary` (from `.opencode/scripts/topologies.js`) in the scaffold report, e.g. "Detected topology: web-app → layered architecture · observability · docker verify · full ceremony · balanced model tier." Every field stays overridable in `project-manifest.json`.

- **quality.sensor_tier** (operability dial, PR3/PR4): `"minimal" | "standard" | "strict"`. Filters which pre-commit gates run (see `docs/product-skus-and-tiers.md` and `.opencode/hooks/lib/sensor-tier.js`). Deterministic defaults from `scaffold-render.js`:
  - topology `cli-or-library` (project type D / lite shapes) → **`minimal`**
  - `web-app` / `api-service` → **`standard`**
  - Override with profile field `sensorTier` or by editing the written manifest later.
  Also seed `quality.agent_readiness: { "mode": "report", "min_active_pillars": 3, "forbid_regression": false }` for Project Zero-style readiness reporting. Print in the Step 10 report: `Sensor tier: <value> (change via project-manifest.json#quality.sensor_tier)`.

### Auto-attach stack-matched specialty packs

`scaffold-apply.js` and `scaffold-render.js` both derive the effective `frameworkPacks` list via a shared `deriveFrameworkPacks(profile)` helper: whatever the user explicitly selected in the tech-stack-pack question (Step 1.E Q7), plus `fastapi-code` whenever `stack.backend.framework === "fastapi"`, plus `react-code` whenever `stack.frontend.framework === "react"` (the Vite variant — Presets A and C; **not** `"nextjs"`, Preset B). This is fully automatic in both interactive and non-interactive (`--yes`) modes — there is no separate question or confirmation-card line for it, and no manual step is required for either pack since both are locally bundled.

### LSP Config (auto-detected from stack)

Infer the recommended LSP servers from the stack chosen in Step 1. Write an `lsp` block into `project-manifest.json`:

```json
"lsp": {
  "servers": [
    { "language": "python", "server": "pyright", "binary": "pyright", "install": "npm i -g pyright" },
    { "language": "typescript", "server": "typescript-language-server", "binary": "typescript-language-server", "install": "npm i -g typescript-language-server typescript" }
  ]
}
```

Use this mapping table to populate the `servers` array — include only the languages present in the stack:

| Language | LSP Server | Binary on `$PATH` | Install Command |
|----------|------------|-------------------|-----------------|
| Python | pyright | `pyright` | `npm i -g pyright` |
| TypeScript / JavaScript | typescript-language-server | `typescript-language-server` | `npm i -g typescript-language-server typescript` |
| Go | gopls | `gopls` | `go install golang.org/x/tools/gopls@latest` |
| Java | jdtls | `jdtls` | `brew install jdtls` (macOS) or download from eclipse.org |
| C# | omnisharp-roslyn | `OmniSharp` | `dotnet tool install -g omnisharp` |
| Rust | rust-analyzer | `rust-analyzer` | `rustup component add rust-analyzer` |

For preset stacks:
- **A/B** (Python + TypeScript): include pyright + typescript-language-server
- **C** (Node + TypeScript): include typescript-language-server only
- **Custom Python**: include pyright only
- **Custom Node/TypeScript**: include typescript-language-server only
- **Custom (other)**: match from the table above or leave `servers: []` with a comment

### Mutation Testing Config (auto-detected from stack)

`.opencode/scripts/deep-mutation.js` (gap G25) already knows how to drive Stryker or mutmut — its `detectTool()` just needs a starter config or dependency on disk to find, instead of defaulting to `unprovisioned` on every project `/scaffold` produces. Infer the recommended tool from the stack chosen in Step 1 and write a `quality.mutation` block into `project-manifest.json`:

```json
"quality": {
  "mutation": {
    "tool": "stryker",
    "config_file": "stryker.conf.json",
    "critical_globs": []
  }
}
```

Use this mapping — Python backend takes priority (deep mutation is usually aimed at backend business logic first); fall back to Stryker whenever a JS/TS side exists:

| Stack signal | Tool | `config_file` |
|---|---|---|
| `stack.backend.language` is `python` | mutmut | `pyproject.toml` (`[tool.mutmut]`) |
| No Python backend, but `stack.backend.language` or `stack.frontend.language` is `javascript`/`typescript` | Stryker | `stryker.conf.json` |
| Neither (Go, Rust, Java, C#, …) | — | omit the `quality.mutation` block entirely — `deep-mutation.js` already degrades to `unprovisioned` cleanly and there is no tool to recommend |

Leave `critical_globs` empty by default — same reasoning as `verification.golden_paths` (G16): which files are worth the heavier mutation tier is a human judgment call the scaffold shouldn't guess at. The team fills it in once they know which modules are actually critical.

### Provision the Mutation Tool (write starter config)

Detection alone isn't the fix — a team that wants Stryker or mutmut should not have to hand-write a config from scratch. Write the starter file(s) below at the **project root** (not inside `backend/`/`frontend/`) — `detectTool()` only ever checks `process.cwd()`, so a config nested in a subdirectory is invisible to it.

**JS/TS (Stryker) — whenever the mapping above selected it:**

Map the JS/TS side's `test_runner` to a Stryker runner plugin (use the frontend's `test_runner` for presets A/B; the backend's for preset C or any JS/TS-only custom stack):

| `test_runner` | Stryker `testRunner` | Runner package to add |
|---|---|---|
| `vitest` | `vitest` | `@stryker-mutator/vitest-runner` |
| `jest` | `jest` | `@stryker-mutator/jest-runner` |
| anything else / unset | `command` | none — Stryker's built-in command runner; note this in the Step 10 report so the team can swap in a real plugin later |

Copy `.opencode/templates/stryker.conf.json.template` to `stryker.conf.json` at the project root, replacing `{{TEST_RUNNER}}` with the mapped value and `{{MUTATE_GLOB}}` with the JS/TS side's source glob (`frontend/src/**/*.ts` for presets A/B, `backend/src/**/*.ts` for preset C, `src/**/*.ts` for a single-root custom Node/TS project — adjust the extension to `.tsx`/`.js` as the stack requires).

If `package.json` already exists at the project root (a brownfield rescaffold), add `@stryker-mutator/core` and the mapped runner package to its `devDependencies` (merge — never overwrite existing deps). `/scaffold` does not generate application source, so a greenfield project has no `package.json` yet; in that case, note in the Step 10 report that these two packages need adding to the JS/TS side's `package.json` once it exists (typically during `/implement`) — the same "detected, not force-installed" posture the LSP section above takes with missing LSP binaries.

**Python (mutmut) — whenever the mapping above selected it:**

If `pyproject.toml` already exists at the project root (brownfield), add a `[tool.mutmut]` section if one isn't already present, and add `mutmut` via whatever Python dev-dependency mechanism that file already uses (`uv add --dev mutmut`, an existing `[project.optional-dependencies].dev` list, or `[tool.poetry.group.dev.dependencies]`) — match the existing convention, don't introduce a new one.

If no `pyproject.toml` exists yet (the common greenfield case — the real backend project file will later live at `backend/pyproject.toml`, a different path, so this is safe and won't collide), copy `.opencode/templates/mutmut-pyproject.template.toml` to `pyproject.toml` at the project root, replacing `{{PATHS_TO_MUTATE}}` with the backend source dir (`backend/src/` for presets A/B, `src/` for a single-root custom Python project) and `{{RUNNER_CMD}}` with the matching test command (`cd backend && uv run pytest -x -q` for presets A/B, `uv run pytest -x -q` for a single-root project). Note in the Step 10 report that `mutmut` itself still needs adding (`uv add --dev mutmut`) once the backend Python project exists.

### Verification Config (based on the verification-mode decision)

**If Docker (A):**
```json
"verification": {
  "mode": "docker",
  "docker": { "compose_file": "docker-compose.yml", "services": ["backend", "frontend"] }
}
```

**If Local (B):**
```json
"verification": {
  "mode": "local",
  "local": { "backend_url": "http://localhost:8000", "frontend_url": "http://localhost:3000", "start_commands": [] }
}
```

**If Stub (C):**
```json
"verification": {
  "mode": "stub",
  "stub": { "schema_source": "specs/design/api-contracts.schema.json", "auto_generate_mock_server": true }
}
```

**In all three modes**, `verification` also carries an optional `golden_paths` array (gap G16) — e2e spec paths (relative to the project root, e.g. `"e2e/checkout.spec.ts"`) that `local-regression-gate.js` always runs on every `/change`/`/vibe`, regardless of what its impact analysis selects. It's a human-curated safety net under a possibly-stale code-graph, not auto-populated by `/scaffold` — leave it `[]` until the team has stories worth pinning as "must never break," then add them manually:
```json
"verification": {
  "mode": "docker",
  "docker": { ... },
  "golden_paths": []
}
```

### Generate calibration-profile.json (based on the project-type decision)

**If Consumer-facing app (A):**
```json
{
  "scoring": {
    "weights": { "design_quality": 1.5, "originality": 1.5, "craft": 1.5, "functionality": 1.0 },
    "threshold": 8,
    "per_criterion_minimum": 5
  },
  "iteration": {
    "max_iterations": 10,
    "plateau_window": 3,
    "plateau_delta": 0.3,
    "pivot_after_plateau": true
  }
}
```

**If Internal tool (B):**
```json
{
  "scoring": {
    "weights": { "design_quality": 0.75, "originality": 0.5, "craft": 0.5, "functionality": 1.5 },
    "threshold": 6,
    "per_criterion_minimum": 4
  },
  "iteration": {
    "max_iterations": 5,
    "plateau_window": 3,
    "plateau_delta": 0.3,
    "pivot_after_plateau": false
  }
}
```

**If API-only (C):** Do not create `calibration-profile.json` (no UI scoring needed).

**If Minimal (D):** Do not create `calibration-profile.json` (no UI scoring needed). The Step 10 report should lead with `/build --lite` as the recommended entry point.

Preset mappings:
- A) backend: python/3.12/fastapi/uv/ruff/mypy/pytest, frontend: typescript/react/vite/npm/eslint/tsc/vitest, db: postgresql
- B) backend: python/3.12/fastapi/uv/ruff/mypy/pytest, frontend: typescript/nextjs/16/npm/eslint/tsc/vitest, db: postgresql
- C) backend: javascript/node/express/npm/eslint/tsc/jest, frontend: typescript/react/vite/npm/eslint/tsc/vitest, db: postgresql

## Step 3: Copy Scaffold Files

First, locate the plugin source directory. `${HARNESS_PLUGIN_ROOT}` is the authoritative answer when set — the harness plugin adapter exports it to hook processes, and users can export it in their shell to point at the harness checkout. Inside an opencode command session it is usually unset — fall back to searching.

```bash
# Authoritative: the running plugin's own root.
PLUGIN_SOURCE="${HARNESS_PLUGIN_ROOT}"

# Fallback 1: newest local marketplace cache for this plugin.
if [ -z "$PLUGIN_SOURCE" ] || [ ! -f "$PLUGIN_SOURCE/.opencode-plugin/plugin.json" ]; then
  PLUGIN_SOURCE=$(find ~/.opencode/plugins/cache/local-harness -maxdepth 4 -path "*/.opencode-plugin/plugin.json" -exec grep -l '"name": "opencode_harness_design"' {} + 2>/dev/null | sort -V | tail -1 | sed 's|/.opencode-plugin/plugin.json||')
fi

# Fallback 2: conventional clone location for --plugin-dir development sessions.
if [ -z "$PLUGIN_SOURCE" ]; then
  PLUGIN_SOURCE=$(find ~/opencode_harness_design/.opencode -maxdepth 3 -path "*/.opencode-plugin/plugin.json" -exec grep -l '"name": "opencode_harness_design"' {} \; 2>/dev/null | head -1 | sed 's|/.opencode-plugin/plugin.json||')
fi

echo "Found plugin at: $PLUGIN_SOURCE"
```

If `$PLUGIN_SOURCE` is empty, ask the user: "Where is the opencode_harness_design repo cloned? I need the path to copy scaffold files." Then set `PLUGIN_SOURCE=/path/they/give/.opencode`.

Resolve the harness root (one level above `.opencode/`) before validation:

```bash
HARNESS_ROOT=$(dirname "$PLUGIN_SOURCE")
SCAFFOLD_PROFILE="${SCAFFOLD_PROFILE:-core}"       # core | brownfield | full
TELEMETRY_REQUESTED="${TELEMETRY_REQUESTED:-0}"   # 1 only when --telemetry was passed
```

Before copying, validate the source:

```bash
test -f "$PLUGIN_SOURCE/.opencode-plugin/plugin.json"
test -d "$PLUGIN_SOURCE/skills/brownfield"
test -d "$PLUGIN_SOURCE/skills/context"
test -d "$PLUGIN_SOURCE/skills/code-map"
test -f "$PLUGIN_SOURCE/skills/code-map/scripts/import_understand_graph.js"
test -f "$PLUGIN_SOURCE/scripts/context-pack.js"
test -f "$PLUGIN_SOURCE/scripts/context-retrieve.js"
test -f "$PLUGIN_SOURCE/scripts/context-store.js"
test -f "$PLUGIN_SOURCE/scripts/telemetry-memory.js"
test -f "$PLUGIN_SOURCE/scripts/navigation-refresh.js"
test -f "$PLUGIN_SOURCE/scripts/run-compact.js"
test -f "$PLUGIN_SOURCE/scripts/search-compact.js"
test -f "$PLUGIN_SOURCE/scripts/tool-output-pack.js"
test -f "$PLUGIN_SOURCE/hooks/token-advisor.js"
test -d "$PLUGIN_SOURCE/skills/seam-finder"
test -d "$PLUGIN_SOURCE/skills/vibe"
test -f "$PLUGIN_SOURCE/templates/context.template.md"
test -f "$PLUGIN_SOURCE/templates/security-guidance.template.md"
test -f "$PLUGIN_SOURCE/templates/security-patterns.template.yaml"
test -f "$PLUGIN_SOURCE/templates/story.template.md"
# Assert load-bearing skills exist rather than a brittle exact count (the count
# changes whenever a skill is merged/split — existence checks don't).
for s in build auto feature brownfield context code-map change vibe refactor tracker-publish code-gen evaluate gate status; do
  test -f "$PLUGIN_SOURCE/skills/$s/SKILL.md"
done
SKILL_COUNT=$(find "$PLUGIN_SOURCE/skills" -mindepth 2 -maxdepth 2 -name SKILL.md | wc -l | tr -d ' ')
test "$SKILL_COUNT" -ge 15   # sanity floor, not an exact pin
test -f "$PLUGIN_SOURCE/templates/story.template.md"
test -f "$PLUGIN_SOURCE/templates/sprint-contract.json"
test -f "$PLUGIN_SOURCE/templates/agents-md.template.md"
test -f "$PLUGIN_SOURCE/templates/design.template.md"
test -f "$PLUGIN_SOURCE/git-hooks/prepare-commit-msg"
test -f "$PLUGIN_SOURCE/git-hooks/pre-commit"
test -f "$HARNESS_ROOT/README.md"
# Validate telemetry stack assets only if telemetry was requested.
if [ "$TELEMETRY_REQUESTED" = "1" ]; then
  test -f "$HARNESS_ROOT/telemetry_docker_compose.yml"
  test -f "$HARNESS_ROOT/telemetry/otel-collector-config.yml"
  test -f "$HARNESS_ROOT/telemetry/prometheus.yml"
  test -f "$HARNESS_ROOT/telemetry/cache-alerts.rules.yml"
  test -f "$HARNESS_ROOT/telemetry/grafana/dashboards/harness-overview.json"
  test -f "$HARNESS_ROOT/telemetry/grafana/dashboards/cache-health.json"
  test -f "$HARNESS_ROOT/telemetry/grafana/provisioning/dashboards/dashboards.yml"
  test -f "$HARNESS_ROOT/telemetry/grafana/provisioning/datasources/prometheus.yml"
fi
```

If any validation command fails, stop and report: "The resolved plugin source is stale or incomplete; refresh the local marketplace and update the plugin before scaffolding."

Once you have the source path, run the deterministic generator. It owns the lane-appropriate copy set (`core`, `brownfield`, or `full`), writes settings, seeds state, and applies the scaffold profile without hand-copy drift:

```bash
node "$PLUGIN_SOURCE/scripts/scaffold-apply.js" \
  --profile ./.scaffold-profile.json \
  --plugin-source "$PLUGIN_SOURCE" \
  --target . \
  --scaffold-profile "$SCAFFOLD_PROFILE" \
  ${TELEMETRY_REQUESTED:+--telemetry}
```

The generator also initializes living navigation. In an empty greenfield repo it
writes placeholder `specs/brownfield/code-graph.json`, `symbol-map.md`, and
`wiki/WIKI.md` so later hooks have stable paths. In a source-bearing repo it runs
the lean initial code-map/wiki render immediately. The `graph-refresh` hook keeps
the graph, symbol map, and deterministic DeepWiki current after edits.

`settings.auto.json` is the **unattended full-auto profile** — a no-prompt permission set (`Bash(*)`, `Write(*)`, …) plus `HARNESS_AUTO_CONTINUE=1`. It is never auto-loaded; a headless `--auto` run opts into it explicitly (the plugin adapter and hooks read it only when `HARNESS_SETTINGS=.opencode/settings.auto.json` is exported). It merges over the curated `settings.json`, so the deterministic gate hooks and ratchet still enforce safety — interactive sessions keep `settings.json`'s curated allowlist untouched. Do not enable broad permissions in `settings.json` itself.

**Apply the cost-posture preset.** Stamp each agent's `model:` pin from the manifest's `execution.model_tier` (product default `cost` — Sonnet generation, Haiku explorer, Opus judgment). This is the one place a model is named; the prompt bodies stay model-agnostic.

```bash
node .opencode/scripts/model-tier.js "$(node -e "process.stdout.write(require('./project-manifest.json').execution?.model_tier || 'balanced')")" --apply .opencode/agents
```

To change a project's cost posture later, edit `execution.model_tier` in `project-manifest.json` and re-run that command (`cost` | `balanced` | `max-quality`). See `docs/model-allocation.md` for the profiles and the decision rule.

Copy the telemetry stack config only if telemetry was requested. These files are dormant until the stack is started, but the env block is already written by `scaffold-apply.js --telemetry`:

```bash
if [ "$TELEMETRY_REQUESTED" = "1" ]; then
  cp "$HARNESS_ROOT/telemetry_docker_compose.yml" ./telemetry_docker_compose.yml
  mkdir -p telemetry
  cp "$HARNESS_ROOT/telemetry/otel-collector-config.yml" ./telemetry/
  cp "$HARNESS_ROOT/telemetry/prometheus.yml" ./telemetry/
  cp "$HARNESS_ROOT/telemetry/cache-alerts.rules.yml" ./telemetry/
  cp "$HARNESS_ROOT/telemetry/CACHE_MONITORING.md" ./telemetry/
  rm -rf ./telemetry/grafana && cp -r "$HARNESS_ROOT/telemetry/grafana" ./telemetry/
fi
mkdir -p docs
cp "$HARNESS_ROOT/docs/telemetry.md" "$HARNESS_ROOT/docs/testing.md" "$HARNESS_ROOT/docs/extras.md" "$HARNESS_ROOT/docs/prompting-standards.md" "$HARNESS_ROOT/docs/model-allocation.md" ./docs/
```

**Important:** Do NOT run `mkdir -p` on any of the file paths inside `telemetry/` — that would create directories where files should be. The `cp` commands above handle the file creation directly.

**Important:** You MUST actually run these copy commands via Bash. Do NOT skip this step or try to generate the files from memory. The source files contain hooks, agent definitions, and skill instructions that must be copied exactly.

### Configure opencode.json (permissions + MCP, based on the browser-automation decision)

The `settings.json` you just copied is the **harness's own** internal manifest (env flags, hook wiring for the plugin adapter, and the vertical-pack registry). It is not opencode configuration. Delete any `enabledPlugins` key inherited from the harness seed unless the target already had project-scoped vertical entries — preserve those.

Generate the target's `opencode.json` at the project root by copying the harness's own `opencode.json` (permission allowlist + the `harness-nav` MCP server, with the MCP command path pointing at `.opencode/scripts/nav-mcp-server.js` in the target).

**If the user enabled browser automation (Q5 = Yes):** add the Playwright MCP server so the `evaluator` agent's Layer 2 (browser verification) and the `design-critic` GAN loop (Layer 3) can drive a browser. Without it those layers cannot run — `/evaluate` degrades to API-only checks. Record a Q5 = No answer as a degradation in the Step 10 report.

```json
"mcp": {
  "playwright": {
    "type": "local",
    "command": ["npx", "-y", "@playwright/mcp@latest"],
    "enabled": true
  }
}
```

**If No:** omit the `playwright` MCP entry — skip browser automation.

Claude Code official plugins (superpowers, code-review, commit-commands, security-guidance, pr-review-toolkit, frontend-design, context7, code-simplifier) have no opencode equivalents and are **not** installed. Where the source harness leaned on them, the port substitutes:

- `superpowers` workflows → inline discipline (TDD red-green-refactor and quality rules from `.opencode/skills/code-gen/SKILL.md`; for debugging, reproduce → isolate → root-cause before fixing)
- `security-guidance` advisory review → the deterministic `pre-write-gate` hook still blocks secrets before they reach disk, and the **`security-reviewer` agent is the enforced gate** (its `security-verdict.json` fails `/evaluate` and the `/auto` loop on any critical/high finding). Sharpen it with a project threat model in `.opencode/security-guidance.md` and custom deterministic patterns in `.opencode/security-patterns.yaml` — the `pre-write-gate` hook reads that patterns file and **hard-blocks** any rule you flag `block: true`.
- `frontend-design` / `code-simplifier` / review toolkits → the harness's own `design-critic`, `/refactor`, and `code-reviewer` surfaces.

### Generate .mcp.json (MCP Server Configuration)

Copy the MCP config template to the project root as a starting point for connecting to internal tools, databases, and documentation:

```bash
cp $PLUGIN_SOURCE/templates/mcp-config.template.json .mcp.json
```

All servers are disabled by default. The user enables servers they need and configures connection details. Add `.mcp.json` to version control so all team members get the same MCP server configuration.

### Generate Security Threat-Model Files

Copy the security starter files to `.opencode/` (read by the `pre-write-gate` hook and the `security-reviewer` gate):

```bash
cp $PLUGIN_SOURCE/templates/security-guidance.template.md .opencode/security-guidance.md
cp $PLUGIN_SOURCE/templates/security-patterns.template.yaml .opencode/security-patterns.yaml
```

`security-guidance.md` holds the project threat model; its `MUST`/`NEVER` rules are advisory in the plugin but become **blocking** findings in the `security-reviewer` gate. `security-patterns.yaml` adds deterministic per-edit warning patterns (plugin-only, advisory). Commit both. Tell the user to fill in the project-specific rules and note that `security-patterns.yaml` requires PyYAML in the plugin's Python — otherwise rename it to `security-patterns.json` (same schema).

### Generate the Architecture Constitution

Copy the constitution starter file — the cross-sprint invariants `/sprint`'s
design-delta gate checks every amendment against:

```bash
cp $PLUGIN_SOURCE/templates/constitution-template.md specs/design/constitution.md
```

Tell the user this file starts empty (example invariants only) and should be
filled in once the sprint-1 design is approved — it is reviewed like code at
every sprint boundary.

## Step 4: Create Output Directories

```bash
mkdir -p specs/brd specs/stories specs/design/mockups specs/design/amendments specs/reviews specs/test_artefacts specs/brownfield sprint-contracts e2e
```

### Optional Tracker Orchestration Files

If the user chose any tracker orchestration option other than "No":

```bash
cp .opencode/templates/tracker-config.template.json .opencode/tracker-config.json
mkdir -p .opencode/state/tracker-runs
```

Then write `.opencode/tracker-config.json` with the chosen mode flipped on. Do not leave the file shipped from the template (`enabled: false`) — that silently disables `/tracker-publish` and confuses users.

Use the Edit or Write tool to make these changes explicitly:

- Mode B (Publish only): set `enabled: true`, `mode: "publish-only"`.
- Mode C (Publish + sync): set `enabled: true`, `mode: "sync"`.
- Mode D (Publish + external orchestrator dispatch): set `enabled: true`, `mode: "orchestrate"`.

If the user named a specific provider in Q1 ("Linear", "Jira"), also overwrite `provider` to match. Leave `project_slug` as the template placeholder — the user must fill it in themselves (their tracker workspace slug is not knowable from the scaffold interview).

Do not write tracker API keys into `.opencode/tracker-config.json`. Use environment variables such as `LINEAR_API_KEY`, `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, and `GITHUB_TOKEN`. Surface the remaining prerequisites in the Step 10 report (see "Tracker Setup Addendum" below).

### Optional Agent-Framework Skill Packs & Domain Vertical Plugins

If the user selected one or more tech-stack skill packs (LangChain/LangGraph/DeepAgents, or Google ADK) and/or one or more domain vertical plugins (e.g. private equity) at the confirmation card or wizard, record both selections in `project-manifest.json` and print the manual install commands in the Step 10 report. These are two independent choices asked together in one step — a user may pick a tech-stack pack, a domain vertical, both, or neither.

#### Tech-Stack Packs

**A) Local — Python AI Agents (LangGraph, LangChain, DeepAgents) — bundled, no install needed**

This pack (`python-ai-agents`) is authored and bundled directly in this harness. If selected, its three skills (`langgraph-code`, `langchain-code`, `deepagents-code`) are copied automatically by `scaffold-apply.js`'s `copyFrameworkPackSkills` when the scaffold is applied — no manual step, no entry in the Step 10 manual-install block.

**B) External — LangChain / LangGraph / DeepAgents (community pack) — 9 skills**

Do not run `npx skills add` from `/scaffold`. Agent auto-mode commonly blocks external `npx` installs even when command permissions are allowlisted, so attempting it during scaffold creates a noisy denial and a misleading partial-success report. The reliable path is: (1) scaffold writes the harness files and records selected packs; (2) the user runs the listed `npx --yes skills add ...` command in a normal terminal; (3) the user returns to opencode and runs `/install-framework-packs --list` to verify.

**Important:** manual commands must be run inside the target project directory. Do NOT use `-g`/`--global`. **CLI syntax:** the package source goes FIRST as a positional argument — flags before it fail with `ERROR Missing required argument: source`.

```bash
npx --yes skills add cwijayasundara/agent_cli_langchain -a opencode -s '*' -y
```

Expected: 9 skills under `.opencode/skills/langchain-agents-*`. Source: <https://github.com/cwijayasundara/agent_cli_langchain>. Two skills (`deepagents-code`, `deploy`) carry a "Med Risk" Snyk flag from the `skills` CLI's install-time scan — surface this in the install report; the flag's cause hasn't been independently root-caused (likely a repo/dependency-level finding, not something found in the skill content itself — see below).

Content review (2026-07-07): the actual `SKILL.md` bodies for `langgraph-code`, `langchain-code`, `deepagents-code`, `middleware`, and `deploy` were read directly from the repo and found to be current, specific, and production-oriented (version-pinned breaking-change notes, concrete gotchas, real decision tables) — not generic filler. This is not a formal security audit and does not resolve the Snyk flag above; it only speaks to content quality. Its design differs from option A: it's an "editorial" layer that defers API signatures/facts to a live `mcpdoc` MCP tool fetch rather than inlining reference docs, so it needs that MCP server configured for full value, and it additionally covers LCEL/RAG-chain patterns that option A's pack does not. Prefer A by default (no install step, no MCP dependency); pick B if the user wants that broader LCEL coverage or already has `mcpdoc` set up.

**C) Google ADK — 7 skills**

```bash
npx --yes skills add google/agents-cli -a opencode -s '*' -y
```

Expected: 7 skills under `.opencode/skills/google-agents-cli-*`.

Verify manual installs with:

```bash
ls .opencode/skills/ | grep -E '^(langchain-agents|google-agents-cli)-' | wc -l
```

#### Domain Vertical Plugins

Read `.opencode/config/scaffold-packs.json`'s `verticalPacks` array for the list of known verticals to offer (currently: `private-equity`). A selected vertical originates from the Claude Code plugin marketplace — opencode has no equivalent marketplace, so the vertical's skills are installed manually (via the Claude CLI if available, or by copying the pack's skills into `.opencode/skills/`) and then registered in `.opencode/settings.json#enabledPlugins` (the harness-internal vertical registry). Kept separate from the tech-stack packs above in the report below on purpose.

Once selected, the vertical's `enabled_plugin_prefix` becoming truthy in `.opencode/settings.json#enabledPlugins` (via the manual install below) is what makes `/brd` Step 2.7 (`vertical-glossary-pack.js`) start seeding `CONTEXT.md` from that vertical's skill vocabulary automatically — no further scaffold-side action needed once installed.

#### Combined Manual-Install Report (Step 10)

If one or more external tech-stack packs or domain verticals were selected, run `node .opencode/scripts/scaffold-vertical-status.js` for the vertical half of the report, and print this combined block verbatim, adding it to the Step 10 report under a "Manual follow-ups" heading:

```text
[!] Some selections require a manual terminal install.
    Agent auto-mode blocks these installs during /scaffold.

  Tech-stack packs (npx):
  cd <project-root>
  npx --yes skills add cwijayasundara/agent_cli_langchain -a opencode -s '*' -y   # if external LangChain pack selected
  npx --yes skills add google/agents-cli -a opencode -s '*' -y                     # if Google ADK selected

  Domain vertical plugins (claude plugin):
  <output of `node .opencode/scripts/scaffold-vertical-status.js`, verbatim, for each selected vertical not yet installed — e.g.:
    private-equity: PENDING MANUAL INSTALL
      claude plugin marketplace add claude-for-financial-services
      claude plugin install private-equity@claude-for-financial-services>

After running, verify:
  ls .opencode/skills/ | grep -E '^(langchain-agents|google-agents-cli)-'
  /install-framework-packs --list
  node .opencode/scripts/scaffold-vertical-status.js
```

The local `python-ai-agents` pack, if selected, needs no line in this block — it's already been copied.

#### Record selections in project-manifest.json

Internally, the selected verticals flow through `profile.domainVerticalPacks` (alongside the existing `profile.frameworkPacks`) before `scaffold-render.js`'s `buildManifest` writes them out below:

```json
"framework_skill_packs": ["python-ai-agents", "langchain", "google-adk"],
"domain_vertical_packs": ["private-equity"]
```

Omit either field if the user picked None for that question.

## Step 5: Generate AGENTS.md

Write AGENTS.md tailored to chosen stack. This is a slim table of contents (~70 lines) that
directs agents to the right reference files via progressive disclosure. Do not inline full rules
here — agents discover details by reading the referenced skill files.

When filling in the LSP Integration section of the template, replace the placeholders:
- `{lsp_install_commands}` — one bullet per server from the `lsp.servers` array in the manifest. Format: `- \`{install_command}\` — {language} ({server_name})`
- `{lsp_verify_command}` — a one-liner that checks all binaries, e.g. `pyright --version && typescript-language-server --version`

### AGENTS.md Template

Read `.opencode/templates/agents-md.template.md`, fill in `{project-name}`, `{description from user input}`, and the `{lsp_*}` placeholders (per the instructions above), tailor the Quick Reference commands to the chosen stack, and write the result to `AGENTS.md` at the project root.

### Step 5.B: Generate Subdirectory AGENTS.md Files (monorepo/multi-module projects)

If the project has separate `backend/` and `frontend/` directories (presets A, B, C), generate scoped AGENTS.md files for each subdirectory. These load additively as Claude navigates the tree.

- **backend/AGENTS.md** (Python projects): copy `.opencode/templates/backend-agents-md.template.md`, then tailor the test/lint commands and conventions to the actual stack.
- **frontend/AGENTS.md** (TypeScript projects): copy `.opencode/templates/frontend-agents-md.template.md`, then tailor the same way.

For single-root projects (custom Python/Node, project type D), skip this step — the root AGENTS.md is sufficient.

**Codebase map:** Also generate a `CODEBASE_MAP.md` at the project root using the template from `.opencode/templates/codebase-map.template.md`. Tailor the directories table and test commands to match the actual project stack inferred in Step 1.B.

## Step 6: Generate design.md

Architecture reference document (~200-300 lines):
- System architecture ASCII diagram
- Karpathy ratchet loop diagram
- Agent roles table (8 agents)
- Hook execution order (consolidated per-event hooks + git commit gates)
- State files description
- Sprint contract format summary
- Quality principles (6)

### design.md Template

Read `.opencode/templates/design.template.md`, adapt the stack-specific bits (architecture diagram, agent/hook tables already reflect the current 8-agent / consolidated-hook design), and write the result to `design.md` at the project root.

## Step 7: Generate init.sh

Read init-sh.template, replace placeholders based on manifest:
- {{BACKEND_INSTALL}}: e.g. `cd backend && uv sync && cd ..`
- {{FRONTEND_INSTALL}}: e.g. `cd frontend && npm ci && cd ..`
- {{DOCKER_COMPOSE_CMD}}: `docker compose up -d --build`
- {{LSP_HEALTH_CHECKS}}: one check per server from `lsp.servers` in the manifest
- {{HEALTH_CHECKS}}: curl commands for each service URL from manifest

Write to `init.sh` and `chmod +x init.sh`.

Placeholder mappings by preset:
- A/B (uv): `{{BACKEND_INSTALL}}` → `cd backend && uv sync && cd ..`
- C (npm): `{{BACKEND_INSTALL}}` → `cd backend && npm ci && cd ..`
- All presets: `{{FRONTEND_INSTALL}}` → `cd frontend && npm ci && cd ..`
- Health checks: use `evaluation.api_base_url`, `evaluation.ui_base_url`, and `evaluation.health_check` from the manifest

LSP health check template — generate one block per entry in `lsp.servers`:
```bash
if command -v {binary} &>/dev/null; then
  echo "  ✓ {server} ($({binary} --version 2>/dev/null || echo 'version unknown'))"
else
  echo "  ✗ {server} not found — install with: {install}"
fi
```

If `lsp.servers` is empty, replace `{{LSP_HEALTH_CHECKS}}` with `echo "  (no LSP servers configured — add to project-manifest.json lsp.servers if needed)"`.

### Mutation Testing Confirmation (if configured)

Mutation tools have no meaningful `--version` health probe the way an LSP binary does, so this doesn't warrant a full health-check block — just a one-line confirmation. If `project-manifest.json#quality.mutation` is set, use the Edit tool to append one line to the just-written `init.sh`, directly after the LSP health-check block:

```bash
echo "Mutation testing: {tool} configured (config: {config_file})"
```

substituting the `tool`/`config_file` values just written. If `quality.mutation` was omitted (no JS/TS or Python side detected), skip this — there is nothing to confirm.

## Step 8: Initialize Git

```bash
git init
```

Wire git to the harness hook set (always). `scaffold-apply.js` already copied the
`.opencode/git-hooks/` tree (`pre-commit`, `commit-msg`, `prepare-commit-msg`, `lib/`);
point `core.hooksPath` at it so the hooks run from `.opencode/git-hooks/` — the only
location where their `__dirname`-relative `require()`s resolve (`../hooks/lib/...`
and `lib/refactor-purity`). Do **not** copy them into `.git/hooks/`: there
`../hooks/lib` resolves to a nonexistent `.git/hooks/lib/` and every commit crashes
with `MODULE_NOT_FOUND`. `check-git-hooks.js` honors `core.hooksPath`, so the
installed-hook guard stays green.

```bash
chmod +x .opencode/git-hooks/prepare-commit-msg .opencode/git-hooks/pre-commit .opencode/git-hooks/commit-msg
git config core.hooksPath .opencode/git-hooks
mkdir -p .opencode/runs
```

### Telemetry (default: OFF)

Telemetry is opt-in. The deterministic generator bakes OTEL + Pushgateway env vars into `settings.json` and `settings.auto.json` only when `--telemetry` or `"telemetry": true` is used. Without that flag, the `record-run` hook still writes local harness memory, but no OTEL metrics are exported and the hook does not push to a Pushgateway.

When telemetry is enabled, the user still starts the stack — the one step scaffold cannot automate:

```bash
docker compose -f telemetry_docker_compose.yml up -d
# OTEL collector :4317 · Prometheus :9090 · Pushgateway :9091 · Grafana :3001 (admin/harness)
```

The stack (`telemetry_docker_compose.yml`, `telemetry/` configs, dashboards) is copied only in telemetry mode. After starting it, restart the Claude session so the env block is picked up. Each teammate can set `HARNESS_USER` to label their metrics; left unset, the `record-run` hook derives it from git `user.name` / the OS user. Full setup, the metric catalog, and PromQL queries: **`docs/telemetry.md`** (copied into the project). To turn telemetry off again, remove the `HARNESS_ENABLE_TELEMETRY` / `OTEL_*` / `HARNESS_PUSHGATEWAY_URL` keys from settings.

Write `.gitignore` by copying the template:

```bash
cp .opencode/templates/gitignore.template .gitignore
```

## Step 9: Initialize State Files

```bash
echo '[]' > features.json
```

Write `claude-progress.txt`:
```
=== Session 0 ===
date: {ISO 8601 now}
mode: full
groups_completed: []
groups_remaining: []
current_group: none
current_stories: []
sprint_contract: none
last_commit: none
features_passing: 0 / 0
coverage: 0%
learned_rules: 0
blocked_stories: none
next_action: Run /brd to start
```

## Step 10: Report

The Step 3 validation asserts that the load-bearing skills exist (not an exact count), so adding or merging skills does not break the scaffold.

Tailor the "Next steps" ordering based on the project-type decision:

- If the user picked **D — Minimal** as the project type, lead with `/build --lite` and demote `/brd`.
- Otherwise, keep `/brd` as the default first action.

**Default report (questions 3 = A / B / C):**
```
✓ OpenCode Harness Engine v5 scaffolded successfully.

Installed:
  scaffold      → {core|brownfield|full} profile
  agents        → .opencode/agents/ (profile-selected)
  skills        → .opencode/skills/ (profile-selected)
  hooks         → .opencode/hooks/ (per-event gates + lib/)
  templates     → .opencode/templates/ (+ state-seeds/)
  workflows/    → .opencode/workflows/  (full profile only)
  state seeds   → .opencode/state/ (from templates/state-seeds/)
  navigation    → living DeepWiki/code-map initialized ({placeholder|fresh})
  1 manifest    → .opencode/.opencode-plugin/plugin.json

Sensor tier: {project-manifest.json#quality.sensor_tier} (minimal|standard|strict)
  Change via project-manifest.json#quality.sensor_tier — see docs/product-skus-and-tiers.md
  Filters pre-commit gates; default is minimal for cli-or-library, standard otherwise

Telemetry (OFF by default — opt-in):
  Enable with /scaffold --telemetry or profile.telemetry=true
  When enabled: telemetry_docker_compose.yml + telemetry/ stack files are copied

LSP servers (auto-detected from stack):
  {for each lsp.servers entry, run `command -v {binary}` and print one of:}
  ✓ {server} ({language})             — found at $(which {binary})
  ✗ {server} ({language})             — not found, install: {install}

{if `project-manifest.json#quality.mutation` was written:}
Mutation testing (auto-detected from stack):
  {tool} — starter config written to {config_file}
  {if the JS/TS or Python dependency file didn't exist yet to receive the package:}
  Install once the project exists: {npm i -D @stryker-mutator/core @stryker-mutator/{runner}-runner | uv add --dev mutmut}
  {if it already existed and the dependency was added directly:}
  Added {@stryker-mutator/core + runner package | mutmut} to {package.json | pyproject.toml} devDependencies

Large codebase tips:
  - Add subdirectory AGENTS.md files for monorepo modules (see Step 5.B pattern)
  - Run `node .opencode/scripts/archive-state.js` if state files grow large
  - Use the codebase-explorer agent for read-only discovery before broad changes
  {if the project has separate backend/ and frontend/ dirs (stack presets A/B/C — the same multi-module signal Step 5.B uses) and the wizard's bounded-context question (Q9) was not opted into (no `architecture.contexts` in the manifest):}
  - Bounded-context enforcement is available but not configured — see project-manifest.json#architecture.contexts if this codebase has domain modules (billing/, user/, etc.) that shouldn't reach into each other's internals.

Next steps:
  1. Run /brd to create your Business Requirements Document
  2. For an existing codebase, run /brownfield first
  3. Or run /build to execute the full pipeline
  4. For small new projects (CLI / library / single-script), use /build --lite
  5. For tiny safe changes, use /vibe with a micro-contract
```

**Minimal report (project type = D):**
```
✓ OpenCode Harness Engine v5 scaffolded successfully (minimal project mode).

Installed:
  scaffold      → core profile
  agents        → .opencode/agents/ (core set)
  skills        → .opencode/skills/ (core set)
  hooks         → .opencode/hooks/ (per-event gates + lib/)
  templates     → .opencode/templates/ (+ state-seeds/)
  state seeds   → .opencode/state/ (from templates/state-seeds/)
  1 manifest    → .opencode/.opencode-plugin/plugin.json

Telemetry (OFF by default — opt-in):
  Enable with /scaffold --telemetry or profile.telemetry=true

LSP servers (auto-detected from stack):
  {for each lsp.servers entry, run `command -v {binary}` and print ✓ or ✗ — same format as default report}

{if `project-manifest.json#quality.mutation` was written — same format as default report}
Mutation testing (auto-detected from stack):
  {tool} — starter config written to {config_file}

Large codebase tips:
  - Run `node .opencode/scripts/archive-state.js` if state files grow large
  - Use the codebase-explorer agent for read-only discovery before broad changes

Next steps:
  1. Run /build --lite "<one-paragraph project description>"  ← recommended for this project type
  2. Escalate to /brd → /spec → /design → /auto if scope grows past the /build --lite eligibility cap
  3. For tiny safe changes later, use /vibe with a micro-contract
```

### Tracker Setup Addendum

If the user selected tracker mode B (publish-only), C (publish + sync), or D (publish + external orchestrator dispatch), insert this block immediately after `Installed:` and before `Next steps:`. It MUST list every prerequisite the user still has to fulfil before `/tracker-publish` will do anything.

```
Tracker orchestration ({mode display name}):
  .opencode/tracker-config.json     enabled=true, mode={mode}, provider={provider}
  
  Before /tracker-publish runs, you still need to:
  1. Set {provider}_API_KEY in your shell or .env (never commit it).
  2. Replace project_slug "replace-with-{provider}-project-slug" in tracker-config.json.
  3. Confirm the configured states ({readyState}, {runningState}, ...) exist in your tracker workflow.
  4. (If mode D) prepare an isolated workspace runner — see .opencode/skills/tracker-publish/SKILL.md and the symphony_clone README.
```

Substitute placeholders from the user's wizard answers and from the values written into `.opencode/tracker-config.json` during Step 4. Use the actual provider name (Linear or Jira) in the prerequisite list. Do NOT print this block when the user selected mode A (Local-only).

Also append one line to Next steps when tracker mode ≠ A:

- After `Run /brd …` (or `Run /build --lite …` in minimal mode), insert: "Then /tracker-publish to mirror approved groups to {provider}; the orchestrator will not pick anything up until enabled=true and the project_slug is real."

If the user picked mode A, omit both the addendum and the extra Next steps line.

### Framework Skill Pack Addendum

If the user installed any framework skill packs (selected on the confirmation card or wizard), append a section after the `Installed:` block (before `Next steps:`), listing each pack with its skill count and install status. Example:

```
Framework skill packs (.opencode/skills/):
  + LangChain / LangGraph / DeepAgents — 9 skills (cwijayasundara/agent_cli_langchain)   [PENDING MANUAL INSTALL]
  + Google ADK                          — 7 skills (google/agents-cli)                    [INSTALLED]
```

Use `INSTALLED` when the prefix directory contains the expected skill count. Use `PENDING MANUAL INSTALL` when the user selected the pack but the expected prefix directories are not present yet.

Also append a "Framework-specific entry points" hint to Next steps, since these packs ship their own scaffolders and workflow skills that complement the harness pipeline. Example additions:

- If LangChain pack selected and installed: "For LangChain/LangGraph/DeepAgents work, ask the agent to 'scaffold a langgraph agent' or 'build an agent using ADK middleware' — the framework's `*-scaffold` and `*-workflow` skills will trigger."
- If LangChain pack selected but pending: "After the manual LangChain pack install, ask the agent to 'scaffold a langgraph agent' or 'build an agent using ADK middleware'."
- If Google ADK pack selected and installed: "For Google ADK work, ask the agent to 'start a new ADK project' or 'deploy my ADK agent' — the `google-agents-cli-*` skills will trigger."
- If Google ADK pack selected but pending: "After the manual Google ADK pack install, ask the agent to 'start a new ADK project' or 'deploy my ADK agent'."

If the user picked None for framework packs, omit both additions.

### Domain Vertical Plugin Addendum

If the user selected a domain vertical, run `node .opencode/scripts/scaffold-vertical-status.js` and append a section after the `Installed:` block (before `Next steps:`), listing each selected vertical with its install status, using that script's real output. Example:

```
Domain vertical plugins (.opencode/settings.json#enabledPlugins):
  + Private Equity — private-equity@claude-for-financial-services   [PENDING MANUAL INSTALL]
```

Use `INSTALLED` when `scaffold-vertical-status.js` reports the vertical as `INSTALLED`, `PENDING MANUAL INSTALL` otherwise.

If the user picked None for the domain-vertical question, omit this section.

### Final banner — print LAST when any selected pack is pending

If at least one selected framework pack OR domain vertical is `PENDING MANUAL INSTALL`, the very last thing the scaffold prints (after the Files-written section, after Next steps, after everything) MUST be a prominent boxed banner per pending item. This banner is the user's primary signal that the scaffold is complete but an optional pack or vertical still needs a terminal install.

Print exactly this template for each pending pack (concatenate if there are multiple):

```
═══════════════════════════════════════════════════════════════════════════════
  [!] ACTION REQUIRED — Framework pack pending manual install
═══════════════════════════════════════════════════════════════════════════════

  Pack: <pack-display-name> (<repo>)
  Cause: agent auto-mode blocks external npx installs during /scaffold.

  Finish the install in 2 steps:

  1) Open a normal terminal (NOT the agent session) and run:

       cd <project-root>
       npx --yes skills add <repo> -a opencode -s '*' -y

  2) Come back to opencode and run:

       /install-framework-packs --list

     This verifies the install completed and reports any remaining missing packs.

═══════════════════════════════════════════════════════════════════════════════
```

Banner rules:

- The banner MUST be the absolute last text printed in the scaffold report. Do not append further "Files written" or "Configuration" blocks below it.
- Use real Unicode box characters (`═`). Do not collapse to ASCII dashes.
- One banner per pending item (pack or vertical). If several are pending, print banners back-to-back.
- For a pending domain vertical, use this template instead of the framework-pack one above:

```
═══════════════════════════════════════════════════════════════════════════════
  [!] ACTION REQUIRED — Domain vertical pending manual install
═══════════════════════════════════════════════════════════════════════════════

  Vertical: <vertical-display-name> (<install_id>)
  Cause: agent auto-mode blocks external plugin installs during /scaffold.

  Finish the install in 2 steps:

  1) Open a normal terminal (NOT the agent session) and run:

       claude plugin marketplace add <marketplace>
       claude plugin install <install_id>

  2) Come back to opencode and run:

       node .opencode/scripts/scaffold-vertical-status.js

     This verifies the install completed.

═══════════════════════════════════════════════════════════════════════════════
```

- If all selected packs/verticals are already installed, omit the banner entirely and end the report on Next steps.

If no framework packs and no domain vertical were configured (the user picked None for both), neither the addenda nor any banner appears in the report.
