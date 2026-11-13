// Pairs the top-level units of two Asset Maid bundles whose minified names differ.
// Usage: node pair.mjs <old raw> <old pretty> <new raw> <new pretty> <out dir>
import fs from "node:fs";
import crypto from "node:crypto";
import * as acorn from "acorn";
import * as eslintScope from "eslint-scope";

const [oldRaw, oldPretty, newRaw, newPretty, outDir] = process.argv.slice(2);

function unitsOf(ast) {
  const iife = ast.body.find((s) => s.type === "ExpressionStatement").expression.callee;
  const units = [];
  for (const st of iife.body.body) {
    if (st.type === "VariableDeclaration")
      for (const d of st.declarations)
        units.push({ kind: "var", start: d.start, end: d.end, line: d.loc.start.line, endLine: d.loc.end.line, name: d.id.type === "Identifier" ? d.id.name : null });
    else if (st.type === "FunctionDeclaration" || st.type === "ClassDeclaration")
      units.push({ kind: "decl", start: st.start, end: st.end, line: st.loc.start.line, endLine: st.loc.end.line, name: st.id.name });
    else units.push({ kind: "stmt", start: st.start, end: st.end, line: st.loc.start.line, endLine: st.loc.end.line, name: null });
  }
  return { iife, units };
}

function load(rawPath, prettyPath) {
  const src = fs.readFileSync(rawPath, "utf8");
  const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "script", ranges: true, locations: true });
  const { iife, units } = unitsOf(ast);
  const pretty = unitsOf(acorn.parse(fs.readFileSync(prettyPath, "utf8"), { ecmaVersion: "latest", sourceType: "script", locations: true })).units;
  if (pretty.length !== units.length) throw new Error("unit count mismatch " + units.length + " vs " + pretty.length);
  units.forEach((u, i) => {
    u.pline = pretty[i].line;
    u.pend = pretty[i].endLine;
    if (pretty[i].name !== u.name) throw new Error("unit order mismatch at " + i);
  });
  const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: "script" });
  const top = sm.acquire(iife);
  const starts = units.map((u) => u.start);
  const unitAt = (pos) => {
    let lo = 0, hi = units.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (starts[m] <= pos) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans >= 0 && pos < units[ans].end ? ans : -1;
  };
  // shorthand properties: keep the key text
  const shorthand = new Set();
  (function walk(n) {
    if (!n || typeof n.type !== "string") return;
    if (n.type === "Property" && n.shorthand) shorthand.add(n.value.type === "AssignmentPattern" ? n.value.left.start : n.value.start);
    for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === "string") walk(v); }
  })(ast);
  const occ = units.map(() => []);
  const seen = new Set();
  const add = (id, name, isTop) => {
    if (seen.has(id.start)) return;
    const u = unitAt(id.start);
    if (u < 0) return;
    seen.add(id.start);
    occ[u].push({ s: id.start, e: id.end, name, top: isTop });
  };
  for (const sc of sm.scopes) {
    for (const v of sc.variables) {
      if (!v.identifiers.length) continue; // implicit arguments
      const isTop = sc === top;
      for (const id of v.identifiers) add(id, v.name, isTop);
      for (const r of v.references) add(r.identifier, v.name, isTop);
    }
  }
  occ.forEach((o) => o.sort((a, b) => a.s - b.s));
  return { src, units, occ, shorthand };
}

function render(b, i, topName, forDiff) {
  const u = b.units[i];
  const locals = new Map();
  let out = "", pos = u.start;
  for (const o of b.occ[i]) {
    out += b.src.slice(pos, o.s);
    let rep;
    if (o.top) rep = topName(o.name);
    else {
      if (!locals.has(o.name)) locals.set(o.name, forDiff ? "$Lq_" + o.name + "_qL$" : "\u00a7L" + (locals.size + 1));
      rep = locals.get(o.name);
    }
    if (b.shorthand.has(o.s)) rep = o.name + ":" + rep; // key stays, value renamed
    out += rep;
    pos = o.e;
  }
  return out + b.src.slice(pos, u.end);
}
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex");

const A = load(oldRaw, oldPretty), B = load(newRaw, newPretty);
const o2n = new Map(), n2o = new Map();
const conflicts = [];
function link(a, b) {
  if (o2n.has(a) || n2o.has(b)) {
    if (o2n.get(a) !== b) conflicts.push([a, o2n.get(a) ?? null, b, n2o.get(b) ?? null]);
    return false;
  }
  o2n.set(a, b);
  n2o.set(b, a);
  return true;
}
const pairA = new Map(), pairB = new Map(); // unit index pairs (unchanged)
function propagate(i, j) {
  const ta = A.occ[i].filter((o) => o.top), tb = B.occ[j].filter((o) => o.top);
  let n = 0;
  if (ta.length === tb.length) for (let k = 0; k < ta.length; k++) if (link(ta[k].name, tb[k].name)) n++;
  return n;
}
function exactRounds() {
 let any = false;
 for (let round = 1; round <= 15; round++) {
  const hA = new Map(), hB = new Map();
  const keyA = (n) => (o2n.has(n) ? "\u00a7G" + o2n.get(n) : "\u00a7T");
  const keyB = (n) => (n2o.has(n) ? "\u00a7G" + n : "\u00a7T");
  A.units.forEach((u, i) => {
    if (pairA.has(i)) return;
    const h = sha(u.kind + render(A, i, keyA));
    if (!hA.has(h)) hA.set(h, []);
    hA.get(h).push(i);
  });
  B.units.forEach((u, j) => {
    if (pairB.has(j)) return;
    const h = sha(u.kind + render(B, j, keyB));
    if (!hB.has(h)) hB.set(h, []);
    hB.get(h).push(j);
  });
  let made = 0, linked = 0;
  for (const [h, ia] of hA) {
    const jb = hB.get(h);
    if (!jb) continue;
    if (ia.length === 1 && jb.length === 1) {
      pairA.set(ia[0], jb[0]);
      pairB.set(jb[0], ia[0]);
      made++;
      linked += propagate(ia[0], jb[0]);
      continue;
    }
    // duplicates: pair those whose own names are already linked
    for (const i of ia) {
      const nm = A.units[i].name;
      if (!nm || !o2n.has(nm)) continue;
      const j = jb.find((x) => B.units[x].name === o2n.get(nm) && !pairB.has(x));
      if (j !== undefined) {
        pairA.set(i, j);
        pairB.set(j, i);
        made++;
        linked += propagate(i, j);
      }
    }
  }
  console.log("round " + round + ": +" + made + " pairs, +" + linked + " names, total pairs " + pairA.size + ", names " + o2n.size);
  if (!made && !linked) break;
  any = true;
 }
 return any;
}
// Fuzzy pass: leftover units that are the same unit with edits (nothing unchanged refers to them).
const fuzzy = []; // [i, j, score]
const fuzzyA = new Map(), fuzzyB = new Map();
function grams(b, i, key) {
  const toks = render(b, i, key).match(/[A-Za-z_$§][\w$§]*|"(?:[^"\\]|\\.)*"|\d+|\S/g) || [];
  const g = new Set();
  for (let k = 0; k + 3 < toks.length; k++) g.add(toks[k] + " " + toks[k + 1] + " " + toks[k + 2] + " " + toks[k + 3]);
  if (!g.size) g.add(toks.join(" "));
  return g;
}
function fuzzyPass() {
  const keyA = (n) => (o2n.has(n) ? "§G" + o2n.get(n) : "§T");
  const keyB = (n) => (n2o.has(n) ? "§G" + n : "§T");
  const la = [], lb = [];
  A.units.forEach((u, i) => { if (!pairA.has(i) && !fuzzyA.has(i) && !(u.name && o2n.has(u.name))) la.push([i, grams(A, i, keyA)]); });
  B.units.forEach((u, j) => { if (!pairB.has(j) && !fuzzyB.has(j) && !(u.name && n2o.has(u.name))) lb.push([j, grams(B, j, keyB)]); });
  const cand = [];
  for (const [i, ga] of la) for (const [j, gb] of lb) {
    if (A.units[i].kind !== B.units[j].kind) continue;
    if (!A.units[i].name !== !B.units[j].name) continue;
    let inter = 0;
    const [small, large] = ga.size < gb.size ? [ga, gb] : [gb, ga];
    for (const x of small) if (large.has(x)) inter++;
    const score = inter / (ga.size + gb.size - inter);
    const sz = Math.min(ga.size, gb.size); const min = sz < 40 ? 0.7 : sz < 300 ? 0.45 : 0.2;
    if (score >= min) cand.push([i, j, score]);
  }
  cand.sort((x, y) => y[2] - x[2]);
  let n = 0;
  for (const [i, j, score] of cand) {
    if (fuzzyA.has(i) || fuzzyB.has(j)) continue;
    fuzzyA.set(i, j); fuzzyB.set(j, i); fuzzy.push([i, j, score]); n++;
    if (A.units[i].name && B.units[j].name) link(A.units[i].name, B.units[j].name);
  }
  console.log("fuzzy: +" + n + " pairs (" + la.length + " x " + lb.length + " leftovers)");
  return n > 0;
}
exactRounds();
for (let k = 0; k < 6; k++) { const f = fuzzyPass(); const e = exactRounds(); if (!f && !e) break; }

const tA = (n) => (o2n.has(n) ? o2n.get(n) : "$OLD_" + n);
const tB = (n) => n;
const idxB = new Map();
B.units.forEach((u, j) => u.name && idxB.set(u.name, j));
const changed = [], removed = [], added = [], same = [];
A.units.forEach((u, i) => {
  if (pairA.has(i)) { same.push(i); return; }
  let j = u.name && o2n.has(u.name) ? idxB.get(o2n.get(u.name)) : undefined;
  if (j === undefined && fuzzyA.has(i)) j = fuzzyA.get(i);
  if (j !== undefined && !pairB.has(j)) changed.push([i, j]);
  else removed.push(i);
});
const changedB = new Set(changed.map((c) => c[1]));
B.units.forEach((u, j) => { if (!pairB.has(j) && !changedB.has(j)) added.push(j); });

const info = (b, i) => ({ name: b.units[i].name, kind: b.units[i].kind, line: b.units[i].pline, endLine: b.units[i].pend, lines: b.units[i].pend - b.units[i].pline + 1 });
const wrap = (b, i, t) => {
  const u = b.units[i];
  const body = render(b, i, t, true);
  return u.kind === "var" ? "var " + body + ";" : body;
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outDir + "/names-old-to-new.json", JSON.stringify(Object.fromEntries(o2n)));
fs.writeFileSync(outDir + "/pairs.json", JSON.stringify([...pairA]));
fs.writeFileSync(outDir + "/report.json", JSON.stringify({
  counts: { oldUnits: A.units.length, newUnits: B.units.length, same: same.length, changed: changed.length, removed: removed.length, added: added.length, names: o2n.size, conflicts: conflicts.length },
  conflicts: conflicts.slice(0, 80),
  changed: changed.map(([i, j]) => ({ old: info(A, i), new: info(B, j) })),
  removed: removed.map((i) => info(A, i)),
  added: added.map((j) => info(B, j)),
}, null, 1));
// normalized sources for a readable diff (prettier them afterwards)
const sep = (tag, x) => "\n/*==== " + tag + " " + (x.name ?? "<stmt>") + " old@" + (x.o ?? "-") + " new@" + (x.n ?? "-") + " ====*/\n";
let oldSide = "", newSide = "";
for (const [i, j] of changed) {
  const tag = { name: B.units[j].name, o: A.units[i].pline, n: B.units[j].pline };
  oldSide += sep("CHANGED", tag) + wrap(A, i, tA) + "\n";
  newSide += sep("CHANGED", tag) + wrap(B, j, tB) + "\n";
}
let rem = "", addSrc = "";
for (const i of removed) rem += sep("REMOVED", { name: A.units[i].name, o: A.units[i].pline }) + wrap(A, i, tA) + "\n";
for (const j of added) addSrc += sep("ADDED", { name: B.units[j].name, n: B.units[j].pline }) + wrap(B, j, tB) + "\n";
fs.writeFileSync(outDir + "/changed.old.js", oldSide);
fs.writeFileSync(outDir + "/changed.new.js", newSide);
fs.writeFileSync(outDir + "/removed.js", rem);
fs.writeFileSync(outDir + "/added.js", addSrc);
console.log(JSON.stringify({ old: A.units.length, new: B.units.length, same: same.length, changed: changed.length, removed: removed.length, added: added.length, conflicts: conflicts.length }));
