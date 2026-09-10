/**
 * V3.7.6 Type definitions.
 * Faithfully reflects decompiled V3.7.6 module schema, Lua runtime, and CONTRACT.md.
 */

export type V376Mode = "illustration" | "asset" | "comic";
export type V376TextLanguage = "off" | "free" | "english" | "korean" | "japanese" | "chinese";
export type V376PromptSyntax = "nai" | "comfyui";
export type V376PromptSeparator = "pipe" | "newline" | "native";
export type V376EncodingMode = "plain" | "placeholder" | "base64" | "atbash";

/**
 * Shared V376 options contract.
 * Owned by source-schema, consumed by prompt, parser, runtime, and config ports.
 */
export interface V376Options {
  mode: V376Mode;
  nsfw: boolean;
  supplement: boolean;
  text: V376TextLanguage;
  quote: boolean;
  syntax: V376PromptSyntax;
  separator: V376PromptSeparator;
  imageMin: number;
  imageMax: number;
  characterMax: number;
  panelMin: number;
  originalReference: boolean;
  originalCreationName: string;
  encodingMode?: V376EncodingMode;
  prefillEnabled?: boolean;
  characterContext?: boolean;
  characterContextDepth?: number;
  customInstruction?: string;
  includeUserMessage?: boolean;
  customPos?: string;
  customNeg?: string;
  [key: string]: unknown;
}

export interface V376Supplement {
  pose?: string;
  action?: string;
  [key: string]: string | undefined;
}

export interface V376Character {
  name: string;
  label: string;
  age: string;
  appearance: string;
  attire: string;
  body?: string;
  expression?: string;
  action?: string;
  sex?: string;
  position?: string;
  supplement?: string | V376Supplement;
  text?: string;
  negative?: string;
  /** Internal or pre-resolved positive prompt string */
  positive?: string;
  /** Internal identity string for character appearance cache (label, age, appearance, body, attire) */
  identity?: string;
}

export interface V376Panel {
  number: string;
  composition: string;
  text?: string;
}

export interface V376Shot {
  paragraph: number;
  camera?: string;
  situation?: string;
  characters: V376Character[];
  placement?: string;
  panels?: V376Panel[];
  quote?: string;
  /** Flat or combined scene text (situation + place fallback) */
  scene?: string;
  action?: string;
  sex?: string;
  supplement?: string;
  place?: string;
}

export interface V376Scene {
  place: string;
  shots: V376Shot[];
}

export interface V376Payload {
  scenes: V376Scene[];
  cover?: unknown;
}

export interface V376NativeCharacter {
  name?: string;
  prompt: string;
  negative?: string;
}

export interface V376CompiledShot {
  paragraph: number;
  prompt: string;
  negative: string;
  corePrompt: string;
  nativeCharacters?: V376NativeCharacter[];
  rawShot: V376Shot;
  scenePlace?: string;
  quote?: string;
  /** Comic panel prompt string (pipe-separated formatted panel definitions) */
  panelsPrompt?: string;
  /** Alias for panelsPrompt for backward/forward compatibility */
  panels?: string;
  /** Extracted character names from shot */
  characterNames?: string[];
}

export interface V376NormalizedCharacter {
  name: string;
  positive: string;
  negative: string;
  identity: string;
}

export interface V376NormalizedShot {
  paragraph: number;
  quote?: string;
  camera?: string;
  characters: V376NormalizedCharacter[];
  scene: string;
  action?: string;
  sex?: string;
  supplement?: string;
  panels: V376Panel[];
  place?: string;
  placement?: string;
}

export interface V376PrefillMessage {
  role: "system" | "user" | "char";
  content: string;
  [key: string]: string;
}

export interface V376CompileOptions extends Partial<V376Options> {
  presetContent?: string;
  activePromptPresetId?: string | null;
  promptPresets?: Array<{
    id: string;
    name: string;
    positivePrefix?: string;
    negativePrefix?: string;
    content?: string;
    [key: string]: unknown;
  }>;
  /** Custom artist tag prefix prepended to positive prompt (Lua toggle_Card.CustomPos) */
  customPos?: string;
  /** Custom quality tag suffix appended to positive prompt (Lua toggle_Card.CustomNeg) */
  customNeg?: string;
  /** Config alias for customPos */
  customPositivePrefix?: string;
  /** Config alias for customNeg */
  customPositiveSuffix?: string;
  /** Config negative affix explicitly appended to negative prompt */
  customNegative?: string;
  /** Config alias for customNegative */
  negativeAffix?: string;
  /** Character appearance negative tag cache (Lua Card.CharAppearance) */
  appearanceMap?: Record<string, { tags?: string; negTags?: string }>;
  [key: string]: unknown;
}
