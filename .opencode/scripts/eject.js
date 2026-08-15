'use strict';

// eject.js — extract the application code from a scaffolded harness project by
// removing (or copying around) the harness's own footprint. The footprint is a
// fixed, known set: the `.opencode/` tree, the planning artifacts, the root
// control files, the optional telemetry stack, and the harness docs that
// /scaffold copies into `docs/`. Everything else — including `e2e/` (real
// Playwright tests for the app) and `.gitignore` — is application code.
//
// Modes:
//   node .opencode/scripts/eject.js                 # dry-run: list what would be removed
//   node .opencode/scripts/eject.js --apply         # delete the harness footprint in place
//   node .opencode/scripts/eject.js --out <dir>     # copy the app files to a clean directory
//
// Safety: refuses to run unless `project-manifest.json` exists (the scaffolded-
// project marker), so it cannot eject the harness monorepo itself.

const fs = require('fs');
const path = require('path');

const HARNESS_DIRS = ['.opencode', 'specs', 'sprint-contracts', 'telemetry'];

const HARNESS_ROOT_FILES = [
  'AGENTS.md',
  'opencode.json',
  '.mcp.json',
  'design.md',
  'REVIEW.md',
  'init.sh',
  'project-manifest.json',
  'features.json',
  'harness-progress.txt',
  'calibration-profile.json',
  'SCAFFOLD_README.md',
  'telemetry_docker_compose.yml',
];

// Harness reference docs that /scaffold copies into the target's docs/ — removed
// file-by-file so the user's own docs (PRD, etc.) survive.
const HARNESS_DOC_FILES = [
  'docs/telemetry.md',
  'docs/testing.md',
  'docs/extras.md',
  'docs/prompting-standards.md',
  'docs/model-allocation.md',
];

function harnessFootprint(target) {
  const entries = [...HARNESS_DIRS, ...HARNESS_ROOT_FILES, ...HARNESS_DOC_FILES];
  return entries.filter((rel) => fs.existsSync(path.join(target, rel)));
}

function assertScaffoldedProject(target) {
  if (fs.existsSync(path.join(target, 'project-manifest.json'))) return;
  throw new Error(
    'eject: no project-manifest.json here — this does not look like a scaffolded project. ' +
      'Run from the root of a project created by /scaffold.'
  );
}

function parseArgs(argv) {
  const opts = { apply: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--apply') opts.apply = true;
    else if (argv[i] === '--out') opts.out = argv[++i] || null;
    else throw new Error(`eject: unknown argument ${argv[i]} (expected --apply or --out <dir>)`);
  }
  if (opts.apply && opts.out) throw new Error('eject: --apply and --out are mutually exclusive');
  if (opts.out === null && argv.includes('--out')) throw new Error('eject: --out requires a directory');
  return opts;
}

function removeFootprint(target, footprint) {
  for (const rel of footprint) fs.rmSync(path.join(target, rel), { recursive: true, force: true });
}

// Copy everything that is NOT harness footprint (and not .git/node_modules —
// the user re-inits history and reinstalls deps in the extracted repo).
function copyAppFiles(target, outDir, footprint) {
  const skip = new Set([...footprint, '.git', 'node_modules']);
  fs.mkdirSync(outDir, { recursive: true });
  for (const entry of fs.readdirSync(target)) {
    if (skip.has(entry)) continue;
    if (path.join(target, entry) === outDir) continue;
    if (entry === 'docs') {
      copyDocsDir(target, outDir, footprint);
      continue;
    }
    fs.cpSync(path.join(target, entry), path.join(outDir, entry), { recursive: true });
  }
}

function copyDocsDir(target, outDir, footprint) {
  const harnessDocs = new Set(footprint.filter((rel) => rel.startsWith('docs/')));
  const srcDocs = path.join(target, 'docs');
  for (const entry of fs.readdirSync(srcDocs)) {
    if (harnessDocs.has(`docs/${entry}`)) continue;
    fs.mkdirSync(path.join(outDir, 'docs'), { recursive: true });
    fs.cpSync(path.join(srcDocs, entry), path.join(outDir, 'docs', entry), { recursive: true });
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const target = process.cwd();
  assertScaffoldedProject(target);
  const footprint = harnessFootprint(target);

  if (opts.out) {
    copyAppFiles(target, path.resolve(target, opts.out), footprint);
    process.stdout.write(`eject: copied application files to ${opts.out} (excluded ${footprint.length} harness entries, .git, node_modules)\n`);
    process.stdout.write('Next: cd there, `git init && git add -A && git commit`, and reinstall dependencies.\n');
    return;
  }

  if (opts.apply) {
    removeFootprint(target, footprint);
    process.stdout.write(`eject: removed ${footprint.length} harness entries. Remaining files are your application.\n`);
    return;
  }

  process.stdout.write('eject (dry-run): the following harness entries would be removed — rerun with --apply, or use --out <dir> to copy the app files instead:\n');
  for (const rel of footprint) process.stdout.write(`  ${rel}\n`);
  process.stdout.write(`Kept: everything else, including e2e/ (application tests) and .gitignore.\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { harnessFootprint, HARNESS_DIRS, HARNESS_ROOT_FILES, HARNESS_DOC_FILES };
