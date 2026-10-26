import { isAbsolute, relative, resolve } from "node:path";
import { buildContext, evaluate, type Action, type Decision } from "@tdd-sdd/core";
import { humanCommand, status } from "./commands.js";
import { extractWriteTargets } from "./shell.js";
import { loadConfig, loadState, planPath, readOptional, saveState } from "./store.js";

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

function projectRelative(file: string, root: string, cwd: string): string | undefined {
  const rel = relative(root, isAbsolute(file) ? file : resolve(cwd, file));
  return rel.startsWith("..") || isAbsolute(rel) ? undefined : rel;
}

function actionsFor(input: HookInput, root: string): Action[] | HookResult {
  const cwd = input.cwd ?? root;
  const tool = (input.tool_name ?? "").toLowerCase();
  const args = input.tool_input ?? {};
  if (EDIT_TOOLS.has(tool)) {
    const raw = args.file_path ?? args.filePath ?? args.notebook_path ?? args.path;
    if (!raw) return [];
    const file = projectRelative(raw, root, cwd);
    return file === undefined ? [] : [{ type: "edit", file }];
  }
  if (tool !== "bash") return [];
  const command = args.command ?? "";
  if (HARNESS_WRITE.test(command) && WRITE_OPERATOR.test(command)) {
    return deny("HARNESS_FILE_PROTECTED", "Los archivos de estado del harness no se modifican desde la shell.");
  }
  const actions: Action[] = [];
  for (const target of extractWriteTargets(command)) {
    const file = projectRelative(target, root, cwd);
    if (file !== undefined) actions.push({ type: "edit", file });
  }
  if (/\bgit\b[^|;&]*\bcommit\b/.test(command)) actions.push({ type: "commit" });
  if (/\bgit\b[^|;&]*\bpush\b/.test(command)) actions.push({ type: "push" });
  return actions;
}

function isHookResult(value: Action[] | HookResult): value is HookResult {
  return !Array.isArray(value);
}

function decide(input: HookInput, root: string, action: Action): HookResult {
  const state = loadState(root);
  if (!state) return ALLOW;
  const context = buildContext(state, readOptional(planPath(root, state.useCase)), loadConfig(root));
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
      const actions = actionsFor(input, root);
      if (isHookResult(actions)) return actions;
      for (const action of actions) {
        const result = decide(input, root, action);
        if (result.exitCode === 2) return result;
      }
      return ALLOW;
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
