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
        kind: "behavior",
        done: true,
        covers: ["FP-1", "FP-2"],
        files: ["src/login.ts", "tests/login.test.ts"],
      },
      {
        id: 2,
        title: "Contraseña incorrecta devuelve 401",
        kind: "behavior",
        done: false,
        covers: ["FA-3a"],
        files: ["src/login.ts", "tests/login.test.ts"],
      },
    ]);
  });

  it("returns an empty list when the plan has no checks", () => {
    expect(parsePlan("# Plan vacío\n")).toEqual([]);
  });

  it("reads the check kind from an optional tag and keeps it out of the title", () => {
    const plan = `- [ ] 1. (refactor) Refactor DRY backend
  - cubre: RNF-2
  - archivos: src/a.ts
- [ ] 2. (verificación) Integración contra Oracle real
  - cubre: RNF-1
  - archivos: tests/it.test.ts
- [ ] 3. (verificacion) Sin tilde
  - cubre: RNF-1
  - archivos: tests/it.test.ts
- [ ] 4. (Refactor) Mayúscula
  - cubre: RNF-2
  - archivos: src/a.ts
- [ ] 5. Titulo (refactor) en medio
  - cubre: RN-1
  - archivos: src/a.ts
`;
    expect(parsePlan(plan).map((c) => [c.kind, c.title])).toEqual([
      ["refactor", "Refactor DRY backend"],
      ["verify", "Integración contra Oracle real"],
      ["verify", "Sin tilde"],
      ["refactor", "Mayúscula"],
      ["behavior", "Titulo (refactor) en medio"],
    ]);
  });
});
