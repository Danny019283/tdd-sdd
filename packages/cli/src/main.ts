import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { finishRefactor, initUseCase, recordTestRun, requestReview, status, type Result } from "./commands.js";
import { handleHook, type HookInput } from "./hook.js";
import { findRoot, HARNESS_DIR } from "./store.js";

function print(result: Result): never {
  (result.ok ? process.stdout : process.stderr).write(result.message + "\n");
  process.exit(result.ok ? 0 : 1);
}

function testCommand(root: string, rest: string[]): string {
  const dash = rest.indexOf("--");
  if (dash !== -1 && rest[dash + 1]) return rest.slice(dash + 1).join(" ");
  try {
    const config = JSON.parse(readFileSync(join(root, HARNESS_DIR, "config.json"), "utf8"));
    if (typeof config.testCommand === "string") return config.testCommand;
  } catch {
    // sin config: se informa abajo
  }
  process.stderr.write(
    `Falta el comando de tests. Define "testCommand" en ${HARNESS_DIR}/config.json o usa: tdd-sdd test -- <comando>\n`,
  );
  process.exit(1);
}

function runTests(root: string, rest: string[]): number {
  const result = spawnSync(testCommand(root, rest), { cwd: root, shell: true, stdio: "inherit" });
  return result.status ?? 1;
}

const [command = "", ...rest] = process.argv.slice(2);
const cwd = process.cwd();

if (command === "hook") {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}") as HookInput;
  const start = input.cwd ?? cwd;
  const root = findRoot(start) ?? start;
  const result = handleHook(input, root, { cliPath: process.argv[1] });
  if (result.stdout) process.stdout.write(result.stdout + "\n");
  if (result.stderr) process.stderr.write(result.stderr + "\n");
  process.exit(result.exitCode);
}

if (command === "init") print(initUseCase(cwd, rest[0] ?? ""));

const root = findRoot(cwd);
if (!root) {
  process.stderr.write("tdd-sdd no está iniciado aquí. Ejecuta: tdd-sdd init <id-caso-de-uso>\n");
  process.exit(1);
}

switch (command) {
  case "status":
    process.stdout.write(status(root) + "\n");
    break;
  case "test": {
    const code = runTests(root, rest);
    const result = recordTestRun(root, code);
    process.stdout.write(`\n[tdd-sdd] ${result.message}\n`);
    process.exit(code === 0 && !result.ok ? 1 : code);
  }
  case "review":
    print(requestReview(root));
    break;
  case "refactor-done": {
    const code = runTests(root, rest);
    print(finishRefactor(root, code));
    break;
  }
  default:
    process.stderr.write("Uso: tdd-sdd init <id> | test [-- cmd] | review | refactor-done [-- cmd] | status | hook\n");
    process.exit(1);
}
