#!/usr/bin/env node

'use strict';

// Emit installable SKU trees for harness-core / harness-lite (Phase 3 packaging).
// Does not publish to a registry — produces a local project directory you can
// open in opencode (`cd <pkg> && opencode`), or zip for distribution.
//
// Usage:
//   node .opencode/scripts/package-sku.js core|lite|full|all [--out dir] [--clean]
//
// Defaults: --out <repo>/dist/skus

const fs = require('fs');
const path = require('path');
const {
  copyScaffoldTree,
  resolveScaffoldProfile,
  CORE_SKILLS,
  OPTIONAL_SKILLS,
} = require('./scaffold-copy');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PLUGIN_SOURCE = path.join(REPO_ROOT, '.opencode');
const LITE_SOURCE = path.join(REPO_ROOT, 'harness-lite');

const SKU_META = {
  core: {
    dirName: 'harness-core',
    pluginName: 'opencode-harness-core',
    description:
      'Lean product harness: /build, /feature, /gate, brownfield spine. No vertical/framework optional skills.',
    profile: 'core',
  },
  full: {
    dirName: 'harness-full',
    pluginName: 'opencode-harness-full',
    description:
      'Full harness surface including optional skills, workflows slot, and ops extras.',
    profile: 'full',
  },
  lite: {
    dirName: 'harness-lite',
    pluginName: 'opencode-harness-lite',
    description:
      'Artifact-only loadout: mockups, ARB docs, research. No SDLC pipeline or quality hooks.',
    profile: null, // special: copy harness-lite/
  },
};

function arg(argv, name, fallback) {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  return argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}

function readRootVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')).version || '0.0.0';
  } catch (_) {
    return '0.0.0';
  }
}

function writePluginJson(skuRoot, meta, version) {
  // SKU metadata stamp: .opencode-plugin/plugin.json identifies the package
  // (name/version/sku) for humans and tooling; opencode itself loads the
  // nested .opencode/ tree when the package dir is opened as a project.
  const pluginDir = path.join(skuRoot, '.opencode-plugin');
  fs.mkdirSync(pluginDir, { recursive: true });
  const body = {
    name: meta.pluginName,
    version,
    description: meta.description,
    author: { name: 'OpenCode Harness Engine' },
    sku: meta.dirName,
  };
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), `${JSON.stringify(body, null, 2)}\n`);
}

function packageCoreOrFull(sku, outRoot, version) {
  const meta = SKU_META[sku];
  const dest = path.join(outRoot, meta.dirName);
  fs.mkdirSync(dest, { recursive: true });
  // copyScaffoldTree writes into <target>/.opencode — keep that nesting: the
  // package is a ready-to-open opencode project dir (`cd <pkg> && opencode`).
  const profile = resolveScaffoldProfile({}, { scaffoldProfile: meta.profile });
  fs.rmSync(path.join(dest, '.opencode'), { recursive: true, force: true });
  copyScaffoldTree(PLUGIN_SOURCE, dest, profile);
  writePluginJson(dest, meta, version);
  // Manifest stamp for humans
  fs.writeFileSync(
    path.join(dest, 'SKU.md'),
    `# ${meta.dirName}\n\n${meta.description}\n\nVersion: ${version}\nProfile: ${meta.profile}\n\n` +
      `Load: \`cd ${meta.dirName} && opencode\`\n` +
      (sku === 'core'
        ? `\nCore skills (${CORE_SKILLS.length}). Optional not included: ${OPTIONAL_SKILLS.join(', ')}.\n`
        : '')
  );
  return dest;
}

function packageLite(outRoot, version) {
  const meta = SKU_META.lite;
  const dest = path.join(outRoot, meta.dirName);
  fs.rmSync(dest, { recursive: true, force: true });
  if (!fs.existsSync(LITE_SOURCE)) {
    throw new Error(`harness-lite source missing at ${LITE_SOURCE}`);
  }
  // lite lives as harness-lite/.opencode — keep the nested project layout
  const liteTree = path.join(LITE_SOURCE, '.opencode');
  const litePlugin = path.join(LITE_SOURCE, '.opencode-plugin');
  fs.mkdirSync(dest, { recursive: true });
  if (fs.existsSync(liteTree)) {
    fs.cpSync(liteTree, path.join(dest, '.opencode'), { recursive: true });
  }
  // Prefer packaging SKU metadata; fall back to source plugin.json fields
  let description = meta.description;
  try {
    const src = JSON.parse(fs.readFileSync(path.join(litePlugin, 'plugin.json'), 'utf8'));
    if (src.description) description = src.description;
  } catch (_) { /* use default */ }
  writePluginJson(dest, { ...meta, description }, version);
  fs.writeFileSync(
    path.join(dest, 'SKU.md'),
    `# harness-lite\n\n${description}\n\nVersion: ${version}\n\nLoad: \`cd harness-lite && opencode\`\n`
  );
  // README for operators
  if (fs.existsSync(path.join(LITE_SOURCE, 'README.md'))) {
    fs.copyFileSync(path.join(LITE_SOURCE, 'README.md'), path.join(dest, 'README.md'));
  }
  return dest;
}

function packageSku(sku, outRoot, version) {
  if (sku === 'lite') return packageLite(outRoot, version);
  if (sku === 'core' || sku === 'full') return packageCoreOrFull(sku, outRoot, version);
  throw new Error(`unknown sku: ${sku} (expected core|lite|full)`);
}

function main(argv = process.argv.slice(2)) {
  const which = (argv[0] || 'all').toLowerCase();
  const outRoot = path.resolve(arg(argv, '--out', path.join(REPO_ROOT, 'dist', 'skus')));
  const clean = argv.includes('--clean');
  const version = readRootVersion();

  if (!['core', 'lite', 'full', 'all'].includes(which)) {
    process.stderr.write('Usage: package-sku.js core|lite|full|all [--out dir] [--clean]\n');
    process.exit(2);
  }

  if (clean && fs.existsSync(outRoot)) {
    fs.rmSync(outRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(outRoot, { recursive: true });

  const skus = which === 'all' ? ['core', 'lite', 'full'] : [which];
  const results = [];
  for (const sku of skus) {
    const dest = packageSku(sku, outRoot, version);
    results.push({ sku, dest });
    process.stdout.write(`package-sku: ${sku} -> ${dest}\n`);
  }
  process.stdout.write(`package-sku: done (${results.length} sku(s), version ${version})\n`);
  process.exit(0);
}

module.exports = {
  packageSku,
  SKU_META,
  readRootVersion,
  REPO_ROOT,
};

if (require.main === module) main();
