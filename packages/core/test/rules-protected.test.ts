import { describe, expect, it } from "vitest";
import { evaluate } from "../src/rules.js";
import type { CyclePhase } from "../src/cycle.js";

const edit = (phase: CyclePhase, file: string) => evaluate({ phase }, { type: "edit", file });
const SPEC = ".tdd-sdd/use-cases/login/spec.md";
const PLAN = ".tdd-sdd/use-cases/login/plan.md";

describe("harness files are protected", () => {
  it.each<CyclePhase>(["spec_draft", "red", "review"])("never lets the AI edit state.json (%s)", (phase) => {
    expect(edit(phase, ".tdd-sdd/state.json")).toMatchObject({ allow: false, rule: "HARNESS_FILE_PROTECTED" });
  });

  it("never lets the AI edit overrides.log", () => {
    expect(edit("red", ".tdd-sdd/overrides.log")).toMatchObject({ allow: false, rule: "HARNESS_FILE_PROTECTED" });
  });

  it("allows editing spec.md only while it is a draft", () => {
    expect(edit("spec_draft", SPEC)).toEqual({ allow: true });
    expect(edit("spec_approved", SPEC)).toMatchObject({ allow: false, rule: "SPEC_FROZEN" });
    expect(edit("red", SPEC)).toMatchObject({ allow: false, rule: "SPEC_FROZEN" });
  });

  it("allows editing plan.md only while the plan is being drafted", () => {
    expect(edit("spec_approved", PLAN)).toEqual({ allow: true });
    expect(edit("plan_approved", PLAN)).toMatchObject({ allow: false, rule: "PLAN_FROZEN" });
    expect(edit("green", PLAN)).toMatchObject({ allow: false, rule: "PLAN_FROZEN" });
  });

  it("lets the AI write the test command only while the spec is a draft", () => {
    expect(edit("spec_draft", ".tdd-sdd/config.json")).toEqual({ allow: true });
    expect(edit("spec_approved", ".tdd-sdd/config.json")).toMatchObject({ allow: false, rule: "CONFIG_FROZEN" });
    expect(edit("red", ".tdd-sdd/config.json")).toMatchObject({ allow: false, rule: "CONFIG_FROZEN" });
  });
});
