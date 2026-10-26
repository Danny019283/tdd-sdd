import { describe, expect, it } from "vitest";
import { evaluate } from "../src/rules.js";

const approve = (role: string) => evaluate({ phase: "review" }, { type: "role_command", command: "approve_check", role });
const amend = (role: string) => evaluate({ phase: "red" }, { type: "role_command", command: "amend_files", role });

describe("role commands", () => {
  it("lets only the reviewer approve a check", () => {
    expect(approve("revisor")).toEqual({ allow: true });
    for (const role of ["main", "desarrollador", "solucionador", "redactor", "subagent"]) {
      expect(approve(role)).toMatchObject({ allow: false, rule: "ROLE_NOT_ALLOWED" });
    }
  });

  it("lets only the troubleshooter amend the files of a check", () => {
    expect(amend("solucionador")).toEqual({ allow: true });
    for (const role of ["main", "desarrollador", "revisor", "redactor"]) {
      expect(amend(role)).toMatchObject({ allow: false, rule: "ROLE_NOT_ALLOWED" });
    }
  });

  it("names the role that may run the command in the reason", () => {
    const decision = approve("desarrollador");
    expect(decision.allow).toBe(false);
    if (!decision.allow) expect(decision.reason).toMatch(/revisor/);
  });

  it("protects the approval and amendment logs like the other harness files", () => {
    for (const file of [".tdd-sdd/approvals.log", ".tdd-sdd/amendments.log"]) {
      expect(evaluate({ phase: "red" }, { type: "edit", file })).toMatchObject({ allow: false, rule: "HARNESS_FILE_PROTECTED" });
    }
  });
});
