'use strict';

// /eject extracts the application from a scaffolded project by removing the
// harness's fixed footprint. These tests build a miniature scaffolded target
// and verify: the footprint listing, the scaffolded-project guard, in-place
// removal keeping app code + e2e/ + .gitignore, and --out copying that skips
// harness docs but keeps the user's own docs.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', '.opencode', 'scripts', 'eject.js');
const { harnessFootprint } = require(SCRIPT);

function makeScaffoldedProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eject-'));
  for (const d of ['.opencode/scripts', 'specs/brd', 'sprint-contracts', 'e2e', 'src', 'docs']) {
    fs.mkdirSync(path.join(dir, d), { recursive: true });
  }
  const files = {
    'project-manifest.json': '{}\n',
    'AGENTS.md': 'x\n',
    'opencode.json': '{}\n',
    'features.json': '[]\n',
    'harness-progress.txt': 'x\n',
    '.gitignore': 'node_modules/\n',
    'src/app.js': 'code\n',
    'e2e/app.spec.js': 'test\n',
    'docs/telemetry.md': 'harness doc\n',
    'docs/prd.md': 'user doc\n',
    '.opencode/scripts/eject.js': 'copy\n',
    'specs/brd/brd.md': 'x\n',
  };
  for (const [rel, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, rel), body);
  return dir;
}

function runEject(cwd, args) {
  return execFileSync('node', [SCRIPT, ...args], { cwd, encoding: 'utf8' });
}

test('footprint lists only harness entries that exist', () => {
  const dir = makeScaffoldedProject();
  const fp = harnessFootprint(dir);
  assert.ok(fp.includes('.opencode'));
  assert.ok(fp.includes('specs'));
  assert.ok(fp.includes('docs/telemetry.md'));
  assert.ok(!fp.includes('design.md'), 'absent files are not listed');
  assert.ok(!fp.includes('e2e'), 'e2e is application code');
});

test('refuses to run outside a scaffolded project', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eject-guard-'));
  assert.throws(() => runEject(dir, []), /project-manifest\.json/);
});

test('dry-run lists the footprint and removes nothing', () => {
  const dir = makeScaffoldedProject();
  const out = runEject(dir, []);
  assert.match(out, /dry-run/);
  assert.match(out, /\.opencode/);
  assert.ok(fs.existsSync(path.join(dir, '.opencode')));
});

test('--apply removes the footprint and keeps the app', () => {
  const dir = makeScaffoldedProject();
  runEject(dir, ['--apply']);
  for (const gone of ['.opencode', 'specs', 'sprint-contracts', 'AGENTS.md', 'features.json', 'docs/telemetry.md']) {
    assert.ok(!fs.existsSync(path.join(dir, gone)), `${gone} should be removed`);
  }
  for (const kept of ['src/app.js', 'e2e/app.spec.js', '.gitignore', 'docs/prd.md']) {
    assert.ok(fs.existsSync(path.join(dir, kept)), `${kept} should be kept`);
  }
});

test('--out copies app files only, keeping user docs', () => {
  const dir = makeScaffoldedProject();
  runEject(dir, ['--out', 'clean']);
  const out = path.join(dir, 'clean');
  for (const kept of ['src/app.js', 'e2e/app.spec.js', '.gitignore', 'docs/prd.md']) {
    assert.ok(fs.existsSync(path.join(out, kept)), `${kept} should be copied`);
  }
  for (const gone of ['.opencode', 'specs', 'AGENTS.md', 'docs/telemetry.md']) {
    assert.ok(!fs.existsSync(path.join(out, gone)), `${gone} should not be copied`);
  }
  assert.ok(fs.existsSync(path.join(dir, '.opencode')), 'source project untouched');
});

test('--apply and --out are mutually exclusive', () => {
  const dir = makeScaffoldedProject();
  assert.throws(() => runEject(dir, ['--apply', '--out', 'x']), /mutually exclusive/);
});
