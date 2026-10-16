import { describe, expect, it } from "vitest";
import { evaluate } from "../src/rules.js";

describe("evaluate push", () => {
  it("denies push while checks remain", () => {
    const d = evaluate({ phase: "plan_approved", remainingChecks: 2, finalApproved: true }, { type: "push" });
    expect(d).toMatchObject({ allow: false, rule: "PUSH_REQUIRES_COMPLETE_PLAN" });
  });
  it("denies push when the plan state is unknown", () => {
    expect(evaluate({ phase: "plan_approved" }, { type: "push" })).toMatchObject({
      allow: false,
      rule: "PUSH_REQUIRES_COMPLETE_PLAN",
    });
  });
  it("denies push without the human's final approval", () => {
    const d = evaluate({ phase: "plan_approved", remainingChecks: 0 }, { type: "push" });
    expect(d).toMatchObject({ allow: false, rule: "PUSH_REQUIRES_FINAL_APPROVAL" });
  });
  it("allows push when the checklist is complete and approved", () => {
    expect(
      evaluate({ phase: "plan_approved", remainingChecks: 0, finalApproved: true }, { type: "push" }),
    ).toEqual({ allow: true });
  });
});

describe("evaluate stop", () => {
  it("denies stopping in green: the review stop must be presented first", () => {
    const d = evaluate({ phase: "green" }, { type: "stop" });
    expect(d).toMatchObject({ allow: false, rule: "STOP_REQUIRES_REVIEW" });
  });
  it.each(["spec_draft", "spec_approved", "plan_approved", "red", "review", "refactor"] as const)(
    "allows stopping in %s (the AI may be asking the human)",
    (phase) => {
      expect(evaluate({ phase }, { type: "stop" })).toEqual({ allow: true });
    },
  );
});
