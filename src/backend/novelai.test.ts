import { describe, expect, test } from "bun:test";
import {
  DEFAULT_CONFIG,
  isNovelAiConnection,
  NOVELAI_RESOLUTION_PRESETS,
  NOVELAI_SAMPLER_OPTIONS,
  type Config
} from "../shared/config.js";
import { buildImageParameters, imageModelOverride, rerollImageParameters } from "./images.js";
import { renderPromptWithCurrentAffixes } from "./prompt.js";
import type { ImageConnection } from "./types.js";

describe("NovelAI profile detection and parameters", () => {
  test("correctly identifies NovelAI connection profiles without false positives", () => {
    // True NovelAI cases
    expect(isNovelAiConnection({ provider: "novelai" })).toBeTrue();
    expect(isNovelAiConnection({ provider: "NAI" })).toBeTrue();
    expect(isNovelAiConnection({ name: "My NovelAI Account" })).toBeTrue();
    expect(isNovelAiConnection({ name: "nai_v3_anime" })).toBeTrue();
    expect(isNovelAiConnection({ name: "account_nai_1" })).toBeTrue();
    expect(isNovelAiConnection({ model: "nai-diffusion-4-5-full" })).toBeTrue();
    expect(isNovelAiConnection({ model: "nai_diffusion" })).toBeTrue();

    // ComfyUI / SwarmUI must NEVER be misidentified as NovelAI even if checkpoint or name contains NAI
    expect(isNovelAiConnection({ provider: "comfyui", name: "ComfyUI NAI", model: "nai-diffusion-3.safetensors" })).toBeFalse();
    expect(isNovelAiConnection({ provider: "swarmui", name: "Swarm NAI Checkpoint", model: "nai-diffusion-4.safetensors" })).toBeFalse();
    expect(isNovelAiConnection({ provider: "comfyui", name: "Local Comfy" })).toBeFalse();

    // Substring false positive guard (OpenAI, Renaissance)
    expect(isNovelAiConnection({ provider: "openai", name: "OpenAI DALL-E" })).toBeFalse();
    expect(isNovelAiConnection({ name: "Renaissance Art Generator" })).toBeFalse();

    // Nil / empty checks
    expect(isNovelAiConnection(null)).toBeFalse();
    expect(isNovelAiConnection(undefined)).toBeFalse();
    expect(isNovelAiConnection({})).toBeFalse();
  });

  test("buildImageParameters applies NovelAI defaults, multiple-of-64 dimension snapping, and parameter clamping", async () => {
    const naiConn: ImageConnection = {
      id: "nai-1",
      name: "NovelAI",
      provider: "novelai",
      model: "nai-diffusion-4-5-full",
      is_default: true,
      default_parameters: {},
      metadata: {}
    };

    // Default configuration
    const defaultParams = await buildImageParameters(
      DEFAULT_CONFIG,
      naiConn,
      "masterpiece, 1girl",
      "lowres"
    );

    expect(defaultParams.sampler).toBe("k_euler_ancestral");
    expect(defaultParams.steps).toBe(28);
    expect(defaultParams.scale).toBe(5);
    expect(defaultParams.width).toBe(832);
    expect(defaultParams.height).toBe(1216);
    expect(typeof defaultParams.seed).toBe("number");
    expect((defaultParams.seed as number) > 0).toBeTrue();

    // Extreme/Out-of-bounds configuration clamping
    const clampedParams = await buildImageParameters(
      {
        ...DEFAULT_CONFIG,
        imageParameters: {
          steps: 999,
          scale: 4.5,
          width: 850, // Not multiple of 64 -> snaps to 832
          height: 0,   // Zero -> clamped to min 512
          seed: 12345.67, // Float -> floored to 12345
          smea: "true",
          smea_dyn: false,
          workflow: { nodes: [] },
          workflowFormat: "api_prompt",
          preserveImportedWorkflow: true
        }
      },
      naiConn,
      "test",
      "negative"
    );

    expect(clampedParams.steps).toBe(50);
    expect(clampedParams.scale).toBe(4.5);
    expect(clampedParams.width).toBe(832);
    expect(clampedParams.height).toBe(512);
    expect(clampedParams.seed).toBe(12345);
    expect(clampedParams.smea).toBe(true);
    expect(clampedParams.smea_dyn).toBe(false);

    // Stripped ComfyUI artifacts
    expect(clampedParams.workflow).toBeUndefined();
    expect(clampedParams.workflowFormat).toBeUndefined();
    expect(clampedParams.preserveImportedWorkflow).toBeUndefined();
  });

  test("buildImageParameters respects active connection defaults over fallback defaults", async () => {
    const naiConnWithDefaults: ImageConnection = {
      id: "nai-custom",
      name: "NovelAI Configured",
      provider: "novelai",
      model: "nai-diffusion-4-5-full",
      is_default: true,
      default_parameters: {
        sampler: "k_euler",
        steps: 35,
        scale: 6.5,
        width: 1024,
        height: 1024,
        smea: true,
        smea_dyn: true
      },
      metadata: {}
    };

    const params = await buildImageParameters(
      DEFAULT_CONFIG,
      naiConnWithDefaults,
      "scene prompt",
      "bad quality"
    );

    expect(params.sampler).toBe("k_euler");
    expect(params.steps).toBe(35);
    expect(params.scale).toBe(6.5);
    expect(params.width).toBe(1024);
    expect(params.height).toBe(1024);
    expect(params.smea).toBe(true);
    expect(params.smea_dyn).toBe(true);
  });

  test("renderPromptWithCurrentAffixes sanitizes embedded ComfyUI linebreaks when syntax is NAI", () => {
    const configWithNai = {
      ...DEFAULT_CONFIG,
      promptSyntax: "nai" as const
    };

    const promptWithComfyDelimiters = "1girl, solo,\n\nmasterpiece, high quality,\ncinematic lighting";
    const rendered = renderPromptWithCurrentAffixes(promptWithComfyDelimiters, "legacy", configWithNai);

    expect(rendered.includes("\n")).toBeFalse();
    expect(rendered).toContain("1girl, solo, masterpiece, high quality, cinematic lighting");
  });
});

describe("NovelAI character payload transport and rerolls", () => {
  const sampleCharacters = [
    { prompt: "blonde hair, blue eyes, white dress", negative: "gloves, hat" },
    { prompt: "black hair, red eyes, trench coat", negative: "sword, armor" }
  ];

  const naiConn: ImageConnection = {
    id: "nai-1",
    name: "NovelAI",
    provider: "novelai",
    model: "nai-diffusion-4-5-full",
    is_default: true,
    default_parameters: {
      sampler: "k_euler_ancestral",
      steps: 28,
      scale: 5.0,
      width: 832,
      height: 1216
    },
    metadata: {}
  };

  test("fresh generation transports complete positive and negative character channels intact", async () => {
    const params = await buildImageParameters(
      DEFAULT_CONFIG,
      naiConn,
      "masterpiece, sunset background",
      "blurry, watermark",
      sampleCharacters
    );

    // Characters preserved under both characters and nativeCharacters keys
    expect(Array.isArray(params.characters)).toBeTrue();
    expect(Array.isArray(params.nativeCharacters)).toBeTrue();
    const chars = params.characters as Array<{ prompt: string; negative: string }>;
    expect(chars).toHaveLength(2);

    // Character 1 channels
    expect(chars[0].prompt).toBe("blonde hair, blue eyes, white dress");
    expect(chars[0].negative).toBe("gloves, hat");

    // Character 2 channels
    expect(chars[1].prompt).toBe("black hair, red eyes, trench coat");
    expect(chars[1].negative).toBe("sword, armor");

    // Scene-level prompts remain independent
    expect(params.width).toBe(832);
    expect(params.height).toBe(1216);
  });

  test("reroll preserves character channels and generates fresh seed", () => {
    const initialParams: Record<string, unknown> = {
      sampler: "k_euler_ancestral",
      steps: 28,
      scale: 5.0,
      width: 832,
      height: 1216,
      seed: 99999,
      characters: sampleCharacters
    };

    const rerolled = rerollImageParameters(initialParams, naiConn, "new prompt", "new negative");

    // Seed must change
    expect(rerolled.seed).not.toBe(99999);
    expect(typeof rerolled.seed).toBe("number");
    expect((rerolled.seed as number) > 0).toBeTrue();

    // Characters must survive with all positive and negative channels intact
    expect(Array.isArray(rerolled.characters)).toBeTrue();
    const chars = rerolled.characters as Array<{ prompt: string; negative: string }>;
    expect(chars).toHaveLength(2);
    expect(chars[0]).toEqual({
      prompt: "blonde hair, blue eyes, white dress",
      negative: "gloves, hat"
    });
    expect(chars[1]).toEqual({
      prompt: "black hair, red eyes, trench coat",
      negative: "sword, armor"
    });
  });

  test("bulk reroll preserves character channels across multiple independent iterations", () => {
    const initialParams: Record<string, unknown> = {
      sampler: "k_euler",
      steps: 30,
      scale: 6.0,
      width: 832,
      height: 1216,
      seed: 12345,
      characters: sampleCharacters
    };

    const seeds = new Set<number>();
    for (let i = 0; i < 5; i++) {
      const rerolled = rerollImageParameters(initialParams, naiConn);
      const seed = rerolled.seed as number;
      expect(seed).toBeGreaterThan(0);
      seeds.add(seed);

      // Verify character integrity on each bulk reroll iteration
      const chars = rerolled.characters as Array<{ prompt: string; negative: string }>;
      expect(chars).toHaveLength(2);
      expect(chars[0].prompt).toBe("blonde hair, blue eyes, white dress");
      expect(chars[0].negative).toBe("gloves, hat");
      expect(chars[1].prompt).toBe("black hair, red eyes, trench coat");
      expect(chars[1].negative).toBe("sword, armor");
    }

    // Verify seeds varied across iterations
    expect(seeds.size).toBeGreaterThan(1);
  });
});

describe("Cross-provider isolation and parameter normalization", () => {
  const naiConn: ImageConnection = {
    id: "nai-1",
    name: "NovelAI",
    provider: "novelai",
    model: "nai-diffusion-4-5-full",
    is_default: true,
    default_parameters: {
      sampler: "k_euler_ancestral",
      steps: 32,
      scale: 5.5,
      width: 832,
      height: 1216
    },
    metadata: {}
  };

  const comfyConn: ImageConnection = {
    id: "comfy-1",
    name: "Local ComfyUI",
    provider: "comfyui",
    model: "sd_xl_base.safetensors",
    is_default: false,
    default_parameters: {
      steps: 20,
      cfg: 8.0,
      width: 1024,
      height: 1024
    },
    metadata: {
      comfyui: {
        workflow_api_json: {
          "3": { class_type: "KSampler", inputs: { seed: 100, steps: 20, cfg: 8.0 } },
          "6": { class_type: "CLIPTextEncode", inputs: { text: "old positive" } },
          "7": { class_type: "CLIPTextEncode", inputs: { text: "old negative" } }
        },
        field_mappings: [
          { nodeId: "3", fieldName: "seed", mappedAs: "seed" },
          { nodeId: "6", fieldName: "text", mappedAs: "positive_prompt" },
          { nodeId: "7", fieldName: "text", mappedAs: "negative_prompt" }
        ]
      }
    }
  };

  test("cross-provider reroll: ComfyUI -> NovelAI strips workflow and applies active NAI defaults", () => {
    // Parameters originally from ComfyUI
    const comfyInitial: Record<string, unknown> = {
      workflow: {
        "3": { class_type: "KSampler", inputs: { seed: 42 } },
        "6": { class_type: "CLIPTextEncode", inputs: { text: "old pos" } }
      },
      workflowFormat: "api_prompt",
      preserveImportedWorkflow: true,
      comfyui_custom_fields: { "3:steps": 25 },
      field_mappings: [{ nodeId: "3", fieldName: "seed", mappedAs: "seed" }],
      checkpoint: "sd_xl_base.safetensors",
      scheduler: "karras",
      sampler_name: "euler",
      seed: 42,
      characters: [
        { prompt: "elf girl, silver hair", negative: "human ears" }
      ]
    };

    const rerolled = rerollImageParameters(comfyInitial, naiConn, "new prompt", "new negative");

    // All ComfyUI-specific artifacts must be stripped
    expect(rerolled.workflow).toBeUndefined();
    expect(rerolled.workflowFormat).toBeUndefined();
    expect(rerolled.preserveImportedWorkflow).toBeUndefined();
    expect(rerolled.comfyui_custom_fields).toBeUndefined();
    expect(rerolled.field_mappings).toBeUndefined();
    expect(rerolled.checkpoint).toBeUndefined();
    expect(rerolled.scheduler).toBeUndefined();
    expect(rerolled.sampler_name).toBeUndefined();

    // NovelAI active defaults must be applied
    expect(rerolled.sampler).toBe("k_euler_ancestral");
    expect(rerolled.steps).toBe(32);
    expect(rerolled.scale).toBe(5.5);
    expect(rerolled.width).toBe(832);
    expect(rerolled.height).toBe(1216);

    // Seed must be randomized
    expect(typeof rerolled.seed).toBe("number");
    expect(rerolled.seed).not.toBe(42);

    // Characters must survive cross-provider switch
    expect(Array.isArray(rerolled.characters)).toBeTrue();
    const chars = rerolled.characters as Array<{ prompt: string; negative: string }>;
    expect(chars).toHaveLength(1);
    expect(chars[0]).toEqual({ prompt: "elf girl, silver hair", negative: "human ears" });
  });

  test("cross-provider reroll: NovelAI -> ComfyUI rebuilds workflow from connection metadata without degradation", () => {
    // Parameters originally from NovelAI
    const naiInitial: Record<string, unknown> = {
      sampler: "k_euler_ancestral",
      steps: 28,
      scale: 5.0,
      width: 832,
      height: 1216,
      seed: 77777,
      characters: [
        { prompt: "magical girl", negative: "dark" }
      ]
    };

    const rerolled = rerollImageParameters(
      naiInitial,
      comfyConn,
      "fresh positive scene",
      "ugly, bad quality"
    );

    // ComfyUI workflow must be rebuilt from metadata
    expect(rerolled.workflow).toBeDefined();
    expect(typeof rerolled.workflow).toBe("object");
    expect(rerolled.workflowFormat).toBe("api_prompt");
    expect(rerolled.preserveImportedWorkflow).toBeTrue();

    const wf = rerolled.workflow as Record<string, { inputs: Record<string, unknown> }>;
    expect(wf["6"].inputs.text).toBe("fresh positive scene");
    expect(wf["7"].inputs.text).toBe("ugly, bad quality");
    expect(typeof wf["3"].inputs.seed).toBe("number");
    expect(wf["3"].inputs.seed).not.toBe(77777);

    // Characters must still survive for metadata persistence
    expect(Array.isArray(rerolled.characters)).toBeTrue();
    expect(rerolled.characters).toEqual([{ prompt: "magical girl", negative: "dark" }]);
  });

  test("explicit ComfyUI connection is never misidentified or degraded as NovelAI", () => {
    const comfyWithNaiName: ImageConnection = {
      id: "comfy-nai",
      name: "ComfyUI NAI Checkpoint Runner",
      provider: "comfyui",
      model: "nai-diffusion-3.safetensors",
      is_default: false,
      default_parameters: {},
      metadata: comfyConn.metadata
    };

    expect(isNovelAiConnection(comfyWithNaiName)).toBeFalse();

    const comfyMeta = comfyConn.metadata as { comfyui: { workflow_api_json: Record<string, unknown> } };
    const initial: Record<string, unknown> = {
      workflow: comfyMeta.comfyui.workflow_api_json,
      workflowFormat: "api_prompt",
      preserveImportedWorkflow: true,
      seed: 123
    };

    const rerolled = rerollImageParameters(initial, comfyWithNaiName, "updated prompt", "updated neg");

    // Workflow must NOT be deleted
    expect(rerolled.workflow).toBeDefined();
    expect(rerolled.workflowFormat).toBe("api_prompt");
  });

  test("strips leftover ComfyUI keys and normalizes ComfyUI sampler names to valid NovelAI samplers", async () => {
    const connWithoutSampler: ImageConnection = {
      ...naiConn,
      default_parameters: {
        steps: 28
      }
    };
    const dirtyConfig: Config = {
      ...DEFAULT_CONFIG,
      imageParameters: {
        sampler_name: "euler",
        scheduler: "normal",
        comfyui_field_values: { prompt: 1 },
        includePersonaAvatar: true,
        includeCharacterAvatar: true,
        steps: 30,
        scale: 5,
        seed: 1
      }
    };

    const built = await buildImageParameters(dirtyConfig, connWithoutSampler, "test prompt", "test neg");

    // "euler" must be converted to valid NovelAI sampler "k_euler"
    expect(built.sampler).toBe("k_euler");

    // Leftover ComfyUI keys must be discarded
    expect(built.sampler_name).toBeUndefined();
    expect(built.scheduler).toBeUndefined();
    expect(built.comfyui_field_values).toBeUndefined();
    expect(built.includePersonaAvatar).toBeUndefined();
    expect(built.includeCharacterAvatar).toBeUndefined();
  });

  test("sends the selected canvas size as resolution/size and honors the connection profile model", async () => {
    const conn: ImageConnection = {
      id: "nai-size",
      name: "NovelAI",
      provider: "novelai",
      model: "nai-diffusion-4-full",
      is_default: true,
      default_parameters: {},
      metadata: {}
    };

    // Resolution selected through the extension panel.
    const fromResolution = await buildImageParameters(
      {
        ...DEFAULT_CONFIG,
        imageModel: "stale-model-from-legacy-settings",
        imageParameters: { resolution: "1216x832", steps: 28, scale: 5 }
      },
      conn,
      "prompt",
      "neg"
    );
    expect(fromResolution.width).toBe(1216);
    expect(fromResolution.height).toBe(832);
    expect(fromResolution.resolution).toBe("1216x832");
    expect(fromResolution.size).toBe("1216x832");

    // Explicit width/height still win, and out-of-grid values snap to 64.
    const fromWidthHeight = await buildImageParameters(
      { ...DEFAULT_CONFIG, imageParameters: { width: 1000, height: 700 } },
      conn,
      "prompt",
      "neg"
    );
    expect(fromWidthHeight.width).toBe(1024);
    expect(fromWidthHeight.height).toBe(704);
    expect(fromWidthHeight.resolution).toBe("1024x704");

    // Connection profile size is used when the extension has no size configured.
    const profileSized: ImageConnection = {
      ...conn,
      default_parameters: { width: 1536, height: 1024 }
    };
    const fromProfile = await buildImageParameters(DEFAULT_CONFIG, profileSized, "prompt", "neg");
    expect(fromProfile.width).toBe(1536);
    expect(fromProfile.height).toBe(1024);

    // A stale extension model must not override the connection profile model.
    expect(imageModelOverride({ ...DEFAULT_CONFIG, imageModel: "stale-model" }, conn)).toBeUndefined();
    expect(imageModelOverride({ ...DEFAULT_CONFIG, imageModel: "explicit" }, { ...conn, model: "" })).toBe("explicit");
    expect(imageModelOverride(DEFAULT_CONFIG, conn)).toBeUndefined();
  });
});


