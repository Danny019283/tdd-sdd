export const SPEC_SECTIONS = [
  "Identificación",
  "Alcance",
  "Precondiciones",
  "Disparador",
  "Flujo principal",
  "Flujos alternativos y de excepción",
  "Postcondiciones",
  "Reglas de negocio",
  "Requisitos no funcionales",
] as const;

export type SpecErrorCode = "MISSING_SECTION" | "EMPTY_SECTION" | "PLACEHOLDER";

const PLACEHOLDERS = new Set(["tbd", "todo", "pendiente", "por definir", "n/a"]);

export interface SpecError {
  section: string;
  code: SpecErrorCode;
}

export interface SpecValidation {
  ok: boolean;
  errors: SpecError[];
}

function parseSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  const heading = /^##\s+\d+\.\s+(.+?)\s*$/gm;
  const matches = [...markdown.matchAll(heading)];
  matches.forEach((match, i) => {
    const start = (match.index ?? 0) + match[0].length;
    const end = matches[i + 1]?.index ?? markdown.length;
    sections.set(match[1]!, markdown.slice(start, end).trim());
  });
  return sections;
}

export function validateSpec(markdown: string): SpecValidation {
  const sections = parseSections(markdown);
  const errors: SpecError[] = [];
  for (const title of SPEC_SECTIONS) {
    const body = sections.get(title);
    if (body === undefined) errors.push({ section: title, code: "MISSING_SECTION" });
    else if (body === "") errors.push({ section: title, code: "EMPTY_SECTION" });
    else if (PLACEHOLDERS.has(body.toLowerCase().replace(/[.\s]+$/, "")))
      errors.push({ section: title, code: "PLACEHOLDER" });
  }
  return { ok: errors.length === 0, errors };
}
