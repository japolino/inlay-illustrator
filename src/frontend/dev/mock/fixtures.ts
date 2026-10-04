/**
 * In-memory data for the dev mock backend: two characters with world books, assets, personas,
 * connections and settings built from the contract defaults.
 */
import {
  createDefaultChatImageGenerationSettings,
  createDefaultConfig,
  createDefaultUiState,
  type ChatImageGenerationSettings,
  type InlayConfig,
  type UiState
} from "../../../shared/contract/config.js";
import {
  CHARACTER_DESCRIPTION_LORE_ID,
  createEmptyCharacterDocument,
  descriptionPromptKey,
  lorePromptKey,
  loreSelectionId,
  normalizeFormCollection,
  type AssetRef,
  type CharacterDocument,
  type FormCollection
} from "../../../shared/contract/character.js";
import type {
  AssetListItem,
  BackendStatus,
  CharacterSummary,
  ImageConnectionSummary,
  LlmConnectionSummary,
  RuntimeLogEntry
} from "../../../shared/contract/rpc.js";

/** Inline SVG placeholder image (data URL) with a label. */
export function svgImage(label: string, hue: number, width = 512, height = 768): string {
  const safe = label.replace(/[<&>"]/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,42%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360},45%,18%)"/></linearGradient></defs>` +
    `<rect width="100%" height="100%" fill="url(#g)"/>` +
    `<circle cx="${width / 2}" cy="${height * 0.36}" r="${Math.min(width, height) * 0.16}" fill="hsla(${hue},40%,85%,.35)"/>` +
    `<rect x="${width * 0.28}" y="${height * 0.52}" width="${width * 0.44}" height="${height * 0.34}" rx="${width * 0.08}" fill="hsla(${hue},40%,85%,.25)"/>` +
    `<text x="50%" y="${height - 28}" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(width / 14)}" fill="#fff">${safe}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export interface MockWorldBookEntry { entryId: string; title: string; keys: string[]; secondaryKeys: string[]; content: string }
export interface MockWorldBook { worldBookId: string; name: string; scope: "character" | "persona" | "chat" | "global" | "extra"; entries: MockWorldBookEntry[] }
export interface MockCharacter {
  summary: CharacterSummary;
  description: string;
  worldBooks: MockWorldBook[];
  /** Extra world books that can be connected as roster sources (AM modules). */
  extraWorldBooks: MockWorldBook[];
  assets: AssetListItem[];
}
export interface MockPersona { personaId: string; name: string; avatarUrl: string | null; description: string }

export interface MockDb {
  status: BackendStatus;
  config: InlayConfig;
  chatImageGeneration: ChatImageGenerationSettings;
  uiState: UiState;
  llmConnections: LlmConnectionSummary[];
  imageConnections: ImageConnectionSummary[];
  characters: MockCharacter[];
  documents: Record<string, CharacterDocument>;
  personas: MockPersona[];
  activePersonaId: string | null;
  logs: RuntimeLogEntry[];
  /** Free space for area mock modules (chat data, jobs, ...). */
  extra: Record<string, unknown>;
}

function asset(characterId: string, name: string, hue: number, kind: AssetListItem["kind"] = "original", extra: Partial<AssetListItem> = {}): AssetListItem {
  const ref: AssetRef = { name, key: `img-${characterId}-${name}`, extension: "png", sourceType: kind === "original" ? "character" : "generated", moduleId: "", moduleName: "", characterTarget: { chaId: characterId } };
  const url = svgImage(name, hue);
  return { asset: ref, kind, url, thumbnailUrl: url, width: 512, height: 768, hasMetadata: kind !== "original", selected: false, candidate: false, ...extra };
}

function forms(main: string[], hair: string[], eyes: string[], outfit: { label: string; top: string; bottom: string }[], gender: "female" | "male" = "female"): FormCollection {
  return normalizeFormCollection({
    defaultFormId: "default",
    forms: [{
      id: "default",
      label: "기본",
      description: "",
      humanlike: true,
      gender,
      basePromptGroups: { identity: main, hair, eyes },
      negativePrompt: "",
      reference: null,
      defaultOutfitId: "outfit_1",
      outfits: outfit.map((o, i) => ({ id: `outfit_${i + 1}`, label: o.label, description: "", candidateEnabled: true, head: "", top: o.top, bottom: o.bottom, legs: "", feet: "" }))
    }]
  });
}

export function createMockDb(): MockDb {
  const c1 = "char-seoyeon";
  const c2 = "char-aria";
  const wb1 = "wb-academy";
  const wb2 = "wb-extra-town";
  const characters: MockCharacter[] = [
    {
      summary: { characterId: c1, name: "한서연 Academy", avatarUrl: svgImage("서연", 330, 256, 256), hasDocument: true, chatCount: 3, worldBookIds: [wb1] },
      description: "A school life story around Han Seo-yeon and her friends.",
      worldBooks: [{
        worldBookId: wb1,
        name: "Academy cast",
        scope: "character",
        entries: [
          { entryId: "e1", title: "한서연 (Han Seo-yeon)", keys: ["서연", "Seo-yeon"], secondaryKeys: [], content: "Han Seo-yeon is a 17-year-old student with long black hair and brown eyes." },
          { entryId: "e2", title: "김민아 (Kim Mina)", keys: ["민아", "Mina"], secondaryKeys: ["class rep"], content: "Kim Mina is the class representative. Short brown bob, green eyes." },
          { entryId: "e3", title: "강지훈 (Kang Jihoon)", keys: ["지훈", "Jihoon"], secondaryKeys: [], content: "Kang Jihoon, a tall boy on the basketball team." },
          { entryId: "e4", title: "School grounds", keys: ["school"], secondaryKeys: [], content: "Location entry (not a person)." },
          { entryId: "e5", title: "Ms. Park (homeroom teacher)", keys: ["Ms. Park", "선생님"], secondaryKeys: [], content: "Homeroom teacher in her thirties." }
        ]
      }],
      extraWorldBooks: [{
        worldBookId: wb2,
        name: "Town NPCs",
        scope: "extra",
        entries: [{ entryId: "t1", title: "Cafe owner", keys: ["owner"], secondaryKeys: [], content: "Runs the cafe near the school." }]
      }],
      assets: []
    },
    {
      summary: { characterId: c2, name: "Aria the Wanderer", avatarUrl: svgImage("Aria", 200, 256, 256), hasDocument: false, chatCount: 1, worldBookIds: [] },
      description: "Aria, a silver-haired elf ranger with a green cloak.",
      worldBooks: [],
      extraWorldBooks: [],
      assets: []
    }
  ];
  characters[0]!.assets = [
    asset(c1, "seoyeon_default", 330),
    asset(c1, "seoyeon_smile", 340),
    asset(c1, "seoyeon_uniform", 10),
    asset(c1, "mina_default", 140),
    asset(c1, "mina_angry", 150),
    asset(c1, "jihoon_default", 220),
    asset(c1, "background_classroom", 45, "original", { width: 768, height: 512 }),
    asset(c1, "scene.__am__.chat.0b7f6a1e-1111-4111-8111-111111111111", 280, "chat"),
    asset(c1, "seoyeon_summer.__am__.outfit.0b7f6a1e-2222-4222-8222-222222222222", 300, "outfit")
  ];
  characters[1]!.assets = [asset(c2, "aria_portrait", 200), asset(c2, "aria_cloak", 120)];

  const doc1 = createEmptyCharacterDocument(c1, new Date("2026-01-01T00:00:00Z"));
  const k1 = lorePromptKey(c1, wb1, "e1");
  const k2 = lorePromptKey(c1, wb1, "e2");
  doc1.characterPrompt.selectedLorebooks = { [c1]: [loreSelectionId(wb1, "e1"), loreSelectionId(wb1, "e2"), loreSelectionId(wb1, "e3"), CHARACTER_DESCRIPTION_LORE_ID] };
  doc1.characterPrompt.workspaceDisabledLorebooks = { [c1]: [loreSelectionId(wb1, "e3")] };
  doc1.characterPrompt.characterForms = {
    [k1]: forms(["1girl", "han seo-yeon"], ["long hair", "black hair"], ["brown eyes"], [{ label: "Uniform", top: "school uniform, white shirt, red ribbon", bottom: "pleated skirt" }, { label: "Summer", top: "white sundress", bottom: "" }]),
    [k2]: forms(["1girl"], ["short hair", "brown hair", "bob cut"], ["green eyes"], [{ label: "기본 의상", top: "school uniform, cardigan", bottom: "pleated skirt" }])
  };
  doc1.customCharacters = [
    { id: "character_7b1c9f3a-0000-4000-8000-000000000001", title: "Shadow figure", recognitionKeys: ["shadow", "그림자"], appearanceDescription: "A tall figure in a black coat." }
  ];
  void descriptionPromptKey;

  const config = createDefaultConfig();
  config.analysis.connectionId = "llm-1";
  config.analysis.model = "gpt-5.5";
  config.image.connectionId = "img-nai";
  config.image.provider = "novelai";
  config.image.model = "nai-diffusion-4-5-full";

  return {
    status: {
      ready: true,
      extensionVersion: "0.10.0",
      activeChatId: "chat-1",
      activeCharacterId: c1,
      activeGroupCharacterIds: [],
      missingPermissions: [],
      generationProvider: "novelai"
    },
    config,
    chatImageGeneration: createDefaultChatImageGenerationSettings(),
    uiState: createDefaultUiState(),
    llmConnections: [
      { id: "llm-1", name: "OpenAI main", provider: "openai", model: "gpt-5.5", isDefault: true, hasApiKey: true },
      { id: "llm-2", name: "Gemini vision", provider: "google", model: "gemini-3-pro", isDefault: false, hasApiKey: true }
    ],
    imageConnections: [
      { id: "img-nai", name: "NovelAI", provider: "novelai", model: "nai-diffusion-4-5-full", isDefault: true, generationProvider: "novelai", promptCodec: "novelai-structured" },
      { id: "img-comfy", name: "Local ComfyUI", provider: "comfyui", model: "anima-v1", isDefault: false, generationProvider: "comfy-ui", promptCodec: "anima-flat" }
    ],
    characters,
    documents: { [c1]: doc1 },
    personas: [
      { personaId: "persona-1", name: "Joon", avatarUrl: svgImage("Joon", 30, 256, 256), description: "A transfer student." },
      { personaId: "persona-2", name: "Hana", avatarUrl: null, description: "" }
    ],
    activePersonaId: "persona-1",
    logs: [],
    extra: {}
  };
}

export function findCharacter(db: MockDb, characterId: string): MockCharacter | undefined {
  return db.characters.find((c) => c.summary.characterId === characterId);
}

export function documentFor(db: MockDb, characterId: string): CharacterDocument {
  return (db.documents[characterId] ??= createEmptyCharacterDocument(characterId));
}
