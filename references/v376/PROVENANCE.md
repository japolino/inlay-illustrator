# V3.7.6 Tracked Source Artifacts and Provenance

## Source File Information
- Source module: `tmp-audit/extracted_v3.7.6/module.json` (SHA-256: `c59709bf6b1e3e0bc693fa2924e8665212824787562cbe1ff861976611fef361`, 477,033 bytes)
- Source Lua script: `tmp-audit/trigger_lua_0.lua` (SHA-256: `29fc6722354e3824f67ebb05af4cc3397c25d168ca0d693510926dd26599de64`, 386,559 bytes)
- Provenance: Directly extracted from decompiled V3.7.6 Risu module.json lorebooks and trigger Lua.

## Tracked Artifacts & Hashes (Exact Source Bytes)
All text artifacts preserve exact UTF-8 source bytes with original LF line endings.

| Artifact | Source Location | Size (bytes) | SHA-256 |
|---|---|---|---|
| `Card.Core.axLLM.txt` | `module.json lorebook[1]` | 2,169 | `d7bc6090054c6880a761a64f93bdb72711368da115374a04c9fcecd19ed2e737` |
| `Card.Image.axLLM.txt` | `module.json lorebook[2]` | 22,521 | `aaf3780dd6b519d03105f1e071da92dc08cecf8311c56063e47ae9c76fee5971` |
| `Card.Image.Format.txt` | `module.json lorebook[3]` | 8,147 | `71a8cca8d22d37f6a641dc374830dc3b3079b24c209cc9e4106f953c5f203c27` |
| `Card.Prefill.Prompt.txt` | `module.json lorebook[4]` | 943 | `eb7c39a1c4444b649ade4c348983196644b167425e83c46643d0305259790eeb` |
| `Card.Preprocess.Prompt.txt` | `module.json lorebook[5]` | 1,456 | `4ffa5982e0990b5c2cd7c9a967fc9b39984445cab579d8cb202642229208a8e0` |
| `Card.Presets.txt` | `module.json lorebook[6]` | 12 | `5cd7177ec56254a6152d2ea23b5a4a00ae04a0256533da5fee69a1ee9ce0a4fe` |
| `preset1.txt` | `module.json lorebook[7]` | 1,412 | `5d2953c3033824849610b8553616abffe7337d4daed493f6e42a48477229ffe8` |
| `Card.System.axLLM.txt` | `module.json lorebook[8]` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `customModuleToggle.txt` | `module.json customModuleToggle` | 5,366 | `1e1ca1b84fadf504c001126b1095f7089fdb92a35b0f242c2fb3974bb38eee1a` |
| `trigger_runtime.lua` | `tmp-audit/trigger_lua_0.lua` | 386,559 | `29fc6722354e3824f67ebb05af4cc3397c25d168ca0d693510926dd26599de64` |

*Note on Lua runtime*: `references/v376/trigger_runtime.lua` is byte-for-byte identical to `tmp-audit/trigger_lua_0.lua` (SHA-256: `29fc6722354e3824f67ebb05af4cc3397c25d168ca0d693510926dd26599de64`).

## Key Findings and Discrepancies Resolved
1. **Instruction Conditioning**:
   - `toggle_Card.Mode`: 0 = "illustration", 1 = "asset", 2 = "comic"
   - `toggle_Card.Nsfw`: 0 = false, 1 = true
   - `toggle_Card.Supplement`: 0 = false, 1 = true
   - `toggle_Card.Text`: 0 = "off", 1 = "free", 2 = "english", 3 = "korean", 4 = "japanese", 5 = "chinese"
   - `toggle_Card.Prompt.Compatibility`: 0 = "nai", 1 = "comfyui"
   - `toggle_Card.Quote`: 0 = false, 1 = true
   - `toggle_Card.Original`: 0 = false, 1 = true
   - `toggle_Card.Original.Text`: user-specified creation name string
   - `toggle_Card.Encode`: 0 = "plain", 1 = "placeholder", 2 = "base64", 3 = "atbash"
   - `toggle_Card.CharAppearance.Context`: 0 = false, 1 = true

2. **Schema & Instruction Contradictions Resolved**:
   - **`sex` field omission**: In `Card.Image.Format`, line 91 states `- negative is optional. All other fields are required.` However, in `Card.Image.axLLM` line 161, instructions explicitly state:
     `Don't output it if sex isn't happening (such as a kiss or a hug). These are only for sexual/explicit scenes when the nsfw tag is used.`
     Decision: `sex` is optional in shots/characters, even when NSFW is enabled, conforming to runtime behavior.
   - **Malformed JSON examples in `Card.Image.Format`**: Lines 128, 129, 143, 144, 145, 163, 164 contain trailing commas before closing braces (e.g. `"composition": "..."{{#if ...}}, "text": "...",{{/if}}}`).
     The TypeScript parser tolerates trailing commas via structural extraction. Generated instructions retain the source examples and prose rather than silently rewriting them.
   - **`body` field**: `normalizeCharacterData` in Lua includes `"body"` in `keys` and `idKeys` (`{"label", "age", "appearance", "body", "attire", ...}`), although it was not explicitly in the format block. Included as optional field on `V376Character`.
   - **`scene` vs `situation` + `place`**: In comic mode (`toggle_Card.Mode == 2`), setup uses `place + placement`, falling back to `shot.scene`. In modes 0 & 1, Lua normalizes `scene` to `situation, place` if `scene` was not provided.
