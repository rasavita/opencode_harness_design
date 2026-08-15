# Distribution / registry publish (process)

Local SKU emit is live (`npm run package:skus` → `dist/skus/harness-{core,lite,full}`).
This document is the **publish process** for distributing the harness SKUs. opencode
has no plugin marketplace; SKUs are distributed as ready-to-open project trees
(tarball, artifact store, or git). It does not require credentials in the monorepo.

## Artifacts

```bash
npm run release:skus
# → dist/skus/harness-{core,lite,full}
# → dist/release/opencode-harness-{core,lite,full}-<version>.tgz
```

| SKU | Path after `npm run package:skus` | Package name (plugin.json) |
|---|---|---|
| Product default | `dist/skus/harness-core` | `opencode-harness-core` |
| Full surface | `dist/skus/harness-full` | `opencode-harness-full` |
| Artifacts only | `dist/skus/harness-lite` | `opencode-harness-lite` |

**Not a SKU:** Symphony (`symphony_clone/`) — see [`docs/symphony-product.md`](symphony-product.md).

Each tree is a ready-to-open opencode project (contains `.opencode/` with
skills/agents/hooks/plugins, plus `.opencode-plugin/plugin.json` metadata).

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
test ! -d dist/skus/harness-core/.opencode/skills/pe-ic-memo
gitleaks detect --source . --config .gitleaks.toml   # if installed
```

## Publish options

### A. Private tarball / artifact store

1. `npm run package:core` (or `package:skus`)
2. Tar each SKU:

   ```bash
   tar -czf opencode-harness-core-2.1.0.tgz -C dist/skus harness-core
   ```

3. Host on internal artifactory / GitHub Release assets.
4. Users unpack and:

   ```bash
   cd /opt/opencode-harness-core && opencode
   ```

### B. Git submodule / sparse clone (interim)

Document:

```bash
git clone --depth 1 https://github.com/rasavita/opencode_harness_design.git
npm --prefix opencode_harness_design ci
npm --prefix opencode_harness_design run package:core
cd opencode_harness_design/dist/skus/harness-core && opencode
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
