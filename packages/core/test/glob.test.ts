import { describe, expect, it } from "vitest";
import { matchesGlob } from "../src/glob.js";

describe("matchesGlob", () => {
  it.each<[string, string, boolean]>([
    ["README.md", "**/*.md", true],
    ["docs/a/b.md", "**/*.md", true],
    ["notas.txt", "*.txt", true],
    ["src/notas.txt", "*.txt", false],
    ["docs/a/b.png", "docs/**", true],
    ["docsx/a.png", "docs/**", false],
    ["src/a.ts", "src/?.ts", true],
    ["src/ab.ts", "src/?.ts", false],
    ["a.b.md", "*.md", true],
    ["src/a.ts", "**/*.md", false],
  ])("%s vs %s -> %s", (path, pattern, expected) => {
    expect(matchesGlob(path, pattern)).toBe(expected);
  });
});
