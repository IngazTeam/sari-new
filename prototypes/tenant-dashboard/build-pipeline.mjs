import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
const copy = JSON.parse(
  readFileSync("client/src/locales/ar.json", "utf8")
).pipelineWorkspace;
const output = "prototypes/tenant-dashboard/site/pipeline-preview.js";
await build({
  entryPoints: ["prototypes/tenant-dashboard/src/pipeline-preview.tsx"],
  outfile: output,
  bundle: true,
  jsx: "automatic",
  format: "iife",
  globalName: "PipelinePreview",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  legalComments: "none",
  define: {
    PIPELINE_PREVIEW_COPY: JSON.stringify(copy),
    "process.env.NODE_ENV": '"production"',
  },
});
writeFileSync(output, readFileSync(output, "utf8").replace(/^[\t ]+$/gm, ""));
console.log(
  "Pipeline prototype built from the actual report, translations and styles."
);
