/** Analysis settings page (Asset Maid `R0t` 141557, `jwe` 141579, `Ewe` 141657, `Nwe` 141681). All changes save at once. */
import type { FunctionComponent } from "preact";
import { useEffect, useState } from "preact/hooks";
import { V5_ANALYZER_SIZE_IDS, type AnalysisProfile, type V5DirectionPreset, type V5DirectionSetting, type V5UserDirections } from "../../../shared/contract/config.js";
import { Button, TextArea, TextField, TrashIcon, XIcon, cn } from "../ui/index.js";
import { useConfigForm } from "./config-form.js";
import {
  builtInDescription,
  commitPresetDraft,
  controlState,
  directionPatch,
  newPresetDraft,
  orderedPresets,
  presetControls,
  presetLabel,
  removePreset,
  selectPreset,
  selectedPreset,
  setControlEnabled,
  setControlValue,
  setCustomInstruction,
  SIZE_CANDIDATES,
  toggleSizeCandidate,
  withOverrides,
  type DirectionKind
} from "./directions.js";
import { EyeIcon, GroupIcon, ImageIcon, PanelsIcon, PencilIcon, PlusIcon, RatioIcon, SaveIcon, ShuffleIcon, SpinnerIcon } from "./icons.js";
import { ANALYSIS_LABELS as A, PAGE_TITLES } from "./labels.js";
import { ChoiceCard, LabeledCheckbox, LoadingBox, SettingsFrame } from "./parts.js";

const PROFILE_OPTIONS: Array<{ value: AnalysisProfile; image: string; imageClassName: string }> = [
  { value: "v5-hybrid", image: "https://i.postimg.cc/W4rDTB61/5.png", imageClassName: "-right-6 h-[118%] w-[62%]" },
  { value: "v4-5", image: "https://i.postimg.cc/dVZ3jbf6/4-5.png", imageClassName: "-right-3 h-[110%] w-[60%]" }
];

const PRESET_ICONS: Record<string, FunctionComponent<{ className?: string }>> = {
  "scene-default": ImageIcon,
  "scene-comic": PanelsIcon,
  "scene-pov": EyeIcon,
  "scene-ensemble": GroupIcon,
  "image-ratio-default": RatioIcon,
  "image-ratio-unspecified": ShuffleIcon
};

export function AnalysisProfilePage() {
  const form = useConfigForm();
  const config = form.config;
  return (
    <SettingsFrame section="analysis-profile" title={PAGE_TITLES["analysis-profile"]} className="gap-8">
      {!config ? <LoadingBox /> : (
        <>
          <ProfileSelector value={config.novelai.analysisProfile} onChange={(value) => void form.apply({ novelai: { analysisProfile: value } })} />
          {config.novelai.analysisProfile === "v5-hybrid" ? (
            <DirectionEditors
              directions={config.novelai.v5UserDirections}
              developerMode={config.ui.developerModeEnabled}
              onSave={async (key, setting) => {
                await form.applyStrict({ novelai: { v5UserDirections: { [key]: directionPatch(setting) } } });
              }}
            />
          ) : null}
        </>
      )}
    </SettingsFrame>
  );
}

/** Analyzer mode selector (`jwe`). */
export function ProfileSelector({ value, onChange }: { value: AnalysisProfile; onChange: (value: AnalysisProfile) => void }) {
  return (
    <div class="grid min-w-0 grid-cols-2 gap-3 mobile:grid-cols-1" role="radiogroup" aria-label={A.profileGroup} data-analysis-profile-selector="">
      {PROFILE_OPTIONS.map((option) => (
        <ChoiceCard
          key={option.value}
          selected={value === option.value}
          label={A.profiles[option.value].label}
          description={A.profiles[option.value].description}
          image={{ src: option.image, className: option.imageClassName }}
          onSelect={() => { if (value !== option.value) onChange(option.value); }}
          data-analysis-profile-option={option.value}
        />
      ))}
    </div>
  );
}

type DirectionKey = keyof V5UserDirections;

function DirectionEditors({ directions, developerMode, onSave }: { directions: V5UserDirections; developerMode: boolean; onSave: (key: DirectionKey, setting: V5DirectionSetting) => Promise<void> }) {
  return (
    <div class="grid min-w-0 content-start gap-8" data-v5-instruction-grid="">
      <DirectionEditor kind="analysis" settingKey="scene" title={A.sceneTitle} saved={directions.scene} developerMode={developerMode} onSave={onSave} />
      <DirectionEditor kind="aspect-ratio" settingKey="imageRatio" title={A.imageRatioTitle} saved={directions.imageRatio} developerMode={developerMode} onSave={onSave} />
    </div>
  );
}

const ACTION_WRAP = "inline-flex h-8 items-center rounded-md bg-surface-control p-1 max-md:h-11";
const ACTION_BUTTON = "h-6 w-8 rounded-sm max-md:h-9 max-md:w-9";

/** One direction editor (`Nwe`). */
export function DirectionEditor({ kind, settingKey, title, saved, developerMode, onSave }: {
  kind: DirectionKind;
  settingKey: DirectionKey;
  title: string;
  saved: V5DirectionSetting;
  developerMode: boolean;
  onSave: (key: DirectionKey, setting: V5DirectionSetting) => Promise<void>;
}) {
  const [draft, setDraft] = useState<V5DirectionPreset | null>(null);
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteArmed, setDeleteArmed] = useState(false);

  const presets = saved.presets ?? [];
  const selected = selectedPreset(saved);
  const customText = selected ? customDrafts[selected.id] ?? null : null;
  const builtInText = builtInDescription(kind, selected);
  const selectedIsCustom = selected !== undefined && builtInText === undefined;
  const editing = draft !== null;
  const shown = draft ?? selected;
  const editsBuiltInInstruction = kind === "analysis" && !editing;
  const draftExists = !!(draft && presets.some((preset) => preset.id === draft.id));
  const canDeleteDraft = draftExists && presets.length > 1;
  const canDeleteSelected = selectedIsCustom && presets.length > 1;
  const draftName = draft?.name.trim() ?? "";
  const controls = presetControls(kind, shown, developerMode);
  const { builtIns, custom } = orderedPresets(kind, presets);

  useEffect(() => {
    if (!editing && customText === null) {
      setError("");
      setDeleteArmed(false);
    }
  }, [editing, customText, saved]);

  const setCustom = (text: string | null) => {
    if (!selected) return;
    setCustomDrafts((previous) => {
      const next = { ...previous };
      if (text === null) delete next[selected.id];
      else next[selected.id] = text;
      return next;
    });
  };

  const persist = async (setting: V5DirectionSetting): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    setError("");
    try {
      await onSave(settingKey, setting);
      setDraft(null);
      setDeleteArmed(false);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const choose = (id: string) => {
    if (saving || editing || id === selected?.id) return;
    void persist(selectPreset(saved, id));
  };
  const saveCustomInstruction = async () => {
    if (customText === null || saving || !selected) return;
    if (await persist(setCustomInstruction(saved, selected.id, customText))) setCustom(null);
  };
  const saveDraft = () => {
    if (!draft || !draftName || saving) return;
    void persist(commitPresetDraft(kind, saved, { ...draft, name: draftName }));
  };
  const remove = (id: string) => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    void persist(removePreset(saved, id));
  };
  const toggleControl = (ref: string, enabled: boolean) => {
    if (draft) {
      setDraft(withOverrides(draft, setControlEnabled(draft.controlOverrides, ref, enabled)));
      return;
    }
    if (saving || !selected) return;
    const next = withOverrides(selected, setControlEnabled(selected.controlOverrides, ref, enabled));
    void persist(selectPreset({ presets: presets.map((p) => (p.id === selected.id ? next : p)) }, selected.id));
  };
  const changeControlValue = (ref: string, value: number) => {
    if (draft) {
      setDraft(withOverrides(draft, setControlValue(draft.controlOverrides, ref, value)));
      return;
    }
    if (saving || !selected) return;
    const next = withOverrides(selected, setControlValue(selected.controlOverrides, ref, value));
    void persist(selectPreset({ presets: presets.map((p) => (p.id === selected.id ? next : p)) }, selected.id));
  };

  const textValue = editsBuiltInInstruction
    ? customText ?? (selected?.customInstruction?.text ?? "")
    : !editing && builtInText
      ? builtInText
      : kind === "analysis"
        ? shown?.customInstruction?.text ?? ""
        : shown?.instruction ?? "";
  // Scene presets: the custom instruction is editable in place (saved by the header button); else read-only until edited.
  const readOnly = saving || (!editing && !editsBuiltInInstruction);

  const headerEnd = editing || customText !== null ? (
    <div class="flex h-8 min-w-0 flex-1 flex-nowrap items-center justify-end gap-1.5 max-md:h-11" data-v5-preset-editing="">
      {draft ? (
        <TextField className="h-8 max-w-56 min-w-32 flex-1 bg-surface-prompt-field max-md:h-11" value={draft.name} maxLength={80} aria-label={A.presetName(title)}
          onInput={(event) => { const name = (event.currentTarget as HTMLInputElement).value; setDraft((current) => current && { ...current, name }); }} />
      ) : null}
      {draft && canDeleteDraft ? (
        <Button variant="danger" size={deleteArmed ? "sm" : "workbenchIcon"} aria-label={A.deleteAria(draft.name)} disabled={saving} onClick={() => { if (draft) remove(draft.id); }}>
          {deleteArmed ? A.confirmDelete : <TrashIcon />}
        </Button>
      ) : null}
      <Button variant="ghost" size="workbenchIcon" aria-label={A.cancelEdit} title={A.cancelEdit} disabled={saving}
        onClick={() => { setDraft(null); setCustom(null); setDeleteArmed(false); setError(""); }}>
        <XIcon />
      </Button>
      <Button size="workbenchIcon" aria-label={draft ? A.savePreset : A.saveCustomInstruction} title={draft ? A.savePreset : A.saveCustomInstruction}
        disabled={saving || (draft !== null && !draftName)} onClick={draft ? saveDraft : () => void saveCustomInstruction()}>
        {saving ? <SpinnerIcon /> : <SaveIcon />}
      </Button>
    </div>
  ) : (
    <div class={cn("flex h-8 min-w-0 flex-nowrap items-center justify-end gap-1.5 max-md:h-11", saving && "pointer-events-none")} aria-busy={saving}>
      {canDeleteSelected && selected ? (
        <Button variant="danger" size={deleteArmed ? "sm" : "workbenchIcon"} data-v5-preset-action="delete" aria-label={A.deleteAria(selected.name)}
          title={deleteArmed ? A.confirmDeletePreset : A.deletePreset} onClick={() => remove(selected.id)}>
          {deleteArmed ? A.confirmDelete : <TrashIcon />}
        </Button>
      ) : null}
      {selectedIsCustom && selected ? (
        <div class={ACTION_WRAP} data-v5-preset-action="edit">
          <Button variant="ghost" size="workbenchIcon" className={ACTION_BUTTON} aria-label={A.editPresetAria(selected.name)} title={A.editPreset}
            onClick={() => {
              setDraft({ ...selected, ...(selected.controlOverrides ? { controlOverrides: { ...selected.controlOverrides } } : {}), ...(selected.allowedSizeIds ? { allowedSizeIds: [...selected.allowedSizeIds] } : {}) });
              setDeleteArmed(false);
              setError("");
            }}>
            <PencilIcon />
          </Button>
        </div>
      ) : null}
      <div class={ACTION_WRAP} data-v5-preset-action="add">
        <Button variant="ghost" size="workbenchIcon" className={ACTION_BUTTON} aria-label={A.addPresetAria(title)} title={A.addPreset}
          onClick={() => { if (saving || editing) return; setDraft(newPresetDraft(kind, settingKey)); setDeleteArmed(false); setError(""); }}>
          <PlusIcon />
        </Button>
      </div>
    </div>
  );

  return (
    <section class="grid min-w-0 content-start gap-3" data-settings-page-section="" data-v5-direction={settingKey}>
      <header class="flex min-h-8 min-w-0 items-center justify-between gap-3">
        <h2 class="shrink-0 text-sm font-extrabold">{title}</h2>
        {headerEnd}
      </header>
      <div class={cn("grid max-h-42 grid-cols-2 gap-2 overflow-y-auto rounded-lg bg-card p-2.5 md:grid-cols-4", (saving || editing) && "pointer-events-none")}
        role="radiogroup" aria-label={A.selection(title)} aria-busy={saving} data-v5-direction-selection-grid={kind}>
        {[...builtIns, ...custom].map((preset) => {
          const Icon = builtInDescription(kind, preset) !== undefined ? PRESET_ICONS[preset.id] : undefined;
          const label = presetLabel(kind, preset);
          const isSelected = preset.id === selected?.id;
          return (
            <button key={preset.id} type="button" role="radio" aria-checked={isSelected} aria-disabled={saving || editing || undefined} title={label}
              onClick={() => choose(preset.id)} data-v5-preset={preset.id}
              class={cn("min-h-11 min-w-0 rounded-md border px-3 py-2 text-left text-xs font-extrabold outline-none transition-colors hover:bg-surface-navigation-hover focus-visible:ring-2 focus-visible:ring-ring/55",
                isSelected ? "border-border bg-surface-navigation-selected text-selected-foreground" : "border-border bg-surface-prompt-field text-muted-foreground")}>
              <span class="flex min-w-0 items-center gap-2">
                {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
                <span class="block min-w-0 truncate">{label}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div class={cn("grid min-h-0 gap-2.5 rounded-lg bg-card p-2.5 md:h-56 md:min-h-56", kind === "aspect-ratio" && "md:grid-cols-[max-content_minmax(0,1fr)]", controls.length > 0 && "md:grid-cols-[minmax(0,1fr)_max-content]")}
        data-v5-instruction-frame={kind}>
        {kind === "aspect-ratio" ? (
          <div class="grid h-full min-h-0 grid-cols-1 grid-rows-[repeat(5,minmax(0,1fr))] gap-2 text-xs leading-6 text-muted-foreground mobile:grid-cols-2 mobile:grid-rows-none" role="group" aria-label={A.sizeCandidates} data-v5-image-ratio-reference="">
            {SIZE_CANDIDATES.map((size) => (
              <LabeledCheckbox key={size.id} label={`sizeId ${size.id} · ${size.resolution}`} checked={(shown?.allowedSizeIds ?? V5_ANALYZER_SIZE_IDS).includes(size.id)}
                disabled={!editing} background="promptField" className="h-full w-full min-w-0 whitespace-nowrap tabular-nums"
                onCheckedChange={(checked) => setDraft((current) => current && { ...current, allowedSizeIds: toggleSizeCandidate(current.allowedSizeIds, size.id, checked) })} />
            ))}
          </div>
        ) : null}
        <div class={cn("grid h-full min-h-0 min-w-0 gap-2.5", kind === "aspect-ratio" && "md:grid-rows-[auto_minmax(0,1fr)]")}>
          {kind === "aspect-ratio" ? (
            <p class="text-xs leading-6 text-muted-foreground">
              {A.sizeHelpBefore} <strong class="font-extrabold text-foreground">sizeId n</strong>{A.sizeHelpAfter}
            </p>
          ) : null}
          <TextArea
            className={cn("min-h-44 resize-y bg-surface-prompt-field px-3.5 py-3 text-xs leading-6 focus-visible:ring-0 focus-visible:outline-none md:h-full md:min-h-0 md:resize-none", !editing && "cursor-text text-muted-foreground")}
            value={textValue}
            placeholder={editsBuiltInInstruction ? A.customInstructionPlaceholder : undefined}
            readOnly={readOnly}
            aria-readonly={readOnly}
            aria-label={editsBuiltInInstruction ? A.customInstruction : title}
            data-v5-instruction-prototype={kind}
            onInput={(event) => {
              const value = (event.currentTarget as HTMLTextAreaElement).value;
              if (!editing) {
                if (editsBuiltInInstruction) setCustom(value);
                return;
              }
              setDraft((current) => current && (kind === "analysis" ? { ...current, customInstruction: { enabled: !!value.trim(), text: value } } : { ...current, instruction: value }));
            }}
          />
        </div>
        {controls.length > 0 ? (
          <div class={cn("grid min-w-0 gap-2 md:h-full md:w-36", developerMode ? "md:grid-rows-4" : "md:grid-rows-2")} role="group" aria-label={A.presetOptions} data-v5-preset-controls={shown?.scenePresetId}>
            {controls.map((control) => {
              const state = controlState(control, shown?.controlOverrides);
              const label = A.controls[control.ref] ?? control.label;
              const values = control.valueOptions?.map((option) => option.value) ?? [];
              const index = state.value === undefined ? -1 : values.indexOf(state.value);
              if (!values.length) {
                return (
                  <LabeledCheckbox key={control.ref} label={label} checked={state.enabled} background="promptField"
                    className={cn("h-10 w-full min-w-0 justify-center md:h-full", saving && "pointer-events-none")} onCheckedChange={(checked) => toggleControl(control.ref, checked)} />
                );
              }
              return (
                <div key={control.ref} class="grid h-22 min-w-0 grid-rows-2 overflow-hidden rounded-md bg-surface-prompt-field md:row-span-2 md:h-full">
                  <LabeledCheckbox label={label} checked={state.enabled} background="transparent" labelClassName="truncate"
                    className={cn("h-full w-full min-w-0 justify-center rounded-none", saving && "pointer-events-none")} onCheckedChange={(checked) => toggleControl(control.ref, checked)} />
                  <div class={cn("m-1 inline-flex min-w-0 items-center justify-center rounded-md bg-surface-control p-0.5", saving && "pointer-events-none")}
                    role="group" aria-label={A.countGroup(label)} aria-disabled={!state.enabled || saving || undefined} data-v5-preset-numeric-control={control.ref}>
                    <Button variant="ghost" size="icon" className="size-6 rounded-sm p-0 text-sm max-md:size-9" aria-label={A.decrease(label)}
                      disabled={!state.enabled || saving || index <= 0} onClick={() => { const v = values[index - 1]; if (v !== undefined) changeControlValue(control.ref, v); }}>−</Button>
                    <output class="min-w-5 text-center text-2xs font-extrabold text-secondary-foreground tabular-nums" aria-label={`${label} ${state.value ?? ""}`} aria-live="polite">{state.value}</output>
                    <Button variant="ghost" size="icon" className="size-6 rounded-sm p-0 text-sm max-md:size-9" aria-label={A.increase(label)}
                      disabled={!state.enabled || saving || index >= values.length - 1} onClick={() => { const v = values[index + 1]; if (v !== undefined) changeControlValue(control.ref, v); }}>+</Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      {error ? <p class="text-xs text-destructive" role="alert">{error}</p> : null}
    </section>
  );
}
