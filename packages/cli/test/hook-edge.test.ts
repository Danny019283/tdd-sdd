import { describe, expect, it } from "vitest";
import { handleHook, type HookInput } from "../src/hook.js";
import { initUseCase } from "../src/commands.js";
import { loadState } from "../src/store.js";
import { FILLED_SPEC, read, tempProject, write } from "./helpers.js";

const UC = ".tdd-sdd/use-cases/login";
const prompt = (text: string): HookInput => ({ hook_event_name: "UserPromptSubmit", prompt: text });
const bash = (command: string): HookInput => ({
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command },
});

function started() {
  const root = tempProject();
  initUseCase(root, "login");
  return root;
}

describe("human commands arrive as user prompts", () => {
  it("applies /approve spec only through UserPromptSubmit", () => {
    const root = started();
    write(root, `${UC}/spec.md`, FILLED_SPEC);
    const result = handleHook(prompt("/approve spec"), root);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/Spec aprobada/);
    expect(loadState(root)?.phase).toBe("spec_approved");
  });

  it("accepts the plugin-namespaced form of the command", () => {
    const root = started();
    write(root, `${UC}/spec.md`, FILLED_SPEC);
    handleHook(prompt("/tdd-sdd:approve spec"), root);
    expect(loadState(root)?.phase).toBe("spec_approved");
  });

  it("reports why an approval was not applied", () => {
    const root = started();
    const result = handleHook(prompt("/approve spec"), root);
    expect(result.stdout).toMatch(/NO APLICADO/);
    expect(result.stdout).toMatch(/PLACEHOLDER/);
    expect(loadState(root)?.phase).toBe("spec_draft");
  });

  it("ignores ordinary prompts", () => {
    const root = started();
    expect(handleHook(prompt("hola, aprueba la spec por favor"), root)).toMatchObject({ exitCode: 0, stdout: "" });
    expect(loadState(root)?.phase).toBe("spec_draft");
  });
});

describe("the AI cannot rewrite harness state from the shell", () => {
  it.each([
    `echo '{"phase":"red"}' > .tdd-sdd/state.json`,
    `sed -i 's/spec_draft/red/' .tdd-sdd/state.json`,
    `rm .tdd-sdd/overrides.log`,
  ])("denies: %s", (command) => {
    expect(handleHook(bash(command), started())).toMatchObject({ exitCode: 2 });
  });

  it("still lets the AI read the state", () => {
    expect(handleHook(bash("cat .tdd-sdd/state.json"), started()).exitCode).toBe(0);
  });

  it("denies editing state.json with an absolute path", () => {
    const root = started();
    const result = handleHook(
      { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: `${root}/.tdd-sdd/state.json` } },
      root,
    );
    expect(result.exitCode).toBe(2);
  });
});

describe("overrides", () => {
  it("lets one explicit, logged override through", () => {
    const root = started();
    const edit: HookInput = { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "src/x.ts" } };
    expect(handleHook(edit, root).exitCode).toBe(2);
    handleHook(prompt("/override PRODUCTION_REQUIRES_RED_TEST"), root);
    expect(handleHook(edit, root).exitCode).toBe(0);
    expect(read(root, ".tdd-sdd/overrides.log")).toMatch(/PRODUCTION_REQUIRES_RED_TEST/);
  });
});

describe("session start", () => {
  it("tells the AI where the CLI is and that the harness is not started", () => {
    const root = tempProject();
    const result = handleHook({ hook_event_name: "SessionStart" }, root, { cliPath: "/p/tdd-sdd.mjs" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("node /p/tdd-sdd.mjs");
    expect(result.stdout).toMatch(/\/start-dev/);
  });

  it("includes the current status when a use case is active", () => {
    const root = started();
    const result = handleHook({ hook_event_name: "SessionStart" }, root, { cliPath: "/p/tdd-sdd.mjs" });
    expect(result.stdout).toContain("Caso de uso: login");
    expect(result.stdout).toContain("Fase: spec_draft");
  });
});
