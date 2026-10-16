import { describe, expect, it } from "vitest";
import { markCheckDone, parsePlan } from "../src/plan.js";

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
