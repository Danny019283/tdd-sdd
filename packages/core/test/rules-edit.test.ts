import { describe, expect, it } from "vitest";
import { evaluate } from "../src/rules.js";
import type { CyclePhase } from "../src/cycle.js";

const PROD = "src/login.ts";
const TEST = "tests/login.test.ts";

const edit = (phase: CyclePhase, file: string) => evaluate({ phase }, { type: "edit", file });

describe("evaluate edit: production code needs a red test", () => {
  it.each<CyclePhase>(["spec_draft", "spec_approved", "plan_approved"])(
    "denies editing production code in %s",
    (phase) => {
      const decision = edit(phase, PROD);
      expect(decision.allow).toBe(false);
      if (!decision.allow) expect(decision.rule).toBe("PRODUCTION_REQUIRES_RED_TEST");
    },
  );

  it.each<CyclePhase>(["red", "refactor"])("allows editing production code in %s", (phase) => {
    expect(edit(phase, PROD)).toEqual({ allow: true });
  });

  it("allows writing the test once the plan is approved", () => {
    expect(edit("plan_approved", TEST)).toEqual({ allow: true });
  });

  it("explains the denial in Spanish with what to do next", () => {
    const decision = edit("plan_approved", PROD);
    expect(decision.allow).toBe(false);
    if (!decision.allow) expect(decision.reason).toMatch(/test en rojo/);
  });

  describe("tests are frozen during refactor", () => {
    it("denies editing a test file in refactor", () => {
      const decision = edit("refactor", TEST);
      expect(decision.allow).toBe(false);
      if (!decision.allow) {
        expect(decision.rule).toBe("TESTS_FROZEN_IN_REFACTOR");
        expect(decision.reason).toMatch(/refactor/);
      }
    });

    it.each<CyclePhase>(["plan_approved", "red"])("still allows editing a test in %s", (phase) => {
      expect(edit(phase, TEST)).toEqual({ allow: true });
    });
  });
});
