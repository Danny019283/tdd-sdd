import type { CyclePhase } from "./cycle.js";

export interface RuleContext {
  phase: CyclePhase;
  /** Archivos declarados por el check actual; si no hay check activo, no se define. */
  allowedFiles?: readonly string[];
  /** El humano aprobó un check y su commit aún no se ha hecho. */
  pendingCommit?: boolean;
  /** Checks sin completar en el plan; si no se conoce, no se permite el push. */
  remainingChecks?: number;
  /** El humano dio la aprobación final de la checklist completa. */
  finalApproved?: boolean;
}

export type Action =
  | { type: "edit"; file: string }
  | { type: "commit" }
  | { type: "push" }
  | { type: "stop" };

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
  if (action.type === "commit") return evaluateCommit(context);
  if (action.type === "push") return evaluatePush(context);
  if (action.type === "stop") return evaluateStop(context);
  return evaluateEdit(context, action);
}

function evaluatePush(context: RuleContext): Decision {
  if (context.remainingChecks !== 0) {
    return {
      allow: false,
      rule: "PUSH_REQUIRES_COMPLETE_PLAN",
      reason: "No se puede hacer push: la checklist del plan no está completa.",
    };
  }
  if (!context.finalApproved) {
    return {
      allow: false,
      rule: "PUSH_REQUIRES_FINAL_APPROVAL",
      reason: "No se puede hacer push: falta la aprobación final del humano.",
    };
  }
  return { allow: true };
}

function evaluateStop(context: RuleContext): Decision {
  if (context.phase === "green") {
    return {
      allow: false,
      rule: "STOP_REQUIRES_REVIEW",
      reason: "Los tests están en verde: presenta la parada de revisión (qué cambió y qué cubre) antes de terminar.",
    };
  }
  return { allow: true };
}

function evaluateCommit(context: RuleContext): Decision {
  if (context.pendingCommit) return { allow: true };
  return {
    allow: false,
    rule: "COMMIT_REQUIRES_APPROVAL",
    reason: "No se puede hacer commit: solo se commitea un check aprobado por el humano y aún no hay ninguna aprobación pendiente.",
  };
}

function evaluateHarnessFile(context: RuleContext, file: string): Decision | undefined {
  const path = normalizePath(file);
  if (!path.startsWith(".tdd-sdd/")) return undefined;
  const name = path.split("/").pop();
  if (path === ".tdd-sdd/state.json" || path === ".tdd-sdd/overrides.log") {
    return {
      allow: false,
      rule: "HARNESS_FILE_PROTECTED",
      reason: `${file} lo gestiona el harness; no se edita a mano.`,
    };
  }
  if (path === ".tdd-sdd/config.json" && context.phase !== "spec_draft") {
    return {
      allow: false,
      rule: "CONFIG_FROZEN",
      reason: `${file} define el comando de tests y queda congelado al aprobar la spec. Si es incorrecto, díselo al humano.`,
    };
  }
  if (name === "spec.md" && context.phase !== "spec_draft") {
    return {
      allow: false,
      rule: "SPEC_FROZEN",
      reason: `${file} está aprobada y no se modifica. Si cambia el requisito, el humano debe pedir una enmienda.`,
    };
  }
  if (name === "plan.md" && context.phase !== "spec_draft" && context.phase !== "spec_approved") {
    return {
      allow: false,
      rule: "PLAN_FROZEN",
      reason: `${file} está aprobado; solo el harness marca checks. No lo edites a mano.`,
    };
  }
  return { allow: true };
}

function evaluateEdit(context: RuleContext, action: { type: "edit"; file: string }): Decision {
  const harness = evaluateHarnessFile(context, action.file);
  if (harness) return harness;
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
