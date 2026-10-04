/**
 * Current character / all characters settings (Asset Maid `Fwe` 145511: settings table `uxt` 144904, prompts `mxt` 145084,
 * charx analysis `pxt` 145129, data management `fxt` 145043, header end `gxt` 145470). Scope rules: spec/ui.md §4.7.1.
 * Toggles/selects save at once; the prompt textareas are drafts saved by the header button.
 */
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import type { CharxSettingField, MetadataAvailability } from "../../../shared/contract/character.js";
import {
  IMAGE_SIZE_PRESETS,
  charxScopeFor,
  generationProviderFromLumiverse,
  promptCodecForProvider,
  resetAllCharxOverrides,
  type CharxSettingsPatch,
  type CustomImageSize,
  type EffectiveCharxSettings,
  type InlayConfig
} from "../../../shared/contract/config.js";
import type { AnalysisKind } from "../../../shared/contract/rpc.js";
import { useApp, useAppState, useRpcQuery } from "../../state/app-state.js";
import { toRpcError } from "../../rpc/client.js";
import { Button, IconButton, Select, Switch, TrashIcon, cn, useConfirm, type SelectOption } from "../ui/index.js";
import { ResetIcon, SpinnerIcon } from "./icons.js";
import { CHARX_LABELS as X, COMMON_LABELS as C, PAGE_TITLES } from "./labels.js";
import { CharxRegexRows } from "./charx-regex.js";
import { AnalyzeButton, Badge, ErrorBox, LoadingBox, Row, SaveActions, SectionCard, SettingsFrame } from "./parts.js";

export type CharxScope = "charx" | "all";

type PromptField = "fixedPositivePrompt" | "negativePrompt" | "animaPositivePrompt" | "animaNegativePrompt";
const PROMPT_FIELDS: PromptField[] = ["fixedPositivePrompt", "negativePrompt", "animaPositivePrompt", "animaNegativePrompt"];

/** Patch key -> stored field name (for the "Custom" markers). */
export const PATCH_FIELD: Record<keyof EffectiveCharxSettings, CharxSettingField> = {
  nativeAssetVisibility: "nativeAssetVisibility",
  freeCharacterGenerationEnabled: "freeCharacterGeneration",
  freeOutfitGenerationEnabled: "freeOutfitGeneration",
  rosterSelectionEnabled: "rosterSelectionEnabled",
  stateAccumulationEnabled: "stateAccumulationEnabled",
  nsfwAlwaysEnabled: "nsfwAlwaysEnabled",
  forceAiChoiceCoordinates: "forceAiChoiceCoordinates",
  autoRemoveConflictingRegex: "autoRemoveConflictingRegex",
  fixedResolution: "fixedResolution",
  fixedPositivePrompt: "fixedPositivePrompt",
  negativePrompt: "negativePrompt",
  animaPositivePrompt: "animaPositivePrompt",
  animaNegativePrompt: "animaNegativePrompt"
};

/** Fixed resolution options (`Z0` + `lxt`): built-in sizes then custom sizes. */
export function fixedResolutionOptions(customSizes: readonly CustomImageSize[]): Array<SelectOption & { custom: boolean }> {
  const label = (w: number, h: number) => X.sizeLabel(w === h ? "square" : w > h ? "landscape" : "portrait", w, h);
  return [
    ...IMAGE_SIZE_PRESETS.map((p) => ({ value: String(p.id), label: label(p.width, p.height), custom: false })),
    ...customSizes.map((s) => ({ value: String(s.id), label: `${label(s.width, s.height)} · ${X.customSize}`, custom: true }))
  ];
}

/** Source metadata state from the per-asset cache (`sme` badge input). */
export function sourceMetadataState(availability: Record<string, MetadataAvailability> | undefined): MetadataAvailability | "unknown" {
  const values = Object.values(availability ?? {});
  if (!values.length) return "unknown";
  if (values.every((v) => v === "deleted")) return "deleted";
  const usable = values.filter((v) => v !== "deleted");
  if (usable.every((v) => v === "available")) return "available";
  if (usable.every((v) => v === "none")) return "none";
  return "partial";
}

/** True when any character has per-character differences (AM `MNe`). */
export function anyCharxDirty(config: InlayConfig | null): boolean {
  const dirty = config?.characterPrompt.charxGenerationDefaults.dirtyFieldsBySourceId ?? {};
  return Object.values(dirty).some((list) => list.length > 0);
}

/**
 * Interim "reset all per-character settings" (`ENe`) through `config.update`: bumps every all-characters revision so
 * all overrides lose, and empties the dirty lists (deep merge cannot delete keys, so each list becomes []).
 */
export function resetAllPatch(config: InlayConfig) {
  const next = resetAllCharxOverrides(charxScopeFor(config, null));
  const defaults = next.characterPrompt.charxGenerationDefaults as { revisionByField?: Record<string, number> };
  const dirty = Object.fromEntries(Object.keys(config.characterPrompt.charxGenerationDefaults.dirtyFieldsBySourceId ?? {}).map((key) => [key, [] as CharxSettingField[]]));
  return { characterPrompt: { charxGenerationDefaults: { revisionByField: defaults.revisionByField ?? {}, dirtyFieldsBySourceId: dirty } } };
}

export function CharxSettingsPage({ scope }: { scope: CharxScope }) {
  const app = useApp();
  const confirm = useConfirm();
  const config = useAppState((state) => state.config);
  const characterId = useAppState((state) => state.selectedCharacterId);
  const characters = useAppState((state) => state.characters);
  const workspace = useAppState((state) => (state.workspace && state.workspace.characterId === state.selectedCharacterId ? state.workspace : null));
  const docRevision = useAppState((state) => (state.selectedCharacterId ? state.documentRevision[state.selectedCharacterId] ?? 0 : 0));
  const query = useRpcQuery("charxSettings.get", scope === "all" ? { characterId: characterId ?? "" } : characterId ? { characterId } : null, [docRevision]);
  const [drafts, setDrafts] = useState<Partial<Record<PromptField, string>>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [deletingMetadata, setDeletingMetadata] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const runningMetadata = useAppState((state) => Object.values(state.analysisJobs).find((job) => !job.finishedAt && job.kind === "metadata-check" && job.characterId === characterId));
  const runningMatching = useAppState((state) => Object.values(state.analysisJobs).find((job) => !job.finishedAt && job.kind === "asset-matching" && job.characterId === characterId));

  useEffect(() => {
    setDrafts({});
    setSaveError(null);
  }, [scope, characterId]);

  const characterName = workspace?.characterName ?? characters?.find((c) => c.characterId === characterId)?.name ?? null;
  const title = scope === "all" ? PAGE_TITLES["all-charx"] : characterName ?? X.charxTitle;
  const data = query.data;
  const values = data ? (scope === "all" ? data.all : data.effective) : null;
  const dirtyFields = useMemo(() => new Set(scope === "charx" ? data?.dirtyFields ?? [] : []), [scope, data]);
  const promptDirty = values ? PROMPT_FIELDS.some((f) => drafts[f] !== undefined && drafts[f] !== values[f]) : false;
  const scopeDirty = scope === "all" ? anyCharxDirty(config) : dirtyFields.size > 0;

  type Data = NonNullable<typeof query.data>;
  const update = (fn: (previous: Data) => Data) => query.setData((previous) => (previous ? fn(previous) : (previous as unknown as Data)));

  const write = async (patch: CharxSettingsPatch): Promise<boolean> => {
    if (!data) return false;
    // Optimistic local update, replaced by the server result.
    update((previous) => (scope === "all" ? { ...previous, all: { ...previous.all, ...patch } } : { ...previous, effective: { ...previous.effective, ...patch } }));
    try {
      if (scope === "all") {
        const result = await app.call("charxSettings.setDefaults", { patch });
        update((previous) => ({ ...previous, all: result.all }));
      } else if (characterId) {
        const result = await app.call("charxSettings.setOverride", { characterId, patch });
        update((previous) => ({ ...previous, effective: result.effective, dirtyFields: result.dirtyFields }));
      }
      void query.reload();
      return true;
    } catch (caught) {
      void query.reload();
      app.notifyError(caught);
      return false;
    }
  };

  const savePrompts = async () => {
    if (!values || saving) return;
    const patch: CharxSettingsPatch = {};
    for (const field of PROMPT_FIELDS) if (drafts[field] !== undefined && drafts[field] !== values[field]) patch[field] = drafts[field];
    setSaving(true);
    setSaveError(null);
    try {
      if (scope === "all") await app.call("charxSettings.setDefaults", { patch });
      else if (characterId) await app.call("charxSettings.setOverride", { characterId, patch });
      setDrafts({});
      await query.reload();
    } catch (caught) {
      setSaveError(toRpcError(caught).message);
    } finally {
      setSaving(false);
    }
  };

  const resetScope = async () => {
    setDrafts({});
    try {
      if (scope === "all") {
        try {
          await app.call("charxSettings.resetAll", {});
        } catch (caught) {
          // Older backends: fall back to bumping the default revisions through config.update.
          if (toRpcError(caught).code !== "unsupported" && toRpcError(caught).code !== "unknown-method") throw caught;
          if (config) await app.updateConfig(resetAllPatch(config));
        }
      } else if (characterId) {
        const result = await app.call("charxSettings.clearOverrides", { characterId });
        update((previous) => ({ ...previous, effective: result.effective, dirtyFields: [] }));
      }
      await query.reload();
    } catch (caught) {
      app.notifyError(caught);
    }
  };

  const deleteMetadata = async () => {
    if (!characterId) return;
    setDeletingMetadata(true);
    setMetadataError(null);
    try {
      await app.call("assets.clearMetadataRecords", { characterId });
      await app.reloadWorkspace();
    } catch (caught) {
      setMetadataError(toRpcError(caught).message);
    } finally {
      setDeletingMetadata(false);
    }
  };

  const resetCharacter = async () => {
    if (!characterId) return;
    const ok = await confirm({ title: X.resetConfirmTitle, description: X.resetConfirmDescription, confirmLabel: X.resetConfirmButton, cancelLabel: C.cancel });
    if (!ok) return;
    setResetting(true);
    setResetError(null);
    try {
      await app.call("character.reset", { characterId, confirm: true });
      setDrafts({});
      await Promise.all([app.reloadWorkspace(), query.reload()]);
      app.notify({ tone: "success", message: X.resetDone });
    } catch (caught) {
      setResetError(toRpcError(caught).message);
    } finally {
      setResetting(false);
    }
  };

  const startAnalysis = (kind: AnalysisKind) => {
    if (characterId) void app.startAnalysis({ kind, characterId });
  };

  const resetLabel = scope === "all" ? X.resetAll : X.resetCurrent;
  const actions = (
    <SaveActions dirty={promptDirty} saving={saving} error={saveError} onSave={() => void savePrompts()}
      label={saveError ? X.promptSaveRetry : X.promptSave} unsavedLabel={X.promptUnsaved} failedLabel={X.promptSaveFailed}>
      <IconButton label={resetLabel} disabled={!scopeDirty || !data} onClick={() => void resetScope()} data-charx-reset-scope="">
        <ResetIcon />
      </IconButton>
    </SaveActions>
  );

  const section = scope === "all" ? "all-charx" : "charx";
  if (scope === "charx" && !characterId) {
    return <SettingsFrame section={section} title={title}><p class="rounded-lg bg-card p-4 text-xs text-muted-foreground">{C.noCharacter}</p></SettingsFrame>;
  }
  if (!values || !config) {
    return (
      <SettingsFrame section={section} title={title} actions={actions}>
        {query.error ? <ErrorBox message={query.error.message} onRetry={() => void query.reload()} /> : <LoadingBox />}
      </SettingsFrame>
    );
  }

  const marker = (key: keyof EffectiveCharxSettings) =>
    dirtyFields.has(PATCH_FIELD[key]) ? <Badge tone="primary" className="px-1.5 text-3xs" title={X.overrideBadgeTitle}>{X.overrideBadge}</Badge> : null;
  const anima = promptCodecForProvider(config.image.provider ? generationProviderFromLumiverse(config.image.provider) : config.runtime.generationProvider) === "anima-flat";
  const positiveField: PromptField = anima ? "animaPositivePrompt" : "fixedPositivePrompt";
  const negativeField: PromptField = anima ? "animaNegativePrompt" : "negativePrompt";
  const metadataState = sourceMetadataState(workspace?.metadataAvailability);
  const metadataPresent = Object.keys(workspace?.metadataAvailability ?? {}).length > 0;
  const sizeOptions = fixedResolutionOptions(config.runtime.customImageSizes);
  const metadataTone = metadataState === "none" ? "danger" : metadataState === "partial" ? "warning" : metadataState === "available" ? "success" : "neutral";
  const analyzeLabels = { analyze: X.analyze, stop: X.stop, stopAnalysis: X.stopAnalysis };

  return (
    <SettingsFrame section={section} title={title} actions={actions} className="gap-0">
      <p class="px-0.5 pb-2 text-xs leading-relaxed text-muted-foreground" data-charx-scope={scope}>{scope === "all" ? X.scopeAllNote : X.scopeCharxNote}</p>
      <SectionCard title={X.generationRules}>
        <ToggleRow title={X.freeCharacter.title} description={X.freeCharacter.description} marker={marker("freeCharacterGenerationEnabled")} checked={values.freeCharacterGenerationEnabled}
          onChange={(checked) => void write({ freeCharacterGenerationEnabled: checked })} field="freeCharacterGeneration" />
        <ToggleRow title={X.freeOutfit.title} description={X.freeOutfit.description} marker={marker("freeOutfitGenerationEnabled")} checked={values.freeOutfitGenerationEnabled}
          onChange={(checked) => void write({ freeOutfitGenerationEnabled: checked })} field="freeOutfitGeneration" />
        <ToggleRow title={X.stateAccumulation.title} description={X.stateAccumulation.description} marker={marker("stateAccumulationEnabled")} checked={values.stateAccumulationEnabled}
          onChange={(checked) => void write({ stateAccumulationEnabled: checked })} field="stateAccumulationEnabled" />
        <ToggleRow title={X.nsfwAlways.title} description={X.nsfwAlways.description} marker={marker("nsfwAlwaysEnabled")} checked={values.nsfwAlwaysEnabled}
          onChange={(checked) => void write({ nsfwAlwaysEnabled: checked })} field="nsfwAlwaysEnabled" />
      </SectionCard>
      <SectionCard title={X.analysisOutput}>
        <ToggleRow title={X.rosterSelection.title} description={X.rosterSelection.description} marker={marker("rosterSelectionEnabled")} checked={values.rosterSelectionEnabled}
          onChange={(checked) => void write({ rosterSelectionEnabled: checked })} field="rosterSelectionEnabled" />
        <Row title={X.fixedResolution.title} titleEnd={marker("fixedResolution")} description={X.fixedResolution.description} className="mobile:grid-cols-1 mobile:gap-2" data-charx-field="fixedResolution">
          <div class="w-48">
            <Select aria-label={X.fixedResolutionSelect} value={String(values.fixedResolution.sizeId)} options={sizeOptions} disabled={!values.fixedResolution.enabled}
              onValueChange={(value) => void write({ fixedResolution: { enabled: values.fixedResolution.enabled, sizeId: Number(value) } })} />
          </div>
          <Switch aria-label={X.fixedResolutionUse} checked={values.fixedResolution.enabled}
            onCheckedChange={(checked) => void write({ fixedResolution: { enabled: checked, sizeId: values.fixedResolution.sizeId } })} />
        </Row>
        <ToggleRow title={X.aiChoice.title} description={X.aiChoice.description} marker={marker("forceAiChoiceCoordinates")} checked={values.forceAiChoiceCoordinates}
          onChange={(checked) => void write({ forceAiChoiceCoordinates: checked })} field="forceAiChoiceCoordinates" />
        <Row title={X.nativeAssets.title} titleEnd={marker("nativeAssetVisibility")} description={X.nativeAssets.description} data-charx-field="nativeAssetVisibility">
          <div class="inline-flex h-8 items-center rounded-md bg-surface-control p-1 max-md:h-11" role="group" aria-label={X.nativeAssets.title}>
            {(["hidden", "shown"] as const).map((option) => (
              <button key={option} type="button" aria-pressed={values.nativeAssetVisibility === option}
                onClick={() => { if (values.nativeAssetVisibility !== option) void write({ nativeAssetVisibility: option }); }}
                class={cn("h-6 rounded-sm px-2.5 text-2xs font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/55 max-md:h-9 max-md:text-xs",
                  values.nativeAssetVisibility === option ? "bg-surface-navigation-selected text-selected-foreground" : "text-muted-foreground hover:text-foreground")}>
                {option === "hidden" ? X.hide : X.show}
              </button>
            ))}
          </div>
        </Row>
      </SectionCard>
      <section class="grid gap-2.5 pt-2.5 pb-4.5" data-charx-prompts="">
        <h2 class="flex h-9.5 items-center gap-1.5 px-0.5 text-xs font-extrabold">{anima ? X.animaPrompts : X.commonPrompts}{marker(positiveField)}{marker(negativeField)}</h2>
        <div class="grid h-56.5 grid-cols-2 gap-2.5 rounded-lg bg-surface-workbench p-2.5 mobile:h-auto mobile:grid-cols-1">
          {[positiveField, negativeField].map((field) => (
            <label key={field} class="grid min-h-36 grid-rows-[minmax(0,1fr)_24px] overflow-hidden rounded-md bg-surface-prompt-field md:min-h-0">
              <textarea
                class="size-full min-h-0 resize-none rounded-none border-0 bg-transparent px-2.5 py-2 text-xs leading-5 text-foreground outline-none max-md:text-base"
                value={drafts[field] ?? values[field]}
                aria-label={field === positiveField ? X.fixedPositive : X.negative}
                data-charx-prompt={field}
                onInput={(event) => { const value = (event.currentTarget as HTMLTextAreaElement).value; setDrafts((previous) => ({ ...previous, [field]: value })); }}
              />
              <span class="flex items-center justify-end px-2 text-3xs font-bold text-muted-foreground">{field === positiveField ? X.fixedPositive : X.negative}</span>
            </label>
          ))}
        </div>
      </section>
      <SectionCard title={X.charxAnalysis} disabled={scope === "all"}>
        <Row title={X.metadataCheck.title} description={X.metadataCheck.description}>
          <span class="inline-flex items-center gap-1">
            <Badge tone={metadataTone}>{X.metadataStates[metadataState]}</Badge>
            {metadataPresent && metadataState !== "deleted" ? (
              <IconButton label={X.deleteMetadataInline} title={X.deleteMetadataTitle} className="size-6" disabled={deletingMetadata || !!runningMetadata} onClick={() => void deleteMetadata()}>
                {deletingMetadata ? <SpinnerIcon className="size-3.5" /> : <TrashIcon className="size-3.5" />}
              </IconButton>
            ) : null}
          </span>
          <AnalyzeButton running={!!runningMetadata} labels={analyzeLabels} onRun={() => startAnalysis("metadata-check")} onCancel={() => runningMetadata && void app.cancelAnalysis(runningMetadata.jobId)} />
        </Row>
        <Row title={X.assetClassification.title} description={X.assetClassification.description}>
          <AnalyzeButton running={!!runningMatching} title={X.assetClassificationTitle} labels={analyzeLabels} onRun={() => startAnalysis("asset-matching")} onCancel={() => runningMatching && void app.cancelAnalysis(runningMatching.jobId)} />
        </Row>
        <CharxRegexRows characterId={characterId} analysis={workspace?.document.characterPrompt.charxAssetRegexAnalysis} disabled={scope === "all"} />
      </SectionCard>
      <SectionCard title={X.dataManagement} disabled={scope === "all"}>
        <Row title={X.metadataRecord.title} description={X.metadataRecord.description}>
          <Badge tone={metadataPresent ? "primary" : "neutral"}>{metadataPresent ? X.recordPresent : X.noRecord}</Badge>
          <Button variant="subtle" disabled={!characterId || !metadataPresent || deletingMetadata || resetting} onClick={() => void deleteMetadata()}>
            {deletingMetadata ? <SpinnerIcon /> : <TrashIcon />}{C.delete}
          </Button>
        </Row>
        <Row title={X.resetCharacter.title} description={X.resetCharacter.description}>
          <Button variant="danger" disabled={!characterId || resetting || deletingMetadata} onClick={() => void resetCharacter()} data-charx-reset="">
            {resetting ? <SpinnerIcon /> : <ResetIcon />}{X.reset}
          </Button>
        </Row>
      </SectionCard>
      {resetError ? <p class="-mt-4.5 px-0.5 pb-4.5 text-xs text-destructive" role="alert">{X.resetFailed(resetError)}</p> : null}
      {metadataError ? <p class="-mt-4.5 px-0.5 pb-4.5 text-xs text-destructive" role="alert">{X.metadataDeleteFailed(metadataError)}</p> : null}
    </SettingsFrame>
  );
}

function ToggleRow({ title, description, marker, checked, onChange, field }: { title: string; description: string; marker: ComponentChildren; checked: boolean; onChange: (checked: boolean) => void; field: CharxSettingField }) {
  return (
    <Row title={title} titleEnd={marker} description={description} data-charx-field={field}>
      <Switch aria-label={title} checked={checked} onCheckedChange={onChange} />
    </Row>
  );
}

