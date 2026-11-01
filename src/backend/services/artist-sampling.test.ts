import { expect, test } from "bun:test";
import { normalizeConfig, normalizeNovelAIArtistOverrides, novelAISamplingOptions } from "../../shared/contract/index.js";
import { resolveNovelAIRunConfig } from "../../engine/context/context.js";
import { buildNovelAIParameters } from "./images.js";

test("saved artist sampling reaches the NovelAI request; model changes enforce supported options", () => {
  const overrides = normalizeNovelAIArtistOverrides({ sampler: "k_dpmpp_2m_sde", noiseSchedule: "exponential" })!;
  expect(overrides).toEqual({ sampler: "k_dpmpp_2m_sde", noiseSchedule: "exponential" });
  expect(normalizeNovelAIArtistOverrides({ sampler: "invalid", noiseSchedule: "invalid" })).toBeUndefined();
  const config = normalizeConfig({ characterPrompt: { defaultArtistId: "mine", selectedArtistId: "mine", artistPrompts: [
    { id: "mine", title: "Mine", prompt: "artist:me", novelAIOverrides: overrides },
  ] } });
  const run = resolveNovelAIRunConfig({ ...config, characterPrompt: { ...config.characterPrompt, selectedArtistId: "mine" } } as never);
  expect(run).toMatchObject(overrides);
  const request = { purpose: "chat" as const, prompt: "scene", width: 832, height: 1216, novelai: run };
  const v45 = buildNovelAIParameters(request, config, { model: "nai-diffusion-4-5-full", isNovelAIV5: false });
  expect(v45.parameters.sampler).toBe("k_dpmpp_2m_sde");
  expect(JSON.parse(String(v45.parameters.rawRequestOverride)).parameters.noise_schedule).toBe("exponential");
  const v5 = buildNovelAIParameters(request, config, { model: "nai-diffusion-5-full", isNovelAIV5: true });
  expect(JSON.parse(String(v5.parameters.rawRequestOverride)).parameters.noise_schedule).toBe("karras");
  const legacy = buildNovelAIParameters(request, config, { model: "nai-diffusion-3", isNovelAIV5: false });
  expect(legacy.parameters.sampler).toBe(config.novelai.sampler);
  expect(novelAISamplingOptions("nai-diffusion-3").samplers.some((s) => s.value === "ddim_v3")).toBe(true);
  expect(novelAISamplingOptions("nai-diffusion-4-5-full").samplers.some((s) => s.value === "ddim_v3")).toBe(false);
  expect(config.characterPrompt.artistPrompts[0]!.novelAIOverrides).toEqual(overrides);
});
