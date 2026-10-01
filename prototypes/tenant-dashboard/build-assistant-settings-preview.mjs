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
          "common",
          "merchantUx",
          "virtualTeamReview",
          "assistantOptionUx",
          "assistantOptionDraftUx",
          "assistantSectionsUx",
          "humanTakeoverPage",
          "takeoverWorkspaceUx",
          "languageSettingsPage",
          "botSettingsPage",
          "assistantDraftUx",
          "assistantSettingsScopeUx",
          "assistantSettingsDraftUx",
          "assistantScheduleStatusUx",
          "assistantSettingsReviewUx",
          "assistantPersonalityUx",
          "assistantSaveUx",
          "botScheduleUx",
          "setupHoursUx",
          "personaPreviewUx",
          "testSariPage",
          "sariPlayground",
          "botTemplates",
        ].map(key => [key, all[key]])
      ),
    ];
  })
);
await build({
  entryPoints: [
    "prototypes/tenant-dashboard/src/assistant-settings-preview.tsx",
  ],
  outfile: "prototypes/tenant-dashboard/site/assistant-settings-preview.js",
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
      "prototypes/tenant-dashboard/src/assistant-settings-preview-api.ts"
    ),
    "react-i18next": path.resolve(
      "prototypes/tenant-dashboard/src/assistant-settings-preview-i18n.ts"
    ),
    wouter: path.resolve(
      "prototypes/tenant-dashboard/src/brain-preview-router.tsx"
    ),
  },
  define: {
    ASSISTANT_SETTINGS_PREVIEW_COPY: JSON.stringify(copy),
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
  "prototypes/tenant-dashboard/src/assistant-settings-preview.tsx",
  "client/src/pages/merchant/HumanTakeoverSettings.tsx",
  "client/src/pages/merchant/LanguageSettings.tsx",
  "client/src/pages/merchant/BotSettings.tsx",
  "client/src/components/DiscountPolicySettings.tsx",
  "client/src/components/CheckoutMarginPolicySettings.tsx",
  "client/src/components/merchant/AssistantDraftReview.tsx",
  "client/src/components/merchant/AssistantPersonalityFields.tsx",
  "client/src/components/merchant/AssistantReplyPreview.tsx",
  "client/src/components/merchant/AssistantScheduleStatus.tsx",
  "client/src/components/KnowledgeWorkspaceScope.tsx",
  "client/src/components/merchant/AssistantOptionReview.tsx",
  "client/src/components/merchant/AssistantOptionRecovery.tsx",
  "client/src/components/merchant/WorkspaceState.tsx",
  ...readdirSync("client/src/components/ui")
    .filter(f => f.endsWith(".tsx"))
    .map(f => "client/src/components/ui/" + f),
])
  for (const token of readFileSync(file, "utf8").match(/[^\s"'`<>]+/g) || [])
    candidates.add(token);
writeFileSync(
  "prototypes/tenant-dashboard/site/assistant-settings-preview.css",
  compiler.build([...candidates]) +
    readFileSync("client/src/styles/merchant-workspace.css", "utf8") +
    readFileSync("client/src/styles/merchant-mobile.css", "utf8") +
    "\nbody.merchant-surface{width:100%;max-width:none;margin:0;border:0;border-radius:0;box-shadow:none}"
);
console.log("Assistant settings preview built from the actual pages.");
