import {
  isNovelAiConnection,
  NOVELAI_RESOLUTION_PRESETS,
  NOVELAI_SAMPLER_OPTIONS
} from "../../shared/config.js";
import { generationSummary } from "../view-model.js";
import type { SectionContext } from "./section-context.js";

export function renderGenerationSection({ ui, config, imageConnections, actions, rerender }: SectionContext): void {
  const activeImgConn = imageConnections?.find((c) => c.id === config.imageConnectionId)
    || imageConnections?.find((c) => c.is_default)
    || imageConnections?.[0]
    || null;
  const isNai = isNovelAiConnection(activeImgConn);
  const section = ui.section("Generation", true, {
    description: "Choose when and how many illustrations are created.",
    badge: generationSummary(config)
  });

  const selectedImageConn = imageConnections?.find((c) => c.id === config.imageConnectionId);
  const imageConnOptions = (imageConnections || []).map((conn) => ({
    value: conn.id,
    label: `${conn.name}${conn.is_default ? " (default)" : ""} (${conn.provider}${conn.model ? ` / ${conn.model}` : ""})`
  }));
  if (config.imageConnectionId && !selectedImageConn) {
    imageConnOptions.push({ value: config.imageConnectionId, label: `Missing: ${config.imageConnectionId}` });
  }

  if (imageConnOptions.length > 0) {
    ui.addSelect(
      section,
      "imageConnectionId",
      "Image connection",
      imageConnOptions,
      selectedImageConn
        ? `Active: ${selectedImageConn.name} (${selectedImageConn.provider})`
        : "Choose the image generator profile for illustrations.",
      rerender
    );
  }

  ui.addSwitch(
    section,
    "autoGenerate",
    "Auto generate",
    "Automatically illustrate completed assistant messages. You can always use Generate latest above."
  );
  ui.addSwitch(
    section,
    "coverImageEnabled",
    "Cover image",
    "Generate one additional cinematic key visual for the whole message and place it above the first paragraph.",
    rerender
  );
  if (config.coverImageEnabled) {
    ui.addNumber(section, "coverImageWidth", "Cover image width", 120, 2400);
    ui.addNumber(section, "coverImageMaxHeightVh", "Cover image max height (vh)", 10, 100);
  }

  ui.addSelect(
    section,
    "moduleMode",
    "Pipeline mode",
    [
      { value: "illustration", label: "Illustration (삽화) - Full scene with characters" },
      { value: "asset", label: "Asset (에셋) - Isolated character portrait/sprites" },
      { value: "comic", label: "Comic (만화) - Multi-panel manga style" }
    ],
    "V3.7.6 module generation mode (Card.Mode): multi-shot illustration, isolated character assets, or multi-panel manga.",
    rerender
  );

  if (config.moduleMode === "comic") {
    ui.addNumber(
      section,
      "comicMinPanels",
      "Minimum comic panels",
      1,
      100,
      "Minimum number of manga panels per comic illustration (V3.7.6 Card.PanelNum, default: 3)."
    );
  }

  ui.addNumber(section, "minImages", "Minimum images", 1, 12);
  ui.addNumber(section, "maxImages", "Maximum images", 1, 12);
  if (config.moduleMode !== "asset") {
    ui.addNumber(section, "maxCharacters", "Maximum characters", 1, 8, "Maximum number of characters detected per illustration (default: 2).");
  }

  if (isNai) {
    ui.addSubtitle(section, "NovelAI settings");
    ui.addSummary(section, "NovelAI connection detected. Basic generation settings are exposed and applied automatically.");

    const params = config.imageParameters || {};
    const curWidth = Number(params.width) || 832;
    const curHeight = Number(params.height) || 1216;
    const matchedPreset = NOVELAI_RESOLUTION_PRESETS.find((p) => p.width === curWidth && p.height === curHeight)
      || NOVELAI_RESOLUTION_PRESETS[0];

    ui.addCustomSelect(
      section,
      "Resolution",
      matchedPreset.value,
      NOVELAI_RESOLUTION_PRESETS.map((p) => ({ value: p.value, label: p.label })),
      "NovelAI resolution preset. Automatically synchronizes the in-chat display aspect ratio.",
      (val) => {
        const found = NOVELAI_RESOLUTION_PRESETS.find((p) => p.value === val);
        if (found) {
          actions.patchConfig({
            inlayImageAspect: found.aspect,
            imageParameters: {
              ...config.imageParameters,
              width: found.width,
              height: found.height,
              resolution: found.value
            }
          });
          rerender();
        }
      }
    );

    const currentSampler = String(params.sampler || params.sampler_name || "k_euler_ancestral");
    ui.addCustomSelect(
      section,
      "Sampler",
      currentSampler,
      NOVELAI_SAMPLER_OPTIONS,
      "Diffusion sampler algorithm.",
      (val) => {
        actions.patchConfig({
          imageParameters: {
            ...config.imageParameters,
            sampler: val
          }
        });
      }
    );

    const currentSteps = Number(params.steps) || 28;
    ui.addCustomNumber(
      section,
      "Steps",
      currentSteps,
      1,
      50,
      "Sampling steps (1–50, default 28).",
      (val) => {
        if (val !== null) {
          actions.patchConfig({
            imageParameters: {
              ...config.imageParameters,
              steps: val
            }
          });
        }
      }
    );

    const currentScale = Number(params.scale) || Number(params.cfg) || 5;
    ui.addCustomNumber(
      section,
      "Guidance scale (CFG)",
      currentScale,
      1,
      20,
      "Prompt guidance scale (1–20, default 5.0).",
      (val) => {
        if (val !== null) {
          actions.patchConfig({
            imageParameters: {
              ...config.imageParameters,
              scale: val,
              cfg: val
            }
          });
        }
      },
      false
    );

    const currentSeed = params.seed !== undefined ? String(params.seed) : "-1";
    ui.addCustomText(
      section,
      "Seed",
      currentSeed,
      "RNG seed. Set to -1 for a fresh random seed on each turn.",
      (val) => {
        const trimmed = (val || "").trim();
        const parsed = Number(trimmed);
        const seedVal = trimmed === "" || !Number.isFinite(parsed) || parsed <= 0
          ? -1
          : Math.floor(parsed);
        actions.patchConfig({
          imageParameters: {
            ...config.imageParameters,
            seed: seedVal
          }
        });
      }
    );

    const currentSmea = params.smea === true || params.smea === "true";
    ui.addCustomSwitch(
      section,
      "Auto-SMEA",
      currentSmea,
      "Enable SMEA sampling optimization for higher resolutions.",
      (checked) => {
        actions.patchConfig({
          imageParameters: {
            ...config.imageParameters,
            smea: checked
          }
        });
      }
    );

    const currentSmeaDyn = params.smea_dyn === true || params.smea_dyn === "true";
    ui.addCustomSwitch(
      section,
      "Auto-SMEA Dynamic",
      currentSmeaDyn,
      "Dynamically applies SMEA for high resolutions with enhanced visual details and dramatic contrast.",
      (checked) => {
        actions.patchConfig({
          imageParameters: {
            ...config.imageParameters,
            smea_dyn: checked
          }
        });
      }
    );
  }
}
