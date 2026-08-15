'use strict';

// Focused tests for the opencode plugin adapter (.opencode/plugins/harness.js):
// manifest-driven dispatch, exit-2 -> throw on tool.execute.before, corrective
// prompt injection on post/stop surfaces, and prompt-text buffering.

const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = path.join(ROOT, '.opencode', 'plugins', 'harness.js');

// The plugin ships as .js because opencode's Bun loader takes ESM .js files in
// .opencode/plugins/; Node's require chain treats repo .js as CJS, so import a
// temp .mjs copy.
let HarnessPlugin;
before(async () => {
  const tmp = path.join(os.tmpdir(), `harness-plugin-${process.pid}.mjs`);
  fs.copyFileSync(PLUGIN, tmp);
  ({ HarnessPlugin } = await import(tmp));
});

// A minimal project fixture: settings.json manifest wiring PreToolUse/Write to
// a blocking hook, PostToolUse to another, and Stop to a third.
function makeProject({ blockPre = false, blockPost = false, blockStop = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-plugin-'));
  fs.mkdirSync(path.join(dir, '.opencode', 'hooks'), { recursive: true });
  const hook = (name, exitCode, message) => {
    fs.writeFileSync(
      path.join(dir, '.opencode', 'hooks', name),
      `let input = '';
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  const payload = JSON.parse(input);
  require('fs').writeFileSync(require('path').join(__dirname, '${name}.payload.json'), input);
  if (${exitCode} === 2) { process.stdout.write('${message}'); process.exit(2); }
  process.exit(0);
});
`
    );
  };
  hook('pre.js', blockPre ? 2 : 0, 'pre blocked');
  hook('post.js', blockPost ? 2 : 0, 'post blocked');
  hook('stop.js', blockStop ? 2 : 0, 'stop blocked');
  const manifest = {
    hooks: {
      PreToolUse: [
        {
          matcher: 'Write|Edit|MultiEdit',
          hooks: [{ type: 'command', command: 'node "$OPENCODE_PROJECT_DIR/.opencode/hooks/pre.js"' }],
        },
      ],
      PostToolUse: [
        { hooks: [{ type: 'command', command: 'node "$OPENCODE_PROJECT_DIR/.opencode/hooks/post.js"' }] },
      ],
      Stop: [
        { hooks: [{ type: 'command', command: 'node "$OPENCODE_PROJECT_DIR/.opencode/hooks/stop.js"' }] },
      ],
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: 'node "$OPENCODE_PROJECT_DIR/.opencode/hooks/stop.js"' }] },
      ],
    },
  };
  fs.writeFileSync(path.join(dir, '.opencode', 'settings.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

function fakeClient() {
  const prompts = [];
  return {
    prompts,
    session: {
      prompt: async (req) => { prompts.push(req); },
      get: async () => ({ data: {} }),
    },
  };
}

function payloadOf(dir, name) {
  const p = path.join(dir, '.opencode', 'hooks', `${name}.payload.json`);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

test('a PreToolUse exit-2 becomes a thrown veto in tool.execute.before', async () => {
  const dir = makeProject({ blockPre: true });
  const plugin = await HarnessPlugin({ client: fakeClient(), directory: dir });
  await assert.rejects(
    plugin['tool.execute.before'](
      { tool: 'write', sessionID: 's1', callID: 'c1' },
      { args: { filePath: '/etc/passwd', content: 'x' } }
    ),
    /pre blocked/
  );
  const payload = payloadOf(dir, 'pre.js');
  assert.strictEqual(payload.hook_event_name, 'PreToolUse');
  assert.strictEqual(payload.tool_name, 'Write');
  assert.strictEqual(payload.tool_input.file_path, '/etc/passwd');
});

test('a passing PreToolUse hook does not throw', async () => {
  const dir = makeProject({ blockPre: false });
  const plugin = await HarnessPlugin({ client: fakeClient(), directory: dir });
  await plugin['tool.execute.before'](
    { tool: 'edit', sessionID: 's1', callID: 'c1' },
    { args: { filePath: path.join(dir, 'a.js'), oldString: 'a', newString: 'b' } }
  );
  const payload = payloadOf(dir, 'pre.js');
  assert.strictEqual(payload.tool_name, 'Edit');
  assert.strictEqual(payload.tool_input.old_string, 'a');
});

test('the PreToolUse matcher filters non-matching tools', async () => {
  const dir = makeProject({ blockPre: true });
  const plugin = await HarnessPlugin({ client: fakeClient(), directory: dir });
  // bash does not match Write|Edit|MultiEdit — the blocking hook must not run.
  await plugin['tool.execute.before'](
    { tool: 'bash', sessionID: 's1', callID: 'c1' },
    { args: { command: 'ls' } }
  );
  assert.strictEqual(payloadOf(dir, 'pre.js'), null);
});

test('a PostToolUse exit-2 becomes a corrective prompt, not a throw', async () => {
  const dir = makeProject({ blockPost: true });
  const client = fakeClient();
  const plugin = await HarnessPlugin({ client, directory: dir });
  await plugin['tool.execute.after'](
    { tool: 'write', sessionID: 's1', callID: 'c1', args: { filePath: 'a.js' } },
    { title: 'a.js', output: 'ok', metadata: {} }
  );
  assert.strictEqual(client.prompts.length, 1);
  assert.match(client.prompts[0].body.parts[0].text, /post blocked/);
  const payload = payloadOf(dir, 'post.js');
  assert.strictEqual(payload.hook_event_name, 'PostToolUse');
  assert.strictEqual(payload.tool_response.output, 'ok');
});

test('session.idle dispatches Stop and injects the exit-2 output as a prompt', async () => {
  const dir = makeProject({ blockStop: true });
  const client = fakeClient();
  const plugin = await HarnessPlugin({ client, directory: dir });
  await plugin.event({ event: { type: 'session.idle', properties: { sessionID: 's1' } } });
  const payload = payloadOf(dir, 'stop.js');
  assert.strictEqual(payload.hook_event_name, 'Stop');
  assert.strictEqual(client.prompts.length, 1);
  assert.match(client.prompts[0].body.parts[0].text, /stop blocked/);
});

test('session.idle on a child session dispatches SubagentStop', async () => {
  const dir = makeProject();
  const client = fakeClient();
  client.session.get = async () => ({ data: { parentID: 'parent' } });
  const plugin = await HarnessPlugin({ client, directory: dir });
  await plugin.event({ event: { type: 'session.idle', properties: { sessionID: 's2' } } });
  const payload = payloadOf(dir, 'stop.js');
  // SubagentStop has no manifest entry in this fixture, so no hook runs.
  assert.strictEqual(payload, null);
});

test('message.updated carries the buffered part text as the prompt', async () => {
  const dir = makeProject();
  const client = fakeClient();
  const plugin = await HarnessPlugin({ client, directory: dir });
  await plugin.event({
    event: {
      type: 'message.part.updated',
      properties: { part: { type: 'text', messageID: 'm1', text: 'hello harness' } },
    },
  });
  await plugin.event({
    event: { type: 'message.updated', properties: { info: { id: 'm1', role: 'user', sessionID: 's1' } } },
  });
  const payload = payloadOf(dir, 'stop.js');
  assert.strictEqual(payload.hook_event_name, 'UserPromptSubmit');
  assert.strictEqual(payload.prompt, 'hello harness');
});

test('the real pre-write-gate blocks a write outside the project dir through the adapter', async () => {
  const dir = makeProject();
  const manifest = {
    hooks: {
      PreToolUse: [
        {
          matcher: 'Write|Edit|MultiEdit',
          hooks: [{ type: 'command', command: 'node "$OPENCODE_PROJECT_DIR/.opencode/hooks/pre-write-gate.js"' }],
        },
      ],
    },
  };
  fs.writeFileSync(path.join(dir, '.opencode', 'settings.json'), JSON.stringify(manifest));
  fs.mkdirSync(path.join(dir, '.opencode', 'hooks', 'lib'), { recursive: true });
  fs.cpSync(path.join(ROOT, '.opencode', 'hooks', 'pre-write-gate.js'), path.join(dir, '.opencode', 'hooks', 'pre-write-gate.js'));
  fs.cpSync(path.join(ROOT, '.opencode', 'hooks', 'lib'), path.join(dir, '.opencode', 'hooks', 'lib'), { recursive: true });
  const plugin = await HarnessPlugin({ client: fakeClient(), directory: dir });
  // Not under the project and not under /tmp (which isWriteInScope allows).
  const outside = '/usr/local/definitely-outside/x.txt';
  await assert.rejects(
    plugin['tool.execute.before'](
      { tool: 'write', sessionID: 's1', callID: 'c1' },
      { args: { filePath: outside, content: 'x' } }
    ),
    /outside|project/i
  );
  // ...and a write inside the project passes (a test file, so the TDD
  // test-first gate does not fire).
  await plugin['tool.execute.before'](
    { tool: 'write', sessionID: 's1', callID: 'c1' },
    { args: { filePath: path.join(dir, 'src', 'ok.test.js'), content: 'x' } }
  );
});
