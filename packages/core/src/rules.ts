import type { CyclePhase } from "./cycle.js";

export interface RuleContext {
  phase: CyclePhase;
  /** Archivos declarados por el check actual; si no hay check activo, no se define. */
  allowedFiles?: readonly string[];
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

const FROZEN_AFTER_GREEN: ReadonlySet<CyclePhase> = new Set(["green", "review"]);

function normalizePath(file: string): string {
  return file.replace(/^(\.\/)+/, "");
}

export function evaluate(context: RuleContext, action: Action): Decision {
  if (context.allowedFiles !== undefined) {
    const allowed = context.allowedFiles.map(normalizePath);
    if (!allowed.includes(normalizePath(action.file))) {
      return {
        allow: false,
        rule: "OUT_OF_SCOPE",
        reason: `${action.file} no forma parte del check actual. Archivos permitidos: ${allowed.join(", ")}. Si hace falta tocarlo, pide al humano que amplíe el plan.`,
      };
    }
  }
  if (isTestFile(action.file) && context.phase === "refactor") {
    return {
      allow: false,
      rule: "TESTS_FROZEN_IN_REFACTOR",
      reason: `No se puede editar ${action.file} durante el refactor: los tests son la red de seguridad y deben quedar intactos.`,
    };
  }
  if (isTestFile(action.file) && FROZEN_AFTER_GREEN.has(context.phase)) {
    return {
      allow: false,
      rule: "TESTS_FROZEN_AFTER_GREEN",
      reason: `No se puede editar ${action.file} en la fase ${context.phase}: el test ya pasó y modificarlo invalidaría la evidencia del check. Cambia de check o pide enmienda.`,
    };
  }
  if (!isTestFile(action.file) && !PRODUCTION_EDIT_PHASES.has(context.phase)) {
    return {
      allow: false,
      rule: "PRODUCTION_REQUIRES_RED_TEST",
      reason: `No se puede editar ${action.file} en la fase ${context.phase}: primero debe existir un test en rojo del check actual.`,
    };
  }
  return { allow: true };
}
