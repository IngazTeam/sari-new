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
    orderWorkspace: text.orderWorkspace,
    ordersPage: text.ordersPage,
    merchantUx: text.merchantUx,
  };
}
await build({
  entryPoints: [root + "order-preview.tsx"],
  outfile: "prototypes/tenant-dashboard/site/order-preview.js",
  bundle: true,
  jsx: "automatic",
  format: "iife",
  globalName: "OrderPreview",
  platform: "browser",
  target: ["es2022"],
  supported: { "template-literal": false },
  minify: true,
  legalComments: "none",
  alias: {
    "@/lib/trpc": path.resolve(root + "order-preview-api.ts"),
    "react-i18next": path.resolve(root + "order-preview-i18n.ts"),
  },
  define: {
    ORDER_PREVIEW_COPY: JSON.stringify(copy),
    "process.env.NODE_ENV": '"production"',
  },
});
console.log(
  "Order prototype uses the actual list, detail, review, cache and receipt UI with a memory-only adapter."
);
