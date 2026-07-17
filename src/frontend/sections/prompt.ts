import type { PromptPreset } from "../../shared/config.js";
import type { SectionContext } from "./section-context.js";

function createPresetId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `preset-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function renderPromptSection({ ui, config, actions, rerender }: SectionContext): void {
  const section = ui.section("Prompt output", false);
  if (config.mode === "experimental") {
    ui.addSummary(section, "Experimental mode uses the atomic Anima parser and prompt renderer.");
  } else {
    ui.addSelect(section, "promptStyle", "Prompt style", [
      { value: "default", label: "Default" },
      { value: "anima", label: "Anima" }
    ]);
  }
  ui.addSelect(section, "promptSyntax", "Prompt syntax", [
    { value: "nai", label: "NovelAI" },
    { value: "comfyui", label: "ComfyUI" }
  ]);
  ui.addSwitch(section, "originalReference", "Source reference");
  ui.addText(section, "originalCreationName", "Creation name");
  ui.addSwitch(section, "supplement", config.mode === "experimental" ? "Natural/shared detail" : "Natural supplement");
  ui.addSubtitle(section, "Prompt presets");

  const selectedPreset = config.promptPresets.find((preset) => preset.id === config.activePromptPresetId) || null;
  const presetSelectTarget = ui.row(section, "Active preset", "Preset prefixes are inserted before the custom prompt fields below.");
  const presetSelect = document.createElement("select");
  presetSelect.className = "inlay-native-select";
  presetSelect.setAttribute("aria-label", "Active prompt preset");
  presetSelect.innerHTML = '<option value="">No preset</option>';
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

  const presetPositiveTarget = ui.row(section, "Preset positive", "Tags placed before the custom positive prefix and generated prompt.");
  const presetPositive = document.createElement("textarea");
  presetPositive.value = selectedPreset?.positivePrefix || "";
  presetPositive.placeholder = "masterpiece, best quality";
  presetPositive.setAttribute("aria-label", "Preset positive prefix");
  presetPositiveTarget.append(presetPositive);

  const presetNegativeTarget = ui.row(section, "Preset negative", "Tags placed before the custom negative additions and shot negatives.");
  const presetNegative = document.createElement("textarea");
  presetNegative.value = selectedPreset?.negativePrefix || "";
  presetNegative.placeholder = "lowres, bad anatomy";
  presetNegative.setAttribute("aria-label", "Preset negative prefix");
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
      onClick: () => {
        if (!selectedPreset) {
          actions.updateStatus("Select a preset to rename.");
          return;
        }
        const name = presetName.value.trim();
        if (!name) {
          actions.updateStatus("A preset name is required.");
          return;
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
      onClick: () => {
        if (!selectedPreset) {
          actions.updateStatus("Select a preset to delete.");
          return;
        }
        actions.patchConfig({
          promptPresets: config.promptPresets.filter((preset) => preset.id !== selectedPreset.id),
          activePromptPresetId: null
        });
        actions.updateStatus(`Deleted preset \"${selectedPreset.name}\".`);
        rerender();
      }
    }
  ]);

  ui.addText(section, "customPositivePrefix", "Positive prefix");
  ui.addText(section, "customPositiveSuffix", "Positive suffix");
  ui.addText(section, "customNegative", "Negative additions");
}
