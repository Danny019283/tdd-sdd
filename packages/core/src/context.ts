import type { CyclePhase } from "./cycle.js";
import { parsePlan } from "./plan.js";
import type { RuleContext } from "./rules.js";

export interface ProjectState {
  useCase: string;
  phase: CyclePhase;
  pendingCommit: boolean;
  finalApproved: boolean;
  /** Reglas que el humano decidió saltarse explícitamente. */
  overrides: string[];
}

const SCOPED_PHASES: ReadonlySet<CyclePhase> = new Set([
  "plan_approved",
  "red",
  "green",
  "review",
  "refactor",
]);

export function buildContext(state: ProjectState, planMarkdown?: string): RuleContext {
  const context: RuleContext = {
    phase: state.phase,
    pendingCommit: state.pendingCommit,
    finalApproved: state.finalApproved,
  };
  if (planMarkdown === undefined) return context;
  const checks = parsePlan(planMarkdown);
  const pending = checks.filter((check) => !check.done);
  context.remainingChecks = pending.length;
  const current = pending[0];
  if (current && SCOPED_PHASES.has(state.phase)) context.allowedFiles = current.files;
  return context;
}
