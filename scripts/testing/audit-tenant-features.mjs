// Reproducible source inventory. A discovered control is NOT proof of UX/functional coverage.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import ts from "typescript";
import vm from "node:vm";
import {
  browserRequests,
  imperativeReads,
  routeComponentImports,
} from "./tenant-source-analysis.mjs";

const output = process.argv[2] || "docs/audits/tenant-features-2026-09-30";
const sourceRoot = "client/src";
const locale = JSON.parse(
  fs.readFileSync(`${sourceRoot}/locales/ar.json`, "utf8")
);
const translate = key => key.split(".").reduce((o, k) => o?.[k], locale);
const context = { window: {} };
vm.runInNewContext(
  fs.readFileSync("prototypes/tenant-dashboard/site/page-catalog.js", "utf8"),
  context
);
const catalog = context.window.TENANT_PAGES;
const cache = new Map();
const normalize = file => file.replaceAll("\\", "/");
const hash = text =>
  crypto
    .createHash("sha256")
    .update(text.replace(/\r\n/g, "\n"))
    .digest("hex")
    .slice(0, 12);
function resolve(file, specifier) {
  const base = specifier.startsWith("@/")
    ? `${sourceRoot}/${specifier.slice(2)}`
    : specifier.startsWith(".")
      ? path.join(path.dirname(file), specifier)
      : null;
  return (
    base &&
    [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]
      .map(normalize)
      .find(p => fs.existsSync(p) && fs.statSync(p).isFile())
  );
}
const opening = node =>
  ts.isJsxElement(node)
    ? node.openingElement
    : ts.isJsxSelfClosingElement(node)
      ? node
      : null;
const walk = (node, fn) => {
  fn(node);
  ts.forEachChild(node, child => walk(child, fn));
};
function analyze(file) {
  if (cache.has(file)) return cache.get(file);
  const source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  const result = {
    file,
    hash: hash(source),
    imports: [],
    controls: [],
    queries: [],
    mutations: [],
    imperativeReads: imperativeReads(ast),
    browserRequests: browserRequests(ast),
    links: [],
    sections: [],
    choices: [],
    handlers: [],
    queryStates: [],
    conditions: [],
  };
  cache.set(file, result);
  const raw = node => node?.getText(ast) || "";
  const attr = (node, name) => {
    const value = opening(node)?.attributes.properties.find(
      a => a.name?.getText(ast) === name
    )?.initializer;
    return value && ts.isStringLiteral(value)
      ? value.text
      : value && ts.isJsxExpression(value)
        ? raw(value.expression)
        : "";
  };
  function text(node) {
    if (!node) return "";
    if (ts.isJsxText(node)) return node.text.replace(/\s+/g, " ").trim();
    if (ts.isStringLiteral(node)) return node.text;
    if (
      ts.isCallExpression(node) &&
      /(?:^|\.)t$/.test(raw(node.expression)) &&
      ts.isStringLiteral(node.arguments[0])
    )
      return translate(node.arguments[0].text) || "";
    const parts = [];
    ts.forEachChild(node, n => {
      if (
        !ts.isJsxOpeningElement(n) &&
        !ts.isJsxSelfClosingElement(n) &&
        !ts.isJsxClosingElement(n)
      ) {
        const s = text(n);
        if (s) parts.push(s);
      }
    });
    return [...new Set(parts)].join(" ").trim();
  }
  const value = node => {
    if (!node) return null;
    if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
    if (ts.isAsExpression(node)) return value(node.expression);
    if (ts.isArrayLiteralExpression(node)) return node.elements.map(value);
    if (ts.isObjectLiteralExpression(node))
      return Object.fromEntries(
        node.properties
          .filter(ts.isPropertyAssignment)
          .map(p => [
            p.name.getText(ast).replace(/['"]/g, ""),
            value(p.initializer),
          ])
      );
    if (
      ts.isCallExpression(node) &&
      raw(node.expression) === "t" &&
      ts.isStringLiteral(node.arguments[0])
    )
      return translate(node.arguments[0].text) || node.arguments[0].text;
    return raw(node).slice(0, 160);
  };
  const labels = new Map();
  walk(ast, node => {
    const tag = raw(opening(node)?.tagName);
    if (["Label", "label"].includes(tag)) {
      const id = attr(node, "htmlFor");
      if (id) labels.set(id, text(node));
    }
  });
  walk(ast, node => {
    if (ts.isImportDeclaration(node)) {
      const target = resolve(file, node.moduleSpecifier.text);
      if (
        !node.importClause?.isTypeOnly &&
        target?.startsWith(`${sourceRoot}/`) &&
        /\.tsx?$/.test(target) &&
        !/\/ui\/|DashboardLayout|WorkspaceState|QueryStateCard|\/lib\/trpc\.ts$/.test(
          target
        )
      )
        result.imports.push(target);
    }
    if (ts.isVariableDeclaration(node) && node.initializer) {
      const init = ts.isAsExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;
      if (
        ts.isArrayLiteralExpression(init) &&
        init.elements.length &&
        init.elements.length < 60
      )
        result.choices.push({
          name: raw(node.name),
          line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
          values: value(init),
        });
      if (
        ts.isArrowFunction(init) &&
        /handle|save|submit|delete|remove|create|update|open|close|select|toggle|confirm|edit/i.test(
          raw(node.name)
        )
      )
        result.handlers.push({
          name: raw(node.name),
          line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
          calls: [
            ...new Set(
              [
                ...raw(init).matchAll(/([\w.]+)\.(?:mutate|mutateAsync)\(/g),
              ].map(m => m[1])
            ),
          ],
        });
    }
    if (ts.isCallExpression(node)) {
      const match = raw(node.expression).match(
        /^trpc\.([\w.]+)\.(useQuery|useMutation|useInfiniteQuery)$/
      );
      if (match) {
        result[match[2] === "useMutation" ? "mutations" : "queries"].push(
          match[1]
        );
        if (match[2] !== "useMutation") {
          const declaration = ts.isVariableDeclaration(node.parent)
              ? node.parent
              : null,
            binding = declaration ? raw(declaration.name) : "";
          const names =
            declaration && ts.isObjectBindingPattern(declaration.name)
              ? declaration.name.elements
                  .filter(n =>
                    /error|isError/.test(raw(n.propertyName) || raw(n.name))
                  )
                  .map(n => raw(n.name))
              : [];
          result.queryStates.push({
            query: match[1],
            binding,
            line:
              ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
            errorSignal:
              names.length > 0 ||
              Boolean(
                binding &&
                new RegExp(
                  `\\b${binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(?:error|isError)\\b`
                ).test(source)
              ),
            loadingSignal:
              /isLoading|isPending/.test(binding) ||
              Boolean(binding && source.includes(`${binding}.isLoading`)),
            enabled:
              raw(node.arguments[1]).match(/enabled:\s*([^,}\n]+)/)?.[1] ||
              null,
          });
        }
      }
    }
    if (ts.isStringLiteral(node) && node.text.startsWith("/merchant"))
      result.links.push({
        target: node.text,
        line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
      });
    const tag = raw(opening(node)?.tagName);
    if (!tag) return;
    if (
      /^(CardTitle|DialogTitle|SheetTitle|AlertDialogTitle|h[123]|summary|TabsTrigger)$/.test(
        tag
      )
    )
      result.sections.push({
        label: text(node),
        line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
        tag,
      });
    const kind =
      /^(Input|input|Textarea|textarea|Select|select|Switch|Checkbox|checkbox|RadioGroup|Slider|Calendar|DatePicker|FileUpload)$/.test(
        tag
      )
        ? "field"
        : /^(Button|button|TabsTrigger|DropdownMenuItem|AlertDialogAction|AlertDialogCancel|ToggleGroupItem|Link|a|summary)$/.test(
              tag
            ) ||
            [
              "radio",
              "button",
              "tab",
              "link",
              "checkbox",
              "switch",
              "option",
              "menuitem",
            ].includes(attr(node, "role"))
          ? "action"
          : /^(DialogContent|AlertDialogContent|SheetContent)$/.test(tag)
            ? "dialog"
            : null;
    if (!kind) return;
    const line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
    let label = labels.get(attr(node, "id")) || "";
    let ancestor = node.parent;
    for (
      let i = 0;
      i < 3 && ancestor && !label;
      i++, ancestor = ancestor.parent
    ) {
      if (/^(label|Label)$/.test(raw(opening(ancestor)?.tagName)))
        label = text(ancestor);
      else if (ts.isJsxElement(ancestor)) {
        const sibling = ancestor.children.find(n =>
          /^(Label|label)$/.test(raw(opening(n)?.tagName))
        );
        if (sibling) label = text(sibling);
      }
    }
    label ||=
      attr(node, "aria-label").replace(
        /^t\(['"]([^'"]+)['"].*$/,
        (_, k) => translate(k) || ""
      ) ||
      (kind !== "field" ? text(node) : "") ||
      attr(node, "placeholder").replace(
        /^t\(['"]([^'"]+)['"].*$/,
        (_, k) => translate(k) || ""
      );
    const options = [];
    walk(node, child => {
      if (
        /^(SelectItem|option|RadioGroupItem)$/.test(
          raw(opening(child)?.tagName)
        )
      )
        options.push({ value: attr(child, "value"), label: text(child) });
    });
    const binding =
      attr(node, "name") ||
      attr(node, "value") ||
      attr(node, "checked") ||
      attr(node, "onClick") ||
      attr(node, "onCheckedChange") ||
      attr(node, "onChange") ||
      attr(node, "href");
    const section =
      result.sections.filter(s => s.line <= line).at(-1)?.label ||
      path.basename(file, ".tsx");
    const conditions = [];
    let parent = node.parent;
    for (let depth = 0; parent && depth < 10; depth++, parent = parent.parent) {
      if (ts.isConditionalExpression(parent))
        conditions.push(raw(parent.condition));
      if (
        ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
      )
        conditions.push(raw(parent.left));
    }
    result.controls.push({
      id: hash(`${file}:${kind}:${binding || tag}:${line}`),
      file,
      line,
      tag,
      role: attr(node, "role"),
      kind,
      label: label.slice(0, 220),
      section,
      binding,
      type:
        attr(node, "type") ||
        (/Switch|Checkbox/.test(tag)
          ? "checkbox"
          : tag === "Textarea"
            ? "textarea"
            : tag === "Select"
              ? "select"
              : "text"),
      options,
      min: attr(node, "min"),
      max: attr(node, "max"),
      maxLength: attr(node, "maxLength"),
      required: opening(node).attributes.properties.some(
        a => a.name?.getText(ast) === "required"
      ),
      conditional: /&&|\?|map\(/.test(raw(node.parent)),
      conditions,
      disabled: attr(node, "disabled"),
      review: "source-inventoried",
    });
  });
  result.queries.push(
    ...result.imperativeReads.flatMap(call =>
      call.procedure ? [call.procedure] : []
    )
  );
  for (const key of ["imports", "queries", "mutations"])
    result[key] = [...new Set(result[key])];
  return result;
}
const appFile = `${sourceRoot}/App.tsx`,
  app = fs.readFileSync(appFile, "utf8");
const ast = ts.createSourceFile(
  appFile,
  app,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const imports = routeComponentImports(ast, specifier =>
  resolve(appFile, specifier)
);
const routes = [];
walk(ast, node => {
  const o = opening(node);
  if (o?.tagName.getText(ast) !== "Route") return;
  const p = o.attributes.properties.find(
    a => a.name?.getText(ast) === "path"
  )?.initializer;
  if (!p || !ts.isStringLiteral(p) || !p.text.startsWith("/merchant")) return;
  const body = node.getText(ast),
    route = p.text;
  const names = [
    ...new Set(
      [
        body.match(/component=\{(\w+)\}/)?.[1],
        ...[...body.matchAll(/<(\w+)[\s/>]/g)].map(m => m[1]),
      ].filter(n => imports[n] && !/DashboardLayout|ProtectedRoute/.test(n))
    ),
  ];
  const name = names[0];
  const files = new Set();
  const collect = file => {
    if (!file || files.has(file)) return;
    files.add(file);
    for (const dependency of analyze(file).imports) collect(dependency);
  };
  for (const entry of names) collect(imports[entry]);
  const page = catalog.find(p => p.route === route);
  routes.push({
    route,
    title: page?.title || name || route,
    redirect: body.match(/<Redirect\s+to="([^"]+)"/)?.[1],
    prototype: Boolean(page),
    entryComponents: names,
    files: [...files],
    controls: [...files].flatMap(file => analyze(file).controls).map(c => c.id),
    queries: [...new Set([...files].flatMap(f => analyze(f).queries))],
    mutations: [...new Set([...files].flatMap(f => analyze(f).mutations))],
    imperativeReads: [...files].flatMap(file =>
      analyze(file).imperativeReads.map(call => ({ file, ...call }))
    ),
    browserRequests: [...files].flatMap(file =>
      analyze(file).browserRequests.map(call => ({ file, ...call }))
    ),
  });
});
const match = target =>
  routes.some(r =>
    new RegExp(`^${r.route.replace(/:[^/]+/g, "[^/]+")}/?$`).test(
      target.split(/[?#]/)[0]
    )
  );
const sharedSurfaces = ["client/src/components/merchant/MerchantShell.tsx"];
for (const file of sharedSurfaces.filter(fs.existsSync)) {
  const collect = f => {
    const item = analyze(f);
    for (const dependency of item.imports)
      if (!cache.has(dependency)) collect(dependency);
  };
  collect(file);
}
const files = [...cache.values()];
const controls = files.flatMap(f => f.controls);
const orphanFiles = fs
  .readdirSync(`${sourceRoot}/pages/merchant`)
  .filter(f => f.endsWith(".tsx"))
  .map(f => `${sourceRoot}/pages/merchant/${f}`)
  .filter(f => !cache.has(f));
const reachableApis = new Set(
  files.flatMap(f => [...f.queries, ...f.mutations])
);
const orphanDetails = orphanFiles.map(file => {
  const item = analyze(file);
  return {
    file,
    controls: item.controls.length,
    queries: item.queries,
    mutations: item.mutations,
    unmatchedApis: [...item.queries, ...item.mutations].filter(
      api => !reachableApis.has(api)
    ),
    status: "unrouted-legacy-candidate; do not delete without checking imports",
  };
});
const invalidLinks = files.flatMap(f =>
  f.links.filter(l => !match(l.target)).map(l => ({ file: f.file, ...l }))
);
const inventory = {
  generatedAt: new Date().toISOString(),
  scope:
    "Static JSX, local TS/TSX dependencies, query/mutation hooks, traced imperative utility reads, browser fetches and unresolved read candidates, semantic role controls, static choices, conditional controls and literal merchant links. Generic UI primitives are excluded. Dynamic imports outside App, computed routes, lexical shadowing, dynamic controls, permissions, provider states and runtime behavior require separate review; no runtime completeness claim.",
  routeCount: routes.length,
  sharedSurfaces,
  files: files.map(({ imports, links, controls, ...file }) => ({
    ...file,
    imports,
    controlCount: controls.length,
  })),
  routes,
  controls,
  orphanFiles,
  orphanDetails,
  invalidLinks,
};
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(
  `${output}/inventory.json`,
  `${JSON.stringify(inventory, null, 2)}\n`
);
const escape = s => String(s).replaceAll("|", "\\|").replaceAll("\n", " ");
const lines = [
  "# سجل صفحات وخصائص التيننت",
  "",
  "هذا حصر مصدر قابل لإعادة التوليد، وليس ادعاءً بأن كل مسار عمل اختُبر أو أُعيد تصميمه. يشمل المكونات الفرعية المحلية، الحقول، الأزرار، النوافذ، التبويبات، واجهات القراءة والتعديل. العناصر الديناميكية تحتاج مراجعة إضافية.",
  "",
  `- ${routes.length} مسارًا مسجلًا، ${files.length} ملف واجهة متصلًا، ${controls.length} عنصر تحكم في المصدر.`,
  `- ${invalidLinks.length} رابطًا حرفيًا غير مطابق، و${orphanFiles.length} ملف صفحة غير متصل بالمسارات المحصورة.`,
  "",
  "| الصفحة | الملفات | عناصر التحكم | القراءة / التعديل | موك أب للصفحة |",
  "|---|---:|---:|---:|---|",
  ...routes.map(
    r =>
      `| ${r.route} — ${escape(r.title)} | ${r.files.length} | ${r.controls.length} | ${r.queries.length} / ${r.mutations.length} | ${r.prototype ? "موجود؛ عمق الخصائص يحتاج مطابقة" : "غير موجود"} |`
  ),
  "",
  "## روابط تحتاج مراجعة",
  ...invalidLinks.map(l => `- ${l.file}:${l.line} → ${l.target}`),
  "",
  "## ملفات غير متصلة",
  ...orphanFiles.map(f => `- ${f}`),
];
for (const file of files.filter(f => f.controls.length))
  lines.push(
    "",
    `## ${file.file}`,
    "",
    "| السطر | النوع | التسمية | القسم |",
    "|---:|---|---|---|",
    ...file.controls.map(
      c =>
        `| ${c.line} | ${c.tag} | ${escape(c.label || "تسمية ديناميكية / تحتاج مراجعة")} | ${escape(c.section)} |`
    )
  );
fs.writeFileSync(`${output}/FEATURE_REGISTER.md`, `${lines.join("\n")}\n`);
console.log(
  JSON.stringify(
    {
      routes: routes.length,
      files: files.length,
      controls: controls.length,
      unlabeled: controls.filter(c => !c.label).length,
      invalidLinks,
      orphanFiles,
    },
    null,
    2
  )
);
