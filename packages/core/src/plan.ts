/** `behavior` pasa por rojo; `refactor` parte de tests en verde; `verify` solo añade pruebas. */
export type CheckKind = "behavior" | "refactor" | "verify";

export interface PlanCheck {
  id: number;
  title: string;
  kind: CheckKind;
  done: boolean;
  covers: string[];
  files: string[];
}

const CHECK_LINE = /^- \[( |x)\]\s+(\d+)\.\s+(.+?)\s*$/;
const KIND_TAG = /^\((refactor|verificaci[oó]n)\)\s+/i;
const FIELD_LINE = /^\s+-\s+(cubre|archivos):\s*(.*?)\s*$/;

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

export function parsePlan(markdown: string): PlanCheck[] {
  const checks: PlanCheck[] = [];
  let current: PlanCheck | undefined;
  for (const line of markdown.split("\n")) {
    const check = CHECK_LINE.exec(line);
    if (check) {
      const tag = KIND_TAG.exec(check[3]!);
      current = {
        id: Number(check[2]),
        title: tag ? check[3]!.slice(tag[0].length) : check[3]!,
        kind: tag ? (tag[1]!.toLowerCase() === "refactor" ? "refactor" : "verify") : "behavior",
        done: check[1] === "x",
        covers: [],
        files: [],
      };
      checks.push(current);
      continue;
    }
    const field = FIELD_LINE.exec(line);
    if (field && current) {
      if (field[1] === "cubre") current.covers = splitList(field[2]!);
      else current.files = splitList(field[2]!);
    }
  }
  return checks;
}

export function markCheckDone(markdown: string, id: number): string {
  const lines = markdown.split("\n");
  const index = lines.findIndex((line) => CHECK_LINE.exec(line)?.[2] === String(id));
  if (index === -1) throw new Error(`No existe el check ${id} en el plan`);
  const line = lines[index]!;
  if (CHECK_LINE.exec(line)![1] === "x") throw new Error(`El check ${id} ya está completado`);
  lines[index] = line.replace("- [ ]", "- [x]");
  return lines.join("\n");
}

const FILES_LINE = /^(\s+-\s+archivos:\s*)(.*?)\s*$/;

function checkAmendablePath(file: string): string {
  const path = file.replace(/^(\.\/)+/, "");
  const parts = path.split("/");
  if (path === "" || path.startsWith("/") || parts.includes("..") || parts[0] === ".tdd-sdd") {
    throw new Error(`ruta no permitida en un check: ${file}`);
  }
  return path;
}

/** Cambia solo la línea `archivos:` del check; el resto del plan queda intacto. */
export function amendFiles(markdown: string, id: number, change: { add: string[]; remove: string[] }): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => CHECK_LINE.exec(line)?.[2] === String(id));
  if (start === -1) throw new Error(`No existe el check ${id} en el plan`);
  const add = change.add.map(checkAmendablePath);
  const remove = new Set(change.remove.map((f) => f.replace(/^(\.\/)+/, "")));
  for (let i = start + 1; i < lines.length && !CHECK_LINE.test(lines[i]!); i++) {
    const match = FILES_LINE.exec(lines[i]!);
    if (!match) continue;
    const files = [...new Set([...splitList(match[2]!).filter((f) => !remove.has(f)), ...add])];
    if (files.length === 0) throw new Error(`El check ${id} se quedaría sin archivos`);
    lines[i] = match[1]! + files.join(", ");
    return lines.join("\n");
  }
  throw new Error(`El check ${id} no tiene línea de archivos`);
}
