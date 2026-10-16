export interface PlanCheck {
  id: number;
  title: string;
  done: boolean;
  covers: string[];
  files: string[];
}

const CHECK_LINE = /^- \[( |x)\]\s+(\d+)\.\s+(.+?)\s*$/;
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
      current = {
        id: Number(check[2]),
        title: check[3]!,
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
