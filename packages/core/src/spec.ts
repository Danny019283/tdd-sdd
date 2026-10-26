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

export type SpecErrorCode =
  | "MISSING_SECTION"
  | "EMPTY_SECTION"
  | "PLACEHOLDER"
  | "PENDING_MARK"
  | "MULTIPLE_TRIGGERS";

const PLACEHOLDERS = new Set(["tbd", "todo", "pendiente", "por definir", "n/a"]);

export interface SpecError {
  section: string;
  code: SpecErrorCode;
  /** Línea con el marcador, solo en PENDING_MARK. */
  line?: string;
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
    const body = markdown.slice(start, end).replace(/<!--[\s\S]*?-->/g, "").trim();
    sections.set(match[1]!, body);
  });
  return sections;
}

/** Una línea que termina en un marcador ("Criterio exacto: pendiente"), no prosa que usa la palabra. */
const PENDING_LINE = /(?:^|[:\-–—])\s*(?:pendiente|tbd|todo|por definir)\s*[.!]?\s*$/i;

function findPendingLine(body: string): string | undefined {
  return body
    .split("\n")
    .map((line) => line.trim())
    .find((line) => PENDING_LINE.test(line));
}

function countListItems(body: string): number {
  return body.split("\n").filter((line) => /^\s*(?:[-*+]|\d+[.)])\s+/.test(line)).length;
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
    else {
      const line = findPendingLine(body);
      if (line !== undefined) errors.push({ section: title, code: "PENDING_MARK", line });
    }
  }
  const trigger = sections.get("Disparador");
  if (trigger && errors.every((e) => e.section !== "Disparador") && countListItems(trigger) > 1)
    errors.push({ section: "Disparador", code: "MULTIPLE_TRIGGERS" });
  return { ok: errors.length === 0, errors };
}
