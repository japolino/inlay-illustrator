import type { Config } from "../shared/config.js";
import { logStage } from "./logging.js";
import { normalizeCharacterData, extractLLMPrompts, getFinalPromptsForGeneration } from "./prompt.js";
import type { CharacterJson, NormalizedScene, ParsedPayload, PreparedParagraph, PromptEntry, SceneJson, ShotJson } from "./types.js";
import { cleanArray, cleanString } from "./utils.js";

function parseParagraphNumber(value: unknown): number | null {
  const match = String(value ?? "").match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

export function recoverSceneParagraphs(payload: ParsedPayload, fallbackParagraph?: number): ParsedPayload {
  return {
    ...payload,
    scenes: cleanArray<SceneJson>(payload.scenes).map((scene) => {
      const inherited = parseParagraphNumber(scene.paragraph) || fallbackParagraph;
      if (!Array.isArray(scene.shots)) return parseParagraphNumber(scene.paragraph) || !inherited
        ? scene
        : { ...scene, paragraph: inherited };
      return {
        ...scene,
        shots: scene.shots.map((shot) => parseParagraphNumber(shot.paragraph) || !inherited
          ? shot
          : { ...shot, paragraph: inherited })
      };
    })
  };
}

function luaTrim(value: unknown): string {
  const s = String(value ?? "");
  const m = s.match(/^\s*(.*?)\s*$/s);
  return m ? m[1] : "";
}
function joinPromptParts(parts: (string|undefined)[], sep: string): string {
  const filtered: string[] = [];
  for (const p of parts || []) {
    const t = luaTrim(p ?? "");
    if (t !== "") filtered.push(t);
  }
  return filtered.join(sep);
}

function normalizeSceneData(scene: any): any {
  if (!scene) return scene;
  if (scene.paragraph !== undefined && scene.paragraph !== "" && scene.paragraph !== null) {
    const m = String(scene.paragraph).match(/\d+/);
    if (m) scene.paragraph = m[0];
  }
  return scene;
}

// Exact port of original normalizeScenePayload with defect
export function normalizeScenePayload(payload: ParsedPayload, config?: Config): NormalizedScene[] {
  const normalized: NormalizedScene[] = [];
  const cfg = config ?? ({ originalReference: false, originalCreationName: "", promptSyntax: "nai" } as any);
  const scenes = cleanArray<SceneJson>(payload.scenes);
  for (const rawScene of scenes) {
    if (typeof rawScene !== "object" || rawScene === null) continue;
    const shots = cleanArray<ShotJson>(rawScene.shots);
    if (shots.length > 0) {
      const groupPlace = luaTrim(String((rawScene as any).place ?? ""));
      for (const rawShot of shots) {
        if (typeof rawShot !== "object" || rawShot === null) continue;
        // flattenShot with defect
        const characters: any[] = [];
        const nameCounters: Record<string, number> = {};
        for (const ch of (rawShot.characters as any[]) || []) {
          const norm = normalizeCharacterData(ch, cfg);
          if (norm) {
            if (norm.name === "") {
              let label = luaTrim(String((ch as any).label ?? "character"));
              if (label === "") label = "character";
              nameCounters[label] = (nameCounters[label] || 0) + 1;
              const suffix = String.fromCharCode(64 + nameCounters[label]);
              norm.name = label + " " + suffix;
            }
            characters.push(norm);
          }
        }
        let sceneText = luaTrim(String((rawShot as any).scene ?? ""));
        // stored situation/place are always empty due to defect
        const storedSituation = "";
        const storedPlace = "";
        if (sceneText === "") {
          const sit = luaTrim(String(rawShot.situation ?? ""));
          const place = luaTrim(String(groupPlace ?? ""));
          const envParts: string[] = [];
          if (sit !== "") envParts.push(sit);
          if (place !== "") envParts.push(place);
          sceneText = envParts.join(", ");
        }
        const paragraphVal = rawShot.paragraph;
        const normalizedSceneObj = normalizeSceneData({
          paragraph: paragraphVal,
          quote: luaTrim(String(rawShot.quote ?? "")),
          camera: luaTrim(String((rawShot as any).camera ?? "")),
          characters,
          situation: storedSituation,
          place: storedPlace,
          scene: sceneText,
          action: luaTrim(String((rawShot as any).action ?? "")),
          supplement: luaTrim(String((rawShot as any).supplement ?? "")),
        });
        const parserParagraph = parseParagraphNumber(normalizedSceneObj.paragraph);
        if (!parserParagraph) continue;
        // Build NormalizedScene structure: scene contains place, shot is normalizedSceneObj
        normalized.push({ scene: { ...rawScene, place: groupPlace, shots: [rawShot] } as any, shot: normalizedSceneObj, parserParagraph });
        // But also need to keep shot as normalizedSceneObj for prompt extraction
        // For compatibility, override shot with normalizedSceneObj
        normalized[normalized.length - 1].shot = normalizedSceneObj;
      }
      continue;
    }
    // legacyPlace path (no shots)
    const legacyPlace = luaTrim(String((rawScene as any).place ?? ""));
    const rawShotLegacy = rawScene as ShotJson;
    const characters: any[] = [];
    const nameCounters: Record<string, number> = {};
    for (const ch of (rawShotLegacy.characters as any[]) || []) {
      const norm = normalizeCharacterData(ch, cfg);
      if (norm) {
        if (norm.name === "") {
          let label = luaTrim(String((ch as any).label ?? "character"));
          if (label === "") label = "character";
          nameCounters[label] = (nameCounters[label] || 0) + 1;
          const suffix = String.fromCharCode(64 + nameCounters[label]);
          norm.name = label + " " + suffix;
        }
        characters.push(norm);
      }
    }
    let sceneText = luaTrim(String((rawShotLegacy as any).scene ?? ""));
    const storedSituation = "";
    const storedPlace = "";
    if (sceneText === "") {
      const sit = luaTrim(String(rawShotLegacy.situation ?? ""));
      const place = luaTrim(String(legacyPlace ?? ""));
      const envParts: string[] = [];
      if (sit !== "") envParts.push(sit);
      if (place !== "") envParts.push(place);
      sceneText = envParts.join(", ");
    }
    const normalizedSceneObj = normalizeSceneData({
      paragraph: (rawScene as any).paragraph,
      quote: luaTrim(String((rawShotLegacy as any).quote ?? "")),
      camera: luaTrim(String((rawShotLegacy as any).camera ?? "")),
      characters,
      situation: storedSituation,
      place: storedPlace,
      scene: sceneText,
      action: luaTrim(String((rawShotLegacy as any).action ?? "")),
      supplement: luaTrim(String((rawShotLegacy as any).supplement ?? "")),
    });
    const parserParagraph = parseParagraphNumber(normalizedSceneObj.paragraph);
    if (!parserParagraph) continue;
    normalized.push({ scene: { place: legacyPlace, shots: [rawShotLegacy] } as any, shot: normalizedSceneObj, parserParagraph });
  }
  return normalized;
}

function normalizedValue(value: unknown): string {
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim().toLowerCase();
  if (Array.isArray(value)) return JSON.stringify(value.map(normalizedValue));
  if (value && typeof value === "object") {
    return JSON.stringify(Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))));
  }
  return String(value ?? "");
}

export function dedupeExactShotCharacters(payload: ParsedPayload): ParsedPayload {
  // Original does NOT dedupe; spec says do not dedupe tags. Keep no-op for fidelity.
  return payload;
}

export function normalizeAtomicCompositionTerms(payload: ParsedPayload): ParsedPayload {
  return payload;
}

export function exactVisualKey(entry: NormalizedScene): string {
  return JSON.stringify({
    paragraph: entry.parserParagraph,
    place: normalizedValue(entry.scene.place),
    camera: normalizedValue(entry.shot.camera),
    situation: normalizedValue((entry.shot as any).situation),
    characters: normalizedValue((entry.shot as any).characters),
    supplement: normalizedValue(entry.shot.supplement),
    quote: normalizedValue(entry.shot.quote)
  });
}

export function selectPromptEntries(
  payload: ParsedPayload,
  paragraphs: PreparedParagraph[],
  config: Config,
  lorebookEntries?: Array<{ comment: string; content: string }>
): PromptEntry[] {
  const paragraphMap = new Map(paragraphs.map((p) => [p.parserIndex, p]));
  const byParagraph = new Map<number, NormalizedScene>();
  // Use normalizeScenePayload with config for correct name handling
  for (const entry of normalizeScenePayload(payload, config)) {
    if (paragraphMap.has(entry.parserParagraph)) byParagraph.set(entry.parserParagraph, entry);
  }
  const selected = [...byParagraph.values()]
    .sort((left, right) => left.parserParagraph - right.parserParagraph)
    .slice(0, config.maxImages);
  const prompts: PromptEntry[] = [];
  for (const entry of selected) {
    const paragraph = paragraphMap.get(entry.parserParagraph);
    if (!paragraph) continue;
    // Build raw prompt data via extractLLMPrompts
    const raw = extractLLMPrompts(entry.shot as any, config);
    const [finalPos, finalNeg] = getFinalPromptsForGeneration(raw, config, lorebookEntries);
    const isAnima = config.promptStyle === "anima";
    const prompt = { sections: [finalPos], format: (isAnima ? "ordered" : "legacy") as "ordered" | "legacy" };
    const corePrompt = { sections: [ [raw.setup, raw.charPos].filter(Boolean).join(", ") ], format: (isAnima ? "ordered" : "legacy") as "ordered" | "legacy" };
    const promptEntry: PromptEntry = {
      prompt,
      corePrompt,
      shotNegative: raw.charNeg,
      negative: finalNeg,
      paragraph: paragraph.originalIndex,
      parserParagraph: entry.parserParagraph,
      quote: String((entry.shot as any).quote ?? ""),
      rawPromptData: raw,
    };
    // filter empty final prompt (original would generate but we may filter)
    if (finalPos && finalPos.trim() !== "") prompts.push(promptEntry);
    else if (raw.setup || raw.charPos) prompts.push(promptEntry);
  }
  logStage(config, "illustration_candidates_selected", {
    candidateCount: normalizeScenePayload(payload, config).length,
    uniqueParagraphCount: byParagraph.size,
    selectedCount: prompts.length,
    selectedParagraphs: selected.map((e) => e.parserParagraph),
    mode: config.mode
  });
  return prompts;
}
