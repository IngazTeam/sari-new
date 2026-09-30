import { build } from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
const root = "prototypes/tenant-dashboard/src/",
  copy = {};
for (const language of ["ar", "en"]) {
  const text = JSON.parse(
    readFileSync(`client/src/locales/${language}.json`, "utf8")
  );
  copy[language] = {
    productWorkspaceUx: text.productWorkspaceUx,
    categoryUx: text.categoryUx,
    detailUx: text.detailUx,
  };
}
await build({
  entryPoints: [root + "product-preview.tsx"],
  outfile: "prototypes/tenant-dashboard/site/product-preview.js",
  bundle: true,
  jsx: "automatic",
  format: "iife",
  globalName: "ProductPreview",
  platform: "browser",
  target: ["es2022"],
  supported: { "template-literal": false },
  minify: true,
  legalComments: "none",
  alias: {
    "@/lib/trpc": path.resolve(root + "product-preview-api.ts"),
    "react-i18next": path.resolve(root + "product-preview-i18n.ts"),
  },
  define: {
    PRODUCT_PREVIEW_COPY: JSON.stringify(copy),
    "process.env.NODE_ENV": '"production"',
  },
});
console.log(
  "Product prototype uses actual catalog, editor, review and recovery UI with local fixtures."
);
