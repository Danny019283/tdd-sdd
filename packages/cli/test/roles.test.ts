import { describe, expect, it } from "vitest";
import { handleHook, type HookInput } from "../src/hook.js";
import {
  amendCheckFiles,
  approveCheckAsReviewer,
  humanCommand,
  initUseCase,
  recordTestRun,
  requestReview,
} from "../src/commands.js";
import { loadState, saveState } from "../src/store.js";
import { FILLED_SPEC, PLAN, read, tempProject, write } from "./helpers.js";

const UC = ".tdd-sdd/use-cases/login";
const CLI = "node /opt/plugin/bin/tdd-sdd.mjs";

const bash = (command: string, who: Partial<HookInput> = {}): HookInput => ({
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command },
  ...who,
});
const as = (type: string): Partial<HookInput> => ({ agent_id: "agent-1", agent_type: type });

function inReview() {
  const root = tempProject();
  initUseCase(root, "login");
  write(root, `${UC}/spec.md`, FILLED_SPEC);
  humanCommand(root, "approve", "spec");
  write(root, `${UC}/plan.md`, PLAN);
  humanCommand(root, "approve", "plan");
  recordTestRun(root, 1);
  recordTestRun(root, 0);
  requestReview(root);
  return root;
}

describe("who may run approve-check and amend-files", () => {
  it.each([
    ["the main session", {}],
    ["the developer", as("tdd-sdd:desarrollador")],
    ["the troubleshooter", as("tdd-sdd:solucionador")],
    ["an unknown subagent", { agent_id: "x" }],
  ])("denies approve-check to %s", (_name, who) => {
    const root = inReview();
    const r = handleHook(bash(`${CLI} approve-check`, who), root);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/ROLE_NOT_ALLOWED/);
    expect(loadState(root)?.grant).toBeUndefined();
  });

  it.each(["tdd-sdd:revisor", "revisor"])("leaves a one-use grant for the reviewer (%s)", (type) => {
    const root = inReview();
    expect(handleHook(bash(`${CLI} approve-check`, as(type)), root).exitCode).toBe(0);
    expect(loadState(root)?.grant).toMatchObject({ action: "approve_check", agent: "revisor" });
  });

  it("denies amend-files to everyone but the troubleshooter", () => {
    const root = inReview();
    const command = `${CLI} amend-files 1 --add src/a.ts`;
    expect(handleHook(bash(command, as("tdd-sdd:revisor")), root).exitCode).toBe(2);
    expect(handleHook(bash(command), root).exitCode).toBe(2);
    expect(handleHook(bash(command, as("tdd-sdd:solucionador")), root).exitCode).toBe(0);
    expect(loadState(root)?.grant).toMatchObject({ action: "amend_files", agent: "solucionador" });
  });

  it("honours an explicit human override of ROLE_NOT_ALLOWED", () => {
    const root = inReview();
    humanCommand(root, "override", "ROLE_NOT_ALLOWED");
    expect(handleHook(bash(`${CLI} approve-check`), root).exitCode).toBe(0);
    expect(loadState(root)?.grant?.action).toBe("approve_check");
  });

  it("does not let the shell forge approvals or grants", () => {
    const root = inReview();
    for (const command of [`echo x >> .tdd-sdd/approvals.log`, `echo x > .tdd-sdd/amendments.log`]) {
      expect(handleHook(bash(command, as("tdd-sdd:revisor")), root).exitCode).toBe(2);
    }
  });
});

describe("approve-check as the reviewer", () => {
  const granted = (root: string, action = "approve_check", at = new Date().toISOString()) =>
    saveState(root, { ...loadState(root)!, grant: { action: action as "approve_check", agent: "revisor", at } });

  it("refuses to run without a grant from the hook", () => {
    const root = inReview();
    let ran = false;
    expect(approveCheckAsReviewer(root, () => ((ran = true), 0)).ok).toBe(false);
    expect(ran).toBe(false);
    expect(loadState(root)?.phase).toBe("review");
  });

  it("runs the tests and, if they pass, approves the check and enables the commit", () => {
    const root = inReview();
    granted(root);
    const result = approveCheckAsReviewer(root, () => 0);
    expect(result).toMatchObject({ ok: true });
    expect(result.message).toMatch(/Check 1 aprobado/);
    expect(read(root, `${UC}/plan.md`)).toContain("- [x] 1.");
    expect(loadState(root)).toMatchObject({ phase: "plan_approved", pendingCommit: true });
    expect(loadState(root)?.grant).toBeUndefined();
    expect(read(root, ".tdd-sdd/approvals.log")).toMatch(/check 1 revisor tests=pass/);
    expect(handleHook(bash("git commit -m x"), root).exitCode).toBe(0);
  });

  it("does not approve when the tests fail, and spends the grant anyway", () => {
    const root = inReview();
    granted(root);
    const result = approveCheckAsReviewer(root, () => 1);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/NO aprobado/);
    expect(loadState(root)).toMatchObject({ phase: "review", pendingCommit: false });
    expect(loadState(root)?.grant).toBeUndefined();
    expect(read(root, `${UC}/plan.md`)).toContain("- [ ] 1.");
    expect(read(root, ".tdd-sdd/approvals.log")).toMatch(/check 1 revisor tests=fail/);
  });

  it("rejects a stale grant, a grant for another action and a wrong phase", () => {
    const root = inReview();
    granted(root, "approve_check", new Date(Date.now() - 5 * 60_000).toISOString());
    expect(approveCheckAsReviewer(root, () => 0).ok).toBe(false);
    granted(root, "amend_files");
    expect(approveCheckAsReviewer(root, () => 0).ok).toBe(false);

    const green = tempProject();
    initUseCase(green, "login");
    granted(green);
    expect(approveCheckAsReviewer(green, () => 0).ok).toBe(false);
  });
});

describe("amend-files as the troubleshooter", () => {
  const granted = (root: string) =>
    saveState(root, { ...loadState(root)!, grant: { action: "amend_files", agent: "solucionador", at: new Date().toISOString() } });

  it("rewrites only the files of the current check and logs it", () => {
    const root = inReview();
    granted(root);
    const result = amendCheckFiles(root, 1, { add: ["src/token.ts"], remove: [] });
    expect(result).toMatchObject({ ok: true });
    expect(read(root, `${UC}/plan.md`)).toContain("  - archivos: src/login.ts, tests/login.test.ts, src/token.ts\n- [ ] 2.");
    expect(read(root, ".tdd-sdd/amendments.log")).toMatch(/check 1 solucionador \+src\/token\.ts/);
    expect(loadState(root)?.grant).toBeUndefined();
    expect(handleHook({ hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "src/token.ts" } }, root).exitCode).toBe(2); // phase review: production still frozen
  });

  it("only touches the check in progress, never a later or earlier one", () => {
    const root = inReview();
    granted(root);
    const result = amendCheckFiles(root, 2, { add: ["src/x.ts"], remove: [] });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/check en curso/);
    expect(read(root, `${UC}/plan.md`)).not.toContain("src/x.ts");
  });

  it("refuses without a grant and rejects forbidden paths", () => {
    const root = inReview();
    expect(amendCheckFiles(root, 1, { add: ["src/a.ts"], remove: [] }).ok).toBe(false);
    granted(root);
    const result = amendCheckFiles(root, 1, { add: [".tdd-sdd/state.json"], remove: [] });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/ruta no permitida/);
  });

  it("widens the scope guard so the developer can then edit the new file", () => {
    const root = tempProject();
    initUseCase(root, "login");
    write(root, `${UC}/spec.md`, FILLED_SPEC);
    humanCommand(root, "approve", "spec");
    write(root, `${UC}/plan.md`, PLAN);
    humanCommand(root, "approve", "plan");
    recordTestRun(root, 1);
    const edit = (f: string): HookInput => ({ hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: f } });
    expect(handleHook(edit("src/token.ts"), root).stderr).toMatch(/OUT_OF_SCOPE/);
    granted(root);
    amendCheckFiles(root, 1, { add: ["src/token.ts"], remove: [] });
    expect(handleHook(edit("src/token.ts"), root).exitCode).toBe(0);
  });
});

describe("SubagentStart", () => {
  const start = (type: string): HookInput => ({ hook_event_name: "SubagentStart", agent_id: "a", agent_type: type });

  it("gives the plugin's agents the CLI command, their role and the current state", () => {
    const root = inReview();
    const r = handleHook(start("tdd-sdd:revisor"), root, { cliPath: "/opt/plugin/bin/tdd-sdd.mjs" });
    expect(r.exitCode).toBe(0);
    const context = JSON.parse(r.stdout).hookSpecificOutput;
    expect(context.hookEventName).toBe("SubagentStart");
    expect(context.additionalContext).toMatch(/node \/opt\/plugin\/bin\/tdd-sdd\.mjs/);
    expect(context.additionalContext).toMatch(/revisor/);
    expect(context.additionalContext).toMatch(/Fase: review/);
  });

  it("stays silent for subagents that are not part of the harness", () => {
    expect(handleHook(start("Explore"), inReview())).toMatchObject({ exitCode: 0, stdout: "" });
  });
});
