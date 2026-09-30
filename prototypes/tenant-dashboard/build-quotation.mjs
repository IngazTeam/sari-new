import { build } from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
const root = "prototypes/tenant-dashboard/src/",
  copy = {};
for (const locale of ["ar", "en"]) {
  const text = JSON.parse(
    readFileSync(`client/src/locales/${locale}.json`, "utf8")
  );
  copy[locale] = {
    quotationWorkspace: text.quotationWorkspace,
    quotationSend: text.quotationSend,
    quotationTemplates: text.quotationTemplates,
  };
}
await build({
  entryPoints: [root + "quotation-preview.tsx"],
  outfile: "prototypes/tenant-dashboard/site/quotation-preview.js",
  bundle: true,
  jsx: "automatic",
  format: "iife",
  globalName: "QuotationPreview",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  legalComments: "none",
  alias: {
    "@/lib/trpc": path.resolve(root + "quotation-preview-api.ts"),
    "react-i18next": path.resolve(root + "quotation-preview-i18n.ts"),
    sonner: path.resolve(root + "quotation-preview-toast.ts"),
  },
  define: {
    QUOTATION_PREVIEW_COPY: JSON.stringify(copy),
    "process.env.NODE_ENV": '"production"',
  },
});
console.log(
  "Quotation prototype uses the actual workspace, editor, report and delivery dialog with a local-only API adapter."
);
