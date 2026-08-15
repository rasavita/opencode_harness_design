'use strict';

// Regression tests for search-compact.js. Two bugs made it unreliable for the
// harness's own control plane: (1) the entire .opencode/ tree was excluded from the
// walk, so harness source under .opencode/ was invisible (the real cause of /retro
// reporting "canvas-sync doesn't exist"); (2) a positional path argument was
// ignored, so a "scoped" search silently ran repo-wide.

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { sourceFiles, searchFiles } = require('../.opencode/scripts/search-compact.js');

const MARKER = 'CANVAS_SYNC_MARKER';

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-compact-'));
  const write = (rel, body) => {
    const abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  };
  write('.opencode/hooks/lib/foo.js', `// ${MARKER} in harness source\n`);
  write('.opencode/scripts/bar.js', `const x = '${MARKER}';\n`);
  write('.opencode/state/big.log', `${MARKER} noise noise noise\n`); // must be excluded
  write('.opencode/runs/2026-07-16.jsonl', `{"m":"${MARKER}"}\n`); // heavy run journal — excluded
  write('.opencode/worktrees/wt1/.opencode/state/x.log', `${MARKER}\n`); // nested worktree state — excluded
  write('.opencode/worktrees/wt1/src/dup.js', `${MARKER}\n`); // worktree checkout — excluded
  write('src/app.js', `run(); // ${MARKER}\n`);
  write('node_modules/pkg/index.js', `${MARKER}\n`); // must be excluded
  return dir;
}

test('sourceFiles walks .opencode/ source but excludes .opencode state/runs/worktrees and node_modules', () => {
  const dir = tmpProject();
  const files = sourceFiles(dir);
  assert.ok(files.includes('.opencode/hooks/lib/foo.js'), 'harness source under .opencode/ must be walked');
  assert.ok(files.includes('.opencode/scripts/bar.js'));
  assert.ok(files.includes('src/app.js'));
  assert.ok(!files.some((f) => f.startsWith('.opencode/state/')), '.opencode/state logs must stay excluded');
  assert.ok(!files.some((f) => f.startsWith('.opencode/runs/')), '.opencode/runs journals must stay excluded');
  assert.ok(!files.some((f) => f.startsWith('.opencode/worktrees/')), 'worktree checkouts (incl. nested .opencode/state) must stay excluded');
  assert.ok(!files.some((f) => f.startsWith('node_modules/')), 'node_modules must stay excluded');
});

test('searchFiles finds a marker in .opencode/ control-plane source (the /retro regression)', () => {
  const dir = tmpProject();
  const { files } = searchFiles({ projectDir: dir, pattern: MARKER, glob: null });
  const hit = files.map((f) => f.path);
  assert.ok(hit.includes('.opencode/hooks/lib/foo.js'), 'search must see .opencode/ source, not just dist/ copies');
  assert.ok(hit.includes('src/app.js'));
  assert.ok(!hit.some((p) => p.startsWith('.opencode/state/')), 'excluded state must not match');
  assert.ok(!hit.some((p) => p.startsWith('node_modules/')));
});

test('a positional path scope narrows the search instead of being ignored', () => {
  const dir = tmpProject();
  const { files } = searchFiles({ projectDir: dir, pattern: MARKER, glob: null, scopes: ['.opencode/hooks'] });
  const hit = files.map((f) => f.path);
  assert.deepStrictEqual(hit, ['.opencode/hooks/lib/foo.js'], 'only files under the scope prefix may match');
});
