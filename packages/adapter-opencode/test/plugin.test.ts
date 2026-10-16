import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initUseCase, loadState } from "@tdd-sdd/cli";
import { TddSddPlugin } from "../src/index.js";

async function started() {
  const dir = mkdtempSync(join(tmpdir(), "tdd-sdd-oc-"));
  initUseCase(dir, "login");
  const hooks = await TddSddPlugin({ directory: dir });
  return { dir, hooks };
}

describe("opencode adapter", () => {
  it("throws on a denied edit, with the harness reason", async () => {
    const { hooks } = await started();
    await expect(
      hooks["tool.execute.before"]!({ tool: "edit" }, { args: { filePath: "src/login.ts" } }),
    ).rejects.toThrow(/PRODUCTION_REQUIRES_RED_TEST/);
  });

  it("lets allowed actions through", async () => {
    const { hooks } = await started();
    await expect(
      hooks["tool.execute.before"]!({ tool: "read" }, { args: { filePath: "src/login.ts" } }),
    ).resolves.toBeUndefined();
  });

  it("denies git push from the bash tool", async () => {
    const { hooks } = await started();
    await expect(
      hooks["tool.execute.before"]!({ tool: "bash" }, { args: { command: "git push origin main" } }),
    ).rejects.toThrow(/PUSH_REQUIRES_COMPLETE_PLAN/);
  });

  it("applies human slash commands found in the user's message", async () => {
    const { dir, hooks } = await started();
    await hooks["chat.message"]!({}, { parts: [{ type: "text", text: "/override PRODUCTION_REQUIRES_RED_TEST" }] });
    expect(loadState(dir)?.overrides).toContain("PRODUCTION_REQUIRES_RED_TEST");
  });
});
