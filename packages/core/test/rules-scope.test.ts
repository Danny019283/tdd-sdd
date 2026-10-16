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
