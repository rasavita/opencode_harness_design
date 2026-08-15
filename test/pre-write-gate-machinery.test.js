const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { test } = require('node:test');
const { makeHookProject, runHook } = require('./helpers/hook-fixture');

// Split out of pre-write-gate.test.js (the "trust boundary" section) so each
// file stays under the harness's file-length gate.

const HOOK = 'pre-write-gate.js';
const ENV = { HARNESS_TDD_GATE: 'off' };

// --- trust boundary (harness machinery) ---

const MACHINERY_TARGETS = [
  '.opencode/hooks/pre-write-gate.js',
  '.opencode/hooks/lib/tdd.js',
  '.opencode/git-hooks/pre-commit',
  '.opencode/settings.json',
  '.opencode/security-patterns.json',
  '.opencode/state/coverage-baseline.txt',
  '.opencode/state/coverage-baseline-js.txt',
  '.opencode/state/coverage-preflight-cache.json',
  '.opencode/state/hook-errors.log',
];

test('blocks writes to harness machinery in a target project', async () => {
  const projectDir = makeHookProject([HOOK]);
  for (const rel of MACHINERY_TARGETS) {
    const result = await runHook(projectDir, HOOK, {
      tool_name: 'Write',
      tool_input: { file_path: path.join(projectDir, rel), content: 'tampered\n' },
    }, ENV);
    assert.strictEqual(result.status, 2, `${rel} was not blocked`);
    assert.ok(result.stdout.includes('machinery'), `${rel}: ${result.stdout}`);
  }
});

test('machinery protection does not block ordinary .opencode content', async () => {
  const projectDir = makeHookProject([HOOK]);
  for (const rel of ['.opencode/state/learned-rules.md', '.opencode/program.md', '.opencode/skills/foo/SKILL.md']) {
    const result = await runHook(projectDir, HOOK, {
      tool_name: 'Write',
      tool_input: { file_path: path.join(projectDir, rel), content: 'notes\n' },
    }, ENV);
    assert.strictEqual(result.status, 0, `${rel} was blocked: ${result.stdout}`);
  }
});

test('machinery edits are allowed inside the harness repo itself', async () => {
  const projectDir = makeHookProject([HOOK]);
  fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({ name: 'opencode-harness-design' }));
  const result = await runHook(projectDir, HOOK, {
    tool_name: 'Write',
    tool_input: { file_path: path.join(projectDir, '.opencode', 'hooks', 'new-hook.js'), content: 'ok\n' },
  }, ENV);
  assert.strictEqual(result.status, 0, result.stdout);
});

test('HARNESS_PROTECT=off bypasses the machinery gate deliberately', async () => {
  const projectDir = makeHookProject([HOOK]);
  // Use a machinery path that is NOT also a prompt-cache prefix file
  // (.opencode/settings.json is dual-guarded; HARNESS_PROTECT alone is not enough).
  const result = await runHook(projectDir, HOOK, {
    tool_name: 'Write',
    tool_input: {
      file_path: path.join(projectDir, '.opencode', 'security-patterns.json'),
      content: '[]\n',
    },
  }, { ...ENV, HARNESS_PROTECT: 'off' });
  assert.strictEqual(result.status, 0, result.stdout);
});

// --- Claude Code per-project memory directory ---

function mungedProject(projectDir) {
  return fs.realpathSync(projectDir).replace(/[^a-zA-Z0-9-]/g, '-');
}

test("allows writes to this project's Claude memory directory", async () => {
  const projectDir = makeHookProject([HOOK]);
  const memoryFile = path.join(os.homedir(), '.opencode', 'projects', mungedProject(projectDir), 'memory', 'note.md');
  const result = await runHook(projectDir, HOOK, {
    tool_name: 'Write',
    tool_input: { file_path: memoryFile, content: '# memory\n' },
  }, ENV);
  assert.strictEqual(result.status, 0, result.stdout);
});

test("still blocks writes to a DIFFERENT project's Claude memory directory", async () => {
  const projectDir = makeHookProject([HOOK]);
  const otherFile = path.join(os.homedir(), '.opencode', 'projects', '-Users-someone-else-project', 'memory', 'note.md');
  const result = await runHook(projectDir, HOOK, {
    tool_name: 'Write',
    tool_input: { file_path: otherFile, content: '# memory\n' },
  }, ENV);
  assert.strictEqual(result.status, 2, result.stdout);
});
