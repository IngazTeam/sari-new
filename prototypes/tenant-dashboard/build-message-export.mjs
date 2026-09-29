import { build } from "esbuild";
import { readFileSync } from "node:fs";
await build({
  entryPoints: ["prototypes/tenant-dashboard/src/message-export.ts"],
  outfile: "prototypes/tenant-dashboard/site/message-export.js",
  bundle: true,
  format: "iife",
  globalName: "MessageExportPreview",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  legalComments: "none",
  supported: { "template-literal": false },
  define: {
    MESSAGE_PREVIEW_FONT: JSON.stringify(
      readFileSync(
        "client/public/central/fonts/IBMPlexSansArabic-Regular.ttf"
      ).toString("base64")
    ),
  },
});
console.log(
  "Local preview export bundle built from the actual workspace exporter; loaded only when exporting."
);
