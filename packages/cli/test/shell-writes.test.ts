import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extractWriteTargets } from "../src/shell.js";
import { handleHook, type HookInput } from "../src/hook.js";
import { initUseCase } from "../src/commands.js";
import { tempProject, write } from "./helpers.js";

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
    ["cat > spec.md <<'EOF'\nFP-1 -> ok <!-- nota --> it's\nEOF", ["spec.md"]],
    ["cat <<EOF > spec.md\na > b\nEOF\necho hi > x.ts", ["spec.md", "x.ts"]],
    ["cat <<-EOF > spec.md\n\ta > b\n\tEOF", ["spec.md"]],
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

describe("heredocs and relative paths", () => {
  const spec = ".tdd-sdd/use-cases/login/spec.md";

  it("does not read the body of a heredoc as shell commands", () => {
    const root = tempProject();
    initUseCase(root, "login");
    const command = `cat > ${spec} <<'EOF'\nFP-1 -> ok <!-- nota --> it's\nEOF`;
    expect(handleHook(bash(command), root)).toMatchObject({ exitCode: 0 });
  });

  it("resolves relative targets against the cwd of the tool call", () => {
    const root = tempProject();
    initUseCase(root, "login");
    const input: HookInput = { ...bash("echo hi > spec.md"), cwd: join(root, ".tdd-sdd/use-cases/login") };
    expect(handleHook(input, root)).toMatchObject({ exitCode: 0 });
  });

  it("still denies a relative production path from a subdirectory", () => {
    const root = tempProject();
    initUseCase(root, "login");
    const input: HookInput = { ...bash("echo hi > login.ts"), cwd: join(root, "src") };
    const r = handleHook(input, root);
    expect(r.exitCode).toBe(2);
    expect(r.stderr).toMatch(/src\/login\.ts/);
  });
});

describe("notes and docs are always allowed", () => {
  const edit = (file: string): HookInput => ({ hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: file } });

  it("lets a root note through while a check is open", () => {
    const root = tempProject();
    initUseCase(root, "login");
    expect(handleHook(edit(join(root, "PROBLEMAS.txt")), root).exitCode).toBe(0);
    expect(handleHook(bash("echo nota > docs/notas.md"), root).exitCode).toBe(0);
  });

  it("honours alwaysAllowed from config.json", () => {
    const root = tempProject();
    initUseCase(root, "login");
    expect(handleHook(bash("echo x > scripts/dev.sh"), root).exitCode).toBe(2);
    write(root, ".tdd-sdd/config.json", JSON.stringify({ alwaysAllowed: ["scripts/**"] }));
    expect(handleHook(bash("echo x > scripts/dev.sh"), root).exitCode).toBe(0);
  });
});
