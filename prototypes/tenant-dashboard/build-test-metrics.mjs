import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
const allCopy = JSON.parse(readFileSync("client/src/locales/ar.json", "utf8"));
const copy = {
  overviewWorkspace: allCopy.overviewWorkspace,
  testMetricsWorkspace: allCopy.testMetricsWorkspace,
};
await build({
  entryPoints: ["prototypes/tenant-dashboard/src/test-metrics-preview.tsx"],
  outfile: "prototypes/tenant-dashboard/site/test-metrics-preview.js",
  bundle: true,
  jsx: "automatic",
  format: "iife",
  globalName: "TestMetricsPreview",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  legalComments: "none",
  define: {
    TEST_METRICS_PREVIEW_COPY: JSON.stringify(copy),
    "process.env.NODE_ENV": '"production"',
  },
});
const output = "prototypes/tenant-dashboard/site/test-metrics-preview.js";
writeFileSync(output, readFileSync(output, "utf8").replace(/^[\t ]+$/gm, ""));
console.log(
  "Test metrics preview built from the actual report, styles, and CSV exporter."
);
