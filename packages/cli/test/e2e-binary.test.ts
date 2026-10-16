import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { FILLED_SPEC, PLAN, read, tempProject, write } from "./helpers.js";

const BIN = resolve(__dirname, "../../adapter-claude/bin/tdd-sdd.mjs");
const UC = ".tdd-sdd/use-cases/login";

beforeAll(() => {
  execFileSync("node", ["scripts/build.mjs"], { cwd: resolve(__dirname, "..") });
});

function cli(cwd: string, args: string[]) {
  const r = spawnSync("node", [BIN, ...args], { cwd, encoding: "utf8" });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
}

function hook(cwd: string, input: object) {
  const r = spawnSync("node", [BIN, "hook"], {
    cwd,
    input: JSON.stringify({ cwd, ...input }),
    encoding: "utf8",
  });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
}

const edit = (file: string) => ({ hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: file } });
const bash = (command: string) => ({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } });
function setTestCommand(root: string, testCommand: string) {
  write(root, ".tdd-sdd/config.json", JSON.stringify({ testCommand }));
}
const prompt = (prompt: string) => ({ hook_event_name: "UserPromptSubmit", prompt });

describe("real binary, real processes", () => {
  it("drives a use case end to end with real test commands", () => {
    const root = tempProject();

    expect(cli(root, ["init", "login"]).code).toBe(0);
    expect(hook(root, edit("src/login.ts")).code).toBe(2);

    write(root, `${UC}/spec.md`, FILLED_SPEC);
    expect(hook(root, prompt("/approve spec")).out).toMatch(/Spec aprobada/);
    write(root, `${UC}/plan.md`, PLAN.split("- [ ] 2.")[0]!);
    expect(hook(root, prompt("/approve plan")).out).toMatch(/Plan aprobado/);

    // the test command comes only from config.json; there is no way to pass one
    expect(cli(root, ["test", "--", "true"]).err).toMatch(/Falta el comando|comando de tests/);
    setTestCommand(root, "node -e \"process.exit(0)\"");

    // a passing test with no implementation does not count as red
    const notRed = cli(root, ["test"]);
    expect(notRed.code).toBe(1);
    expect(JSON.parse(read(root, ".tdd-sdd/state.json")).phase).toBe("plan_approved");

    setTestCommand(root, "node -e \"process.exit(1)\"");
    expect(cli(root, ["test"]).code).toBe(1);
    expect(JSON.parse(read(root, ".tdd-sdd/state.json")).phase).toBe("red");
    expect(hook(root, edit("src/login.ts")).code).toBe(0);

    setTestCommand(root, "node -e \"process.exit(0)\"");
    expect(cli(root, ["test"]).code).toBe(0);
    expect(hook(root, { hook_event_name: "Stop" }).code).toBe(2);
    expect(cli(root, ["review"]).code).toBe(0);
    expect(hook(root, { hook_event_name: "Stop" }).code).toBe(0);

    expect(hook(root, bash("git commit -m x")).code).toBe(2);
    expect(hook(root, prompt("/approve check")).out).toMatch(/Check 1 aprobado/);
    expect(hook(root, bash("git commit -m x")).code).toBe(0);

    expect(hook(root, bash("git push")).code).toBe(2);
    expect(hook(root, prompt("/approve final")).out).toMatch(/Aprobación final/);
    expect(hook(root, bash("git push")).code).toBe(0);

    expect(cli(root, ["status"]).out).toContain("[x] 1.");
  });

  it("session start announces the CLI path", () => {
    const root = tempProject();
    const r = hook(root, { hook_event_name: "SessionStart" });
    expect(r.code).toBe(0);
    expect(r.out).toContain(BIN);
  });
});
