import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
const copy = JSON.parse(
  readFileSync("client/src/locales/ar.json", "utf8")
).performanceWorkspace;
const output = "prototypes/tenant-dashboard/site/performance-preview.js";
await build({
  entryPoints: ["prototypes/tenant-dashboard/src/performance-preview.tsx"],
  outfile: output,
  bundle: true,
  jsx: "automatic",
  format: "iife",
  globalName: "PerformancePreview",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  legalComments: "none",
  define: {
    PERFORMANCE_PREVIEW_COPY: JSON.stringify(copy),
    "process.env.NODE_ENV": '"production"',
  },
});
writeFileSync(output, readFileSync(output, "utf8").replace(/^[\t ]+$/gm, ""));
console.log(
  "Performance prototype built from the actual report, styles, translations and CSV."
);
