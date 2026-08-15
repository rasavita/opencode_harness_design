// OpenCode plugin adapter for the harness hook layer.
//
// The harness hooks (.opencode/hooks/*.js) are standalone Node processes that
// read one canonical JSON hook event from stdin and signal a veto by exiting
// with code 2 after writing the reason to stdout/stderr. That envelope
// ({ hook_event_name, session_id, tool_name, tool_input, tool_response,
// prompt, ... }) is the pluggable boundary: this adapter translates OpenCode's
// plugin events into that envelope, and translates an exit-2 veto into the
// OpenCode blocking mechanism (throwing from `tool.execute.before` — see
// https://opencode.ai/docs/plugins/).
//
// The wiring manifest stays declarative in .opencode/settings.json#hooks
// (logical event -> matcher -> hook commands), so the wiring-contract tests
// and scaffold tooling keep a single source of truth. This adapter evaluates
// those matchers against the mapped tool names.
//
// Blocking semantics per surface:
//   - tool.execute.before  -> throw Error(reason)  (true pre-execution veto)
//   - tool.execute.after   -> post-execution correction only: the tool already
//     ran, so a veto is surfaced back into the session as a corrective prompt.
//   - Stop/SubagentStop    -> OpenCode has no "block the stop" control; an
//     exit-2 from a Stop hook (e.g. auto-continue-on-stop) is converted into a
//     follow-up prompt injected via client.session.prompt().
//   - UserPromptSubmit     -> advisory only (message.updated fires after the
//     message exists); an exit-2 becomes a corrective prompt.

import fs from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"

const TOOL_NAME_MAP = {
  write: "Write",
  edit: "Edit",
  multiedit: "MultiEdit",
  patch: "Edit",
  bash: "Bash",
  read: "Read",
  task: "Task",
  glob: "Glob",
  grep: "Grep",
  webfetch: "WebFetch",
  skill: "Skill",
}

// OpenCode tool args -> Claude-style tool_input keys the hooks consume.
function mapToolInput(tool, args) {
  const a = args || {}
  const out = { ...a }
  if (a.filePath != null) out.file_path = a.filePath
  if (a.oldString != null) out.old_string = a.oldString
  if (a.newString != null) out.new_string = a.newString
  if (a.subagent_type == null && a.subagentType != null) out.subagent_type = a.subagentType
  return out
}

function loadHookManifest(projectDir) {
  try {
    const settings = JSON.parse(
      fs.readFileSync(path.join(projectDir, ".opencode", "settings.json"), "utf8")
    )
    return settings.hooks || {}
  } catch {
    return {}
  }
}

// Extract the hook script path from a manifest command like
//   node "$OPENCODE_PROJECT_DIR/.opencode/hooks/pre-write-gate.js"
function scriptFromCommand(command, projectDir) {
  const m = /\$OPENCODE_PROJECT_DIR\/([^"']+\.js)/.exec(command || "")
  return m ? path.join(projectDir, m[1]) : null
}

function matcherApplies(matcher, toolName) {
  if (!matcher) return true
  try {
    return new RegExp(`^(?:${matcher})$`).test(toolName)
  } catch {
    return matcher === toolName
  }
}

function hooksFor(manifest, eventName, toolName) {
  const scripts = []
  for (const entry of manifest[eventName] || []) {
    if (toolName != null && !matcherApplies(entry.matcher, toolName)) continue
    for (const h of entry.hooks || []) {
      if (h && h.type === "command" && h.command) scripts.push({ command: h.command, timeout: h.timeout })
    }
  }
  return scripts
}

function runHookScript(script, payload, projectDir, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], {
      cwd: projectDir,
      env: {
        ...process.env,
        OPENCODE_PROJECT_DIR: projectDir,
        HARNESS_PLUGIN_ROOT: path.join(projectDir, ".opencode"),
      },
      stdio: ["pipe", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    let done = false
    const finish = (status) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ status, stdout, stderr })
    }
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL") } catch { /* already gone */ }
      finish(0) // hooks are fail-open on timeout, like Claude Code's runner
    }, timeoutMs || 10000)
    child.stdout.on("data", (c) => { stdout += c })
    child.stderr.on("data", (c) => { stderr += c })
    child.on("error", () => finish(0))
    child.on("close", (code) => finish(code == null ? 0 : code))
    child.stdin.on("error", () => {})
    child.stdin.end(JSON.stringify(payload))
  })
}

async function dispatch(manifest, projectDir, eventName, toolName, payload) {
  const blocks = []
  for (const { command, timeout } of hooksFor(manifest, eventName, toolName)) {
    const script = scriptFromCommand(command, projectDir)
    if (!script || !fs.existsSync(script)) continue
    const result = await runHookScript(script, payload, projectDir, timeout)
    if (result.status === 2) {
      blocks.push((result.stdout || result.stderr || "blocked by harness hook").trim())
    }
  }
  return blocks
}

export const HarnessPlugin = async ({ client, directory }) => {
  const projectDir = directory
  const manifest = loadHookManifest(projectDir)
  const seenPrompts = new Set()
  // Text parts stream in via message.part.updated; buffer them per message so
  // the UserPromptSubmit envelope can carry the prompt text (best-effort: parts
  // that arrive after message.updated are missed).
  const partText = new Map()

  // Best-effort corrective feedback for post-execution / stop surfaces.
  async function injectPrompt(sessionID, text) {
    if (!sessionID || !text) return
    try {
      await client.session.prompt({
        path: { id: sessionID },
        body: { parts: [{ type: "text", text }] },
      })
    } catch { /* session may be gone; feedback is best-effort */ }
  }

  async function isSubagentSession(sessionID) {
    try {
      const res = await client.session.get({ path: { id: sessionID } })
      const info = res && (res.data || res)
      return Boolean(info && info.parentID)
    } catch {
      return false
    }
  }

  return {
    "tool.execute.before": async (input, output) => {
      const toolName = TOOL_NAME_MAP[input.tool] || input.tool
      const payload = {
        hook_event_name: "PreToolUse",
        session_id: input.sessionID,
        tool_name: toolName,
        tool_input: mapToolInput(input.tool, output.args),
      }
      const blocks = await dispatch(manifest, projectDir, "PreToolUse", toolName, payload)
      if (blocks.length) throw new Error(blocks.join("\n"))
    },

    "tool.execute.after": async (input, output) => {
      const toolName = TOOL_NAME_MAP[input.tool] || input.tool
      const payload = {
        hook_event_name: "PostToolUse",
        session_id: input.sessionID,
        tool_name: toolName,
        tool_input: mapToolInput(input.tool, input.args),
        tool_response: {
          title: output && output.title,
          output: output && output.output,
          metadata: output && output.metadata,
        },
      }
      const blocks = await dispatch(manifest, projectDir, "PostToolUse", toolName, payload)
      if (blocks.length) await injectPrompt(input.sessionID, blocks.join("\n"))
    },

    event: async ({ event }) => {
      if (!event || !event.type) return

      if (event.type === "session.created") {
        const sessionID = event.properties && event.properties.info && event.properties.info.id
        await dispatch(manifest, projectDir, "SessionStart", null, {
          hook_event_name: "SessionStart",
          session_id: sessionID,
        })
        return
      }

      if (event.type === "message.part.updated") {
        const part = event.properties && event.properties.part
        if (part && part.type === "text" && part.messageID && part.text) {
          partText.set(part.messageID, part.text)
        }
        return
      }

      if (event.type === "message.updated") {
        const info = event.properties && event.properties.info
        if (!info || info.role !== "user" || seenPrompts.has(info.id)) return
        seenPrompts.add(info.id)
        const prompt = partText.get(info.id) || ""
        partText.delete(info.id)
        const blocks = await dispatch(manifest, projectDir, "UserPromptSubmit", null, {
          hook_event_name: "UserPromptSubmit",
          session_id: info.sessionID,
          prompt,
        })
        if (blocks.length) await injectPrompt(info.sessionID, blocks.join("\n"))
        return
      }

      if (event.type === "session.idle") {
        const sessionID = event.properties && event.properties.sessionID
        const eventName = (await isSubagentSession(sessionID)) ? "SubagentStop" : "Stop"
        const blocks = await dispatch(manifest, projectDir, eventName, null, {
          hook_event_name: eventName,
          session_id: sessionID,
          stop_hook_active: false,
        })
        if (blocks.length) await injectPrompt(sessionID, blocks.join("\n"))
      }
    },
  }
}
