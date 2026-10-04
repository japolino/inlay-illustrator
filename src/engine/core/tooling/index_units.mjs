
import fs from "node:fs";
import * as acorn from "acorn";
import * as eslintScope from "eslint-scope";
const src = fs.readFileSync("C:/Users/eme4/asset-maid-port/AssetMaid.pretty.js", "utf8");
const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "script", ranges: true, locations: true });
const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: "script", childVisitorKeys: undefined, fallback: "iteration" });
const iife = ast.body.find(s => s.type === "ExpressionStatement").expression.callee;
const body = iife.body.body;
const units = [];
for (const st of body) {
  if (st.type === "VariableDeclaration") {
    for (const d of st.declarations) units.push({ kind: st.kind, node: d, start: d.start, end: d.end, line: d.loc.start.line, endLine: d.loc.end.line, names: d.id.type === "Identifier" ? [d.id.name] : ["<pattern>"] });
  } else if (st.type === "FunctionDeclaration" || st.type === "ClassDeclaration") {
    units.push({ kind: st.type === "FunctionDeclaration" ? "function" : "class", node: st, start: st.start, end: st.end, line: st.loc.start.line, endLine: st.loc.end.line, names: [st.id.name] });
  } else {
    units.push({ kind: "stmt:" + st.type, node: st, start: st.start, end: st.end, line: st.loc.start.line, endLine: st.loc.end.line, names: [] });
  }
}
const starts = units.map(u => u.start);
function unitAt(pos) { let lo = 0, hi = units.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (starts[m] <= pos) { ans = m; lo = m + 1; } else hi = m - 1; } return ans >= 0 && pos < units[ans].end ? ans : -1; }
const fnScope = sm.acquire(iife);
const nameToUnit = new Map();
units.forEach((u, i) => u.names.forEach(n => nameToUnit.set(n, i)));
const deps = units.map(() => new Set());
const writesOutside = [];
for (const v of fnScope.variables) {
  const declUnit = nameToUnit.get(v.name);
  for (const ref of v.references) {
    const u = unitAt(ref.identifier.start);
    if (u < 0) continue;
    if (declUnit !== undefined && u !== declUnit) deps[u].add(declUnit);
    if (ref.isWrite() && u !== declUnit && !ref.init) writesOutside.push({ name: v.name, unit: u, line: ref.identifier.loc.start.line });
  }
}
// globals (through refs) per unit
const globals = units.map(() => new Set());
for (const sc of sm.scopes) for (const ref of sc.through) { if (ref.resolved) continue; const u = unitAt(ref.identifier.start); if (u >= 0) globals[u].add(ref.identifier.name); }
const out = units.map((u, i) => ({ i, kind: u.kind, names: u.names, start: u.start, end: u.end, line: u.line, endLine: u.endLine, deps: [...deps[i]], globals: [...globals[i]] }));
fs.writeFileSync("C:/Users/eme4/asset-maid-port/scratch/engine/units.json", JSON.stringify({ units: out, writesOutside }));
console.log(units.length, writesOutside.length, fnScope.variables.length);
