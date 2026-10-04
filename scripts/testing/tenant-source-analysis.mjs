import ts from "typescript";

export function walkSource(node, visit) {
  visit(node);
  ts.forEachChild(node, child => walkSource(child, visit));
}

// Follow runtime module edges, including barrel re-exports. Never execute imports.
export function runtimeModuleReferences(ast) {
  const modules = new Set();
  walkSource(ast, node => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (clause?.isTypeOnly) return;
      const bindings = clause?.namedBindings;
      if (clause && !clause.name && bindings && ts.isNamedImports(bindings) &&
          bindings.elements.every(entry => entry.isTypeOnly)) return;
      modules.add(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && !node.isTypeOnly &&
               node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause) &&
          node.exportClause.elements.every(entry => entry.isTypeOnly)) return;
      modules.add(node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
               node.arguments.length && ts.isStringLiteral(node.arguments[0])) {
      modules.add(node.arguments[0].text);
    }
  });
  return [...modules];
}

// Static provenance only: resolve utility aliases/ref holders, never execute source.
// Calls which cannot be traced to useUtils remain visible as unresolved candidates.
export function imperativeReads(ast) {
  const aliases = new Map();
  function resolve(node, seen = new Set()) {
    if (!node) return null;
    if (
      ts.isAsExpression(node) ||
      ts.isParenthesizedExpression(node) ||
      ts.isNonNullExpression(node)
    )
      return resolve(node.expression, seen);
    if (ts.isIdentifier(node)) {
      if (seen.has(node.text)) return null;
      const next = new Set(seen).add(node.text);
      return resolve(aliases.get(node.text), next);
    }
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(ast);
      if (/^trpc\.(?:useUtils|useContext)$/.test(name)) return { path: [] };
      if (/^(?:React\.)?useRef$/.test(name))
        return { fields: { current: resolve(node.arguments[0], seen) } };
    }
    if (ts.isObjectLiteralExpression(node)) {
      return {
        fields: Object.fromEntries(
          node.properties.flatMap(property => {
            if (ts.isShorthandPropertyAssignment(property))
              return [[property.name.text, resolve(property.name, seen)]];
            if (ts.isPropertyAssignment(property))
              return [
                [
                  property.name.getText(ast).replace(/^['"]|['"]$/g, ""),
                  resolve(property.initializer, seen),
                ],
              ];
            return [];
          })
        ),
      };
    }
    if (ts.isPropertyAccessExpression(node)) {
      const parent = resolve(node.expression, seen);
      if (parent?.path) return { path: [...parent.path, node.name.text] };
      return parent?.fields?.[node.name.text] || null;
    }
    return null;
  }
  walkSource(ast, node => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    )
      aliases.set(node.name.text, node.initializer);
  });
  const result = [];
  walkSource(ast, node => {
    if (
      !ts.isCallExpression(node) ||
      !ts.isPropertyAccessExpression(node.expression)
    )
      return;
    const method = node.expression.name.text;
    if (!["fetch", "fetchInfinite", "ensureData"].includes(method)) return;
    const resolved = resolve(node.expression.expression);
    const procedure =
      resolved?.path?.length >= 2 ? resolved.path.join(".") : null;
    result.push({
      procedure,
      method,
      expression: node.expression.getText(ast),
      line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
      provenance: procedure
        ? "trpc-utility-static"
        : "unresolved-static-candidate",
    });
  });
  return result;
}

export function routeComponentImports(ast, resolveFile) {
  const imports = {};
  walkSource(ast, node => {
    if (
      ts.isImportDeclaration(node) &&
      node.importClause &&
      !node.importClause.isTypeOnly &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const file = resolveFile(node.moduleSpecifier.text);
      if (!file) return;
      if (node.importClause.name) imports[node.importClause.name.text] = file;
      const bindings = node.importClause.namedBindings;
      if (bindings && ts.isNamedImports(bindings))
        for (const entry of bindings.elements)
          if (!entry.isTypeOnly) imports[entry.name.text] = file;
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      // Supports multiline lazy/lazyLoad and either quote style.
      walkSource(node.initializer, child => {
        if (
          ts.isCallExpression(child) &&
          child.expression.kind === ts.SyntaxKind.ImportKeyword &&
          child.arguments.length === 1 &&
          ts.isStringLiteral(child.arguments[0])
        ) {
          const file = resolveFile(child.arguments[0].text);
          if (file) imports[node.name.text] = file;
        }
      });
    }
  });
  return imports;
}

export function browserRequests(ast) {
  const requests = [];
  walkSource(ast, node => {
    if (
      !ts.isCallExpression(node) ||
      !["fetch", "window.fetch", "globalThis.fetch"].includes(
        node.expression.getText(ast)
      )
    )
      return;
    const [url, options] = node.arguments;
    const method =
      options && ts.isObjectLiteralExpression(options)
        ? options.properties.find(
            p =>
              ts.isPropertyAssignment(p) &&
              p.name.getText(ast).replace(/['"]/g, "") === "method"
          )?.initializer
        : undefined;
    requests.push({
      line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
      target: url && ts.isStringLiteral(url) ? url.text : null,
      targetExpression: url?.getText(ast).slice(0, 200) || "",
      method:
        method && ts.isStringLiteral(method)
          ? method.text
          : options
            ? "dynamic-or-default"
            : "GET",
      provenance: "browser-fetch-static",
    });
  });
  return requests;
}
