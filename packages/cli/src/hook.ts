import { isAbsolute, relative } from "node:path";
import { buildContext, evaluate, type Action, type Decision } from "@tdd-sdd/core";
import { humanCommand, status } from "./commands.js";
import { loadState, planPath, readOptional, saveState } from "./store.js";

export interface HookInput {
  hook_event_name: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: { file_path?: string; filePath?: string; path?: string; notebook_path?: string; command?: string };
  prompt?: string;
  stop_hook_active?: boolean;
}

export interface HookResult {
  exitCode: 0 | 2;
  stdout: string;
  stderr: string;
}

const ALLOW: HookResult = { exitCode: 0, stdout: "", stderr: "" };
const EDIT_TOOLS = new Set(["edit", "write", "multiedit", "notebookedit"]);
const HARNESS_WRITE = /\.tdd-sdd\/(state\.json|overrides\.log)/;
const WRITE_OPERATOR = />|\btee\b|\bsed\s+-i|\bmv\b|\brm\b|\bcp\b|\bdd\b|\btruncate\b/;

function deny(rule: string, reason: string): HookResult {
  return { exitCode: 2, stdout: "", stderr: `[tdd-sdd] ${reason} (regla: ${rule})` };
}

function actionFor(input: HookInput, root: string): Action | HookResult | undefined {
  const tool = (input.tool_name ?? "").toLowerCase();
  const args = input.tool_input ?? {};
  if (EDIT_TOOLS.has(tool)) {
    const raw = args.file_path ?? args.filePath ?? args.notebook_path ?? args.path;
    if (!raw) return undefined;
    const file = isAbsolute(raw) ? relative(root, raw) : raw;
    return { type: "edit", file };
  }
  if (tool === "bash") {
    const command = args.command ?? "";
    if (HARNESS_WRITE.test(command) && WRITE_OPERATOR.test(command)) {
      return deny("HARNESS_FILE_PROTECTED", "Los archivos de estado del harness no se modifican desde la shell.");
    }
    if (/\bgit\b[^|;&]*\bcommit\b/.test(command)) return { type: "commit" };
    if (/\bgit\b[^|;&]*\bpush\b/.test(command)) return { type: "push" };
  }
  return undefined;
}

function isHookResult(value: Action | HookResult | undefined): value is HookResult {
  return value !== undefined && "exitCode" in value;
}

function decide(input: HookInput, root: string, action: Action): HookResult {
  const state = loadState(root);
  if (!state) return ALLOW;
  const context = buildContext(state, readOptional(planPath(root, state.useCase)));
  const decision: Decision = evaluate(context, action);
  if (decision.allow) {
    if (action.type === "commit" && state.pendingCommit) saveState(root, { ...state, pendingCommit: false });
    return ALLOW;
  }
  if (state.overrides.includes(decision.rule)) {
    return { exitCode: 0, stdout: "", stderr: `[tdd-sdd] override activo para ${decision.rule}` };
  }
  return deny(decision.rule, decision.reason);
}

const PROMPT_COMMAND = /^\/(?:[\w-]+:)?(approve|override|refactor)\b\s*(.*)$/s;

function handlePrompt(input: HookInput, root: string): HookResult {
  const match = PROMPT_COMMAND.exec((input.prompt ?? "").trim());
  if (!match || !loadState(root)) return ALLOW;
  const result = humanCommand(root, match[1]!, match[2]!.trim());
  const prefix = result.ok ? "[tdd-sdd]" : "[tdd-sdd] NO APLICADO:";
  return { exitCode: 0, stdout: `${prefix} ${result.message}`, stderr: "" };
}

function sessionStart(root: string, cliPath: string | undefined): HookResult {
  const cli = cliPath ? `node ${cliPath}` : "tdd-sdd";
  const intro = `[tdd-sdd] Harness TDD+SDD. Comando CLI: ${cli} (úsalo donde la documentación dice "tdd-sdd").`;
  const body = loadState(root)
    ? status(root)
    : "El harness no está iniciado en este proyecto; usa /start-dev para empezar un caso de uso.";
  return { exitCode: 0, stdout: `${intro}\n${body}`, stderr: "" };
}

export function handleHook(input: HookInput, root: string, options: { cliPath?: string } = {}): HookResult {
  if (input.hook_event_name === "SessionStart") return sessionStart(root, options.cliPath);
  if (!loadState(root)) return ALLOW;
  switch (input.hook_event_name) {
    case "PreToolUse": {
      const action = actionFor(input, root);
      if (action === undefined) return ALLOW;
      if (isHookResult(action)) return action;
      return decide(input, root, action);
    }
    case "Stop":
      if (input.stop_hook_active) return ALLOW;
      return decide(input, root, { type: "stop" });
    case "UserPromptSubmit":
      return handlePrompt(input, root);
    default:
      return ALLOW;
  }
}
