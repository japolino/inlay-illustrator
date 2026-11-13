// Rewrites the top-level names of a new Asset Maid bundle to the port's canonical names (the names of the bundle the
// port was built from), so the slicers, their configs and every hand-written import keep working across releases.
// Usage: node translate.mjs <old raw> <new raw> <names-old-to-new.json> <out raw> <out report.json>
import fs from "node:fs";
import * as acorn from "acorn";
import * as eslintScope from "eslint-scope";

const [oldRaw, newRaw, mapPath, outRaw, outReport] = process.argv.slice(2);
const SUFFIX = process.env.AM_NEW_SUFFIX || "_91";

const parse = (src) => acorn.parse(src, { ecmaVersion: "latest", sourceType: "script", ranges: true, locations: true });
const iifeOf = (ast) => ast.body.find((s) => s.type === "ExpressionStatement").expression.callee;

const oldAst = parse(fs.readFileSync(oldRaw, "utf8"));
const oldTop = new Set(eslintScope.analyze(oldAst, { ecmaVersion: 2022, sourceType: "script" }).acquire(iifeOf(oldAst)).variables.map((v) => v.name));

const src = fs.readFileSync(newRaw, "utf8");
const ast = parse(src);
const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: "script" });
const top = sm.acquire(iifeOf(ast));
const o2n = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const n2o = new Map(Object.entries(o2n).map(([o, n]) => [n, o]));

// 1. target name of every top-level variable
const target = new Map(); // Variable -> name
const used = new Set();
for (const v of top.variables) if (v.identifiers.length && n2o.has(v.name)) { target.set(v, n2o.get(v.name)); used.add(n2o.get(v.name)); }
const fresh = [];
for (const v of top.variables) {
  if (!v.identifiers.length || target.has(v)) continue;
  let name = v.name;
  if (oldTop.has(name) || used.has(name)) {
    name = v.name + SUFFIX;
    while (oldTop.has(name) || used.has(name)) name += "_";
    fresh.push([v.name, name]);
  }
  target.set(v, name);
  used.add(name);
}

// 2. globals must not collide with a target name
const globals = new Set();
for (const sc of sm.scopes) for (const r of sc.through) if (!r.resolved) globals.add(r.identifier.name);
const globalClash = [...used].filter((n) => globals.has(n));

// 3. capture: a local with the target name between a reference and the top scope gets a new name
const localRename = new Map(); // Variable -> name
const captured = [];
for (const [v, name] of target) {
  if (name === v.name) continue;
  for (const r of v.references) {
    for (let sc = r.from; sc && sc !== top; sc = sc.upper) {
      const hit = sc.set.get(name);
      if (hit && !localRename.has(hit)) { localRename.set(hit, "_l_" + name); captured.push([name, r.identifier.loc.start.line]); }
    }
  }
}
// a renamed local must not capture something else in its own scope tree; "_l_" names do not occur in the bundle
if (/\b_l_[\w$]+/.test(src)) throw new Error("the bundle already uses _l_ names");

// 4. shorthand properties keep their key
const shorthand = new Set();
(function walk(n) {
  if (!n || typeof n.type !== "string") return;
  if (n.type === "Property" && n.shorthand) shorthand.add(n.value.type === "AssignmentPattern" ? n.value.left.start : n.value.start);
  for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === "string") walk(v); }
})(ast);

const edits = new Map(); // start -> [end, text]
const put = (id, from, to) => {
  if (from === to) return;
  edits.set(id.start, [id.end, shorthand.has(id.start) ? from + ":" + to : to]);
};
for (const [v, name] of [...target, ...localRename]) {
  for (const id of v.identifiers) put(id, v.name, name);
  for (const r of v.references) put(r.identifier, v.name, name);
}
const order = [...edits.keys()].sort((a, b) => a - b);
var out = "", pos = 0;
for (const s of order) { const [e, text] = edits.get(s); out += src.slice(pos, s) + text; pos = e; }
out += src.slice(pos);
parse(out); // must still parse

// 5. Units upstream did not touch keep the port's existing text (the minifier renames locals in every release).
function load(text) {
  const a = parse(text);
  const units = [];
  for (const st of iifeOf(a).body.body) {
    if (st.type === "VariableDeclaration") for (const d of st.declarations) units.push({ start: d.start, end: d.end });
    else units.push({ start: st.start, end: st.end });
  }
  const s = eslintScope.analyze(a, { ecmaVersion: 2022, sourceType: "script" });
  const t = s.acquire(iifeOf(a));
  const starts = units.map((u) => u.start);
  const unitAt = (pos) => {
    let lo = 0, hi = units.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (starts[m] <= pos) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans >= 0 && pos < units[ans].end ? ans : -1;
  };
  const occ = units.map(() => []);
  const seen = new Set();
  const add = (id, name, isTop) => {
    if (seen.has(id.start)) return;
    const u = unitAt(id.start);
    if (u < 0) return;
    seen.add(id.start);
    occ[u].push({ s: id.start, e: id.end, name, top: isTop });
  };
  for (const sc of s.scopes) for (const v of sc.variables) {
    if (!v.identifiers.length) continue;
    for (const id of v.identifiers) add(id, v.name, sc === t);
    for (const r of v.references) add(r.identifier, v.name, sc === t);
  }
  occ.forEach((o) => o.sort((x, y) => x.s - y.s));
  return { src: text, units, occ };
}
// locals numbered by first occurrence, top-level names verbatim: equal strings = same unit up to local names
function norm(b, i) {
  const u = b.units[i];
  const locals = new Map();
  let res = "", p = u.start;
  for (const o of b.occ[i]) {
    res += b.src.slice(p, o.s);
    if (o.top) res += "§T" + o.name;
    else { if (!locals.has(o.name)) locals.set(o.name, "§L" + locals.size); res += locals.get(o.name); }
    p = o.e;
  }
  return res + b.src.slice(p, u.end);
}
let reused = 0, refused = 0;
const pairsPath = process.env.AM_PAIRS;
if (pairsPath) {
  const A = load(fs.readFileSync(oldRaw, "utf8")), T = load(out);
  const keep = new Map(); // new unit index -> old text
  for (const [i, j] of JSON.parse(fs.readFileSync(pairsPath, "utf8"))) {
    if (norm(A, i) === norm(T, j)) { keep.set(j, A.src.slice(A.units[i].start, A.units[i].end)); reused++; } else refused++;
  }
  let res = "", p = 0;
  T.units.forEach((u, j) => { if (!keep.has(j)) return; res += out.slice(p, u.start) + keep.get(j); p = u.end; });
  res += out.slice(p);
  // the result must be the same program: every unit equal up to local names
  const F = load(res);
  if (F.units.length !== T.units.length) throw new Error("unit count changed");
  for (let j = 0; j < T.units.length; j++) if (norm(F, j) !== norm(T, j)) throw new Error("unit " + j + " differs after reuse");
  out = res;
}
fs.writeFileSync(outRaw, out);
const report = {
  topLevel: top.variables.length,
  mapped: [...target].filter(([v, n]) => n2o.has(v.name)).length,
  keptOwnName: [...target].filter(([v, n]) => !n2o.has(v.name) && n === v.name).length,
  renamedNew: fresh,
  capturedLocals: captured,
  globalClash,
  edits: order.length,
  reusedOldText: reused,
  refusedReuse: refused,
};
fs.writeFileSync(outReport, JSON.stringify(report, null, 1));
console.log(JSON.stringify({ ...report, renamedNew: fresh.length, capturedLocals: captured.length }));
