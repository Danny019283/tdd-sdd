import { describe, expect, it } from "vitest";
import { evaluate } from "../src/rules.js";
import type { CyclePhase } from "../src/cycle.js";

const commit = (context: Parameters<typeof evaluate>[0]) => evaluate(context, { type: "commit" });

describe("evaluate commit: only after the human approves a check", () => {
  it.each<CyclePhase>(["plan_approved", "red", "green", "review", "refactor"])(
    "denies a commit in %s when no check approval is pending",
    (phase) => {
      const decision = commit({ phase });
      expect(decision.allow).toBe(false);
      if (!decision.allow) {
        expect(decision.rule).toBe("COMMIT_REQUIRES_APPROVAL");
        expect(decision.reason).toMatch(/aprob/);
      }
    },
  );

  it("allows the commit that follows an approved check", () => {
    expect(commit({ phase: "plan_approved", pendingCommit: true })).toEqual({ allow: true });
  });

  it("is not blocked by the file scope of the check", () => {
    expect(
      commit({ phase: "plan_approved", pendingCommit: true, allowedFiles: ["src/login.ts"] }),
    ).toEqual({ allow: true });
  });
});
