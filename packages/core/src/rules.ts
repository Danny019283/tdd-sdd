import type { CyclePhase } from "./cycle.js";

export interface RuleContext {
  phase: CyclePhase;
}

export type Action = { type: "edit"; file: string };

export type Decision =
  | { allow: true }
  | { allow: false; rule: string; reason: string };

const TEST_FILE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;

export function isTestFile(file: string): boolean {
  return TEST_FILE.test(file);
}

const PRODUCTION_EDIT_PHASES: ReadonlySet<CyclePhase> = new Set(["red", "refactor"]);

export function evaluate(context: RuleContext, action: Action): Decision {
  if (!isTestFile(action.file) && !PRODUCTION_EDIT_PHASES.has(context.phase)) {
    return {
      allow: false,
      rule: "PRODUCTION_REQUIRES_RED_TEST",
      reason: `No se puede editar ${action.file} en la fase ${context.phase}: primero debe existir un test en rojo del check actual.`,
    };
  }
  return { allow: true };
}
