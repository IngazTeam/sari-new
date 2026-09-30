import { build } from "esbuild";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
const root = "prototypes/tenant-dashboard/src/",
  copy = {};
for (const language of ["ar", "en"]) {
  const text = JSON.parse(
    readFileSync(`client/src/locales/${language}.json`, "utf8")
  );
  copy[language] = Object.fromEntries(
    Object.entries(text).filter(
      ([key]) =>
        key.startsWith("setup") ||
        [
          "previewChat",
          "compPreviewChatPage",
          "merchantUx",
          "wizardBasicInfoStepPage",
          "publicUx",
          "common",
          "testSariUx",
          "testSariPage",
          "personalityStep",
          "languageStep",
          "businessTypeStep",
          "basicInfoStep",
          "productsServicesStep",
          "completeStep",
          "websiteStep",
          "templatesStep",
        ].includes(key)
    )
  );
  for (const [namespace, file] of [
    ["authUx", "auth-ux"],
    ["publicUx", "public-ux"],
    ["merchantUx", "merchant-ux"],
  ]) {
    const bundle = await build({
      entryPoints: [`client/src/locales/${file}.${language}.ts`],
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    copy[language][namespace] = (
      await import(
        "data:text/javascript;base64," +
          Buffer.from(bundle.outputFiles[0].text).toString("base64")
      )
    ).default;
  }
}
await build({
  entryPoints: [root + "setup-preview.tsx"],
  outfile: "prototypes/tenant-dashboard/site/setup-preview.js",
  bundle: true,
  jsx: "automatic",
  format: "iife",
  globalName: "SetupPreview",
  platform: "browser",
  target: ["es2022"],
  supported: { "template-literal": false },
  minify: true,
  legalComments: "none",
  external: ["*.woff2"],
  alias: {
    "@/lib/trpc": path.resolve(root + "setup-preview-api.ts"),
    "react-i18next": path.resolve(root + "setup-preview-i18n.ts"),
    "@/lib/i18n": path.resolve(root + "setup-preview-i18n.ts"),
    wouter: path.resolve(root + "setup-preview-router.ts"),
  },
  define: {
    SETUP_PREVIEW_COPY: JSON.stringify(copy),
    "process.env.NODE_ENV": '"production"',
  },
});
// The wizard uses app utility classes too. Compile the real theme rather than imitating them.
const require = createRequire(import.meta.url),
  tailwindRequire = createRequire(require.resolve("@tailwindcss/vite"));
const { compile } = tailwindRequire("@tailwindcss/node");
const source = readFileSync("client/src/index.css", "utf8").replace(
  '@import "tailwindcss";',
  '@import "tailwindcss" source(none);'
);
const compiler = await compile(source, {
  base: path.resolve("client/src"),
  onDependency() {},
});
const candidates = new Set();
function scan(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = path.join(dir, entry.name);
    if (entry.isDirectory()) scan(name);
    else if (/\.(tsx?|css)$/.test(name))
      for (const token of readFileSync(name, "utf8").match(/[^\s"'`<>]+/g) ||
        [])
        candidates.add(token);
  }
}
scan("client/src/components");
scan("client/src/pages/setup-wizard");
for (const token of readFileSync(
  "client/src/pages/SetupWizard.tsx",
  "utf8"
).match(/[^\s"'`<>]+/g) || [])
  candidates.add(token);
writeFileSync(
  "prototypes/tenant-dashboard/site/setup-utilities.css",
  compiler.build([...candidates])
);
console.log(
  "Setup prototype uses the actual wizard, validation, review and recovery screens with local providers."
);
