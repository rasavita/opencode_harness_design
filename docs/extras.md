# Optional Power-Ups

None of these are required. The core loop — pick a lane, let the ratchet run, review the diff — works without any of them.

## Tracker-driven agent factory (Linear/Jira)

For teams that want a visible queue, parallel execution, and tracker-based review:

1. During `/scaffold`, choose tracker mode B/C/D
2. After planning, run `/tracker-publish` — creates one Linear/Jira issue per dependency group
3. Start the orchestrator:
   ```bash
   cd ~/opencode_harness_design/symphony_clone
   cp .env.example .env && $EDITOR .env
   docker compose up --build
   ```
4. The orchestrator polls the tracker, claims ready groups, runs opencode in isolated workspaces, opens PRs, and posts proof back to the tracker
5. Humans review PRs and mark issues Done — the orchestrator never does

Operator guide: `symphony_clone/README.md`.

## Framework skill packs

During `/scaffold`, opt into framework-specific skill packs:

| Pack | Skills | Use when |
|---|---|---|
| LangChain / LangGraph / DeepAgents | 9 | Building LangChain agents, LangGraph workflows, or DeepAgents apps |
| Google ADK | 7 | Building Google Agent Development Kit agents |

These inject framework-aware code generation on top of the harness discipline. Same `/auto` ratchet still runs.

`/scaffold` records selected packs in `project-manifest.json` but does not run `npx skills add` from inside opencode. Agent auto-mode blocks external installs, so run the selected pack command in a normal terminal:

```bash
npx --yes skills add cwijayasundara/agent_cli_langchain -a opencode -s '*' -y   # LangChain
npx --yes skills add google/agents-cli -a opencode -s '*' -y                     # Google ADK
```

Then verify: `/install-framework-packs`

If a pack shows `PENDING MANUAL INSTALL`, run the `npx` command above in a regular terminal (not the agent session), then verify with `/install-framework-packs --list`.

## Richer AST graphs with Understand-Anything

For brownfield refactors, the scaffold can consume an [Understand-Anything](https://github.com/Lum1104/Understand-Anything/tree/main) knowledge graph when its artifact is present in the target repo. This is useful when you need AST-backed call, symbol, inheritance, and dependency evidence before changing an existing system. Understand-Anything ships as a Claude Code plugin — generate its graph from a Claude Code session (or any environment where it runs):

1. Install the plugin (Claude Code session):
   ```text
   /plugin marketplace add Lum1104/Understand-Anything
   /plugin install understand-anything
   ```
2. Run the plugin's analysis workflow in the target repo:
   ```text
   /understand
   ```
   This writes:
   ```text
   .understand-anything/knowledge-graph.json
   ```
3. Run `/code-map` or import the graph directly:
   ```bash
   node .opencode/skills/code-map/scripts/import_understand_graph.js \
     --in .understand-anything/knowledge-graph.json \
     --out specs/brownfield/code-graph.json
   node .opencode/skills/code-map/scripts/build_graph.js \
     --render-mermaid specs/brownfield/code-graph.json \
     --out specs/brownfield/dependency-graph.md
   node .opencode/skills/code-map/scripts/build_graph.js \
     --coupling-report specs/brownfield/code-graph.json \
     --out specs/brownfield/coupling-report.md
   ```
4. Run `/brownfield`, then `/seam-finder "<change goal>"` before `/change` or `/refactor`.
5. For visual exploration, run `/understand-dashboard` from the plugin. For keeping graphs fresh, use `/understand --auto-update` or re-run `/understand` before large releases.

Understand-Anything is optional. If its graph is absent, `/code-map` falls back to the vendored deterministic extractor, then `/brownfield` still writes the same `specs/brownfield/` artifacts.

## Dynamic workflows

Dynamic workflows are JavaScript files in `.opencode/workflows/` that auto-register as `/<name>` slash commands for deterministic multi-agent orchestration (fan-out -> verify -> synthesize). The harness ships none — earlier `/harness-*` workflows merely duplicated existing skills and were removed. Author your own when you have a genuinely new fan-out; see `.opencode/workflows/README.md`.
