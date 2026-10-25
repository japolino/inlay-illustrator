import { createPipelineFixture, PERSONA_ID } from "./fixtures.js";

export function personaFormFixture(profile = "v5-hybrid") {
  return createPipelineFixture({ config: {
    image: { provider: "novelai", model: "nai-diffusion-4-5-full", connectionId: "img-1" },
    novelai: { analysisProfile: profile }, runtime: { generationAutoRetryCount: 0 },
    characterPrompt: { personaSettings: { profiles: { [PERSONA_ID]: { forms: {
      defaultFormId: "form_default", forms: [
        { id: "form_default", label: "Regular", gender: "male", humanlike: true, basePromptGroups: { custom: ["brown hair"] }, defaultOutfitId: "regular-clothes", outfits: [{ id: "regular-clothes", label: "Casual", top: "blue shirt", bottom: "jeans" }] },
        { id: "form_wolf", label: "Wolf omega", gender: "male", humanlike: true, basePromptGroups: { custom: ["wolf ears", "wolf tail"] }, defaultOutfitId: "wolf-clothes", outfits: [{ id: "wolf-clothes", label: "Wolf clothes", top: "red cloak", bottom: "black trousers" }, { id: "wolf-costume", label: "Costume", top: "green jacket", bottom: "white pants" }] },
      ],
    } } } } },
  } });
}
