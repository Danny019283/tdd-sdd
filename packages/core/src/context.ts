import type { CyclePhase } from "./cycle.js";
import { parsePlan } from "./plan.js";
import type { RoleCommand, RuleContext } from "./rules.js";

export interface ProjectState {
  useCase: string;
  phase: CyclePhase;
  pendingCommit: boolean;
  finalApproved: boolean;
  /** Reglas que el humano decidió saltarse explícitamente. */
  overrides: string[];
  /** Permiso de un solo uso que el hook deja al aceptar un comando de rol; el CLI lo consume. */
  grant?: { action: RoleCommand; agent: string; at: string };
}

const SCOPED_PHASES: ReadonlySet<CyclePhase> = new Set([
  "plan_approved",
  "red",
  "green",
  "review",
  "refactor",
]);

export interface ProjectConfig {
  testCommand?: string;
  /** Globs extra que se pueden editar siempre (además de docs y notas). */
  alwaysAllowed?: string[];
}

export function buildContext(state: ProjectState, planMarkdown?: string, config: ProjectConfig = {}): RuleContext {
  const context: RuleContext = {
    phase: state.phase,
    pendingCommit: state.pendingCommit,
    finalApproved: state.finalApproved,
  };
  const extra = config.alwaysAllowed;
  if (Array.isArray(extra) && extra.every((glob) => typeof glob === "string")) context.extraAllowedPaths = extra;
  if (planMarkdown === undefined) return context;
  const checks = parsePlan(planMarkdown);
  const pending = checks.filter((check) => !check.done);
  context.remainingChecks = pending.length;
  const current = pending[0];
  if (current && SCOPED_PHASES.has(state.phase)) context.allowedFiles = current.files;
  return context;
}
