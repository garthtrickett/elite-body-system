import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import ts from "typescript";

export async function checkConventions(root = resolve("src")): Promise<readonly string[]> {
  const issues: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "generated") continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) { await walk(path); continue; }
      if (!path.endsWith(".ts")) continue;
      const source = ts.createSourceFile(path, await readFile(path, "utf8"), ts.ScriptTarget.Latest, true);
      const label = relative(root, path);
      const currentFeature = label.split(sep)[0] === "features" ? label.split(sep)[1] : undefined;
      function visit(node: ts.Node): void {
        if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) issues.push(`${label}: no application classes`);
        if (node.kind === ts.SyntaxKind.AnyKeyword) issues.push(`${label}: use unknown and validate instead of any`);
        const declaration = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier : undefined;
        const dynamic = ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
        const module = declaration ?? dynamic;
        if (module && ts.isStringLiteral(module)) {
          const specifier = module.text;
          const target = relative(root, resolve(directory, specifier)).split(sep);
          if (target[0] === "features" && target[1] !== currentFeature &&
              !(target.length === 3 && ["index.ts", "browser.ts"].includes(target[2] ?? ""))) {
            issues.push(`${label}: import feature public entry points instead of ${specifier}`);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
  await walk(root);
  return issues;
}

if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  const issues = await checkConventions();
  if (issues.length) { console.error(issues.join("\n")); process.exitCode = 1; }
  else console.log("Conventions passed: no classes/any; feature interfaces respected");
}
