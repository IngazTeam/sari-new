import { build } from "esbuild";
import { readFileSync } from "node:fs";
const copy = JSON.parse(
  readFileSync("client/src/locales/ar.json", "utf8")
).overviewWorkspace;
await build({
  entryPoints: ["prototypes/tenant-dashboard/src/overview-preview.tsx"],
  outfile: "prototypes/tenant-dashboard/site/overview-preview.js",
  bundle: true,
  jsx: "automatic",
  format: "iife",
  globalName: "OverviewPreview",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  legalComments: "none",
  define: {
    OVERVIEW_PREVIEW_COPY: JSON.stringify(copy),
    "process.env.NODE_ENV": '"production"',
  },
});
console.log(
  "Overview preview built from the actual report, styles, and CSV exporter."
);
