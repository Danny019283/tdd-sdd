import { describe, expect, it } from "vitest";
import { validateSpec } from "../src/spec.js";

const SECTIONS = [
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

function specWith(overrides: Record<string, string> = {}): string {
  return SECTIONS.map((title, i) => {
    const body = overrides[title] ?? "contenido";
    return `## ${i + 1}. ${title}\n${body}\n`;
  }).join("\n");
}

describe("validateSpec", () => {
  it("accepts a spec with all nine sections filled", () => {
    expect(validateSpec(specWith())).toEqual({ ok: true, errors: [] });
  });

  it("rejects a spec whose Disparador section is empty", () => {
    const result = validateSpec(specWith({ Disparador: "" }));
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ section: "Disparador", code: "EMPTY_SECTION" }),
    );
  });
});
