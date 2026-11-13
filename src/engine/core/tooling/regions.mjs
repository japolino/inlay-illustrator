// Splits the 0.9.90 -> 0.9.91 unit diff into bundle regions, one folder of files per region.
// Usage: node regions.mjs <pair out dir> <repo root> <regions out dir>
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const [dir, repo, out] = process.argv.slice(2);
const REGIONS = [
  ["R1", 0, 40000],
  ["R2", 40000, 80000],
  ["R3", 80000, 104000],
  ["R4", 104000, 140000],
  ["R5", 140000, 174000],
  ["R6", 174000, 1e9],
];
const cores = { engine: "src/engine/core/asset-maid-core.ts", analysis: "src/backend/analysis/core/analysis-core.ts", auto: "src/backend/pipeline/core/auto-core.ts" };
const inCore = {};
for (const [k, f] of Object.entries(cores)) inCore[k] = new Set([...fs.readFileSync(repo + "/" + f, "utf8").matchAll(/\/\/ AM (\S+) @(\d+)/g)].map((m) => m[1]));
const where = (n) => { const w = Object.keys(inCore).filter((k) => inCore[k].has(n)); return w.length ? "generated core: " + w.join("+") : "NOT in a generated core"; };

function segments(path, kind) {
  const re = new RegExp("^/\\*==== " + kind + " (\\S+) old@(\\S+) new@(\\S+) ====\\*/");
  const segs = [];
  let cur = null;
  for (const l of fs.readFileSync(path, "utf8").split("\n")) {
    const m = l.match(re);
    if (m) { cur = { name: m[1], o: m[2], n: m[3], lines: [] }; segs.push(cur); }
    else if (cur) cur.lines.push(l);
  }
  return segs;
}
const oldS = segments(dir + "/changed.old.final.js", "CHANGED"), newS = segments(dir + "/changed.new.final.js", "CHANGED");
const added = segments(dir + "/added.p.js", "ADDED"), removed = segments(dir + "/removed.p.js", "REMOVED");
fs.mkdirSync(out, { recursive: true });
const tmpA = out + "/_a.js", tmpB = out + "/_b.js";
const summary = [];
for (const [id, lo, hi] of REGIONS) {
  let diff = "", table = "";
  let nC = 0, nA = 0, plus = 0, minus = 0;
  oldS.forEach((a, k) => {
    const b = newS[k];
    const line = Number(b.n);
    if (!(line >= lo && line < hi)) return;
    fs.writeFileSync(tmpA, a.lines.join("\n"));
    fs.writeFileSync(tmpB, b.lines.join("\n"));
    let d = "";
    try { execFileSync("diff", ["-U6", tmpA, tmpB]); } catch (e) { d = String(e.stdout); }
    const body = d.split("\n").slice(2).join("\n");
    const p = (body.match(/^\+/gm) || []).length, m = (body.match(/^-/gm) || []).length;
    plus += p; minus += m; nC++;
    diff += "\n################ CHANGED " + b.name + "  (0.9.90 line " + a.o + ", 0.9.91 line " + b.n + "; " + where(b.name) + "; +" + p + "/-" + m + ")\n" + body + "\n";
    table += "CHANGED " + b.name + " 0.9.91@" + b.n + " 0.9.90@" + a.o + " +" + p + "/-" + m + " [" + where(b.name) + "]\n";
  });
  let add = "";
  for (const s of added) {
    const line = Number(s.n);
    if (!(line >= lo && line < hi)) continue;
    nA++;
    add += "\n/*################ ADDED " + s.name + "  (0.9.91 line " + s.n + "; " + where(s.name) + "; " + s.lines.length + " lines) */\n" + s.lines.join("\n") + "\n";
    table += "ADDED " + s.name + " 0.9.91@" + s.n + " " + s.lines.length + " lines [" + where(s.name) + "]\n";
  }
  let rem = "";
  for (const s of removed) {
    const line = Number(s.o);
    // old line numbers: map into the region by the same bounds (the files differ by ~2.5k lines at the end)
    if (!(line >= lo && line < hi)) continue;
    rem += "\n/*################ REMOVED " + s.name + "  (0.9.90 line " + s.o + "; " + where(s.name) + "; " + s.lines.length + " lines) */\n" + s.lines.join("\n") + "\n";
    table += "REMOVED " + s.name + " 0.9.90@" + s.o + " " + s.lines.length + " lines\n";
  }
  fs.writeFileSync(out + "/" + id + ".changed.diff", diff);
  fs.writeFileSync(out + "/" + id + ".added.js", add);
  fs.writeFileSync(out + "/" + id + ".removed.js", rem);
  fs.writeFileSync(out + "/" + id + ".units.txt", table);
  summary.push(id + " lines " + lo + "-" + hi + ": changed " + nC + " (+" + plus + "/-" + minus + "), added " + nA + " (" + add.split("\n").length + " lines), diff file " + diff.split("\n").length + " lines");
}
fs.rmSync(tmpA, { force: true });
fs.rmSync(tmpB, { force: true });
console.log(summary.join("\n"));
