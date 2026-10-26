import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  amendFiles,
  buildContext,
  markCheckDone,
  parsePlan,
  transition,
  validateSpec,
  type CycleEvent,
  type ProjectState,
  type RoleCommand,
} from "@tdd-sdd/core";
import { PLAN_TEMPLATE, SPEC_TEMPLATE } from "./templates.js";
import {
  appendLog,
  loadConfig,
  loadState,
  logOverride,
  planPath,
  readOptional,
  saveState,
  specPath,
  statePath,
  writeText,
  HARNESS_DIR,
} from "./store.js";

export interface Result {
  ok: boolean;
  message: string;
}

const ok = (message: string): Result => ({ ok: true, message });
const fail = (message: string): Result => ({ ok: false, message });

function step(root: string, state: ProjectState, event: CycleEvent): ProjectState {
  const next = { ...state, phase: transition(state.phase, event) };
  saveState(root, next);
  return next;
}

export function initUseCase(root: string, id: string): Result {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    return fail("El id del caso de uso debe ser kebab-case (ej. iniciar-sesion).");
  }
  const existing = loadState(root);
  if (existing) {
    const plan = readOptional(planPath(root, existing.useCase));
    const unfinished = !plan || parsePlan(plan).some((c) => !c.done) || !existing.finalApproved;
    if (unfinished) {
      return fail(`Ya hay un caso de uso activo e incompleto: ${existing.useCase}. Termínalo antes de empezar otro.`);
    }
  }
  if (existsSync(specPath(root, id))) return fail(`El caso de uso ${id} ya existe.`);
  writeText(specPath(root, id), SPEC_TEMPLATE.replaceAll("{{id}}", id));
  writeText(planPath(root, id), PLAN_TEMPLATE.replaceAll("{{id}}", id));
  saveState(root, {
    useCase: id,
    phase: "spec_draft",
    pendingCommit: false,
    finalApproved: false,
    overrides: [],
  });
  return ok(`Caso de uso ${id} creado. Rellena .tdd-sdd/use-cases/${id}/spec.md con el humano.`);
}

function requireState(root: string): ProjectState | Result {
  const state = loadState(root);
  return state ?? fail(`El harness no está iniciado (falta ${statePath(root)}). Usa /start-dev.`);
}

const isResult = (value: ProjectState | Result): value is Result => "message" in value;

export function humanCommand(root: string, name: string, arg: string): Result {
  const state = requireState(root);
  if (isResult(state)) return state;
  if (name === "override") return override(root, state, arg);
  if (name === "refactor") return requestRefactor(root, state);
  if (name !== "approve") return fail(`Comando desconocido: ${name}`);
  switch (arg) {
    case "spec":
      return approveSpec(root, state);
    case "plan":
      return approvePlan(root, state);
    case "check":
      return approveCheck(root, state);
    case "final":
      return approveFinal(root, state);
    default:
      return fail("Uso: /approve spec | plan | check | final");
  }
}

function approveSpec(root: string, state: ProjectState): Result {
  if (state.phase !== "spec_draft") return fail(`La spec ya fue aprobada (fase ${state.phase}).`);
  const spec = readOptional(specPath(root, state.useCase)) ?? "";
  const validation = validateSpec(spec);
  if (!validation.ok) {
    const list = validation.errors.map((e) => `- ${e.section}: ${e.code}${e.line ? ` ("${e.line}")` : ""}`).join("\n");
    return fail(`La spec no se puede aprobar todavía:\n${list}`);
  }
  step(root, state, "approve_spec");
  return ok("Spec aprobada. Ahora redacta plan.md con checks pequeños y verificables.");
}

function approvePlan(root: string, state: ProjectState): Result {
  if (state.phase !== "spec_approved") return fail(`No se puede aprobar el plan en la fase ${state.phase}.`);
  const checks = parsePlan(readOptional(planPath(root, state.useCase)) ?? "");
  if (checks.length === 0) return fail("El plan no tiene ningún check.");
  const incomplete = checks.filter((c) => c.covers.length === 0 || c.files.length === 0);
  if (incomplete.length > 0) {
    return fail(`Cada check debe declarar 'cubre' y 'archivos'. Incompletos: ${incomplete.map((c) => c.id).join(", ")}.`);
  }
  step(root, state, "approve_plan");
  const config = readOptional(join(root, HARNESS_DIR, "config.json"));
  let testCommand = "NO DEFINIDO";
  try {
    testCommand = (JSON.parse(config ?? "{}") as { testCommand?: string }).testCommand ?? testCommand;
  } catch {
    // config ilegible: se muestra como no definido
  }
  return ok(
    `Plan aprobado (${checks.length} checks). Comando de tests: ${testCommand}. Empieza por escribir el test en rojo del check 1.`,
  );
}

function approveCheck(root: string, state: ProjectState): Result {
  if (state.phase !== "review") return fail(`No hay un check en revisión (fase ${state.phase}).`);
  const file = planPath(root, state.useCase);
  const plan = readOptional(file) ?? "";
  const current = parsePlan(plan).find((c) => !c.done);
  if (!current) return fail("No quedan checks pendientes.");
  writeText(file, markCheckDone(plan, current.id));
  const next = step(root, state, "approve_check");
  saveState(root, { ...next, pendingCommit: true });
  return ok(`Check ${current.id} aprobado y marcado. Haz el commit de este check ahora.`);
}

function approveFinal(root: string, state: ProjectState): Result {
  const context = buildContext(state, readOptional(planPath(root, state.useCase)), loadConfig(root));
  if (context.remainingChecks !== 0) {
    return fail(`Aún quedan ${context.remainingChecks ?? "?"} checks sin completar.`);
  }
  saveState(root, { ...state, finalApproved: true });
  return ok("Aprobación final registrada. Ya se puede hacer push.");
}

function requestRefactor(root: string, state: ProjectState): Result {
  if (state.phase !== "review") return fail(`El refactor solo se habilita desde la revisión (fase ${state.phase}).`);
  step(root, state, "request_refactor");
  return ok("Refactor habilitado: los tests quedan congelados y deben seguir en verde.");
}

function override(root: string, state: ProjectState, rule: string): Result {
  if (!rule) return fail("Uso: /override <REGLA>");
  logOverride(root, rule);
  saveState(root, { ...state, overrides: [...new Set([...state.overrides, rule])] });
  return ok(`Override registrado para ${rule}.`);
}

function currentCheck(root: string, state: ProjectState) {
  const plan = readOptional(planPath(root, state.useCase));
  return plan ? parsePlan(plan).find((c) => !c.done) : undefined;
}

/** Registra el resultado de ejecutar el comando de tests y avanza el ciclo si corresponde. */
export function recordTestRun(root: string, exitCode: number): Result {
  const state = requireState(root);
  if (isResult(state)) return state;
  const passed = exitCode === 0;
  switch (state.phase) {
    case "plan_approved": {
      const kind = currentCheck(root, state)?.kind ?? "behavior";
      if (kind === "refactor") {
        if (!passed) return fail("El refactor parte de tests en verde: arréglalos antes de refactorizar.");
        step(root, state, "start_refactor");
        return ok("REFACTOR habilitado: los tests actuales son la red y quedan congelados. Refactoriza sin cambiar comportamiento y termina con tdd-sdd refactor-done.");
      }
      if (passed && kind === "verify") {
        step(root, state, "verified_green");
        return ok("VERDE: las pruebas de verificación pasan sin código nuevo. Ejecuta tdd-sdd review.");
      }
      if (passed) return fail("Los tests pasan sin implementación: el test nuevo no está demostrando nada. Escribe un test que falle.");
      step(root, state, "tests_red");
      return ok("ROJO registrado. Confirma que falla por comportamiento ausente y no por un error de configuración o de ejecución; luego implementa lo mínimo.");
    }
    case "red":
      if (!passed) return ok("Sigue en rojo.");
      step(root, state, "tests_green");
      return ok("VERDE. Ejecuta tdd-sdd review.");
    case "green":
      return passed ? ok("Sigue en verde.") : fail("Regresión: los tests dejaron de pasar tras llegar a verde.");
    default:
      return ok(`Tests ejecutados (fase ${state.phase}): ${passed ? "pasan" : "fallan"}.`);
  }
}

export function requestReview(root: string): Result {
  const state = requireState(root);
  if (isResult(state)) return state;
  if (state.phase !== "green") return fail(`La revisión se pide en verde (fase ${state.phase}).`);
  step(root, state, "request_review");
  return ok("En revisión. Devuelve al orquestador qué cambió y qué elementos de la spec cubre; NO esperes al humano: el orquestador lanza ahora el agente revisor (tdd-sdd:revisor), que corre los tests y aprueba con tdd-sdd approve-check.");
}

export function finishRefactor(root: string, exitCode: number): Result {
  const state = requireState(root);
  if (isResult(state)) return state;
  if (state.phase !== "refactor") return fail(`No hay refactor en curso (fase ${state.phase}).`);
  if (exitCode !== 0) return fail("El refactor rompió los tests: corrígelo antes de terminar.");
  step(root, state, "refactor_done");
  return ok("Refactor terminado con tests en verde. Vuelve a la revisión.");
}

export function status(root: string): string {
  const state = loadState(root);
  if (!state) return "tdd-sdd no está iniciado en este proyecto.";
  const plan = readOptional(planPath(root, state.useCase));
  const checks = plan ? parsePlan(plan) : [];
  const lines = [
    `Caso de uso: ${state.useCase}`,
    `Fase: ${state.phase}`,
    `Commit pendiente: ${state.pendingCommit ? "sí" : "no"}`,
    `Aprobación final: ${state.finalApproved ? "sí" : "no"}`,
    `Overrides: ${state.overrides.length ? state.overrides.join(", ") : "ninguno"}`,
    "",
    ...checks.map((c) => `[${c.done ? "x" : " "}] ${c.id}. ${c.title}  (cubre: ${c.covers.join(", ")})`),
  ];
  return lines.join("\n");
}

const GRANT_TTL_MS = 60_000;

/** Consume el permiso de un solo uso que dejó el hook; sin él el comando no corresponde a ese rol. */
function takeGrant(root: string, state: ProjectState, action: RoleCommand): { state: ProjectState; agent: string } | Result {
  const grant = state.grant;
  const age = grant ? Date.now() - Date.parse(grant.at) : Infinity;
  const { grant: _spent, ...rest } = state;
  if (grant) saveState(root, rest);
  if (!grant || grant.action !== action || !(age >= 0 && age <= GRANT_TTL_MS)) {
    return fail("Este comando solo se acepta cuando lo lanza el agente que corresponde a través del hook (no hay permiso vigente).");
  }
  return { state: rest, agent: grant.agent };
}

/** El revisor corre los tests y solo si pasan aprueba el check en curso. */
export function approveCheckAsReviewer(root: string, runTests: () => number): Result {
  const state = requireState(root);
  if (isResult(state)) return state;
  const taken = takeGrant(root, state, "approve_check");
  if ("message" in taken) return taken;
  if (state.phase !== "review") return fail(`No hay un check en revisión (fase ${state.phase}).`);
  const current = currentCheck(root, taken.state);
  if (!current) return fail("No quedan checks pendientes.");
  const exitCode = runTests();
  appendLog(root, "approvals.log", `check ${current.id} ${taken.agent} tests=${exitCode === 0 ? "pass" : "fail"}`);
  if (exitCode !== 0) {
    return fail(`Check ${current.id} NO aprobado: los tests fallan. Vuelve al desarrollador; esto se le muestra al humano.`);
  }
  return approveCheck(root, taken.state);
}

/** El solucionador ajusta los archivos del check en curso; nada más del plan se toca. */
export function amendCheckFiles(root: string, id: number, change: { add: string[]; remove: string[] }): Result {
  const state = requireState(root);
  if (isResult(state)) return state;
  const taken = takeGrant(root, state, "amend_files");
  if ("message" in taken) return taken;
  if (!["plan_approved", "red", "green", "review", "refactor"].includes(state.phase)) {
    return fail(`El plan aún no está aprobado (fase ${state.phase}).`);
  }
  const current = currentCheck(root, taken.state);
  if (!current || current.id !== id) {
    return fail(`Solo se pueden ajustar los archivos del check en curso (${current?.id ?? "ninguno"}), no el ${id}.`);
  }
  const file = planPath(root, state.useCase);
  try {
    writeText(file, amendFiles(readOptional(file) ?? "", id, change));
  } catch (error) {
    return fail((error as Error).message);
  }
  const summary = [...change.add.map((f) => `+${f}`), ...change.remove.map((f) => `-${f}`)].join(" ");
  appendLog(root, "amendments.log", `check ${id} ${taken.agent} ${summary}`);
  return ok(`Archivos del check ${id} actualizados (${summary}). Si hay que añadir o quitar checks, cambiar lo que cubren o la spec, pregunta al humano.`);
}
