import { build } from "esbuild";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { loadPreviewLocales } from './preview-locales.mjs';
export const previewNamespaces = [
  "virtualTeamUx",
  "virtualTeamReview",
  "virtualTeamDraftUx",
  "virtualTeamReceiptUx",
  "personaPreviewUx",
  "testSariPage",
  "sariPlayground",
  "merchantUx"
];
const copy = await loadPreviewLocales(previewNamespaces);
await build({
  entryPoints: ["prototypes/tenant-dashboard/src/persona-preview.tsx"],
  outfile: "prototypes/tenant-dashboard/site/persona-preview.js",
  bundle: true,
  jsx: "automatic",
  format: "iife",
  platform: "browser",
  target: ["es2022"],
  supported: { "template-literal": false },
  minify: true,
  legalComments: "none",
  alias: {
    "@/lib/trpc": path.resolve(
      "prototypes/tenant-dashboard/src/persona-preview-api.ts"
    ),
    "react-i18next": path.resolve(
      "prototypes/tenant-dashboard/src/persona-preview-i18n.ts"
    ),
    wouter: path.resolve(
      "prototypes/tenant-dashboard/src/brain-preview-router.tsx"
    ),
  },
  define: {
    PERSONA_PREVIEW_COPY: JSON.stringify(copy),
    "process.env.NODE_ENV": '"production"',
  },
});
const require = createRequire(import.meta.url),
  tw = createRequire(require.resolve("@tailwindcss/vite")),
  { compile } = tw("@tailwindcss/node");
const compiler = await compile(
  readFileSync("client/src/index.css", "utf8").replace(
    '@import "tailwindcss";',
    '@import "tailwindcss" source(none);'
  ),
  { base: path.resolve("client/src"), onDependency() {} }
);
const candidates = new Set();
for (const file of [
  "prototypes/tenant-dashboard/src/persona-preview.tsx",
  "client/src/pages/merchant/VirtualTeamPage.tsx",
  "client/src/components/merchant/VirtualAgentReview.tsx",
  "client/src/components/merchant/AssistantReplyPreview.tsx",
  "client/src/components/merchant/WorkspaceState.tsx",
  "client/src/components/AgentAvatars.tsx",
  ...readdirSync("client/src/components/ui")
    .filter(f => f.endsWith(".tsx"))
    .map(f => "client/src/components/ui/" + f),
])
  for (const token of readFileSync(file, "utf8").match(/[^\s"'`<>]+/g) || [])
    candidates.add(token);
writeFileSync(
  "prototypes/tenant-dashboard/site/persona-preview.css",
  compiler.build([...candidates]) +
    readFileSync("client/src/styles/merchant-workspace.css", "utf8") +
    readFileSync("client/src/styles/merchant-mobile.css", "utf8") +
    "\nbody.merchant-surface{width:100%;max-width:none;margin:0;border:0;border-radius:0;box-shadow:none}"
);
console.log("Persona preview built from the actual editor.");
