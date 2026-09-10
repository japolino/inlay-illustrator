import { isNovelAiConnection, type PromptPreset } from "../../shared/config.js";
import { promptSummary } from "../view-model.js";
import type { SectionContext } from "./section-context.js";

function createPresetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function renderPromptSection({ ui, config, imageConnections, actions, rerender }: SectionContext): void {
  const activeImgConn = imageConnections?.find((c) => c.id === config.imageConnectionId)
    || imageConnections?.find((c) => c.is_default)
    || imageConnections?.[0]
    || null;
  const isNai = isNovelAiConnection(activeImgConn);

  // When NovelAI connection is detected, automatically enforce NAI prompt syntax
  let effectiveConfig = config;
  if (isNai && config.promptSyntax !== "nai") {
    actions.patchConfig({ promptSyntax: "nai" });
    effectiveConfig = { ...config, promptSyntax: "nai" };
  }

  const section = ui.section("Prompt output", false, {
    description: "Control renderer syntax, tag separators, reusable presets, and prompt affixes.",
    badge: promptSummary(effectiveConfig)
  });

  ui.addSelect(
    section,
    "promptSeparator",
    "Prompt separator",
    [
      { value: "pipe", label: "Pipe ( | ) - Scene | Character tags" },
      { value: "newline", label: "Newline ( \n\n ) - Multi-line tag groups" },
      { value: "native", label: "NovelAI Native Characters (v4 API)" }
    ],
    config.promptSeparator === "native"
      ? "Keeps scene and character prompts separate in parameters.characters. Host NovelAI V4 support is unverified. Use pipe mode unless your host supports native character channels."
      : "Delimiter separating scene tags and character definitions (V3.7.6 Card.PromptSep).",
    rerender
  );

  if (isNai) {
    ui.addSummary(
      section,
      "Prompt syntax is automatically locked to NovelAI based on your active connection profile."
    );
  } else {
    ui.addSelect(section, "promptSyntax", "Prompt syntax", [
      { value: "nai", label: "NovelAI ({ } weights)" },
      { value: "comfyui", label: "ComfyUI (( ) weights)" }
    ], "", rerender);
  }

  ui.addSelect(
    section,
    "imageTextLanguage",
    "In-image text language",
    [
      { value: "off", label: "Off (사용 안함) - No text" },
      { value: "free", label: "Free (자유) - Model chooses language" },
      { value: "english", label: "English (영어)" },
      { value: "korean", label: "Korean (한국어)" },
      { value: "japanese", label: "Japanese (일본어)" },
      { value: "chinese", label: "Chinese (중국어)" }
    ],
    "Add speech bubbles, sound effects, or dialogue text inside the image (V3.7.6 Card.Text)."
  );

  ui.addSwitch(
    section,
    "originalReference",
    "Source reference",
    "Include the configured creation name as an explicit source-style reference.",
    rerender
  );
  if (config.originalReference) ui.addText(section, "originalCreationName", "Creation name");

  ui.addSwitch(
    section,
    "supplement",
    "Natural language supplement",
    "Add natural language pose and action descriptions to character tags (V3.7.6 Card.Supplement)."
  );

  ui.addSwitch(
    section,
    "quoteEnabled",
    "Extract image dialogue quotes",
    "Include a short per-shot dialogue quote in parser output (V3.7.6 Card.Quote). Quotes are saved as metadata; existing image display is unchanged."
  );

  ui.addSubtitle(section, "Prompt presets");
  if (config.promptPresets.length === 0) {
    ui.addSummary(section, "The original V3.7.6 preset is used by default. Save a preset to replace its positive and negative templates.");
  }

  const selectedPreset = config.promptPresets.find((preset) => preset.id === config.activePromptPresetId) || null;
  const presetSelectTarget = ui.row(section, "Active preset", "CustomPos is placed before the preset output. CustomNeg is a positive suffix. With no selection, the original V3.7.6 preset is used.");
  const presetSelect = document.createElement("select");
  presetSelect.className = "inlay-native-select";
  presetSelect.setAttribute("aria-label", "Active prompt preset");
  presetSelect.innerHTML = '<option value="">V3.7.6 default preset</option>';
  for (const preset of config.promptPresets) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.name;
    option.selected = preset.id === config.activePromptPresetId;
    presetSelect.append(option);
  }
  presetSelect.addEventListener("change", () => {
    actions.patchConfig({ activePromptPresetId: presetSelect.value || null });
    rerender();
  });
  presetSelectTarget.append(presetSelect);

  const presetNameTarget = ui.row(section, "Preset name", "Save a new preset or update the selected preset with these values.");
  const presetName = document.createElement("input");
  presetName.type = "text";
  presetName.value = selectedPreset?.name || "";
  presetName.placeholder = "e.g. Cinematic anime";
  presetName.setAttribute("aria-label", "Preset name");
  presetNameTarget.append(presetName);

  const presetPositiveTarget = ui.row(section, "Preset positive template", "Use {prompt} for the full generated prompt, or {setup} and {char} for scene and character groups. Plain tags automatically get the generated prompt appended.");
  const presetPositive = document.createElement("textarea");
  presetPositive.value = selectedPreset?.positivePrefix || "";
  presetPositive.placeholder = "masterpiece, best quality";
  presetPositive.setAttribute("aria-label", "Preset positive template");
  presetPositiveTarget.append(presetPositive);

  const presetNegativeTarget = ui.row(section, "Preset negative template", "Negative quality tags. Character negatives and your custom negative additions are appended. Source {prompt} expands to empty in this template.");
  const presetNegative = document.createElement("textarea");
  presetNegative.value = selectedPreset?.negativePrefix || "";
  presetNegative.placeholder = "lowres, bad anatomy";
  presetNegative.setAttribute("aria-label", "Preset negative template");
  presetNegativeTarget.append(presetNegative);

  const readPresetValues = (forNew = false): PromptPreset | null => {
    const name = presetName.value.trim();
    if (!name) {
      actions.updateStatus("A preset name is required.");
      return null;
    }
    const duplicate = config.promptPresets.find((preset) =>
      preset.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0
      && (forNew || preset.id !== selectedPreset?.id)
    );
    if (duplicate) {
      actions.updateStatus(`A preset named \"${name}\" already exists.`);
      return null;
    }
    return {
      id: forNew ? createPresetId() : selectedPreset?.id || createPresetId(),
      name,
      positivePrefix: presetPositive.value.trim(),
      negativePrefix: presetNegative.value.trim()
    };
  };

  ui.addActions(section, [
    {
      label: "Save new",
      primary: true,
      onClick: () => {
        const next = readPresetValues(true);
        if (!next) return;
        actions.patchConfig({ promptPresets: [...config.promptPresets, next], activePromptPresetId: next.id });
        actions.updateStatus(`Saved preset \"${next.name}\".`);
        rerender();
      }
    },
    {
      label: "Update selected",
      disabled: !selectedPreset,
      onClick: () => {
        if (!selectedPreset) {
          actions.updateStatus("Select a preset to update.");
          return;
        }
        const next = readPresetValues();
        if (!next) return;
        actions.patchConfig({
          promptPresets: config.promptPresets.map((preset) => preset.id === selectedPreset.id ? next : preset)
        });
        actions.updateStatus(`Updated preset \"${next.name}\".`);
        rerender();
      }
    },
    {
      label: "Rename",
      disabled: !selectedPreset,
      onClick: () => {
        if (!selectedPreset) {
          actions.updateStatus("Select a preset to rename.");
          return;
        }
        const name = presetName.value.trim();
        if (!name) {
          actions.updateStatus("A preset name is required.");
          return null;
        }
        const duplicate = config.promptPresets.find((preset) =>
          preset.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0
          && preset.id !== selectedPreset.id
        );
        if (duplicate) {
          actions.updateStatus(`A preset named \"${name}\" already exists.`);
          return;
        }
        actions.patchConfig({
          promptPresets: config.promptPresets.map((preset) => preset.id === selectedPreset.id ? { ...preset, name } : preset)
        });
        actions.updateStatus(`Renamed preset to \"${name}\".`);
        rerender();
      }
    },
    {
      label: "Delete",
      danger: true,
      disabled: !selectedPreset,
      onClick: async () => {
        if (!selectedPreset) {
          actions.updateStatus("Select a preset to delete.");
          return;
        }
        const confirmed = await ui.confirmDestructive(
          "Delete prompt preset?",
          `Delete "${selectedPreset.name}"? This cannot be undone.`,
          "Delete preset"
        );
        if (!confirmed) return;
        actions.patchConfig({
          promptPresets: config.promptPresets.filter((preset) => preset.id !== selectedPreset.id),
          activePromptPresetId: null
        });
        actions.updateStatus(`Deleted preset "${selectedPreset.name}".`);
        rerender();
      }
    }
  ]);

  ui.addText(
    section,
    "customPositivePrefix",
    "Custom author tags (Positive prefix / CustomPos)",
    "Tags prepended to the [Positive] prompt (V3.7.6 toggle_Card.CustomPos / 커스텀 작가 태그)."
  );
  ui.addText(
    section,
    "customPositiveSuffix",
    "Custom quality tags (Positive suffix / CustomNeg)",
    "Tags appended to the [Positive] prompt (V3.7.6 toggle_Card.CustomNeg / 커스텀 퀄리티 태그 - source positive suffix, NOT negative prompt!)."
  );
  ui.addText(
    section,
    "customNegative",
    "Negative prompt additions",
    "Additional tags appended to the negative prompt."
  );
}
