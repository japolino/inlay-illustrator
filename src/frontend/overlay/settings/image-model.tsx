/** Image generation model settings page (Asset Maid `axt` panel "image-model" 144098; provider boxes 144108-144577). */
import { useState } from "preact/hooks";
import {
  CHARACTER_REFERENCE_TYPES,
  IMAGE_SIZE_PRESETS,
  NOVELAI_MODELS,
  NOVELAI_NOISE_SCHEDULES,
  NOVELAI_SAMPLERS,
  generationProviderFromLumiverse,
  isNovelAIV5Model,
  promptCodecForProvider,
  type CharacterReferenceType,
  type CustomImageSize,
  type GenerationProvider,
  type InlayConfig
} from "../../../shared/contract/config.js";
import type { ImageConnectionSummary } from "../../../shared/contract/rpc.js";
import { useApp, useRpcQuery } from "../../state/app-state.js";
import { toRpcError } from "../../rpc/client.js";
import { IconButton, Select, TextField, cn, type SelectOption } from "../ui/index.js";
import { useConfigForm, type ConfigForm } from "./config-form.js";
import { AlertCircleIcon, PlugIcon, SpinnerIcon } from "./icons.js";
import { COMMON_LABELS as C, IMAGE_LABELS as I, PAGE_TITLES } from "./labels.js";
import { Badge, Card, ChoiceCard, Column, Columns, CommitSlider, ErrorBanner, Field, LabeledCheckbox, LoadingBox, NumberField, SaveActions, SettingsFrame, useFieldId } from "./parts.js";

const PROVIDER_KINDS: Array<{ value: GenerationProvider; gradient: string }> = [
  { value: "novelai", gradient: "from-primary/28 via-primary/10 to-transparent" },
  { value: "comfy-ui", gradient: "from-success/28 via-success/10 to-transparent" },
  { value: "generic", gradient: "from-warning/28 via-warning/10 to-transparent" }
];

/** The connection a config points at ("" = the default connection). */
export function resolveImageConnection(connections: readonly ImageConnectionSummary[], connectionId: string): ImageConnectionSummary | undefined {
  return connectionId ? connections.find((c) => c.id === connectionId) : connections.find((c) => c.isDefault) ?? connections[0];
}

/** Patch for choosing a connection (provider follows the connection; the model override is cleared). */
export function connectionPatch(connections: readonly ImageConnectionSummary[], connectionId: string) {
  const connection = resolveImageConnection(connections, connectionId);
  return { image: { connectionId, provider: connection?.provider ?? "", model: "" } };
}

/** Size preset options: built-in sizes + custom sizes (`Z0`). */
export function sizeOptions(customSizes: readonly CustomImageSize[], width: number, height: number): SelectOption[] {
  const options: SelectOption[] = [
    ...IMAGE_SIZE_PRESETS.map((p) => ({ value: `${p.width}x${p.height}`, label: `${p.width} × ${p.height}` })),
    ...customSizes.map((s) => ({ value: `${s.width}x${s.height}`, label: `${s.width} × ${s.height} · ${I.customSize}` }))
  ];
  const current = `${width}x${height}`;
  if (!options.some((o) => o.value === current)) options.push({ value: current, label: C.existingValue(`${width} × ${height}`) });
  return options;
}

export function ImageModelSettingsPage() {
  const app = useApp();
  const form = useConfigForm();
  const config = form.config;
  const connections = useRpcQuery("connections.listImage", {});
  const list = connections.data?.connections ?? [];
  const resolved = config ? resolveImageConnection(list, config.image.connectionId) : undefined;
  const models = useRpcQuery("connections.listImageModels", resolved ? { connectionId: resolved.id } : null);
  const [test, setTest] = useState<{ status: "idle" | "loading" | "success" | "error"; text?: string; title?: string }>({ status: "idle" });
  const connectionFieldId = useFieldId("ii-image-connection");

  const actions = <SaveActions dirty={form.dirty} saving={form.saving} error={form.error} onSave={() => void form.save()} />;
  if (!config) return <SettingsFrame section="image-model" title={PAGE_TITLES["image-model"]} actions={actions}><LoadingBox /></SettingsFrame>;

  const kind = generationProviderFromLumiverse(resolved?.provider ?? config.image.provider);
  const codec = promptCodecForProvider(kind);
  const connectionOptions: SelectOption[] = [
    { value: "", label: resolved && !config.image.connectionId ? `${C.connectionDefault} (${resolved.name})` : C.connectionDefault },
    ...list.map((c) => ({ value: c.id, label: `${c.name} · ${c.provider}${c.model ? ` · ${c.model}` : ""}` }))
  ];
  if (config.image.connectionId && !list.some((c) => c.id === config.image.connectionId)) connectionOptions.push({ value: config.image.connectionId, label: C.existingValue(config.image.connectionId) });
  const listed = models.data?.models ?? [];
  const modelList = listed.length || kind !== "novelai" ? listed : NOVELAI_MODELS.map((m) => ({ id: m.value, label: m.label }));
  const modelOptions: SelectOption[] = [{ value: "", label: C.connectionModel(resolved?.model ?? "") }, ...modelList.map((m) => ({ value: m.id, label: m.label || m.id }))];
  if (config.image.model && !modelList.some((m) => m.id === config.image.model)) modelOptions.splice(1, 0, { value: config.image.model, label: C.existingValue(config.image.model) });

  const runTest = async () => {
    setTest({ status: "loading" });
    try {
      const result = await app.call("image.testConnection", { connectionId: resolved?.id });
      setTest(result.ok ? { status: "success", text: I.connected(result.latencyMs) } : { status: "error", text: I.connectionFailed, title: result.error?.message });
    } catch (caught) {
      setTest({ status: "error", text: I.connectionFailed, title: toRpcError(caught).message });
    }
  };

  return (
    <SettingsFrame section="image-model" title={PAGE_TITLES["image-model"]} actions={actions} banner={<ErrorBanner message={form.error} />} className="gap-8">
      <div class="grid min-w-0 grid-cols-3 gap-3 mobile:grid-cols-1" role="radiogroup" aria-label={I.connectionGroup} data-image-generation-provider-selector="">
        {PROVIDER_KINDS.map((option) => {
          const first = list.find((c) => generationProviderFromLumiverse(c.provider) === option.value);
          return (
            <ChoiceCard key={option.value} selected={kind === option.value} label={I.providerKinds[option.value].label} description={I.providerKinds[option.value].description}
              gradient={option.gradient} disabled={!first && kind !== option.value}
              onSelect={() => { if (kind !== option.value && first) { setTest({ status: "idle" }); void form.apply(connectionPatch(list, first.id)); } }}
              data-image-generation-provider-option={option.value} />
          );
        })}
      </div>
      <Card data-image-provider-settings-box="connection">
        <Columns>
          <Field label={I.connection} htmlFor={connectionFieldId} hint={list.length || connections.loading ? I.connectionHint : I.noConnections}>
            <div class="flex min-w-0 items-center gap-1.5">
              <div class="min-w-0 flex-1">
                <Select id={connectionFieldId} aria-label={I.connection} value={config.image.connectionId} options={connectionOptions}
                  onValueChange={(value) => { setTest({ status: "idle" }); void form.apply(connectionPatch(list, value)); }} />
              </div>
              <IconButton label={I.testConnection} disabled={!resolved || test.status === "loading"} onClick={() => void runTest()}
                className={cn(test.status === "success" && "text-success", test.status === "error" && "text-destructive")} title={test.title ?? I.testConnection}>
                {test.status === "loading" ? <SpinnerIcon /> : test.status === "error" ? <AlertCircleIcon /> : <PlugIcon />}
              </IconButton>
            </div>
            {test.text ? <span class={cn("text-3xs font-medium", test.status === "success" ? "text-success" : "text-destructive")} title={test.title} role="status">{test.text}</span> : null}
          </Field>
          <Column>
            <Field label={I.model}>
              <Select aria-label={I.modelAria} value={config.image.model} options={modelOptions}
                onValueChange={(value) => void form.apply({ image: { model: value }, ...(kind === "novelai" && isNovelAIV5Model(value) ? { novelai: { characterReferenceEnabled: false } } : {}) })} />
            </Field>
            <div class="flex flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground">
              {I.promptFormat}
              <Badge tone="primary">{I.codecs[codec]}</Badge>
            </div>
          </Column>
        </Columns>
      </Card>
      {kind === "novelai" ? <NovelAIBox form={form} config={config} model={config.image.model || resolved?.model || ""} /> : null}
      {kind === "comfy-ui" ? <ComfyBox form={form} config={config} /> : null}
      {kind === "generic" ? (
        <Card title={I.genericBox} data-image-provider-settings-box="generic">
          <p class="text-xs leading-relaxed text-muted-foreground">{I.genericNote}</p>
        </Card>
      ) : null}
    </SettingsFrame>
  );
}

function NovelAIBox({ form, config, model }: { form: ConfigForm; config: InlayConfig; model: string }) {
  const nai = config.novelai;
  const v5 = isNovelAIV5Model(model);
  const referenceDisabled = v5;
  const ids = { steps: useFieldId("ii-nai-steps"), scale: useFieldId("ii-nai-scale"), rescale: useFieldId("ii-nai-rescale") };
  const samplerOptions: SelectOption[] = NOVELAI_SAMPLERS.map((s) => ({ value: s.value, label: s.label }));
  if (!samplerOptions.some((o) => o.value === nai.sampler)) samplerOptions.push({ value: nai.sampler, label: C.existingValue(nai.sampler) });
  const scheduleOptions: SelectOption[] = NOVELAI_NOISE_SCHEDULES.map((s) => ({ value: s, label: s }));
  const referenceTypes: SelectOption<CharacterReferenceType>[] = CHARACTER_REFERENCE_TYPES.map((t) => ({ value: t, label: t }));
  return (
    <Card title={I.novelaiBox} data-image-provider-settings-box="novelai">
      <Columns>
        <Column className={cn(referenceDisabled && "opacity-45")}>
          <div class="grid gap-3" aria-disabled={referenceDisabled || undefined} inert={referenceDisabled || undefined}>
            <div class="flex flex-wrap items-end gap-3">
              <LabeledCheckbox label={I.referenceEnabled} checked={nai.characterReferenceEnabled && !v5} background="promptField"
                className="h-9" onCheckedChange={(checked) => void form.apply({ novelai: { characterReferenceEnabled: checked } })} />
              <Field label={I.referenceType} className="min-w-40 flex-1">
                <Select aria-label={I.referenceType} value={nai.characterReferenceType} options={referenceTypes}
                  onValueChange={(value) => void form.apply({ novelai: { characterReferenceType: value } })} />
              </Field>
            </div>
            <Field label={`${I.referenceStrength} · ${nai.characterReferenceStrength.toFixed(2)}`}>
              <CommitSlider label={I.referenceStrength} value={nai.characterReferenceStrength} min={0} max={1} step={0.05} format={(v) => v.toFixed(2)}
                onCommit={(value) => void form.apply({ novelai: { characterReferenceStrength: value } })} />
            </Field>
            <Field label={`${I.referenceFidelity} · ${nai.characterReferenceFidelity.toFixed(2)}`}>
              <CommitSlider label={I.referenceFidelity} value={nai.characterReferenceFidelity} min={0} max={1} step={0.05} format={(v) => v.toFixed(2)}
                onCommit={(value) => void form.apply({ novelai: { characterReferenceFidelity: value } })} />
            </Field>
          </div>
          {v5 ? <p class="text-2xs text-muted-foreground">{I.referenceV5Note}</p> : null}
        </Column>
        <Column>
          <div class="grid grid-cols-2 gap-3">
            <Field label={I.sampler}>
              <Select aria-label={I.samplerAria} value={nai.sampler} options={samplerOptions} onValueChange={(value) => void form.apply({ novelai: { sampler: value } })} />
            </Field>
            <Field label={I.noiseSchedule}>
              <Select aria-label={I.noiseScheduleAria} value={nai.noiseSchedule} options={scheduleOptions} onValueChange={(value) => void form.apply({ novelai: { noiseSchedule: value } })} />
            </Field>
          </div>
          <div class="grid grid-cols-3 gap-3">
            <Field label={I.steps} htmlFor={ids.steps}>
              <NumberField id={ids.steps} value={nai.steps} min={1} max={50} step={1} onValueChange={(value) => form.draft({ novelai: { steps: value } })} />
            </Field>
            <Field label={I.scale} htmlFor={ids.scale}>
              <NumberField id={ids.scale} value={nai.scale} min={0} max={20} step={0.1} onValueChange={(value) => form.draft({ novelai: { scale: value } })} />
            </Field>
            <Field label={I.cfgRescale} htmlFor={ids.rescale}>
              <NumberField id={ids.rescale} value={nai.cfgRescale} min={0} max={1} step={0.1} onValueChange={(value) => form.draft({ novelai: { cfgRescale: value } })} />
            </Field>
          </div>
          <Field label={I.size}>
            <Select aria-label={I.sizeAria} value={`${nai.width}x${nai.height}`} options={sizeOptions(config.runtime.customImageSizes, nai.width, nai.height)}
              onValueChange={(value) => {
                const [width, height] = value.split("x").map(Number);
                if (width && height) void form.apply({ novelai: { width, height } });
              }} />
          </Field>
          <div class="grid gap-2">
            <LabeledCheckbox label={I.qualityToggle} checked={nai.qualityToggle} background="promptField" className="h-9 w-full" onCheckedChange={(checked) => void form.apply({ novelai: { qualityToggle: checked } })} />
            <LabeledCheckbox label={I.useOrder} checked={nai.useOrder} background="promptField" className="h-9 w-full" onCheckedChange={(checked) => void form.apply({ novelai: { useOrder: checked } })} />
            <LabeledCheckbox label={I.useCoords} checked={nai.useCoords} background="promptField" className="h-9 w-full" onCheckedChange={(checked) => void form.apply({ novelai: { useCoords: checked } })} />
          </div>
        </Column>
      </Columns>
    </Card>
  );
}

function ComfyBox({ form, config }: { form: ConfigForm; config: InlayConfig }) {
  const ids = { workflow: useFieldId("ii-comfy-workflow"), timeout: useFieldId("ii-comfy-timeout") };
  return (
    <Card title={I.comfyBox} data-image-provider-settings-box="comfy-ui">
      <Columns>
        <Column>
          <Field label={I.workflowId} htmlFor={ids.workflow} hint={I.workflowIdHint}>
            <TextField id={ids.workflow} className="bg-surface-prompt-field" value={config.image.comfyuiWorkflowId} aria-label={I.workflowIdAria} autoComplete="off"
              onInput={(event) => form.draft({ image: { comfyuiWorkflowId: (event.currentTarget as HTMLInputElement).value } })} />
          </Field>
          <Field label={I.timeout} htmlFor={ids.timeout}>
            <div class="flex items-center gap-2">
              <NumberField id={ids.timeout} aria-label={I.timeoutAria} value={Math.round(config.runtime.comfyuiCompletionTimeoutMs / 1000)} min={1} max={3600} step={1}
                onValueChange={(value) => form.draft({ runtime: { comfyuiCompletionTimeoutMs: Math.round(value) * 1000 } })} />
              <span class="text-xs text-muted-foreground">s</span>
            </div>
          </Field>
        </Column>
        <Column>
          <LabeledCheckbox label={I.characterReference} checked={config.runtime.comfyuiCharacterReferenceEnabled} background="promptField" className="h-9 w-full"
            onCheckedChange={(checked) => void form.apply({ runtime: { comfyuiCharacterReferenceEnabled: checked } })} />
          <LabeledCheckbox label={I.outfitReference} checked={config.runtime.comfyuiOutfitReferenceEnabled} background="promptField" className="h-9 w-full"
            onCheckedChange={(checked) => void form.apply({ runtime: { comfyuiOutfitReferenceEnabled: checked } })} />
        </Column>
      </Columns>
    </Card>
  );
}
