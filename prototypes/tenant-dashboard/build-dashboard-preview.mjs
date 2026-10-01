import { build } from "esbuild";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { loadPreviewLocales } from "./preview-locales.mjs";
export const previewNamespaces = [
  "common",
  "merchantUx",
  "dashboardHomeUx",
  "dashboardAnalyticsUx",
  "dashboardSourcesUx",
  "knowledgeGroupsUx",
  "trialNoticeUx",
  "assistantScheduleStatusUx",
  "botSettingsPage",
];
const copy = await loadPreviewLocales(previewNamespaces);
await build({
  entryPoints: ["prototypes/tenant-dashboard/src/dashboard-preview.tsx"],
  outfile: "prototypes/tenant-dashboard/site/dashboard-preview.js",
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
      "prototypes/tenant-dashboard/src/dashboard-preview-api.ts"
    ),
    "react-i18next": path.resolve(
      "prototypes/tenant-dashboard/src/dashboard-preview-i18n.ts"
    ),
    wouter: path.resolve(
      "prototypes/tenant-dashboard/src/dashboard-preview-router.tsx"
    ),
  },
  define: {
    DASHBOARD_PREVIEW_COPY: JSON.stringify(copy),
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
  "prototypes/tenant-dashboard/src/dashboard-preview.tsx",
  "client/src/pages/merchant/Dashboard.tsx",
  "client/src/components/merchant/DashboardAnalytics.tsx",
  "client/src/components/merchant/DashboardSources.tsx",
  "client/src/components/merchant/AssistantScheduleStatus.tsx",
  "client/src/components/merchant/WorkspaceState.tsx",
  "client/src/components/TrialBanner.tsx",
  "client/src/components/DashboardSkeleton.tsx",
  "client/src/components/LearningEvidenceCard.tsx",
  "client/src/components/QueryStateCard.tsx",
  ...readdirSync("client/src/components/ui")
    .filter(f => f.endsWith(".tsx"))
    .map(f => "client/src/components/ui/" + f),
])
  for (const token of readFileSync(file, "utf8").match(/[^\s"'`<>]+/g) || [])
    candidates.add(token);
writeFileSync(
  "prototypes/tenant-dashboard/site/dashboard-preview.css",
  compiler.build([...candidates]) +
    readFileSync("client/src/styles/merchant-workspace.css", "utf8") +
    readFileSync("client/src/styles/merchant-mobile.css", "utf8") +
    "\nbody.merchant-surface{width:100%;max-width:none;margin:0;border:0;border-radius:0;box-shadow:none}"
);
console.log("Dashboard preview built from the actual page.");
