import { describe, expect, it } from "vitest";
import { evaluate } from "../src/rules.js";

const allowedFiles = ["src/login.ts", "tests/login.test.ts"];

describe("evaluate edit: scope guard", () => {
  it("denies editing a file outside the current check's file list", () => {
    const decision = evaluate(
      { phase: "red", allowedFiles },
      { type: "edit", file: "src/billing.ts" },
    );
    expect(decision.allow).toBe(false);
    if (!decision.allow) {
      expect(decision.rule).toBe("OUT_OF_SCOPE");
      expect(decision.reason).toMatch(/src\/billing\.ts/);
      expect(decision.reason).toMatch(/src\/login\.ts/);
    }
  });

  it("allows editing a file listed in the current check", () => {
    expect(
      evaluate({ phase: "red", allowedFiles }, { type: "edit", file: "src/login.ts" }),
    ).toEqual({ allow: true });
  });

  it("treats ./ prefixed paths as the same file", () => {
    expect(
      evaluate({ phase: "red", allowedFiles }, { type: "edit", file: "./src/login.ts" }),
    ).toEqual({ allow: true });
  });

  it("denies a test file that is not part of the check", () => {
    const decision = evaluate(
      { phase: "plan_approved", allowedFiles },
      { type: "edit", file: "tests/other.test.ts" },
    );
    expect(decision.allow).toBe(false);
    if (!decision.allow) expect(decision.rule).toBe("OUT_OF_SCOPE");
  });

  it("does not apply when no check is active", () => {
    expect(
      evaluate({ phase: "red" }, { type: "edit", file: "src/anything.ts" }),
    ).toEqual({ allow: true });
  });
});

describe("evaluate edit: always-allowed paths", () => {
  it.each(["README.md", "notas.txt", "docs/arquitectura/db.png", "CLAUDE.md"])(
    "lets %s through even outside the check and before a red test",
    (file) => {
      expect(evaluate({ phase: "plan_approved", allowedFiles }, { type: "edit", file })).toEqual({ allow: true });
      expect(evaluate({ phase: "spec_draft" }, { type: "edit", file })).toEqual({ allow: true });
    },
  );

  it("does not exempt harness files", () => {
    const decision = evaluate({ phase: "red", allowedFiles }, { type: "edit", file: ".tdd-sdd/use-cases/x/spec.md" });
    expect(decision.allow).toBe(false);
    if (!decision.allow) expect(decision.rule).toBe("SPEC_FROZEN");
  });

  it("still guards production code", () => {
    const decision = evaluate({ phase: "plan_approved", allowedFiles }, { type: "edit", file: "src/billing.ts" });
    expect(decision.allow).toBe(false);
  });

  it("honours extra globs from the project config", () => {
    const context = { phase: "red" as const, allowedFiles, extraAllowedPaths: ["scripts/**"] };
    expect(evaluate(context, { type: "edit", file: "scripts/dev.sh" })).toEqual({ allow: true });
    expect(evaluate({ phase: "red", allowedFiles }, { type: "edit", file: "scripts/dev.sh" }).allow).toBe(false);
  });
});
