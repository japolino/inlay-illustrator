/** System settings page (Asset Maid `axt` panel "system" 144596-144848, custom resolutions `U0t` 142657). */
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import type { ChatImageGenerationSettings, CustomImageSize } from "../../../shared/contract/config.js";
import { useApp, useAppState } from "../../state/app-state.js";
import { toRpcError } from "../../rpc/client.js";
import { Button, CheckIcon, IconButton, Switch, TextField, TrashIcon, XIcon, cn, useConfirm } from "../ui/index.js";
import { useConfigForm } from "./config-form.js";
import { PencilIcon, PlusIcon, ResetIcon, SpinnerIcon } from "./icons.js";
import { COMMON_LABELS as C, PAGE_TITLES, SYSTEM_LABELS as S } from "./labels.js";
import { CommitSlider, ErrorBanner, LoadingBox, SaveActions, SettingsFrame, Stepper } from "./parts.js";
import {
  countLimit,
  newCustomSizeId,
  saveCustomSize,
  setAnalysisMode,
  setCountMode,
  setCountRange,
  setFixedCount,
  setSplitBatch,
  setSplitTotal,
  type CustomSizeDraft
} from "./system-helpers.js";
import { SPLIT_ANALYSIS_MAX_TOTAL, maxSplitBatchSize } from "../../../shared/contract/config.js";

/** Clicks on the hidden row that reveal the developer mode switch (AM 144809). */
export const DEVELOPER_UNLOCK_CLICKS = 5;

function SystemRow({ title, description, children, first, className, ...rest }: {
  title: string;
  description?: string;
  children?: ComponentChildren;
  first?: boolean;
  className?: string;
} & Record<string, unknown>) {
  return (
    <div class={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-5", !first && "border-t border-white/5 pt-4", className)} {...rest}>
      <div class="min-w-0">
        <h3 class="text-xs font-bold">{title}</h3>
        {description ? <p class="mt-1 max-w-140 text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {children ? <div class="flex flex-wrap items-center justify-end gap-2">{children}</div> : null}
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void; label: string }) {
  return (
    <div class="inline-flex h-8 items-center rounded-md bg-surface-control p-1 max-md:h-11" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => { if (value !== option.value) onChange(option.value); }}
          class={cn("h-6 rounded-sm px-2.5 text-2xs font-bold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/55 max-md:h-9 max-md:text-xs",
            value === option.value ? "bg-surface-navigation-selected text-selected-foreground" : "text-muted-foreground hover:text-foreground")}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SystemSettingsPage() {
  const app = useApp();
  const form = useConfigForm();
  const config = form.config;
  const chatImages = useAppState((state) => state.chatImageGeneration);
  const confirm = useConfirm();
  const [clicks, setClicks] = useState(0);
  const [resetting, setResetting] = useState(false);

  const actions = <SaveActions dirty={form.dirty} saving={form.saving} error={form.error} onSave={() => void form.save()} />;
  if (!config) return <SettingsFrame section="system" title={PAGE_TITLES.system} actions={actions}><LoadingBox /></SettingsFrame>;
  const runtime = config.runtime;
  const developerVisible = config.ui.developerModeEnabled || clicks >= DEVELOPER_UNLOCK_CLICKS;

  const setNsfw = async (enabled: boolean) => {
    const before = app.state.config;
    if (before) app.store.patch({ config: { ...before, runtime: { ...before.runtime, nsfwAlwaysEnabled: enabled } } });
    try {
      await app.call("charxSettings.setDefaults", { patch: { nsfwAlwaysEnabled: enabled } });
      app.store.patch({ config: (await app.call("config.get", {})).config });
    } catch (caught) {
      if (before) app.store.patch({ config: before });
      app.notifyError(caught);
    }
  };
  const factoryReset = async () => {
    const ok = await confirm({ title: S.factoryResetConfirmTitle, description: S.factoryResetConfirmDescription, confirmLabel: S.factoryResetButton, cancelLabel: C.cancel });
    if (!ok) return;
    setResetting(true);
    try {
      await app.call("config.factoryReset", { confirm: true });
      const fresh = await app.call("config.get", {});
      app.store.patch({ config: fresh.config, chatImageGeneration: fresh.chatImageGeneration, uiState: fresh.uiState });
      form.reset();
      void app.reloadWorkspace();
      app.notify({ tone: "success", message: S.factoryResetDone });
    } catch (caught) {
      app.notifyError(caught);
    } finally {
      setResetting(false);
    }
  };
  const unlockClick = () => {
    if (!developerVisible) setClicks((n) => n + 1);
  };

  return (
    <SettingsFrame section="system" title={PAGE_TITLES.system} actions={actions} banner={<ErrorBanner message={form.error} />}>
      <section class="grid min-w-0 content-start gap-4 rounded-lg bg-card p-4" data-system-settings="">
        <CustomSizes sizes={runtime.customImageSizes} onChange={(sizes) => void form.apply({ runtime: { customImageSizes: sizes } })} />
        <SystemRow title={S.queue.title} description={S.queue.description} first>
          <Stepper value={runtime.novelaiParallelIntervalSec} label={S.queueAria} format={C.seconds} decreaseLabel={S.queueDecrease} increaseLabel={S.queueIncrease}
            onChange={(value) => void form.apply({ runtime: { novelaiCallMode: "sequential", novelaiParallelIntervalSec: Math.min(30, Math.max(0, value)) } })} />
        </SystemRow>
        <SystemRow title={S.retry.title} description={S.retry.description}>
          <Stepper value={runtime.generationAutoRetryCount} label={S.retryAria} format={C.times} min={0} max={10} decreaseLabel={S.retryDecrease} increaseLabel={S.retryIncrease}
            onChange={(value) => void form.apply({ runtime: { generationAutoRetryCount: Math.min(10, Math.max(0, value)) } })} />
        </SystemRow>
        <div class="grid w-full grid-cols-[minmax(0,1fr)_minmax(7rem,40%)] items-center gap-4 border-t border-white/5 pt-4 mobile:grid-cols-1 mobile:gap-2">
          <div class="min-w-0">
            <h3 class="text-xs font-bold">{S.chatImageSize.title}</h3>
            <p class="mt-1 max-w-140 text-xs leading-relaxed text-muted-foreground">{S.chatImageSize.description}</p>
          </div>
          <CommitSlider label={S.chatImageSize.title} value={runtime.chatImageWidthPercent} min={30} max={100} step={5} format={(v) => `${v}%`}
            onCommit={(value) => void form.apply({ runtime: { chatImageWidthPercent: value } })} />
        </div>
        <SystemRow title={S.floatingCount.title} description={S.floatingCount.description}>
          <Button variant="ghost" disabled={!config.ui.floatingGenerationCountEnabled} onClick={() => void form.apply({ ui: { floatingGenerationCountPosition: null } })}>
            <ResetIcon />{S.resetPosition}
          </Button>
          <Switch aria-label={S.floatingCountUse} checked={config.ui.floatingGenerationCountEnabled} onCheckedChange={(checked) => void form.apply({ ui: { floatingGenerationCountEnabled: checked } })} />
        </SystemRow>
        <SystemRow title={S.popupProtection.title} description={S.popupProtection.description}>
          <Switch aria-label={S.popupProtectionUse} checked={config.ui.popupClickThroughProtectionEnabled} onCheckedChange={(checked) => void form.apply({ ui: { popupClickThroughProtectionEnabled: checked } })} />
        </SystemRow>
        <SystemRow title={S.nsfw.title} description={S.nsfw.description}>
          <Switch aria-label={S.nsfw.title} checked={runtime.nsfwAlwaysEnabled} onCheckedChange={(checked) => void setNsfw(checked)} />
        </SystemRow>
        <SystemRow
          title={S.developerMode.title}
          description={S.developerMode.description}
          className={cn(!developerVisible && "cursor-pointer opacity-0 select-none")}
          role={developerVisible ? undefined : "button"}
          tabIndex={developerVisible ? undefined : 0}
          aria-label={developerVisible ? undefined : S.developerModeArea}
          data-developer-mode-trigger=""
          onClick={unlockClick}
          onKeyDown={(event: KeyboardEvent) => {
            if (!developerVisible && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              unlockClick();
            }
          }}
        >
          {developerVisible ? (
            <Switch aria-label={S.developerModeUse} checked={config.ui.developerModeEnabled}
              onCheckedChange={(checked) => {
                void app.setDeveloperMode(checked).then((result) => {
                  if (result) app.notify({ tone: "success", message: checked ? S.developerModeEnabled : S.developerModeDisabled, durationMs: 3000 });
                });
              }} />
          ) : null}
        </SystemRow>
      </section>
      {chatImages ? <ChatImageSettings settings={chatImages} developerMode={config.ui.developerModeEnabled} /> : null}
      <section class="grid min-w-0 content-start gap-2.5" data-system-danger-zone="">
        <h2 class="flex h-9.5 items-center px-0.5 text-xs font-extrabold">{S.dangerZone}</h2>
        <div class="rounded-lg bg-card p-4">
          <SystemRow title={S.factoryReset.title} description={S.factoryReset.description} first>
            <Button variant="danger" disabled={resetting} onClick={() => void factoryReset()} data-factory-reset="">
              {resetting ? <SpinnerIcon /> : <TrashIcon />}{S.factoryResetButton}
            </Button>
          </SystemRow>
        </div>
      </section>
    </SettingsFrame>
  );
}

/** Custom resolutions (`U0t`). Saved at once. */
export function CustomSizes({ sizes, onChange }: { sizes: readonly CustomImageSize[]; onChange: (sizes: CustomImageSize[]) => void }) {
  const [draft, setDraft] = useState<CustomSizeDraft | null>(null);
  const [error, setError] = useState("");
  const close = () => {
    setDraft(null);
    setError("");
  };
  const save = () => {
    if (!draft) return;
    const result = saveCustomSize(sizes, draft);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    onChange(result.sizes);
    close();
  };
  const rows = draft && !sizes.some((s) => s.id === draft.id) ? [...sizes, { id: draft.id, width: 0, height: 0 }] : sizes;
  return (
    <div class="grid min-w-0 gap-2 border-b border-white/5 pb-4" role="group" aria-label={S.customSizes} data-custom-sizes="">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-xs font-bold">{S.customSizes}</h3>
        <IconButton label={S.addSize} title={C.add} className="size-7 rounded-full" disabled={!!draft}
          onClick={() => { setDraft({ id: newCustomSizeId(), width: "", height: "" }); setError(""); }}>
          <PlusIcon />
        </IconButton>
      </div>
      {!rows.length ? <p class="text-2xs text-muted-foreground">{S.noCustomSizes}</p> : null}
      <div class="grid grid-cols-2 items-start gap-x-6 gap-y-2 mobile:grid-cols-1">
        {rows.map((row) => {
          const editing = draft?.id === row.id;
          return (
            <div key={row.id} class="grid min-w-0 gap-1">
              <div class="flex min-w-0 items-center gap-2">
                {(["width", "height"] as const).map((field, index) => (
                  <>
                    {index === 1 ? <span class="text-xs text-muted-foreground" aria-hidden="true">×</span> : null}
                    <TextField
                      type="number" min={64} max={2048} step={1} inputMode="numeric"
                      className="h-8 min-w-0 flex-1 bg-surface-prompt-field px-1.5 text-center text-xs tabular-nums [appearance:textfield] max-md:h-11"
                      aria-label={index === 0 ? S.sizeWidth : S.sizeHeight}
                      aria-invalid={editing && !!error}
                      readOnly={!editing}
                      value={editing ? draft![field] : String(row[field] || "")}
                      onInput={(event) => { const value = (event.currentTarget as HTMLInputElement).value; setDraft((current) => current && { ...current, [field]: value }); setError(""); }}
                      onKeyDown={(event) => {
                        if (!editing) return;
                        if (event.key === "Enter") { event.preventDefault(); save(); }
                        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
                      }}
                    />
                  </>
                ))}
                <IconButton label={editing ? S.saveSize : S.editSize} title={editing ? C.save : C.edit} disabled={!!draft && !editing}
                  onClick={() => { if (editing) save(); else { setDraft({ id: row.id, width: String(row.width), height: String(row.height) }); setError(""); } }}>
                  {editing ? <CheckIcon /> : <PencilIcon />}
                </IconButton>
                <IconButton label={S.deleteSize} title={C.delete} disabled={!!draft && !editing}
                  onClick={() => { onChange(sizes.filter((s) => s.id !== row.id)); close(); }}>
                  <XIcon />
                </IconButton>
              </div>
              {editing && error ? <p class="text-xs text-destructive" role="alert">{error}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Chat image generation settings (port: AM kept them in the chat count panel). Saved at once. */
function ChatImageSettings({ settings, developerMode }: { settings: ChatImageGenerationSettings; developerMode: boolean }) {
  const app = useApp();
  const limit = countLimit(developerMode);
  const max = Number.isSafeInteger(limit) && limit < 1e6 ? limit : undefined;
  const save = async (next: ChatImageGenerationSettings) => {
    try {
      const notice = await app.setChatImageGeneration(next);
      void notice;
    } catch (caught) {
      app.notifyError(toRpcError(caught));
    }
  };
  const policy = settings.countPolicy;
  const values = policy.values ?? { fixed: policy.max, min: policy.min, max: policy.max };
  const total = settings.splitAnalysis.totalCount;
  return (
    <section class="grid min-w-0 content-start gap-2.5" data-chat-image-settings="">
      <h2 class="flex h-9.5 items-center px-0.5 text-xs font-extrabold">{S.chatImages}</h2>
      <div class="grid min-w-0 content-start gap-4 rounded-lg bg-card p-4">
        <SystemRow title={S.autoGeneration.title} description={S.autoGeneration.description} first>
          <Switch aria-label={S.autoGeneration.title} checked={settings.autoGenerationEnabled} onCheckedChange={(checked) => void save({ ...settings, autoGenerationEnabled: checked })} />
        </SystemRow>
        <SystemRow title={S.countMode.title} description={S.countMode.description}>
          <Segmented label={S.countMode.title} value={policy.mode} options={[{ value: "fixed", label: S.countModes.fixed }, { value: "range", label: S.countModes.range }]}
            onChange={(mode) => void save(setCountMode(settings, mode, limit))} />
          {policy.mode === "fixed" ? (
            <Stepper value={values.fixed} label={S.count} format={String} min={1} max={max} decreaseLabel={S.countDecrease} increaseLabel={S.countIncrease}
              onChange={(value) => void save(setFixedCount(settings, value, limit))} />
          ) : (
            <>
              <Stepper value={policy.min} label={S.countMin} format={String} min={1} max={policy.max - 1} decreaseLabel={`${S.countMin} −`} increaseLabel={`${S.countMin} +`}
                onChange={(value) => void save(setCountRange(settings, value, policy.max, limit))} />
              <Stepper value={policy.max} label={S.countMax} format={String} min={policy.min + 1} max={max} decreaseLabel={`${S.countMax} −`} increaseLabel={`${S.countMax} +`}
                onChange={(value) => void save(setCountRange(settings, policy.min, value, limit))} />
            </>
          )}
        </SystemRow>
        <SystemRow title={S.analysisMode.title} description={S.analysisMode.description}>
          <Segmented label={S.analysisMode.title} value={settings.analysisMode} options={[{ value: "single", label: S.analysisModes.single }, { value: "split", label: S.analysisModes.split }]}
            onChange={(mode) => void save(setAnalysisMode(settings, mode, limit))} />
        </SystemRow>
        {settings.analysisMode === "split" && total !== null ? (
          <SystemRow title={S.splitTotal}>
            <Stepper value={total} label={S.splitTotal} format={String} min={1} max={SPLIT_ANALYSIS_MAX_TOTAL} decreaseLabel={`${S.splitTotal} −`} increaseLabel={`${S.splitTotal} +`}
              onChange={(value) => void save(setSplitTotal(settings, value, limit))} />
            <Stepper value={settings.splitAnalysis.batchSize} label={S.splitBatch} format={String} min={1} max={maxSplitBatchSize(total)} decreaseLabel={`${S.splitBatch} −`} increaseLabel={`${S.splitBatch} +`}
              onChange={(value) => void save(setSplitBatch(settings, value, limit))} />
          </SystemRow>
        ) : null}
      </div>
    </section>
  );
}
