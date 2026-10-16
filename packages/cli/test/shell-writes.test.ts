import { describe, expect, it } from "vitest";
import { extractWriteTargets } from "../src/shell.js";
import { handleHook, type HookInput } from "../src/hook.js";
import { initUseCase } from "../src/commands.js";
import { tempProject } from "./helpers.js";

describe("extractWriteTargets", () => {
  it.each<[string, string[]]>([
    ["echo hi > src/a.ts", ["src/a.ts"]],
    ["echo hi >> src/a.ts", ["src/a.ts"]],
    ["cat x | tee src/a.ts", ["src/a.ts"]],
    ["cat x | tee -a src/a.ts", ["src/a.ts"]],
    ["sed -i 's/a/b/' src/a.ts", ["src/a.ts"]],
    ["cp tpl.ts src/a.ts", ["src/a.ts"]],
    ["mv old.ts src/a.ts", ["src/a.ts"]],
    ["rm src/a.ts src/b.ts", ["src/a.ts", "src/b.ts"]],
    [`echo hi > "src/a b.ts"`, ["src/a b.ts"]],
    ["echo hi > src/a.ts && echo yo > src/b.ts", ["src/a.ts", "src/b.ts"]],
  ])("%s", (command, expected) => {
    expect(extractWriteTargets(command)).toEqual(expected);
  });

  it.each([
    "ls -la",
    "cat src/a.ts",
    "npm test 2>&1",
    "npm test 2>/dev/null",
    "echo hi > /dev/null",
    "git status",
  ])("finds no writes in: %s", (command) => {
    expect(extractWriteTargets(command)).toEqual([]);
  });
});

const bash = (command: string): HookInput => ({
  hook_event_name: "PreToolUse",
  tool_name: "Bash",
  tool_input: { command },
});

describe("shell writes are held to the same rules as edits", () => {
  it("denies writing production code from the shell before a red test", () => {
    const root = tempProject();
    initUseCase(root, "login");
    const r = handleHook(bash("echo 'export {}' > src/login.ts"), root);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/PRODUCTION_REQUIRES_RED_TEST/);
  });

  it("denies rm of production code too", () => {
    const root = tempProject();
    initUseCase(root, "login");
    expect(handleHook(bash("rm src/login.ts"), root).exitCode).toBe(2);
  });

  it("ignores writes outside the project", () => {
    const root = tempProject();
    initUseCase(root, "login");
    expect(handleHook(bash("echo x > /tmp/scratch.txt"), root).exitCode).toBe(0);
  });

  it("still allows plain commands", () => {
    const root = tempProject();
    initUseCase(root, "login");
    expect(handleHook(bash("ls -la && cat package.json"), root).exitCode).toBe(0);
  });
});
