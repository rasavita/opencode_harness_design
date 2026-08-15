'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HARNESS_ROOT = path.join(__dirname, '..', '..');
const E2E_SETTINGS = path.join(__dirname, '..', 'fixtures', 'e2e-settings.json');

// Bare tier names used throughout the e2e suite map onto the harness model
// tiers (opencode wants provider/model ids).
const MODEL_TIERS = {
  opus: process.env.HARNESS_MODEL_JUDGMENT || 'anthropic/claude-opus-5',
  sonnet: process.env.HARNESS_MODEL_GENERATION || 'anthropic/claude-sonnet-5',
  haiku: process.env.HARNESS_MODEL_EXPLORATION || 'anthropic/claude-haiku-4-5',
};

function resolveModel(model) {
  return MODEL_TIERS[model] || model;
}

// opencode run has no --settings/--plugin-dir/--max-budget-usd/--session-id:
// the settings profile travels via HARNESS_SETTINGS (read by the plugin
// adapter), the plugin loads from the project's .opencode/, budget caps are
// metered in-harness, and sessions cannot start with a caller-chosen id — a
// later link resumes the most recent session for the cwd via --continue.
function buildOpencodeArgs(model, continueSession, outputFormat) {
  const args = ['run', '-m', resolveModel(model)];
  if (continueSession) args.push('--continue');
  if (outputFormat) args.push('--format', 'json');
  return args;
}

function buildOpencodeEnv() {
  return {
    ...process.env,
    HARNESS_SETTINGS: E2E_SETTINGS,
    HARNESS_ENABLE_TELEMETRY: '1',
    OTEL_METRICS_EXPORTER: 'otlp',
    OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc',
    OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4317',
    OTEL_METRIC_EXPORT_INTERVAL: '10000',
    // Push harness_* receipts live via the record-run hook, same path as
    // production. When the pushgateway is down the hook's push fails silently,
    // so this is safe to set unconditionally. Lets the build+observability e2e
    // prove real build activity reaches the dashboard (Part B of the
    // pipeline-progress proposal).
    HARNESS_PUSHGATEWAY_URL: process.env.HARNESS_PUSHGATEWAY_URL || 'http://localhost:9091',
  };
}

function runOpencode(prompt, options = {}) {
  const {
    cwd = process.cwd(),
    model = 'sonnet',
    timeoutMs = 300000,
    continueSession = false,
    outputFormat = null,
  } = options; // budgetUsd/pluginDir/sessionId accepted by callers but have no opencode equivalent

  const args = [...buildOpencodeArgs(model, continueSession, outputFormat), prompt];
  const { result, stdout, stderr } = spawnCapturedGroup('opencode', args, {
    input: '', cwd, timeoutMs, env: buildOpencodeEnv(),
  });
  const combined = `${stdout || ''}\n${stderr || ''}`;
  // Surface account/session caps immediately so live e2e fails with a clear
  // message instead of looking like a silent scaffold no-op.
  const sessionLimited = /hit your session limit|session limit · resets/i.test(combined);
  return {
    stdout,
    stderr,
    exitCode: result.status,
    signal: result.signal,
    error: result.error,
    sessionLimited,
    limitMessage: sessionLimited
      ? (combined.match(/You've hit your session limit[^\n]*/i) || ['session limit hit'])[0]
      : null,
  };
}

function readTextOr(p, fallback) {
  try { return fs.readFileSync(p, 'utf8'); } catch (_) { return fallback; }
}

// spawnSync, but capture stdout/stderr to FILES instead of pipes and reap the
// whole process group afterward. With pipes, a grandchild that outlives the
// killed `opencode` — a lingering dev server, or a node:test that never
// force-exits — keeps the pipe open, so spawnSync blocks draining it far past
// timeoutMs; because runOpencode is synchronous that also wedges node:test's own
// timeout. Files never block, and the group-kill (-pid, only reachable because
// the child is detached/a group leader) cleans up the orphans spawnSync's
// single-pid SIGKILL leaves behind.
function spawnCapturedGroup(command, args, { input, cwd, timeoutMs, env }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-run-'));
  const outFd = fs.openSync(path.join(dir, 'out'), 'w');
  const errFd = fs.openSync(path.join(dir, 'err'), 'w');
  let result;
  try {
    result = spawnSync(command, args, {
      input, cwd, env, timeout: timeoutMs,
      killSignal: 'SIGKILL', detached: true, stdio: ['pipe', outFd, errFd],
    });
  } finally {
    fs.closeSync(outFd);
    fs.closeSync(errFd);
  }
  if (result.pid) {
    try { process.kill(-result.pid, 'SIGKILL'); } catch (_) { /* group already gone */ }
  }
  const stdout = readTextOr(path.join(dir, 'out'), '');
  const stderr = readTextOr(path.join(dir, 'err'), '');
  fs.rmSync(dir, { recursive: true, force: true });
  return { result, stdout, stderr };
}

module.exports = { runOpencode, spawnCapturedGroup, HARNESS_ROOT };
