import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import postcss from "postcss";
import { loadPreviewLocales } from "./preview-locales.mjs";
const copy = await loadPreviewLocales([
  "analyticsHubUx",
  "merchantToolsUx",
  "merchantNavigationUx",
  "merchantShellUx",
]);
await build({
  entryPoints: ["prototypes/tenant-dashboard/src/tools-preview.tsx"],
  outfile: "prototypes/tenant-dashboard/site/tools-preview.js",
  bundle: true,
  jsx: "automatic",
  format: "iife",
  globalName: "ToolsPreview",
  platform: "browser",
  target: ["es2022"],
  minify: true,
  legalComments: "none",
  alias: {
    "react-i18next": path.resolve(
      "prototypes/tenant-dashboard/src/tools-preview-i18n.ts"
    ),
    wouter: path.resolve(
      "prototypes/tenant-dashboard/src/tools-preview-router.tsx"
    ),
  },
  define: {
    TOOLS_PREVIEW_COPY: JSON.stringify(copy),
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
  "client/src/components/merchant/MerchantToolsDirectory.tsx",
  "client/src/pages/merchant/AnalyticsHub.tsx",
  "prototypes/tenant-dashboard/src/tools-preview.tsx",
])
  for (const token of readFileSync(file, "utf8").match(/[^\s"'`<>]+/g) || [])
    candidates.add(token);
const css = postcss.parse(
  compiler.build([...candidates]) +
    readFileSync("client/src/styles/merchant-workspace.css", "utf8") +
    readFileSync("client/src/styles/merchant-mobile.css", "utf8")
);
css.walkRules(rule => {
  // Scope compiled utilities and application CSS; retain nested selectors and keyframes.
  if (
    rule.parent.type === "rule" ||
    (rule.parent.type === "atrule" && /keyframes$/.test(rule.parent.name))
  )
    return;
  rule.selectors = rule.selectors.map(selector => {
    const base = selector
      .replace(/body\.merchant-surface/g, ".tools-prototype")
      .replace(/:root|:host|\bhtml\b|\bbody\b/g, ".tools-prototype");
    return base.includes(".tools-prototype")
      ? base
      : ".tools-prototype " + base;
  });
});
writeFileSync(
  "prototypes/tenant-dashboard/site/tools-preview.css",
  css.toString() +
    "\n.tools-prototype{min-width:0;color:var(--foreground);text-align:start}.tools-prototype-note{padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--card);margin-bottom:24px;display:grid;gap:10px}.tools-prototype-note select{min-height:44px;font-size:16px;width:max-content;max-width:100%;border:1px solid var(--border);border-radius:8px;padding:8px}.tools-prototype button,.tools-prototype input,.tools-prototype select{font-family:inherit}.tools-prototype .mw-tools-reset{font-size:16px}\n"
);
// The prototype shell has unlayered paragraph styles; keep their palette out of
// the application component. Its root must not inherit the application's body card.
writeFileSync(
  "prototypes/tenant-dashboard/site/tools-preview.css",
  readFileSync("prototypes/tenant-dashboard/site/tools-preview.css", "utf8") +
    '\n.tools-prototype{width:100%;max-width:none;margin:0;border:0;border-radius:0;box-shadow:none;min-height:0;height:auto;font-family:inherit}.tools-prototype-note p,.tools-prototype .mw-tools-directory > [role="status"],.tools-prototype .mw-analytics-hub p{color:var(--muted-foreground)}\n'
);
console.log(
  "Tools preview built from the application directory, translations and scoped styles."
);
