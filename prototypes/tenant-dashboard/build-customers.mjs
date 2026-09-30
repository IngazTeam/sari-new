import { build } from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
const root = "prototypes/tenant-dashboard/src/",
  copy = {};
for (const language of ["ar", "en"]) {
  const text = JSON.parse(
    readFileSync(`client/src/locales/${language}.json`, "utf8")
  );
  copy[language] = { customerWorkspaceUx: text.customerWorkspaceUx };
}
await build({
  entryPoints: [root + "customer-preview.tsx"],
  outfile: "prototypes/tenant-dashboard/site/customer-preview.js",
  bundle: true,
  jsx: "automatic",
  format: "iife",
  globalName: "CustomerPreview",
  platform: "browser",
  target: ["es2022"],
  supported: { "template-literal": false },
  minify: true,
  legalComments: "none",
  alias: {
    "@/lib/trpc": path.resolve(root + "customer-preview-api.ts"),
    "react-i18next": path.resolve(root + "customer-preview-i18n.ts"),
  },
  define: {
    CUSTOMER_PREVIEW_COPY: JSON.stringify(copy),
    "process.env.NODE_ENV": '"production"',
  },
});
console.log(
  "Customer prototype uses actual list, detail, notes, tags and recovery UI with local fixtures."
);
