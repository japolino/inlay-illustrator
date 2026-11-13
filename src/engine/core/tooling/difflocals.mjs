// Aligns local variable names between the old and new side of each CHANGED unit, so a line diff shows only real edits.
// Input: prettier output of pair.mjs's changed.old.js / changed.new.js (locals are `$Lq_<name>_qL$` markers).
// Usage: node difflocals.mjs <old.p.js> <new.p.js> <old out> <new out>
import fs from "node:fs";
const [oldIn, newIn, oldOut, newOut] = process.argv.slice(2);
const MARK = /\$Lq_([\w$]+?)_qL\$/g;
const HEAD = /^\/\*==== (CHANGED|REMOVED|ADDED) /;

function segments(path) {
  const lines = fs.readFileSync(path, "utf8").split("\n");
  const segs = [];
  let cur = null;
  for (const l of lines) {
    if (HEAD.test(l)) { cur = { head: l, lines: [] }; segs.push(cur); }
    else if (cur) cur.lines.push(l);
  }
  return segs;
}
const mask = (l) => l.replace(MARK, "$L").trim();
const names = (l) => [...l.matchAll(MARK)].map((m) => m[1]);

function lcsPairs(a, b) {
  const n = a.length, m = b.length;
  // trim common prefix / suffix first
  let pre = 0;
  while (pre < n && pre < m && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < n - pre && suf < m - pre && a[n - 1 - suf] === b[m - 1 - suf]) suf++;
  const pairs = [];
  for (let i = 0; i < pre; i++) pairs.push([i, i]);
  const N = n - pre - suf, M = m - pre - suf;
  if (N > 0 && M > 0) {
    const w = M + 1;
    const t = new Int32Array((N + 1) * w);
    for (let i = N - 1; i >= 0; i--)
      for (let j = M - 1; j >= 0; j--)
        t[i * w + j] = a[pre + i] === b[pre + j] ? t[(i + 1) * w + j + 1] + 1 : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
    let i = 0, j = 0;
    while (i < N && j < M) {
      if (a[pre + i] === b[pre + j]) { pairs.push([pre + i, pre + j]); i++; j++; }
      else if (t[(i + 1) * w + j] >= t[i * w + j + 1]) i++;
      else j++;
    }
  }
  for (let k = 0; k < suf; k++) pairs.push([n - suf + k, m - suf + k]);
  return pairs;
}

const A = segments(oldIn), B = segments(newIn);
if (A.length !== B.length) throw new Error("segment count mismatch " + A.length + " vs " + B.length);
let outA = "", outB = "";
const stats = [];
for (let s = 0; s < A.length; s++) {
  const a = A[s].lines, b = B[s].lines;
  const pairs = lcsPairs(a.map(mask), b.map(mask));
  const lineMap = new Map(pairs);
  // unit-wide vote: old local name -> new local name
  const votes = new Map();
  for (const [i, j] of pairs) {
    const na = names(a[i]), nb = names(b[j]);
    if (na.length !== nb.length) continue;
    na.forEach((x, k) => {
      if (!votes.has(x)) votes.set(x, new Map());
      const v = votes.get(x);
      v.set(nb[k], (v.get(nb[k]) ?? 0) + 1);
    });
  }
  const best = new Map();
  for (const [x, v] of votes) best.set(x, [...v].sort((p, q) => q[1] - p[1])[0][0]);
  const ra = a.map((l, i) => {
    if (lineMap.has(i)) {
      const nb = names(b[lineMap.get(i)]);
      let k = 0;
      const na = names(l);
      if (na.length === nb.length) return l.replace(MARK, () => nb[k++]);
    }
    return l.replace(MARK, (_, x) => best.get(x) ?? x);
  });
  const rb = b.map((l) => l.replace(MARK, (_, x) => x));
  outA += A[s].head + "\n" + ra.join("\n") + "\n";
  outB += B[s].head + "\n" + rb.join("\n") + "\n";
  stats.push([A[s].head.replace(/[/*=]/g, "").trim(), a.length, b.length, pairs.length]);
}
fs.writeFileSync(oldOut, outA);
fs.writeFileSync(newOut, outB);
console.log("segments", A.length, "lines", stats.reduce((x, y) => x + y[1], 0), stats.reduce((x, y) => x + y[2], 0), "matched", stats.reduce((x, y) => x + y[3], 0));
