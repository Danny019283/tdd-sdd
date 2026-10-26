import { describe, expect, it } from "vitest";
import { transition, type CycleEvent, type CyclePhase } from "../src/cycle.js";

function run(start: CyclePhase, events: CycleEvent[]): CyclePhase {
  return events.reduce<CyclePhase>((phase, event) => transition(phase, event), start);
}

describe("transition", () => {
  it("walks the happy path from draft spec to an approved check", () => {
    expect(
      run("spec_draft", [
        "approve_spec",
        "approve_plan",
        "tests_red",
        "tests_green",
        "request_review",
        "approve_check",
      ]),
    ).toBe("plan_approved");
  });

  it("only enters refactor when the human requests it from review", () => {
    expect(run("review", ["request_refactor"])).toBe("refactor");
    expect(run("refactor", ["refactor_done"])).toBe("review");
  });

  it.each<[CyclePhase, CycleEvent]>([
    ["spec_draft", "tests_red"],
    ["spec_draft", "approve_plan"],
    ["spec_approved", "tests_red"],
    ["plan_approved", "tests_green"],
    ["red", "request_review"],
    ["green", "approve_check"],
    ["green", "request_refactor"],
  ])("rejects %s + %s", (phase, event) => {
    expect(() => transition(phase, event)).toThrow(/transición inválida/);
  });

  it("lets a refactor check start from the approved plan with the tests as safety net", () => {
    expect(run("plan_approved", ["start_refactor"])).toBe("refactor");
    expect(run("plan_approved", ["start_refactor", "refactor_done", "approve_check"])).toBe("plan_approved");
  });

  it("lets a verification check go straight to green", () => {
    expect(run("plan_approved", ["verified_green", "request_review", "approve_check"])).toBe("plan_approved");
  });

  it.each<[CyclePhase, CycleEvent]>([
    ["red", "start_refactor"],
    ["green", "verified_green"],
    ["review", "start_refactor"],
  ])("rejects %s + %s", (phase, event) => {
    expect(() => transition(phase, event)).toThrow(/transición inválida/);
  });
});
