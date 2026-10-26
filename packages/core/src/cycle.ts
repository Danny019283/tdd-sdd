export type CyclePhase =
  | "spec_draft"
  | "spec_approved"
  | "plan_approved"
  | "red"
  | "green"
  | "review"
  | "refactor";

export type CycleEvent =
  | "approve_spec"
  | "approve_plan"
  | "tests_red"
  | "start_refactor"
  | "verified_green"
  | "tests_green"
  | "request_review"
  | "approve_check"
  | "request_refactor"
  | "refactor_done";

const TRANSITIONS: Record<CyclePhase, Partial<Record<CycleEvent, CyclePhase>>> = {
  spec_draft: { approve_spec: "spec_approved" },
  spec_approved: { approve_plan: "plan_approved" },
  plan_approved: { tests_red: "red", start_refactor: "refactor", verified_green: "green" },
  red: { tests_green: "green" },
  green: { request_review: "review" },
  review: { approve_check: "plan_approved", request_refactor: "refactor" },
  refactor: { refactor_done: "review" },
};

export function transition(phase: CyclePhase, event: CycleEvent): CyclePhase {
  const next = TRANSITIONS[phase][event];
  if (next === undefined) {
    throw new Error(`transición inválida: ${event} no es posible desde ${phase}`);
  }
  return next;
}
