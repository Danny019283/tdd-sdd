import { describe, expect, it } from "vitest";
import { parsePlan } from "../src/plan.js";

const PLAN = `# Plan: Iniciar sesión

- [x] 1. Credenciales válidas devuelven token
  - cubre: FP-1, FP-2
  - archivos: src/login.ts, tests/login.test.ts
- [ ] 2. Contraseña incorrecta devuelve 401
  - cubre: FA-3a
  - archivos: src/login.ts, tests/login.test.ts
`;

describe("parsePlan", () => {
  it("reads each check with its id, title, state, covered spec elements and allowed files", () => {
    expect(parsePlan(PLAN)).toEqual([
      {
        id: 1,
        title: "Credenciales válidas devuelven token",
        done: true,
        covers: ["FP-1", "FP-2"],
        files: ["src/login.ts", "tests/login.test.ts"],
      },
      {
        id: 2,
        title: "Contraseña incorrecta devuelve 401",
        done: false,
        covers: ["FA-3a"],
        files: ["src/login.ts", "tests/login.test.ts"],
      },
    ]);
  });

  it("returns an empty list when the plan has no checks", () => {
    expect(parsePlan("# Plan vacío\n")).toEqual([]);
  });
});
