import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { ProjectConfig, ProjectState } from "@tdd-sdd/core";

export const HARNESS_DIR = ".tdd-sdd";

export const statePath = (root: string) => join(root, HARNESS_DIR, "state.json");
export const useCaseDir = (root: string, id: string) => join(root, HARNESS_DIR, "use-cases", id);
export const specPath = (root: string, id: string) => join(useCaseDir(root, id), "spec.md");
export const planPath = (root: string, id: string) => join(useCaseDir(root, id), "plan.md");
export const overridesLogPath = (root: string) => join(root, HARNESS_DIR, "overrides.log");

export function loadState(root: string): ProjectState | undefined {
  const file = statePath(root);
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8")) as ProjectState;
}

export function saveState(root: string, state: ProjectState): void {
  const file = statePath(root);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
}

export function loadConfig(root: string): ProjectConfig {
  const raw = readOptional(join(root, HARNESS_DIR, "config.json"));
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" ? (parsed as ProjectConfig) : {};
  } catch {
    return {};
  }
}

export function readOptional(file: string): string | undefined {
  return existsSync(file) ? readFileSync(file, "utf8") : undefined;
}

export function writeText(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

export function logOverride(root: string, rule: string): void {
  const file = overridesLogPath(root);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${new Date().toISOString()} override ${rule}\n`);
}

/** Sube desde `start` hasta encontrar un directorio con .tdd-sdd/state.json. */
export function findRoot(start: string): string | undefined {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(statePath(dir))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}
