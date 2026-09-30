import { build } from "esbuild";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
const require = createRequire(import.meta.url),
  root = "prototypes/tenant-dashboard/src/",
  copy = {};
for (const language of ["ar", "en"]) {
  const text = JSON.parse(
    readFileSync(`client/src/locales/${language}.json`, "utf8")
  );
  copy[language] = {
    productImportUx: text.productImportUx,
    productAdviceUx: text.productAdviceUx,
    productWorkspaceUx: text.productWorkspaceUx,
    uploadProductsPage: { viewProducts: text.uploadProductsPage.viewProducts },
  };
}
// Reuse the browser Buffer package already installed by the pinned pnpm lockfile.
const buffers = readdirSync("node_modules/.pnpm").filter(name =>
  /^buffer@\d/.test(name)
);
if (buffers.length !== 1)
  throw Error("Resolve the installed browser Buffer dependency explicitly");
await build({
  entryPoints: [root + "import-preview.tsx"],
  outfile: "prototypes/tenant-dashboard/site/import-preview.js",
  bundle: true,
  jsx: "automatic",
  format: "iife",
  globalName: "ImportPreview",
  platform: "browser",
  target: ["es2022"],
  supported: { "template-literal": false },
  minify: true,
  legalComments: "none",
  inject: [root + "import-preview-buffer.ts"],
  alias: {
    "@/lib/trpc": path.resolve(root + "import-preview-api.ts"),
    "react-i18next": path.resolve(root + "import-preview-i18n.ts"),
    "node:crypto": path.resolve(root + "import-preview-crypto.ts"),
    exceljs: require.resolve("exceljs/dist/exceljs.min.js"),
    buffer: path.resolve(
      "node_modules/.pnpm",
      buffers[0],
      "node_modules/buffer/index.js"
    ),
  },
  define: {
    IMPORT_PREVIEW_COPY: JSON.stringify(copy),
    "process.env.NODE_ENV": '"production"',
  },
});
console.log(
  "Import prototype uses the actual workspace and file parser, with isolated simulated writes and receipts."
);
