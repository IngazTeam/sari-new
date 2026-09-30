import { build } from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
const root = "prototypes/tenant-dashboard/src/",
  copy = {};
for (const language of ["ar", "en"]) {
  const text = JSON.parse(
    readFileSync(`client/src/locales/${language}.json`, "utf8")
  );
  copy[language] = { reportWorkspaceUx: text.reportWorkspaceUx };
}
await build({
  entryPoints: [root + "report-preview.tsx"],
  outfile: "prototypes/tenant-dashboard/site/report-preview.js",
  bundle: true,
  jsx: "automatic",
  format: "iife",
  globalName: "ReportPreview",
  platform: "browser",
  target: ["es2022"],
  supported: { "template-literal": false },
  minify: true,
  legalComments: "none",
  alias: {
    "@/lib/trpc": path.resolve(root + "report-preview-api.ts"),
    "@/lib/report-export": path.resolve(root + "report-preview-export.ts"),
    "react-i18next": path.resolve(root + "report-preview-i18n.ts"),
  },
  define: {
    REPORT_PREVIEW_COPY: JSON.stringify(copy),
    "process.env.NODE_ENV": '"production"',
  },
});
console.log(
  "Reports prototype uses the actual scoped workspace, document, printing and Excel with local fixtures."
);
