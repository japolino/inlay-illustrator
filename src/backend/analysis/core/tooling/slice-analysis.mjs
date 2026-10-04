
import fs from "node:fs";
import * as acorn from "acorn";
import * as eslintScope from "eslint-scope";
const SCR = "C:/Users/eme4/asset-maid-port/scratch/engine/";
const cfg = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const OUT = cfg.out;
const src = fs.readFileSync("C:/Users/eme4/asset-maid-port/AssetMaid.pretty.js", "utf8");
const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "script", ranges: true, locations: true });
const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: "script" });
const iife = ast.body.find(s => s.type === "ExpressionStatement").expression.callee;
const units = [];
for (const st of iife.body.body) {
  if (st.type === "VariableDeclaration") for (const d of st.declarations) units.push({ kind: st.kind, node: d, start: d.start, end: d.end, line: d.loc.start.line, names: d.id.type === "Identifier" ? [d.id.name] : [] });
  else if (st.type === "FunctionDeclaration" || st.type === "ClassDeclaration") units.push({ kind: "decl", node: st, start: st.start, end: st.end, line: st.loc.start.line, names: [st.id.name] });
  else {
    // port addition: top-level `for (var a = ..., b = ...)` statements declare names too (fflate tables in the bundle)
    const decl = (st.type === "ForStatement" ? st.init : (st.type === "ForInStatement" || st.type === "ForOfStatement") ? st.left : null);
    const names = decl && decl.type === "VariableDeclaration" ? decl.declarations.filter(d => d.id.type === "Identifier").map(d => d.id.name) : [];
    units.push({ kind: "stmt", node: st, start: st.start, end: st.end, line: st.loc.start.line, names });
  }
}
const starts = units.map(u => u.start);
function unitAt(pos) { let lo = 0, hi = units.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (starts[m] <= pos) { ans = m; lo = m + 1; } else hi = m - 1; } return ans >= 0 && pos < units[ans].end ? ans : -1; }
const fnScope = sm.acquire(iife);
const nameToUnit = new Map(); units.forEach((u, i) => u.names.forEach(n => nameToUnit.set(n, i)));
const deps = units.map(() => new Set());
const writers = new Map();
const refsByUnit = units.map(() => []);
for (const v of fnScope.variables) {
  const du = nameToUnit.get(v.name);
  for (const ref of v.references) {
    const u = unitAt(ref.identifier.start); if (u < 0) continue;
    refsByUnit[u].push({ id: ref.identifier, name: v.name });
    if (du !== undefined && u !== du) deps[u].add(du);
    if (ref.isWrite() && u !== du && !ref.init && units[u].kind === "stmt") { if (!writers.has(v.name)) writers.set(v.name, new Set()); writers.get(v.name).add(u); }
  }
  // declaration identifiers (defs)
  for (const def of v.defs) { const u = unitAt(def.name.start); if (u >= 0 && !refsByUnit[u].some(r => r.id === def.name)) refsByUnit[u].push({ id: def.name, name: v.name }); }
}
const globalsByUnit = units.map(() => []);
for (const sc of sm.scopes) for (const ref of sc.through) { if (ref.resolved) continue; const u = unitAt(ref.identifier.start); if (u >= 0) globalsByUnit[u].push(ref.identifier); }
// closure
const externals = cfg.externals ?? {};
const stop = new Set([...(cfg.stop ?? []), ...Object.keys(externals)]);
const seen = new Set(); const stack = cfg.roots.map(r => { const i = nameToUnit.get(r); if (i === undefined) throw new Error("no root " + r); return i; });
while (stack.length) { const i = stack.pop(); if (seen.has(i)) continue; seen.add(i);
  for (const d of deps[i]) if (!units[d].names.some(n => stop.has(n))) stack.push(d);
  for (const n of units[i].names) for (const w of writers.get(n) ?? []) stack.push(w); }
const order = [...seen].sort((a, b) => a - b);
const renames = cfg.renames ?? {};
const newName = (n) => renames[n] ?? n;
// parent map for shorthand detection
const parent = new Map();
(function walk(node, p) { if (!node || typeof node.type !== "string") return; parent.set(node, p); for (const k of Object.keys(node)) { if (k === "loc" || k === "range") continue; const v = node[k]; if (Array.isArray(v)) v.forEach(c => c && typeof c.type === "string" && walk(c, node)); else if (v && typeof v.type === "string") walk(v, node); } })(iife.body, null);
const ENV = { "Math.random": "amEnv.random", "Date.now": "amEnv.now", "globalThis.crypto": "amEnv.crypto", "globalThis.performance": "amEnv.performance" };
const ENV_IDENT = { crypto: "amEnv.crypto", performance: "amEnv.performance" };
let out = [];
const envUsed = new Set();
for (const i of order) {
  const u = units[i];
  const edits = [];
  for (const r of refsByUnit[i]) {
    const nn = newName(r.name); if (nn === r.name) continue;
    const p = parent.get(r.id);
    if (p && p.type === "Property" && p.shorthand && p.value === r.id) edits.push([r.id.start, r.id.end, `${r.name}: ${nn}`]);
    else if (p && p.type === "Property" && p.shorthand && p.value?.type === "AssignmentPattern" && p.value.left === r.id) edits.push([r.id.start, r.id.end, `${r.name}: ${nn}`]);
    else edits.push([r.id.start, r.id.end, nn]);
  }
  for (const g of globalsByUnit[i]) {
    const p = parent.get(g);
    if (p && p.type === "MemberExpression" && p.object === g && !p.computed) {
      const key = `${g.name}.${p.property.name}`;
      if (ENV[key]) { edits.push([p.start, p.end, ENV[key]]); envUsed.add(key); continue; }
    }
    if (ENV_IDENT[g.name]) { edits.push([g.start, g.end, ENV_IDENT[g.name]]); envUsed.add(g.name); }
  }
  edits.sort((a, b) => b[0] - a[0]);
  // drop nested edits (member-expr edit containing ident edit)
  let text = src.slice(u.start, u.end); const base = u.start; let lastStart = Infinity;
  for (const [s, e, t] of edits) { if (e > lastStart) continue; text = text.slice(0, s - base) + t + text.slice(e - base); lastStart = s; }
  const orig = u.names.join(",");
  const tag = `// AM ${orig || "stmt"} @${u.line}`;
  if (u.kind === "decl" || u.kind === "stmt") out.push(tag + "\n" + text + (u.kind === "stmt" && !text.trimEnd().endsWith(";") ? ";" : ""));
  else out.push(tag + "\n" + u.kind + " " + text + ";");
}
const exportNames = [...new Set([...order.flatMap(i => units[i].names).map(newName), ...Object.keys(externals)])];
const externalImports = Object.entries(externals).map(([n, [mod, exp]]) => `import { ${exp} as ${n} } from "${mod}";\n`).join("");
const header = `// @ts-nocheck\n/* eslint-disable */\n// GENERATED by asset-maid-port/scratch/analysis-backend/slice-analysis.mjs (copy of the engine slicer) from AssetMaid 0.9.88 (AssetMaid.pretty.js).\n// Do not edit by hand: algorithms and data are verbatim; only top-level identifiers are renamed\n// (see slice-config.json) and clock/RNG access goes through amEnv (src/engine/core/env.ts).\n// Each declaration is tagged with its original minified name and pretty-file line.\nimport { amEnv } from "${cfg.envImport}";\n${externalImports}\n`;
const footer = `\n\nexport {\n${exportNames.map(n => "  " + n + ",").join("\n")}\n};\n`;
fs.writeFileSync(OUT, header + out.join("\n") + footer);
fs.writeFileSync(cfg.manifest, JSON.stringify({ units: order.map(i => ({ names: units[i].names, renamed: units[i].names.map(newName), line: units[i].line, kind: units[i].kind })), envUsed: [...envUsed] }, null, 1));
console.log("units", order.length, "env", [...envUsed].join(" "), "bytes", (header + out.join("\n")).length);
