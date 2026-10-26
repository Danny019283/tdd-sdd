#!/usr/bin/env node

// src/main.ts
import { readFileSync as readFileSync2 } from "node:fs";
import { spawnSync } from "node:child_process";
import { join as join3 } from "node:path";

// src/commands.ts
import { existsSync as existsSync2 } from "node:fs";
import { join as join2 } from "node:path";

// ../core/src/spec.ts
var SPEC_SECTIONS = [
  "Identificaci\xF3n",
  "Alcance",
  "Precondiciones",
  "Disparador",
  "Flujo principal",
  "Flujos alternativos y de excepci\xF3n",
  "Postcondiciones",
  "Reglas de negocio",
  "Requisitos no funcionales"
];
var PLACEHOLDERS = /* @__PURE__ */ new Set(["tbd", "todo", "pendiente", "por definir", "n/a"]);
function parseSections(markdown) {
  const sections = /* @__PURE__ */ new Map();
  const heading = /^##\s+\d+\.\s+(.+?)\s*$/gm;
  const matches = [...markdown.matchAll(heading)];
  matches.forEach((match, i) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[i + 1]?.index ?? markdown.length;
    const body = markdown.slice(start, end).replace(/<!--[\s\S]*?-->/g, "").trim();
    sections.set(match[1], body);
  });
  return sections;
}
function countListItems(body) {
  return body.split("\n").filter((line) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(line)).length;
}
function validateSpec(markdown) {
  const sections = parseSections(markdown);
  const errors = [];
  for (const title of SPEC_SECTIONS) {
    const body = sections.get(title);
    if (body === void 0) errors.push({ section: title, code: "MISSING_SECTION" });
    else if (body === "") errors.push({ section: title, code: "EMPTY_SECTION" });
    else if (PLACEHOLDERS.has(body.toLowerCase().replace(/[.\s]+$/, "")))
      errors.push({ section: title, code: "PLACEHOLDER" });
  }
  const trigger = sections.get("Disparador");
  if (trigger && errors.every((e) => e.section !== "Disparador") && countListItems(trigger) > 1)
    errors.push({ section: "Disparador", code: "MULTIPLE_TRIGGERS" });
  return { ok: errors.length === 0, errors };
}

// ../core/src/plan.ts
var CHECK_LINE = /^- \[( |x)\]\s+(\d+)\.\s+(.+?)\s*$/;
var FIELD_LINE = /^\s+-\s+(cubre|archivos):\s*(.*?)\s*$/;
function splitList(value) {
  return value.split(",").map((item) => item.trim()).filter((item) => item !== "");
}
function parsePlan(markdown) {
  const checks = [];
  let current;
  for (const line of markdown.split("\n")) {
    const check = CHECK_LINE.exec(line);
    if (check) {
      current = {
        id: Number(check[2]),
        title: check[3],
        done: check[1] === "x",
        covers: [],
        files: []
      };
      checks.push(current);
      continue;
    }
    const field = FIELD_LINE.exec(line);
    if (field && current) {
      if (field[1] === "cubre") current.covers = splitList(field[2]);
      else current.files = splitList(field[2]);
    }
  }
  return checks;
}
function markCheckDone(markdown, id) {
  const lines = markdown.split("\n");
  const index = lines.findIndex((line2) => CHECK_LINE.exec(line2)?.[2] === String(id));
  if (index === -1) throw new Error(`No existe el check ${id} en el plan`);
  const line = lines[index];
  if (CHECK_LINE.exec(line)[1] === "x") throw new Error(`El check ${id} ya est\xE1 completado`);
  lines[index] = line.replace("- [ ]", "- [x]");
  return lines.join("\n");
}

// ../core/src/cycle.ts
var TRANSITIONS = {
  spec_draft: { approve_spec: "spec_approved" },
  spec_approved: { approve_plan: "plan_approved" },
  plan_approved: { tests_red: "red" },
  red: { tests_green: "green" },
  green: { request_review: "review" },
  review: { approve_check: "plan_approved", request_refactor: "refactor" },
  refactor: { refactor_done: "review" }
};
function transition(phase, event) {
  const next = TRANSITIONS[phase][event];
  if (next === void 0) {
    throw new Error(`transici\xF3n inv\xE1lida: ${event} no es posible desde ${phase}`);
  }
  return next;
}

// ../core/src/glob.ts
var cache = /* @__PURE__ */ new Map();
function toRegExp(pattern) {
  let regex = cache.get(pattern);
  if (regex) return regex;
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*" && pattern[i + 1] === "*") {
      const slash = pattern[i + 2] === "/";
      source += slash ? "(?:.*/)?" : ".*";
      i += slash ? 2 : 1;
    } else if (c === "*") source += "[^/]*";
    else if (c === "?") source += "[^/]";
    else source += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  regex = new RegExp(`^${source}$`);
  cache.set(pattern, regex);
  return regex;
}
function matchesGlob(path, pattern) {
  return toRegExp(pattern).test(path);
}

// ../core/src/rules.ts
var TEST_FILE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
function isTestFile(file) {
  return TEST_FILE.test(file);
}
var DEFAULT_ALWAYS_ALLOWED = ["**/*.md", "**/*.txt", "docs/**"];
function isAlwaysAllowed(context, file) {
  const path = normalizePath(file);
  return [...DEFAULT_ALWAYS_ALLOWED, ...context.extraAllowedPaths ?? []].some((glob) => matchesGlob(path, glob));
}
var PRODUCTION_EDIT_PHASES = /* @__PURE__ */ new Set(["red", "refactor"]);
var FROZEN_AFTER_GREEN = /* @__PURE__ */ new Set(["green", "review"]);
function normalizePath(file) {
  return file.replace(/^(\.\/)+/, "");
}
function evaluate(context, action) {
  if (action.type === "commit") return evaluateCommit(context);
  if (action.type === "push") return evaluatePush(context);
  if (action.type === "stop") return evaluateStop(context);
  return evaluateEdit(context, action);
}
function evaluatePush(context) {
  if (context.remainingChecks !== 0) {
    return {
      allow: false,
      rule: "PUSH_REQUIRES_COMPLETE_PLAN",
      reason: "No se puede hacer push: la checklist del plan no est\xE1 completa."
    };
  }
  if (!context.finalApproved) {
    return {
      allow: false,
      rule: "PUSH_REQUIRES_FINAL_APPROVAL",
      reason: "No se puede hacer push: falta la aprobaci\xF3n final del humano."
    };
  }
  return { allow: true };
}
function evaluateStop(context) {
  if (context.phase === "green") {
    return {
      allow: false,
      rule: "STOP_REQUIRES_REVIEW",
      reason: "Los tests est\xE1n en verde: presenta la parada de revisi\xF3n (qu\xE9 cambi\xF3 y qu\xE9 cubre) antes de terminar."
    };
  }
  return { allow: true };
}
function evaluateCommit(context) {
  if (context.pendingCommit) return { allow: true };
  return {
    allow: false,
    rule: "COMMIT_REQUIRES_APPROVAL",
    reason: "No se puede hacer commit: solo se commitea un check aprobado por el humano y a\xFAn no hay ninguna aprobaci\xF3n pendiente."
  };
}
function evaluateHarnessFile(context, file) {
  const path = normalizePath(file);
  if (!path.startsWith(".tdd-sdd/")) return void 0;
  const name = path.split("/").pop();
  if (path === ".tdd-sdd/state.json" || path === ".tdd-sdd/overrides.log") {
    return {
      allow: false,
      rule: "HARNESS_FILE_PROTECTED",
      reason: `${file} lo gestiona el harness; no se edita a mano.`
    };
  }
  if (path === ".tdd-sdd/config.json" && context.phase !== "spec_draft") {
    return {
      allow: false,
      rule: "CONFIG_FROZEN",
      reason: `${file} define el comando de tests y queda congelado al aprobar la spec. Si es incorrecto, d\xEDselo al humano.`
    };
  }
  if (name === "spec.md" && context.phase !== "spec_draft") {
    return {
      allow: false,
      rule: "SPEC_FROZEN",
      reason: `${file} est\xE1 aprobada y no se modifica. Si cambia el requisito, el humano debe pedir una enmienda.`
    };
  }
  if (name === "plan.md" && context.phase !== "spec_draft" && context.phase !== "spec_approved") {
    return {
      allow: false,
      rule: "PLAN_FROZEN",
      reason: `${file} est\xE1 aprobado; solo el harness marca checks. No lo edites a mano.`
    };
  }
  return { allow: true };
}
function evaluateEdit(context, action) {
  const harness = evaluateHarnessFile(context, action.file);
  if (harness) return harness;
  if (isAlwaysAllowed(context, action.file)) return { allow: true };
  if (context.allowedFiles !== void 0) {
    const allowed = context.allowedFiles.map(normalizePath);
    if (!allowed.includes(normalizePath(action.file))) {
      return {
        allow: false,
        rule: "OUT_OF_SCOPE",
        reason: `${action.file} no forma parte del check actual. Archivos permitidos: ${allowed.join(", ")}. Si hace falta tocarlo, pide al humano que ampl\xEDe el plan.`
      };
    }
  }
  if (isTestFile(action.file) && context.phase === "refactor") {
    return {
      allow: false,
      rule: "TESTS_FROZEN_IN_REFACTOR",
      reason: `No se puede editar ${action.file} durante el refactor: los tests son la red de seguridad y deben quedar intactos.`
    };
  }
  if (isTestFile(action.file) && FROZEN_AFTER_GREEN.has(context.phase)) {
    return {
      allow: false,
      rule: "TESTS_FROZEN_AFTER_GREEN",
      reason: `No se puede editar ${action.file} en la fase ${context.phase}: el test ya pas\xF3 y modificarlo invalidar\xEDa la evidencia del check. Cambia de check o pide enmienda.`
    };
  }
  if (!isTestFile(action.file) && !PRODUCTION_EDIT_PHASES.has(context.phase)) {
    return {
      allow: false,
      rule: "PRODUCTION_REQUIRES_RED_TEST",
      reason: `No se puede editar ${action.file} en la fase ${context.phase}: primero debe existir un test en rojo del check actual.`
    };
  }
  return { allow: true };
}

// ../core/src/context.ts
var SCOPED_PHASES = /* @__PURE__ */ new Set([
  "plan_approved",
  "red",
  "green",
  "review",
  "refactor"
]);
function buildContext(state, planMarkdown, config = {}) {
  const context = {
    phase: state.phase,
    pendingCommit: state.pendingCommit,
    finalApproved: state.finalApproved
  };
  const extra = config.alwaysAllowed;
  if (Array.isArray(extra) && extra.every((glob) => typeof glob === "string")) context.extraAllowedPaths = extra;
  if (planMarkdown === void 0) return context;
  const checks = parsePlan(planMarkdown);
  const pending = checks.filter((check) => !check.done);
  context.remainingChecks = pending.length;
  const current = pending[0];
  if (current && SCOPED_PHASES.has(state.phase)) context.allowedFiles = current.files;
  return context;
}

// src/templates.ts
var SPEC_TEMPLATE = `# Caso de uso: {{id}}

<!-- Plantilla de caso de uso. Rellena cada secci\xF3n con el humano; sustituye "pendiente". -->

## 1. Identificaci\xF3n
pendiente
<!-- Nombre (verbo + objeto, ej. "Iniciar sesi\xF3n"), objetivo, actor principal y secundarios -->

## 2. Alcance
pendiente
<!-- Incluye / No incluye / Supuestos -->

## 3. Precondiciones
pendiente
<!-- Del actor, de datos, del sistema. Si el sistema debe comprobarla y devolver error, es un flujo de excepci\xF3n -->

## 4. Disparador
pendiente
<!-- UN solo evento que inicia el caso de uso: qui\xE9n lo origina y qu\xE9 lo activa -->

## 5. Flujo principal
pendiente
<!-- Pasos numerados FP-1, FP-2... alternando actor y sistema -->

## 6. Flujos alternativos y de excepci\xF3n
pendiente
<!-- Variaciones y errores referenciando el paso, ej. FA-3a -->

## 7. Postcondiciones
pendiente
<!-- Estado del sistema en \xE9xito y en fallo -->

## 8. Reglas de negocio
pendiente
<!-- RN-1, RN-2... validaciones y restricciones -->

## 9. Requisitos no funcionales
pendiente
<!-- Seguridad, rendimiento, auditor\xEDa -->
`;
var PLAN_TEMPLATE = `# Plan: {{id}}

<!-- Un check por comportamiento verificable. Cada check declara qu\xE9 elementos de la spec cubre
     y los \xFAnicos archivos que puede tocar. Los tests apuntan a la entrada/salida del caso de uso. -->

- [ ] 1. T\xEDtulo del primer check
  - cubre: FP-1
  - archivos: src/ejemplo.ts, tests/ejemplo.test.ts
`;

// src/store.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
var HARNESS_DIR = ".tdd-sdd";
var statePath = (root2) => join(root2, HARNESS_DIR, "state.json");
var useCaseDir = (root2, id) => join(root2, HARNESS_DIR, "use-cases", id);
var specPath = (root2, id) => join(useCaseDir(root2, id), "spec.md");
var planPath = (root2, id) => join(useCaseDir(root2, id), "plan.md");
var overridesLogPath = (root2) => join(root2, HARNESS_DIR, "overrides.log");
function loadState(root2) {
  const file = statePath(root2);
  if (!existsSync(file)) return void 0;
  return JSON.parse(readFileSync(file, "utf8"));
}
function saveState(root2, state) {
  const file = statePath(root2);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
}
function loadConfig(root2) {
  const raw = readOptional(join(root2, HARNESS_DIR, "config.json"));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function readOptional(file) {
  return existsSync(file) ? readFileSync(file, "utf8") : void 0;
}
function writeText(file, content) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}
function logOverride(root2, rule) {
  const file = overridesLogPath(root2);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${(/* @__PURE__ */ new Date()).toISOString()} override ${rule}
`);
}
function findRoot(start) {
  let dir = resolve(start);
  for (; ; ) {
    if (existsSync(statePath(dir))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return void 0;
    dir = parent;
  }
}

// src/commands.ts
var ok = (message) => ({ ok: true, message });
var fail = (message) => ({ ok: false, message });
function step(root2, state, event) {
  const next = { ...state, phase: transition(state.phase, event) };
  saveState(root2, next);
  return next;
}
function initUseCase(root2, id) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) {
    return fail("El id del caso de uso debe ser kebab-case (ej. iniciar-sesion).");
  }
  const existing = loadState(root2);
  if (existing) {
    const plan = readOptional(planPath(root2, existing.useCase));
    const unfinished = !plan || parsePlan(plan).some((c) => !c.done) || !existing.finalApproved;
    if (unfinished) {
      return fail(`Ya hay un caso de uso activo e incompleto: ${existing.useCase}. Term\xEDnalo antes de empezar otro.`);
    }
  }
  if (existsSync2(specPath(root2, id))) return fail(`El caso de uso ${id} ya existe.`);
  writeText(specPath(root2, id), SPEC_TEMPLATE.replaceAll("{{id}}", id));
  writeText(planPath(root2, id), PLAN_TEMPLATE.replaceAll("{{id}}", id));
  saveState(root2, {
    useCase: id,
    phase: "spec_draft",
    pendingCommit: false,
    finalApproved: false,
    overrides: []
  });
  return ok(`Caso de uso ${id} creado. Rellena .tdd-sdd/use-cases/${id}/spec.md con el humano.`);
}
function requireState(root2) {
  const state = loadState(root2);
  return state ?? fail(`El harness no est\xE1 iniciado (falta ${statePath(root2)}). Usa /start-dev.`);
}
var isResult = (value) => "message" in value;
function humanCommand(root2, name, arg) {
  const state = requireState(root2);
  if (isResult(state)) return state;
  if (name === "override") return override(root2, state, arg);
  if (name === "refactor") return requestRefactor(root2, state);
  if (name !== "approve") return fail(`Comando desconocido: ${name}`);
  switch (arg) {
    case "spec":
      return approveSpec(root2, state);
    case "plan":
      return approvePlan(root2, state);
    case "check":
      return approveCheck(root2, state);
    case "final":
      return approveFinal(root2, state);
    default:
      return fail("Uso: /approve spec | plan | check | final");
  }
}
function approveSpec(root2, state) {
  if (state.phase !== "spec_draft") return fail(`La spec ya fue aprobada (fase ${state.phase}).`);
  const spec = readOptional(specPath(root2, state.useCase)) ?? "";
  const validation = validateSpec(spec);
  if (!validation.ok) {
    const list = validation.errors.map((e) => `- ${e.section}: ${e.code}`).join("\n");
    return fail(`La spec no se puede aprobar todav\xEDa:
${list}`);
  }
  step(root2, state, "approve_spec");
  return ok("Spec aprobada. Ahora redacta plan.md con checks peque\xF1os y verificables.");
}
function approvePlan(root2, state) {
  if (state.phase !== "spec_approved") return fail(`No se puede aprobar el plan en la fase ${state.phase}.`);
  const checks = parsePlan(readOptional(planPath(root2, state.useCase)) ?? "");
  if (checks.length === 0) return fail("El plan no tiene ning\xFAn check.");
  const incomplete = checks.filter((c) => c.covers.length === 0 || c.files.length === 0);
  if (incomplete.length > 0) {
    return fail(`Cada check debe declarar 'cubre' y 'archivos'. Incompletos: ${incomplete.map((c) => c.id).join(", ")}.`);
  }
  step(root2, state, "approve_plan");
  const config = readOptional(join2(root2, HARNESS_DIR, "config.json"));
  let testCommand2 = "NO DEFINIDO";
  try {
    testCommand2 = JSON.parse(config ?? "{}").testCommand ?? testCommand2;
  } catch {
  }
  return ok(
    `Plan aprobado (${checks.length} checks). Comando de tests: ${testCommand2}. Empieza por escribir el test en rojo del check 1.`
  );
}
function approveCheck(root2, state) {
  if (state.phase !== "review") return fail(`No hay un check en revisi\xF3n (fase ${state.phase}).`);
  const file = planPath(root2, state.useCase);
  const plan = readOptional(file) ?? "";
  const current = parsePlan(plan).find((c) => !c.done);
  if (!current) return fail("No quedan checks pendientes.");
  writeText(file, markCheckDone(plan, current.id));
  const next = step(root2, state, "approve_check");
  saveState(root2, { ...next, pendingCommit: true });
  return ok(`Check ${current.id} aprobado y marcado. Haz el commit de este check ahora.`);
}
function approveFinal(root2, state) {
  const context = buildContext(state, readOptional(planPath(root2, state.useCase)));
  if (context.remainingChecks !== 0) {
    return fail(`A\xFAn quedan ${context.remainingChecks ?? "?"} checks sin completar.`);
  }
  saveState(root2, { ...state, finalApproved: true });
  return ok("Aprobaci\xF3n final registrada. Ya se puede hacer push.");
}
function requestRefactor(root2, state) {
  if (state.phase !== "review") return fail(`El refactor solo se habilita desde la revisi\xF3n (fase ${state.phase}).`);
  step(root2, state, "request_refactor");
  return ok("Refactor habilitado: los tests quedan congelados y deben seguir en verde.");
}
function override(root2, state, rule) {
  if (!rule) return fail("Uso: /override <REGLA>");
  logOverride(root2, rule);
  saveState(root2, { ...state, overrides: [.../* @__PURE__ */ new Set([...state.overrides, rule])] });
  return ok(`Override registrado para ${rule}.`);
}
function recordTestRun(root2, exitCode) {
  const state = requireState(root2);
  if (isResult(state)) return state;
  const passed = exitCode === 0;
  switch (state.phase) {
    case "plan_approved":
      if (passed) return fail("Los tests pasan sin implementaci\xF3n: el test nuevo no est\xE1 demostrando nada. Escribe un test que falle.");
      step(root2, state, "tests_red");
      return ok("ROJO registrado. Confirma que falla por comportamiento ausente y no por un error de configuraci\xF3n o de ejecuci\xF3n; luego implementa lo m\xEDnimo.");
    case "red":
      if (!passed) return ok("Sigue en rojo.");
      step(root2, state, "tests_green");
      return ok("VERDE. Presenta la parada de revisi\xF3n (tdd-sdd review).");
    case "green":
      return passed ? ok("Sigue en verde.") : fail("Regresi\xF3n: los tests dejaron de pasar tras llegar a verde.");
    default:
      return ok(`Tests ejecutados (fase ${state.phase}): ${passed ? "pasan" : "fallan"}.`);
  }
}
function requestReview(root2) {
  const state = requireState(root2);
  if (isResult(state)) return state;
  if (state.phase !== "green") return fail(`La revisi\xF3n se pide en verde (fase ${state.phase}).`);
  step(root2, state, "request_review");
  return ok("Parada de revisi\xF3n: resume qu\xE9 cambi\xF3 y qu\xE9 elementos de la spec cubre; espera /approve check.");
}
function finishRefactor(root2, exitCode) {
  const state = requireState(root2);
  if (isResult(state)) return state;
  if (state.phase !== "refactor") return fail(`No hay refactor en curso (fase ${state.phase}).`);
  if (exitCode !== 0) return fail("El refactor rompi\xF3 los tests: corr\xEDgelo antes de terminar.");
  step(root2, state, "refactor_done");
  return ok("Refactor terminado con tests en verde. Vuelve a la revisi\xF3n.");
}
function status(root2) {
  const state = loadState(root2);
  if (!state) return "tdd-sdd no est\xE1 iniciado en este proyecto.";
  const plan = readOptional(planPath(root2, state.useCase));
  const checks = plan ? parsePlan(plan) : [];
  const lines = [
    `Caso de uso: ${state.useCase}`,
    `Fase: ${state.phase}`,
    `Commit pendiente: ${state.pendingCommit ? "s\xED" : "no"}`,
    `Aprobaci\xF3n final: ${state.finalApproved ? "s\xED" : "no"}`,
    `Overrides: ${state.overrides.length ? state.overrides.join(", ") : "ninguno"}`,
    "",
    ...checks.map((c) => `[${c.done ? "x" : " "}] ${c.id}. ${c.title}  (cubre: ${c.covers.join(", ")})`)
  ];
  return lines.join("\n");
}

// src/hook.ts
import { isAbsolute, relative, resolve as resolve2 } from "node:path";

// src/shell.ts
var IGNORED_TARGETS = /* @__PURE__ */ new Set(["/dev/null", "/dev/stdout", "/dev/stderr", "-"]);
function tokenize(command2) {
  const tokens = [];
  let word = "";
  let inWord = false;
  const flush = () => {
    if (inWord) tokens.push({ kind: "word", value: word });
    word = "";
    inWord = false;
  };
  for (let i = 0; i < command2.length; i++) {
    const c = command2[i];
    if (c === "'" || c === '"') {
      const end = command2.indexOf(c, i + 1);
      const stop = end === -1 ? command2.length : end;
      word += command2.slice(i + 1, stop);
      inWord = true;
      i = stop;
    } else if (/\s/.test(c)) {
      flush();
    } else if (c === ">") {
      if (inWord && /^\d+$/.test(word)) {
        word = "";
        inWord = false;
      } else flush();
      if (command2[i + 1] === "&") {
        i += 1;
        while (/[\d-]/.test(command2[i + 1] ?? "")) i += 1;
        continue;
      }
      const op = command2[i + 1] === ">" ? ">>" : ">";
      if (op === ">>") i += 1;
      tokens.push({ kind: "op", value: op });
    } else if (c === "&" || c === "|" || c === ";") {
      flush();
      if ((c === "&" || c === "|") && command2[i + 1] === c) i += 1;
      tokens.push({ kind: "op", value: ";" });
    } else {
      word += c;
      inWord = true;
    }
  }
  flush();
  return tokens;
}
function splitCommands(tokens) {
  const commands = [[]];
  for (const token of tokens) {
    if (token.kind === "op" && token.value === ";") commands.push([]);
    else commands[commands.length - 1].push(token);
  }
  return commands.filter((c) => c.length > 0);
}
var HEREDOC_START = /<<(?!<)(-?)\s*(?:'([^']+)'|"([^"]+)"|([\w.-]+))/g;
function stripHeredocs(command2) {
  const kept = [];
  let pending = [];
  for (const line of command2.split("\n")) {
    const open = pending[0];
    if (open) {
      if ((open.indented ? line.trim() : line) === open.delimiter) pending = pending.slice(1);
      continue;
    }
    kept.push(line);
    for (const match of line.matchAll(HEREDOC_START)) {
      pending.push({ delimiter: match[2] ?? match[3] ?? match[4], indented: match[1] === "-" });
    }
  }
  return kept.join("\n");
}
var isFlag = (word) => word.startsWith("-");
function extractWriteTargets(command2) {
  const targets = [];
  for (const tokens of splitCommands(tokenize(stripHeredocs(command2)))) {
    const words = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.kind === "op") {
        const next = tokens[i + 1];
        if (next?.kind === "word") targets.push(next.value);
        i += 1;
      } else words.push(t.value);
    }
    const [name = "", ...args] = words;
    const positional = args.filter((a) => !isFlag(a));
    switch (name) {
      case "tee":
        targets.push(...positional);
        break;
      case "rm":
        targets.push(...positional);
        break;
      case "cp":
      case "mv":
        if (positional.length >= 2) targets.push(positional[positional.length - 1]);
        break;
      case "sed":
        if (args.some((a) => /^-[a-zA-Z]*i/.test(a) || a === "--in-place") && positional.length >= 2) {
          targets.push(positional[positional.length - 1]);
        }
        break;
    }
  }
  return [...new Set(targets)].filter((t) => !IGNORED_TARGETS.has(t));
}

// src/hook.ts
var ALLOW = { exitCode: 0, stdout: "", stderr: "" };
var EDIT_TOOLS = /* @__PURE__ */ new Set(["edit", "write", "multiedit", "notebookedit"]);
var HARNESS_WRITE = /\.tdd-sdd\/(state\.json|overrides\.log)/;
var WRITE_OPERATOR = />|\btee\b|\bsed\s+-i|\bmv\b|\brm\b|\bcp\b|\bdd\b|\btruncate\b/;
function deny(rule, reason) {
  return { exitCode: 2, stdout: "", stderr: `[tdd-sdd] ${reason} (regla: ${rule})` };
}
function projectRelative(file, root2, cwd2) {
  const rel = relative(root2, isAbsolute(file) ? file : resolve2(cwd2, file));
  return rel.startsWith("..") || isAbsolute(rel) ? void 0 : rel;
}
function actionsFor(input, root2) {
  const cwd2 = input.cwd ?? root2;
  const tool = (input.tool_name ?? "").toLowerCase();
  const args = input.tool_input ?? {};
  if (EDIT_TOOLS.has(tool)) {
    const raw = args.file_path ?? args.filePath ?? args.notebook_path ?? args.path;
    if (!raw) return [];
    const file = projectRelative(raw, root2, cwd2);
    return file === void 0 ? [] : [{ type: "edit", file }];
  }
  if (tool !== "bash") return [];
  const command2 = args.command ?? "";
  if (HARNESS_WRITE.test(command2) && WRITE_OPERATOR.test(command2)) {
    return deny("HARNESS_FILE_PROTECTED", "Los archivos de estado del harness no se modifican desde la shell.");
  }
  const actions = [];
  for (const target of extractWriteTargets(command2)) {
    const file = projectRelative(target, root2, cwd2);
    if (file !== void 0) actions.push({ type: "edit", file });
  }
  if (/\bgit\b[^|;&]*\bcommit\b/.test(command2)) actions.push({ type: "commit" });
  if (/\bgit\b[^|;&]*\bpush\b/.test(command2)) actions.push({ type: "push" });
  return actions;
}
function isHookResult(value) {
  return !Array.isArray(value);
}
function decide(input, root2, action) {
  const state = loadState(root2);
  if (!state) return ALLOW;
  const context = buildContext(state, readOptional(planPath(root2, state.useCase)), loadConfig(root2));
  const decision = evaluate(context, action);
  if (decision.allow) {
    if (action.type === "commit" && state.pendingCommit) saveState(root2, { ...state, pendingCommit: false });
    return ALLOW;
  }
  if (state.overrides.includes(decision.rule)) {
    return { exitCode: 0, stdout: "", stderr: `[tdd-sdd] override activo para ${decision.rule}` };
  }
  return deny(decision.rule, decision.reason);
}
var PROMPT_COMMAND = /^\/(?:[\w-]+:)?(approve|override|refactor)\b\s*(.*)$/s;
function handlePrompt(input, root2) {
  const match = PROMPT_COMMAND.exec((input.prompt ?? "").trim());
  if (!match || !loadState(root2)) return ALLOW;
  const result = humanCommand(root2, match[1], match[2].trim());
  const prefix = result.ok ? "[tdd-sdd]" : "[tdd-sdd] NO APLICADO:";
  return { exitCode: 0, stdout: `${prefix} ${result.message}`, stderr: "" };
}
function sessionStart(root2, cliPath) {
  const cli = cliPath ? `node ${cliPath}` : "tdd-sdd";
  const intro = `[tdd-sdd] Harness TDD+SDD. Comando CLI: ${cli} (\xFAsalo donde la documentaci\xF3n dice "tdd-sdd").`;
  const body = loadState(root2) ? status(root2) : "El harness no est\xE1 iniciado en este proyecto; usa /start-dev para empezar un caso de uso.";
  return { exitCode: 0, stdout: `${intro}
${body}`, stderr: "" };
}
function handleHook(input, root2, options = {}) {
  if (input.hook_event_name === "SessionStart") return sessionStart(root2, options.cliPath);
  if (!loadState(root2)) return ALLOW;
  switch (input.hook_event_name) {
    case "PreToolUse": {
      const actions = actionsFor(input, root2);
      if (isHookResult(actions)) return actions;
      for (const action of actions) {
        const result = decide(input, root2, action);
        if (result.exitCode === 2) return result;
      }
      return ALLOW;
    }
    case "Stop":
      if (input.stop_hook_active) return ALLOW;
      return decide(input, root2, { type: "stop" });
    case "UserPromptSubmit":
      return handlePrompt(input, root2);
    default:
      return ALLOW;
  }
}

// src/main.ts
function print(result) {
  (result.ok ? process.stdout : process.stderr).write(result.message + "\n");
  process.exit(result.ok ? 0 : 1);
}
function testCommand(root2) {
  try {
    const config = JSON.parse(readFileSync2(join3(root2, HARNESS_DIR, "config.json"), "utf8"));
    if (typeof config.testCommand === "string" && config.testCommand.trim() !== "") return config.testCommand;
  } catch {
  }
  process.stderr.write(
    `Falta el comando de tests: define "testCommand" en ${HARNESS_DIR}/config.json (solo editable antes de aprobar la spec).
`
  );
  process.exit(1);
}
function runTests(root2) {
  const result = spawnSync(testCommand(root2), { cwd: root2, shell: true, stdio: "inherit" });
  return result.status ?? 1;
}
var [command = "", ...rest] = process.argv.slice(2);
var cwd = process.cwd();
if (command === "hook") {
  const input = JSON.parse(readFileSync2(0, "utf8") || "{}");
  const start = input.cwd ?? cwd;
  const root2 = findRoot(start) ?? start;
  const result = handleHook(input, root2, { cliPath: process.argv[1] });
  if (result.stdout) process.stdout.write(result.stdout + "\n");
  if (result.stderr) process.stderr.write(result.stderr + "\n");
  process.exit(result.exitCode);
}
if (command === "init") print(initUseCase(cwd, rest[0] ?? ""));
var root = findRoot(cwd);
if (!root) {
  process.stderr.write("tdd-sdd no est\xE1 iniciado aqu\xED. Ejecuta: tdd-sdd init <id-caso-de-uso>\n");
  process.exit(1);
}
switch (command) {
  case "status":
    process.stdout.write(status(root) + "\n");
    break;
  case "test": {
    const code = runTests(root);
    const result = recordTestRun(root, code);
    process.stdout.write(`
[tdd-sdd] ${result.message}
`);
    process.exit(code === 0 && !result.ok ? 1 : code);
  }
  case "review":
    print(requestReview(root));
    break;
  case "refactor-done": {
    const code = runTests(root);
    print(finishRefactor(root, code));
    break;
  }
  default:
    process.stderr.write("Uso: tdd-sdd init <id> | test | review | refactor-done | status | hook\n");
    process.exit(1);
}
