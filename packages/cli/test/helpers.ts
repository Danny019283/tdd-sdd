import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function tempProject(): string {
  return mkdtempSync(join(tmpdir(), "tdd-sdd-"));
}

export function write(root: string, file: string, content: string): void {
  const full = join(root, file);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

export function read(root: string, file: string): string {
  return readFileSync(join(root, file), "utf8");
}

export const SECTIONS = [
  "Identificación",
  "Alcance",
  "Precondiciones",
  "Disparador",
  "Flujo principal",
  "Flujos alternativos y de excepción",
  "Postcondiciones",
  "Reglas de negocio",
  "Requisitos no funcionales",
];

export const FILLED_SPEC = SECTIONS.map((t, i) => `## ${i + 1}. ${t}\ncontenido de ${t}\n`).join("\n");

export const PLAN = `# Plan

- [ ] 1. Credenciales válidas
  - cubre: FP-1
  - archivos: src/login.ts, tests/login.test.ts
- [ ] 2. Contraseña incorrecta
  - cubre: FA-3a
  - archivos: src/login.ts, tests/login.test.ts
`;
