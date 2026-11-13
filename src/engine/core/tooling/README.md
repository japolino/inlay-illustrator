# Porting a new Asset Maid release

Upstream ships one minified bundle (`AssetMaid.js`, `https://github.com/acahaAM/Asset-Maid`, release commits are
titled `chore: <version> 배포`). Its minifier renames every top-level and local identifier in every release, so a plain
text diff between two releases is useless and every name the port cites would go stale. These tools fix that.

They need `acorn` and `eslint-scope` (devDependencies). Run everything from the repository root. The working folder
`tmp-audit/upstream/` is gitignored.

## The idea

- **Canonical names.** The port keeps the top-level names of the release it was first built from (0.9.90). A new bundle
  is rewritten to those names before anything else reads it. A unit that is new gets its own name, with a version
  suffix (`_91`) when that name is already taken by an older unit. So `c0e` means the same function in the 0.9.90
  bundle, in the rewritten 0.9.91 bundle, in the generated cores and in every comment of the port.
- **Unchanged units keep their text.** A unit upstream did not touch is copied from the previous canonical bundle, so
  its local variable names do not change either. The diff of a regenerated core therefore shows real upstream edits
  (plus the `@line` tags).

## Steps (0.9.90 -> 0.9.91 shown; `OLD` is the previous canonical raw bundle)

```
U=tmp-audit/upstream
git clone https://github.com/acahaAM/Asset-Maid $U/Asset-Maid          # or: git -C $U/Asset-Maid pull
git -C $U/Asset-Maid show <commit>:AssetMaid.js > $U/raw/0.9.91.js
bunx prettier@3.7.4 --print-width 120 --parser babel $U/raw/0.9.91.js > $U/pretty/0.9.91.p120.js

# 1. pair the units of the old and the new bundle (old pretty file = prettier of OLD)
node src/engine/core/tooling/pair.mjs $U/raw/OLD.js $U/pretty/OLD.p120.js $U/raw/0.9.91.js $U/pretty/0.9.91.p120.js $U/out/pair

# 2. rewrite the new bundle to canonical names, reusing the old text of unchanged units
AM_NEW_SUFFIX=_91 AM_PAIRS=$U/out/pair/pairs.json node src/engine/core/tooling/translate.mjs \
  $U/raw/OLD.js $U/raw/0.9.91.js $U/out/pair/names-old-to-new.json $U/raw/0.9.91.n90.js $U/out/pair/translate-report.json
bunx prettier@3.7.4 --print-width 120 --parser babel $U/raw/0.9.91.n90.js > $U/pretty/0.9.91.n90.p120.js

# 3. check: the rewritten bundle must equal the original, unit for unit (expect changed 0, removed 0, added 0)
node src/engine/core/tooling/pair.mjs $U/raw/0.9.91.js $U/pretty/0.9.91.p120.js $U/raw/0.9.91.n90.js $U/pretty/0.9.91.n90.p120.js $U/out/check

# 4. readable diff in canonical names, split by bundle region
node src/engine/core/tooling/pair.mjs $U/raw/OLD.js $U/pretty/OLD.p120.js $U/raw/0.9.91.n90.js $U/pretty/0.9.91.n90.p120.js $U/out/diff
(cd $U/out/diff && for f in changed.old changed.new removed added; do bunx prettier@3.7.4 --print-width 120 --parser babel $f.js > $f.p.js; done)
node src/engine/core/tooling/difflocals.mjs $U/out/diff/changed.old.p.js $U/out/diff/changed.new.p.js $U/out/diff/changed.old.final.js $U/out/diff/changed.new.final.js
sed -i -E 's/\$Lq_([A-Za-z0-9_$]+)_qL\$/\1/g' $U/out/diff/removed.p.js $U/out/diff/added.p.js
node src/engine/core/tooling/regions.mjs $U/out/diff . $U/regions

# 5. regenerate the three cores (set "source" and "sourceLabel" in the three configs first)
bun src/engine/core/tooling/slice.mjs src/engine/core/tooling/slice-config.json
bun src/backend/analysis/core/tooling/slice-analysis.mjs src/backend/analysis/core/tooling/slice-config.json
bun src/backend/analysis/core/tooling/slice-analysis.mjs src/backend/analysis/core/tooling/slice-config.auto-core.json
```

Then `bun run typecheck` and `bun test` show what the new cores break, and `regions/R*.units.txt`, `R*.changed.diff`,
`R*.added.js`, `R*.removed.js` are the complete list of what upstream changed, including the code that the port
mirrors by hand (frontend, backend wiring, contract).

For the release after 0.9.91, `OLD` is `raw/0.9.91.n90.js` (the rewritten bundle, not upstream's file), so the names
stay canonical. If the working folder is lost, rebuild the chain from upstream's git history starting at 0.9.90
(commit `29913b1`, whose own names are the canonical ones); the tools are deterministic.

## The tools

| File | Does |
|---|---|
| `pair.mjs` | Splits both bundles into top-level units, hashes each with local names numbered and top-level names abstracted, pairs units with a unique equal hash, and spreads the name mapping through the references of paired units until nothing new is found. Leftover units are paired by similarity (edited units). Writes `report.json` (same / changed / removed / added), `names-old-to-new.json`, `pairs.json`, and the sources for the readable diff. |
| `translate.mjs` | Renames the new bundle's top-level identifiers to canonical names with scope analysis (a local that would capture a renamed reference is renamed to `_l_<name>`; shorthand properties keep their key), then replaces every unit that is equal to its old counterpart up to local names by the old text, and verifies the result unit by unit. |
| `difflocals.mjs` | Aligns local names between the old and new text of each changed unit, so the diff shows only real edits. |
| `regions.mjs` | Splits the diff into regions and marks each unit as in or out of a generated core. |
| `slice.mjs` | The engine slicer: the full top-level dependency closure of the config's roots, verbatim, with clock and RNG access rewritten to `amEnv`. Writes the core, `names.json` and a manifest. |
| `index_units.mjs` | Lists the top-level units of a bundle (historical helper). |

`translate.mjs` reports `capturedLocals` (locals it had to rename) and `globalClash` (must be empty), and it refuses to
reuse old text for a pair that is not strictly equal (`refusedReuse`).
