import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { FAB_CORNER_OPTIONS, INLAY_IMAGE_ASPECT_PRESETS, type Config, type FabCorner, type InlayImageAspect } from "../../../shared/config.js";
import { SETTINGS_GROUPS, SYSTEM_SETTINGS_LABELS as L, type SettingsSection } from "../labels.js";
import { Placeholder } from "../placeholder.js";
import { Select, Slider, Switch, cn, useToasts } from "../ui/index.js";

export type SettingsPageProps = {
  section: SettingsSection;
};
type LegacyProps = SettingsPageProps & {
  config: Config;
  patchConfig: (patch: Partial<Config>) => void;
  developerMode: boolean;
  onDeveloperModeChange: (enabled: boolean) => void;
};

function sectionLabel(section: SettingsSection): string {
  for (const group of SETTINGS_GROUPS) {
    const item = group.items.find((entry) => entry.id === section);
    if (item) return item.label;
  }
  return section;
}

/** Settings page frame (`C0t` header + centred body, max-w-190). */
export function SettingsPage({ section }: SettingsPageProps) {
  const props = { section } as LegacyProps;
  return (
    <div class="grid content-start gap-6 px-5 py-5" data-settings-page={props.section}>
      <header class="mx-auto flex min-h-8 w-full max-w-190 items-center justify-between gap-3" data-settings-page-header="">
        <h1 class="truncate text-lg leading-tight font-extrabold">{sectionLabel(props.section)}</h1>
      </header>
      <div class="mx-auto grid w-full max-w-190 content-start gap-2">
        {props.section === "system" && props.config ? <SystemSettings {...props} /> : <Placeholder />}
      </div>
    </div>
  );
}

/** Settings section card (`i5`). */
export function SettingsSectionCard({ title, children, disabled }: { title: string; children: ComponentChildren; disabled?: boolean }) {
  return (
    <section class={cn("grid gap-2.5 pt-2.5 pb-4.5 transition-opacity", disabled && "opacity-45")} aria-disabled={disabled || undefined} inert={disabled || undefined}>
      <h2 class="flex h-9.5 items-center px-0.5 text-xs font-extrabold">{title}</h2>
      <div class="divide-y divide-white/5 overflow-hidden rounded-lg bg-card px-4">{children}</div>
    </section>
  );
}

/** Settings row (`n0`): title + description on the left, controls on the right. */
export function SettingsRow({ title, description, children, labelId, className }: {
  title: string;
  description?: string;
  children?: ComponentChildren;
  labelId?: string;
  className?: string;
}) {
  return (
    <div class={cn("grid min-h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3", className)}>
      <div class="min-w-0 pr-4">
        <strong id={labelId} class="block text-xs font-bold">{title}</strong>
        {description ? <span class="mt-0.5 block max-w-140 text-xs leading-relaxed text-muted-foreground">{description}</span> : null}
      </div>
      <div class="flex min-w-0 items-center justify-end gap-2">{children}</div>
    </div>
  );
}

function SystemSettings({ config, patchConfig, developerMode, onDeveloperModeChange }: LegacyProps) {
  const toasts = useToasts();
  const clicks = useRef({ count: 0, at: 0 });
  // Asset Maid toggles developer mode with 5 clicks on an invisible row in System settings.
  const onHiddenRowClick = () => {
    const now = Date.now();
    clicks.current = { count: now - clicks.current.at < 1500 ? clicks.current.count + 1 : 1, at: now };
    if (clicks.current.count < 5) return;
    clicks.current = { count: 0, at: 0 };
    onDeveloperModeChange(!developerMode);
    toasts.show({ message: developerMode ? L.developerModeDisabled : L.developerModeEnabled, tone: "success", durationMs: 3000 });
  };
  return (
    <>
      <SettingsSectionCard title={L.displaySection}>
        <SettingsRow title={L.fabCorner} description={L.fabCornerDescription} labelId="ii-am-fab-corner">
          <div class="w-44">
            <Select<FabCorner>
              aria-labelledby="ii-am-fab-corner"
              value={config.fabCorner}
              options={FAB_CORNER_OPTIONS}
              onValueChange={(value) => patchConfig({ fabCorner: value })}
            />
          </div>
        </SettingsRow>
        <SettingsRow title={L.imageAspect} description={L.imageAspectDescription} labelId="ii-am-image-aspect">
          <div class="w-44">
            <Select<InlayImageAspect>
              aria-labelledby="ii-am-image-aspect"
              value={config.inlayImageAspect}
              options={INLAY_IMAGE_ASPECT_PRESETS}
              onValueChange={(value) => patchConfig({ inlayImageAspect: value })}
            />
          </div>
        </SettingsRow>
        <SettingsRow title={L.imageHeight} description={L.imageHeightDescription} labelId="ii-am-image-height">
          <div class="flex h-8 w-56 items-center gap-3">
            <HeightSlider value={config.inlayImageMaxHeightVh} onCommit={(value) => patchConfig({ inlayImageMaxHeightVh: value })} />
          </div>
        </SettingsRow>
        <SettingsRow title={L.alignment} description={L.alignmentDescription}>
          <Switch aria-label={L.alignment} checked={config.imageAlignment === "left"} onCheckedChange={(checked) => patchConfig({ imageAlignment: checked ? "left" : "center" })} />
        </SettingsRow>
      </SettingsSectionCard>
      <SettingsSectionCard title={L.diagnosticsSection}>
        <SettingsRow title={L.debugLogging} description={L.debugLoggingDescription}>
          <Switch aria-label={L.debugLogging} checked={config.debugLogging} onCheckedChange={(checked) => patchConfig({ debugLogging: checked })} />
        </SettingsRow>
        {developerMode ? <SettingsRow title={L.developerMode} description={L.developerModeOn} /> : null}
      </SettingsSectionCard>
      <div aria-hidden="true" class="h-8 w-full" data-developer-mode-trigger="" onClick={onHiddenRowClick} />
    </>
  );
}

function HeightSlider({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <>
      <Slider
        aria-labelledby="ii-am-image-height"
        value={draft}
        min={10}
        max={100}
        step={5}
        onValueChange={setDraft}
        onValueCommit={(next) => { if (next !== value) onCommit(next); }}
      />
      <span class="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{draft}vh</span>
    </>
  );
}
