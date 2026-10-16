import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  outfile: "../adapter-claude/bin/tdd-sdd.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
});
console.log("built ../adapter-claude/bin/tdd-sdd.mjs");
