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

  it.each(["TBD", "pendiente", "TODO", "por definir"])(
    "rejects a section containing only the placeholder %s",
    (placeholder) => {
      const result = validateSpec(specWith({ "Reglas de negocio": placeholder }));
      expect(result.ok).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ section: "Reglas de negocio", code: "PLACEHOLDER" }),
      );
    },
  );

  it("accepts a Disparador that is a single event", () => {
    const result = validateSpec(specWith({ Disparador: "El actor envía el formulario de login." }));
    expect(result.ok).toBe(true);
  });

  it.each([
    ["a list of several events", "- El actor envía el formulario\n- Llega el día 1 de cada mes"],
    ["numbered steps", "1. El actor abre la página\n2. El actor envía el formulario"],
  ])("rejects a Disparador written as %s", (_label, body) => {
    const result = validateSpec(specWith({ Disparador: body }));
    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ section: "Disparador", code: "MULTIPLE_TRIGGERS" }),
    );
  });

  it("ignores HTML comments, so template hints do not count as content", () => {
    const hintOnly = validateSpec(specWith({ Alcance: "<!-- qué incluye y qué no -->" }));
    expect(hintOnly.errors).toContainEqual(
      expect.objectContaining({ section: "Alcance", code: "EMPTY_SECTION" }),
    );
    const placeholder = validateSpec(specWith({ Alcance: "pendiente\n<!-- hint -->" }));
    expect(placeholder.errors).toContainEqual(
      expect.objectContaining({ section: "Alcance", code: "PLACEHOLDER" }),
    );
  });
});
