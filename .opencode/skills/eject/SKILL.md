---
name: eject
description: Extract the application code from a scaffolded harness project — list, remove, or copy away the harness footprint (.opencode/, specs/, sprint-contracts/, root control files). Use when the app is done and the user wants a clean app-only repo.
argument-hint: "[--apply | --out <dir>]"
context: fork
---

# Eject — extract the application from the harness

The harness footprint in a scaffolded project is a fixed, known set. Ejecting
removes (or copies around) that set; everything left is the application —
including `e2e/` (real Playwright tests) and `.gitignore`.

## Usage

Run the script from the root of the scaffolded project:

```bash
# 1. Dry-run (default): list exactly what would be removed
node .opencode/scripts/eject.js

# 2a. Remove the harness footprint in place
node .opencode/scripts/eject.js --apply

# 2b. Or copy the application files to a clean directory instead (non-destructive)
node .opencode/scripts/eject.js --out ../my-app-clean
```

## Procedure

1. Always run the dry-run first and show the user the list.
2. Ask which mode they want (`--apply` in place vs `--out` copy) if not stated.
3. `--out` excludes `.git` and `node_modules`; after copying, tell the user to
   `git init && git add -A && git commit` and reinstall dependencies there.
4. `--apply` is destructive — require explicit confirmation, and recommend a
   committed/clean git state first so it is revertable.

## What is removed

- Directories: `.opencode/`, `specs/`, `sprint-contracts/`, `telemetry/`
- Root files: `AGENTS.md`, `opencode.json`, `.mcp.json`, `design.md`,
  `REVIEW.md`, `init.sh`, `project-manifest.json`, `features.json`,
  `harness-progress.txt`, `calibration-profile.json`, `SCAFFOLD_README.md`,
  `telemetry_docker_compose.yml`
- Harness reference docs only: `docs/telemetry.md`, `docs/testing.md`,
  `docs/extras.md`, `docs/prompting-standards.md`, `docs/model-allocation.md`
  (the user's own `docs/` content survives)

The script refuses to run where `project-manifest.json` is absent, so it cannot
eject the harness monorepo itself.
