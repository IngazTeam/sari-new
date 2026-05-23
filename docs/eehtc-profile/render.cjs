const fs = require("node:fs");
const path = require("node:path");

function loadPlaywright() {
  const runtimeModules =
    process.env.CODEX_RUNTIME_NODE_MODULES ||
    "C:\\Users\\ingaz\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules";
  process.env.NODE_PATH = [
    process.env.NODE_PATH,
    runtimeModules,
    path.join(runtimeModules, ".pnpm", "playwright-core@1.60.0", "node_modules"),
  ]
    .filter(Boolean)
    .join(path.delimiter);
  require("node:module").Module._initPaths();
  return require("playwright");
}

async function main() {
  const { chromium } = loadPlaywright();
  const baseDir = __dirname;
  const htmlPath = path.join(baseDir, "profile.html");
  const outputDir = path.join(baseDir, "output");
  fs.mkdirSync(outputDir, { recursive: true });

  const executablePath =
    process.env.CHROME_EXECUTABLE_PATH ||
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

  const browser = await chromium.launch({
    headless: true,
    executablePath,
  });
  const page = await browser.newPage({
    viewport: { width: 900, height: 1280 },
    deviceScaleFactor: 2,
  });

  await page.goto(`file:///${htmlPath.replace(/\\/g, "/")}`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const pdfPath = path.join(outputDir, "eehtc-mini-profile.pdf");
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
  });

  const pages = await page.$$(".page");
  for (let index = 0; index < pages.length; index += 1) {
    await pages[index].screenshot({
      path: path.join(outputDir, `eehtc-mini-profile-page-${index + 1}.jpg`),
      type: "jpeg",
      quality: 96,
    });
  }

  await browser.close();
  console.log(`PDF: ${pdfPath}`);
  console.log(`JPG pages: ${pages.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
