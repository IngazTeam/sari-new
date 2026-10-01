import { build } from "esbuild";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
const copy = Object.fromEntries(
  ["ar", "en"].map(lang => {
    const all = JSON.parse(
      readFileSync(`client/src/locales/${lang}.json`, "utf8")
    );
    return [
      lang,
      Object.fromEntries(
        [
          "brainPreviewUx",
          "sariPlayground",
          "testSariPage",
          "playgroundRepairUx",
        ].map(key => [key, all[key]])
      ),
    ];
  })
);
await build({
  entryPoints: ["prototypes/tenant-dashboard/src/brain-preview.tsx"],
  outfile: "prototypes/tenant-dashboard/site/brain-preview.js",
  bundle: true,
  jsx: "automatic",
  format: "iife",
  platform: "browser",
  target: ["es2022"],
  supported: { "template-literal": false },
  minify: true,
  legalComments: "none",
  alias: {
    "@/lib/knowledge-workspace-cache": path.resolve("prototypes/tenant-dashboard/src/brain-preview-cache.ts"),
    "@/lib/trpc": path.resolve(
      "prototypes/tenant-dashboard/src/brain-preview-api.ts"
    ),
    wouter: path.resolve(
      "prototypes/tenant-dashboard/src/brain-preview-router.tsx"
    ),
    "react-i18next": path.resolve(
      "prototypes/tenant-dashboard/src/brain-preview-i18n.ts"
    ),
  },
  define: {
    BRAIN_PREVIEW_COPY: JSON.stringify(copy),
    "process.env.NODE_ENV": '"production"',
  },
});
const require = createRequire(import.meta.url),
  tw = createRequire(require.resolve("@tailwindcss/vite"));
const { compile } = tw("@tailwindcss/node");
const compiler = await compile(
  readFileSync("client/src/index.css", "utf8").replace(
    '@import "tailwindcss";',
    '@import "tailwindcss" source(none);'
  ),
  { base: path.resolve("client/src"), onDependency() {} }
);
const candidates = new Set();
for (const file of [
  "client/src/components/BrainQuickPreview.tsx",
  "client/src/pages/SariPlayground.tsx",
  "prototypes/tenant-dashboard/src/brain-preview.tsx",
  ...readdirSync("client/src/components/ui")
    .filter(f => f.endsWith(".tsx"))
    .map(f => "client/src/components/ui/" + f),
])
  for (const token of readFileSync(file, "utf8").match(/[^\s"'`<>]+/g) || [])
    candidates.add(token);
writeFileSync(
  "prototypes/tenant-dashboard/site/brain-preview.css",
  compiler.build([...candidates]) +
    readFileSync("client/src/styles/merchant-workspace.css", "utf8") +
    readFileSync("client/src/styles/merchant-mobile.css", "utf8") +
    "\nbody.merchant-surface{width:100%;max-width:none;margin:0;border:0;border-radius:0;box-shadow:none}"
);
console.log("Quick test preview built from the actual component.");
