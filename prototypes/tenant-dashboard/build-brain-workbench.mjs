import { build } from "esbuild";
await build({
  entryPoints: ["prototypes/tenant-dashboard/src/brain-workbench.ts"],
  outfile: "prototypes/tenant-dashboard/site/brain-workbench.js",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2022"],
  // Escape multiline library strings rather than emitting whitespace-only lines.
  supported: { "template-literal": false },
  minify: true,
  legalComments: "none",
});
console.log("Brain workbench built from the shared validation contracts.");
