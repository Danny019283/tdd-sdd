import { describe, expect, it } from "vitest";
import { amendFiles, markCheckDone, parsePlan } from "../src/plan.js";

const PLAN = `# Plan: Iniciar sesión

- [x] 1. Credenciales válidas devuelven token
  - cubre: FP-1
  - archivos: src/login.ts
- [ ] 2. Contraseña incorrecta devuelve 401
  - cubre: FA-3a
  - archivos: src/login.ts
`;

describe("markCheckDone", () => {
  it("marks only the requested check and leaves the rest of the file untouched", () => {
    const updated = markCheckDone(PLAN, 2);
    expect(updated).toBe(PLAN.replace("- [ ] 2.", "- [x] 2."));
    expect(parsePlan(updated).map((c) => c.done)).toEqual([true, true]);
  });

  it("throws when the check does not exist", () => {
    expect(() => markCheckDone(PLAN, 9)).toThrow(/check 9/);
  });

  it("throws when the check is already done", () => {
    expect(() => markCheckDone(PLAN, 1)).toThrow(/ya está completado/);
  });
});

describe("amendFiles", () => {
  it("adds and removes files from one check and touches nothing else", () => {
    const updated = amendFiles(PLAN, 2, { add: ["src/token.ts", "tests/login.test.ts"], remove: ["src/login.ts"] });
    const line = "  - archivos: src/login.ts\n";
    const at = PLAN.lastIndexOf(line);
    expect(updated).toBe(PLAN.slice(0, at) + "  - archivos: src/token.ts, tests/login.test.ts\n" + PLAN.slice(at + line.length));
    expect(parsePlan(updated)[0]!.files).toEqual(["src/login.ts"]);
    expect(parsePlan(updated)[1]!.files).toEqual(["src/token.ts", "tests/login.test.ts"]);
  });

  it("does not duplicate a file that is already listed", () => {
    expect(parsePlan(amendFiles(PLAN, 2, { add: ["src/login.ts"], remove: [] }))[1]!.files).toEqual(["src/login.ts"]);
  });

  it("refuses to leave a check without files", () => {
    expect(() => amendFiles(PLAN, 2, { add: [], remove: ["src/login.ts"] })).toThrow(/sin archivos/);
  });

  it("refuses paths outside the project or inside the harness", () => {
    for (const bad of ["/etc/passwd", "../x.ts", ".tdd-sdd/state.json", "./.tdd-sdd/use-cases/a/spec.md", "a/../../b.ts"]) {
      expect(() => amendFiles(PLAN, 2, { add: [bad], remove: [] })).toThrow(/ruta no permitida/);
    }
  });

  it("throws when the check does not exist or has no files line", () => {
    expect(() => amendFiles(PLAN, 9, { add: ["a.ts"], remove: [] })).toThrow(/check 9/);
    expect(() => amendFiles("- [ ] 1. Sin campos\n", 1, { add: ["a.ts"], remove: [] })).toThrow(/archivos/);
  });
});
