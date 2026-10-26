import { describe, expect, it } from "vitest";
import { handleHook, type HookInput } from "../src/hook.js";
import { finishRefactor, humanCommand, initUseCase, recordTestRun, requestReview } from "../src/commands.js";
import { loadState } from "../src/store.js";
import { FILLED_SPEC, PLAN, read, tempProject, write } from "./helpers.js";

const UC = ".tdd-sdd/use-cases/login";

const edit = (file: string): HookInput => ({
  hook_event_name: "PreToolUse",
  tool_name: "Edit",
  tool_input: { file_path: file },
});
const bash = (command: string): HookInput => ({
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command },
});
const stop: HookInput = { hook_event_name: "Stop" };

describe("hook behaviour before the harness is initialised", () => {
  it("allows everything when the project has no .tdd-sdd/state.json", () => {
    const root = tempProject();
    expect(handleHook(edit("src/anything.ts"), root).exitCode).toBe(0);
    expect(handleHook(bash("git push"), root).exitCode).toBe(0);
  });
});

describe("full use-case walkthrough through the hooks", () => {
  it("enforces spec → plan → red → green → review → approve → push", () => {
    const root = tempProject();

    // init: spec draft with template
    expect(initUseCase(root, "login").ok).toBe(true);
    expect(loadState(root)?.phase).toBe("spec_draft");
    expect(read(root, `${UC}/spec.md`)).toContain("## 4. Disparador");
    expect(handleHook(edit("src/login.ts"), root)).toMatchObject({ exitCode: 2 });
    expect(handleHook(edit(`${UC}/spec.md`), root).exitCode).toBe(0);

    // the unfilled template cannot be approved
    expect(humanCommand(root, "approve", "spec").ok).toBe(false);
    expect(loadState(root)?.phase).toBe("spec_draft");

    // filled spec can
    write(root, `${UC}/spec.md`, FILLED_SPEC);
    expect(humanCommand(root, "approve", "spec").ok).toBe(true);
    expect(handleHook(edit(`${UC}/spec.md`), root).exitCode).toBe(2);

    // plan
    expect(handleHook(edit(`${UC}/plan.md`), root).exitCode).toBe(0);
    write(root, `${UC}/plan.md`, PLAN);
    expect(humanCommand(root, "approve", "plan").ok).toBe(true);
    expect(handleHook(edit(`${UC}/plan.md`), root).exitCode).toBe(2);

    // plan approved: tests yes, production no
    expect(handleHook(edit("tests/login.test.ts"), root).exitCode).toBe(0);
    expect(handleHook(edit("src/login.ts"), root).exitCode).toBe(2);

    // red
    expect(recordTestRun(root, 1).ok).toBe(true);
    expect(loadState(root)?.phase).toBe("red");
    expect(handleHook(edit("src/login.ts"), root).exitCode).toBe(0);
    const outOfScope = handleHook(edit("src/billing.ts"), root);
    expect(outOfScope.exitCode).toBe(2);
    expect(outOfScope.stderr).toMatch(/src\/billing\.ts/);

    // green: cannot stop before the review stop
    expect(recordTestRun(root, 0).ok).toBe(true);
    expect(handleHook(stop, root).exitCode).toBe(2);
    expect(handleHook({ ...stop, stop_hook_active: true }, root).exitCode).toBe(0);
    expect(requestReview(root).ok).toBe(true);
    expect(handleHook(stop, root).exitCode).toBe(0);

    // review: no commit until the human approves
    expect(handleHook(bash("git commit -m x"), root).exitCode).toBe(2);
    expect(humanCommand(root, "approve", "check").ok).toBe(true);
    expect(read(root, `${UC}/plan.md`)).toContain("- [x] 1.");
    expect(handleHook(bash("git commit -m x"), root).exitCode).toBe(0);
    expect(handleHook(bash("git commit -m again"), root).exitCode).toBe(2);

    // check 2
    expect(recordTestRun(root, 1).ok).toBe(true);
    expect(recordTestRun(root, 0).ok).toBe(true);
    expect(requestReview(root).ok).toBe(true);
    expect(humanCommand(root, "approve", "check").ok).toBe(true);
    expect(handleHook(bash("git commit -m y"), root).exitCode).toBe(0);

    // push needs final approval
    expect(handleHook(bash("git push origin main"), root).exitCode).toBe(2);
    expect(humanCommand(root, "approve", "final").ok).toBe(true);
    expect(handleHook(bash("git push origin main"), root).exitCode).toBe(0);
  });
});

const KINDS_PLAN = `# Plan

- [ ] 1. (refactor) Extraer lo común
  - cubre: RNF-2
  - archivos: src/common.ts, src/login.ts
- [ ] 2. (verificación) Integración real
  - cubre: RNF-1
  - archivos: tests/it.test.ts
- [ ] 3. Comportamiento nuevo
  - cubre: FP-1
  - archivos: src/login.ts, tests/login.test.ts
`;

function approvedWith(plan: string): string {
  const root = tempProject();
  initUseCase(root, "login");
  write(root, `${UC}/spec.md`, FILLED_SPEC);
  humanCommand(root, "approve", "spec");
  write(root, `${UC}/plan.md`, plan);
  expect(humanCommand(root, "approve", "plan").ok).toBe(true);
  return root;
}

describe("refactor and verification checks need no red test", () => {
  it("opens the refactor phase when the current tests are green", () => {
    const root = approvedWith(KINDS_PLAN);
    expect(handleHook(edit("src/common.ts"), root).exitCode).toBe(2);
    expect(recordTestRun(root, 1)).toMatchObject({ ok: false });
    expect(loadState(root)?.phase).toBe("plan_approved");

    expect(recordTestRun(root, 0)).toMatchObject({ ok: true });
    expect(loadState(root)?.phase).toBe("refactor");
    expect(handleHook(edit("src/common.ts"), root).exitCode).toBe(0);
    expect(handleHook(edit("tests/login.test.ts"), root).exitCode).toBe(2);

    expect(finishRefactor(root, 1).ok).toBe(false);
    expect(finishRefactor(root, 0).ok).toBe(true);
    expect(loadState(root)?.phase).toBe("review");
    expect(humanCommand(root, "approve", "check").ok).toBe(true);
    expect(read(root, `${UC}/plan.md`)).toContain("- [x] 1.");
  });

  it("goes green without a red phase for a verification check and never allows production edits", () => {
    const root = approvedWith(KINDS_PLAN.replace("- [ ] 1.", "- [x] 1."));
    expect(handleHook(edit("tests/it.test.ts"), root).exitCode).toBe(0);
    expect(handleHook(edit("src/login.ts"), root).exitCode).toBe(2);

    expect(recordTestRun(root, 0)).toMatchObject({ ok: true });
    expect(loadState(root)?.phase).toBe("green");
    expect(requestReview(root).ok).toBe(true);
    expect(humanCommand(root, "approve", "check").ok).toBe(true);
  });

  it("treats a failing verification check as a normal red", () => {
    const root = approvedWith(KINDS_PLAN.replace("- [ ] 1.", "- [x] 1."));
    expect(recordTestRun(root, 1).ok).toBe(true);
    expect(loadState(root)?.phase).toBe("red");
  });

  it("keeps rejecting green-first runs on behaviour checks", () => {
    const root = approvedWith(KINDS_PLAN.replace("- [ ] 1.", "- [x] 1.").replace("- [ ] 2.", "- [x] 2."));
    expect(recordTestRun(root, 0)).toMatchObject({ ok: false });
    expect(loadState(root)?.phase).toBe("plan_approved");
  });
});
