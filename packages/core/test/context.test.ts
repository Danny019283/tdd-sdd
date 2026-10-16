import { describe, expect, it } from "vitest";
import { buildContext, type ProjectState } from "../src/context.js";

const PLAN = `- [x] 1. Uno
  - cubre: FP-1
  - archivos: src/a.ts
- [ ] 2. Dos
  - cubre: FA-2a
  - archivos: src/b.ts, tests/b.test.ts
- [ ] 3. Tres
  - cubre: RN-1
  - archivos: src/c.ts
`;

const state = (over: Partial<ProjectState> = {}): ProjectState => ({
  useCase: "login",
  phase: "red",
  pendingCommit: false,
  finalApproved: false,
  overrides: [],
  ...over,
});

describe("buildContext", () => {
  it("scopes edits to the first unfinished check and counts the remaining ones", () => {
    expect(buildContext(state(), PLAN)).toEqual({
      phase: "red",
      allowedFiles: ["src/b.ts", "tests/b.test.ts"],
      pendingCommit: false,
      remainingChecks: 2,
      finalApproved: false,
    });
  });

  it("does not scope files before the plan is approved", () => {
    const ctx = buildContext(state({ phase: "spec_approved" }), PLAN);
    expect(ctx.allowedFiles).toBeUndefined();
  });

  it("has no scope once every check is done", () => {
    const done = PLAN.replaceAll("- [ ]", "- [x]");
    const ctx = buildContext(state({ phase: "plan_approved", finalApproved: true }), done);
    expect(ctx.allowedFiles).toBeUndefined();
    expect(ctx.remainingChecks).toBe(0);
    expect(ctx.finalApproved).toBe(true);
  });

  it("leaves remainingChecks unknown when there is no plan yet", () => {
    expect(buildContext(state({ phase: "spec_draft" })).remainingChecks).toBeUndefined();
  });
});
