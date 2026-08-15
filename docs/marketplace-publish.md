# Marketplace / registry publish (process)

Local SKU emit is live (`npm run package:skus` → `dist/skus/harness-{core,lite,full}`).
This document is the **publish process** when you have a Claude plugin marketplace
or private plugin registry. It does not require credentials in the monorepo.

## Artifacts

```bash
npm run release:skus
# → dist/skus/harness-{core,lite,full}
# → dist/release/claude-harness-{core,lite,full}-<version>.tgz
```

| SKU | Path after `npm run package:skus` | Plugin name (plugin.json) |
|---|---|---|
| Product default | `dist/skus/harness-core` | `claude-harness-core` |
| Full surface | `dist/skus/harness-full` | `claude-harness-full` |
| Artifacts only | `dist/skus/harness-lite` | `claude-harness-lite` |

**Not a SKU:** Symphony (`symphony_clone/`) — see [`docs/symphony-product.md`](symphony-product.md).

Each tree is a valid `--plugin-dir` root (contains `.opencode-plugin/plugin.json` plus
skills/agents/hooks/…).

## Version

Bump together:

1. Root `package.json` `version`
2. `.opencode/.opencode-plugin/plugin.json` `version`
3. `CHANGELOG.md`
4. README “Current version”

`package-sku.js` stamps the root `package.json` version into each SKU’s `plugin.json`.

## Pre-publish checklist

```bash
npm ci
npm run lint
npm test
npm run agent-readiness && npm run agent-readiness:assert
npm run package:skus
# smoke
test -f dist/skus/harness-core/.opencode-plugin/plugin.json
test ! -d dist/skus/harness-core/skills/pe-ic-memo
gitleaks detect --source . --config .gitleaks.toml   # if installed
```

## Publish options

### A. Claude plugin marketplace (when available)

1. Build SKUs: `npm run package:skus`
2. Register each SKU tree with your marketplace tooling (name/version from plugin.json).
3. Document install for users as:

   ```text
   claude plugin install claude-harness-core@<marketplace>
   ```

   (Exact CLI may vary by Claude Code release — prefer marketplace docs when publishing.)

4. Keep monorepo clone as the **contributor** path only.

### B. Private tarball / artifact store

1. `npm run package:core` (or `package:skus`)
2. Tar each SKU:

   ```bash
   tar -czf claude-harness-core-2.1.0.tgz -C dist/skus harness-core
   ```

3. Host on internal artifactory / GitHub Release assets.
4. Users unpack and:

   ```bash
   claude --plugin-dir /opt/claude-harness-core
   ```

### C. Git submodule / sparse clone (interim)

Until a marketplace is ready, document:

```bash
git clone --depth 1 https://github.com/cwijayasundara/opencode_harness_design.git
npm --prefix opencode_harness_design ci
npm --prefix opencode_harness_design run package:core
claude --plugin-dir "$PWD/opencode_harness_design/dist/skus/harness-core"
```

## What not to publish

- Raw monorepo `.opencode/` as the only product install (includes research surface).
- `symphony_clone/` inside a harness SKU — separate product.
- `.opencode/runs/`, state archives, or secrets.

## Upgrade path for customers

After a new SKU version:

```bash
node /path/to/harness/.opencode/scripts/scaffold-upgrade.js --target ~/my-project --apply
```

Does not overwrite `project-manifest.json` or `.opencode/state/`. Use `--include-skills`
only when skill prompt surface must refresh.
