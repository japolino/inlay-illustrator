/**
 * Zoom viewer UI (AM `Xkt` 164561-165593): desktop layout (chat images sidebar | stage + info/analyzer panel |
 * generation log sidebar) and mobile layout (header, stage, sheet panels, dock), prompt editing, coordinate
 * board, AI prompt edit, slot deletion and the chat state window. State and actions: ./session.ts.
 */
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import type { ZoomPromptSection } from "../../shared/contract/rpc.js";
import { cn } from "../overlay/ui/cn.js";
import { Dialog, IconButton } from "../overlay/ui/index.js";
import { useLayer } from "../overlay/ui/layers.js";
import { useApp, useRpcQuery, type AppController } from "../state/app-state.js";
import { useSelector } from "../state/store.js";
import { AiEditPanel } from "./ai-edit.js";
import { ActivityIcon, ArrowDownToLineIcon, BracesIcon, ChevronDownIcon, ChevronLeftIcon, ColumnsIcon, DicesIcon, FileTextIcon, HistoryIcon, ImagesIcon, InfoIcon, LoaderIcon, PencilIcon, RefreshIcon, SaveIcon, SlidersIcon, TrashIcon, UndoIcon, WandIcon, XIcon } from "./icons.js";
import { fill, ZOOM_LABELS } from "./labels.js";
import { centersOf, isEditableTarget, markersFromSections, mentionCandidates, sizeOptions, type CoordinateMarker } from "./model.js";
import { AnalyzerText, ChatImagesList, ChatStatePanel, CopyButton, GenerationFooter, HistoryActions, HistoryList, PromptField, SlotDeleteDialog, StatusBox } from "./panels.js";
import { useZoomSession, type ZoomSession, type ZoomTarget } from "./session.js";
import { Stage, type CoordinateBoardState } from "./stage.js";

/** AM `dkt` 161478: the zoom switches to the mobile layout below 64rem (and on coarse pointers). */
export const ZOOM_MOBILE_QUERY = "(max-width: 63.999rem), (pointer: coarse)";

function useZoomMobile(doc: Document): boolean {
  const win = doc.defaultView;
  const query = () => {
    try {
      return !!win?.matchMedia?.(ZOOM_MOBILE_QUERY).matches;
    } catch {
      return false;
    }
  };
  const [mobile, setMobile] = useState(query);
  useEffect(() => {
    const list = win?.matchMedia?.(ZOOM_MOBILE_QUERY);
    if (!list) return undefined;
    const update = () => setMobile(list.matches);
    update();
    list.addEventListener?.("change", update);
    return () => list.removeEventListener?.("change", update);
  }, [win]);
  return mobile;
}

type MobilePanel = "closed" | "images" | "history" | "info" | "generation" | "analyzer";

export interface ZoomAppProps {
  target: ZoomTarget;
  onClose: () => void;
  doc: Document;
}

export function ZoomApp({ target, onClose, doc }: ZoomAppProps) {
  const app = useApp();
  const session = useZoomSession(app, target, onClose, doc);
  const mobile = useZoomMobile(doc);
  const config = useSelector(app.store, (s) => s.config);
  const uiState = useSelector(app.store, (s) => s.uiState);
  const developer = !!config?.ui.developerModeEnabled;
  const sidebarsOpen = uiState?.global.zoomSidebarsOpen ?? true;
  const [infoMode, setInfoMode] = useState<"closed" | "info" | "analyzer">(uiState?.global.zoomInfoOpen ? "info" : "closed");
  const [panel, setPanel] = useState<MobilePanel>("closed");
  const [chrome, setChrome] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ZoomPromptSection[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [coord, setCoord] = useState<{ markers: CoordinateMarker[]; selected: number | null; saving: boolean; error: string | null } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);
  const [stateOpen, setStateOpen] = useState(false);
  const details = session.details;
  const historicalLock = session.historical && !developer;
  const locked = !!session.busy || editing || !!coord || aiRunning || session.slotDeleting;
  const disabled = locked || historicalLock;

  // Leaving the slot / entry cancels open editors.
  useEffect(() => {
    setEditing(false);
    setCoord(null);
  }, [details?.slotId, details?.entryId]);
  useEffect(() => {
    if (historicalLock) {
      setEditing(false);
      setCoord(null);
    }
  }, [historicalLock]);
  useEffect(() => {
    if (!developer && infoMode === "analyzer") setInfoMode("closed");
  }, [developer]);

  // Mention candidates: the active character's roster.
  const status = useSelector(app.store, (s) => s.status);
  const workspace = useSelector(app.store, (s) => s.workspace);
  const characterId = status?.activeCharacterId ?? null;
  const ownWorkspace = workspace && workspace.characterId === characterId ? workspace : null;
  const rosterQuery = useRpcQuery("workspace.load", aiOpen && characterId && !ownWorkspace ? { characterId } : null);
  const roster = ownWorkspace ?? rosterQuery.data ?? null;
  const candidates = useMemo(() => (roster ? mentionCandidates(roster.roster, roster.characterName) : []), [roster]);

  const sizes = useMemo(() => sizeOptions(config?.runtime.customImageSizes ?? []), [config?.runtime.customImageSizes]);
  const sections = details?.sections ?? [];
  const markers = useMemo(() => markersFromSections(sections), [sections]);
  const providerLabel = details ? (details.generationProvider === "original" ? ZOOM_LABELS.original : details.generationProvider === "novelai" ? "NovelAI" : details.generationProvider === "comfy-ui" ? "ComfyUI" : String(details.generationProvider)) : "";
  const canEditCoordinates = !!details && details.coordinateGrid !== null && details.canEdit && markers.length > 0;

  const setInfo = (mode: "info" | "analyzer") => {
    const next = infoMode === mode ? "closed" : mode;
    setInfoMode(next);
    if (uiState) app.setUiState({ ...uiState, global: { ...uiState.global, zoomInfoOpen: next === "info" } });
  };
  const toggleSidebars = () => {
    if (uiState) app.setUiState({ ...uiState, global: { ...uiState.global, zoomSidebarsOpen: !sidebarsOpen } });
  };

  const beginEdit = () => {
    setDraft(sections.map((s) => ({ ...s })));
    setEditing(true);
  };
  const saveEdit = async () => {
    setSubmitting(true);
    const ok = await session.savePrompts(draft);
    setSubmitting(false);
    if (ok) setEditing(false);
  };
  const beginCoordinates = () => {
    if (!canEditCoordinates || locked || historicalLock) return;
    if (mobile) setPanel("closed");
    setCoord({ markers: markers.map((m) => ({ ...m })), selected: markers[0]?.actorIndex ?? null, saving: false, error: null });
  };
  const saveCoordinates = async () => {
    if (!coord) return;
    setCoord({ ...coord, saving: true, error: null });
    const ok = await session.saveCenters(centersOf(coord.markers));
    if (ok) setCoord(null);
    else setCoord((c) => (c ? { ...c, saving: false, error: ZOOM_LABELS.saveDraftFailed } : c));
  };
  useLayer(!!coord && !coord.saving, () => setCoord(null));
  useLayer(editing && !submitting, () => setEditing(false));
  useLayer(mobile && panel !== "closed", () => setPanel("closed"));

  const board: CoordinateBoardState | null = coord
    ? {
      markers: coord.markers,
      selected: coord.selected,
      saving: coord.saving,
      error: coord.error,
      onMove: (actorIndex, center) => setCoord((c) => (c ? { ...c, selected: actorIndex, markers: c.markers.map((m) => (m.actorIndex === actorIndex ? { ...m, center } : m)) } : c)),
      onSelect: (actorIndex) => setCoord((c) => (c ? { ...c, selected: actorIndex } : c)),
      onSave: () => void saveCoordinates(),
      onCancel: () => setCoord(null)
    }
    : null;

  // Arrow keys: ←/→ chat images, ↑/↓ generation log (AM 164811); not while locked or typing.
  useEffect(() => {
    const win = doc.defaultView;
    if (!win) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (locked || isEditableTarget(event.target)) return;
      const map: Record<string, () => void> = {
        ArrowLeft: () => session.stepItem(-1),
        ArrowRight: () => session.stepItem(1),
        ArrowUp: () => session.stepHistory(-1),
        ArrowDown: () => session.stepHistory(1)
      };
      const action = map[event.key];
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      action();
    };
    win.addEventListener("keydown", onKey, true);
    return () => win.removeEventListener("keydown", onKey, true);
  });

  const position = Math.max(0, session.items.findIndex((i) => i.slotId === session.target.slotId)) + (session.items.length ? 1 : 0);
  const chatImagesBadge = `${position}/${session.items.length}`;

  const fields = (compact: boolean) => {
    if (!details) {
      return session.loading ? <StatusBox tone="loading">{ZOOM_LABELS.checkingMetadata}</StatusBox> : <StatusBox tone="error">{session.error?.message || ZOOM_LABELS.metadataError}</StatusBox>;
    }
    if (sections.length === 0) return <StatusBox tone="empty">{ZOOM_LABELS.metadataEmpty}</StatusBox>;
    return (
      <div class={cn("grid min-h-0 gap-2", !compact && "overflow-y-auto pr-1")} role="region" aria-label={ZOOM_LABELS.promptList}>
        {historicalLock ? <p class="rounded-md bg-warning/14 px-2.5 py-2 text-2xs text-warning">{ZOOM_LABELS.historicalLocked}</p> : null}
        {sections.map((section, index) => {
          const marker = section.target === "actor" ? markers.find((m) => m.actorIndex === (section.actorIndex ?? -1)) : undefined;
          const excluded = section.target === "actor" && details.excludedCharacterIndexes.includes(section.actorIndex ?? -1);
          const current = draft.find((d) => d.id === section.id) ?? section;
          return (
            <PromptField
              key={section.id}
              section={section}
              ordinal={index}
              editing={editing}
              draft={current}
              onDraft={(next) => setDraft((list) => list.map((d) => (d.id === next.id ? next : d)))}
              providerLabel={providerLabel}
              excluded={excluded}
              includeDisabled={!!session.busy || !details.canEdit || historicalLock || editing || !!coord || aiOpen}
              onIncluded={(included) => void session.setIncluded(section.actorIndex ?? index, included)}
              marker={marker ? (coord?.markers.find((m) => m.actorIndex === marker.actorIndex) ?? marker) : undefined}
              coordinateActive={!!coord}
              coordinateDisabled={(!coord && (locked || historicalLock || aiOpen || !canEditCoordinates)) || excluded || !!coord?.saving}
              onCoordinate={() => (coord ? setCoord(null) : beginCoordinates())}
              compact={compact}
            />
          );
        })}
      </div>
    );
  };

  const infoActions = (compact: boolean) => {
    if (!details) return null;
    if (editing) {
      return (
        <>
          <IconButton label={ZOOM_LABELS.cancelEdit} disabled={submitting} onClick={() => setEditing(false)}><UndoIcon /></IconButton>
          <IconButton label={ZOOM_LABELS.savePrompt} variant="subtle" disabled={submitting} onClick={() => void saveEdit()} data-ii-zoom-save-prompts="">{submitting ? <LoaderIcon /> : <SaveIcon />}</IconButton>
        </>
      );
    }
    return (
      <>
        {details.canEdit && sections.length > 0 ? <IconButton label={ZOOM_LABELS.editPrompt} disabled={disabled || aiOpen} onClick={beginEdit} data-ii-zoom-edit-prompts=""><PencilIcon /></IconButton> : null}
        <IconButton label={ZOOM_LABELS.aiEdit} variant={aiOpen ? "subtle" : "ghost"} aria-pressed={aiOpen} disabled={locked || historicalLock || !details.canRegenerate} onClick={() => { setAiOpen(!aiOpen); if (compact) setPanel("closed"); }} data-ii-zoom-ai-toggle=""><WandIcon /></IconButton>
        {details.kind === "generated" && details.seed ? <IconButton label={ZOOM_LABELS.importSeed} title={ZOOM_LABELS.importSeedTitle} disabled={disabled || aiOpen} onClick={() => void session.importViewed("seed")}><DicesIcon /></IconButton> : null}
        {details.kind === "generated" && !details.promptDraftActive ? <IconButton label={ZOOM_LABELS.importPrompts} title={ZOOM_LABELS.importPromptsTitle} disabled={disabled || aiOpen} onClick={() => void session.importViewed("prompts")}><ArrowDownToLineIcon /></IconButton> : null}
        {details.promptDraftActive || details.coordinateDraftActive ? <IconButton label={ZOOM_LABELS.resetDrafts} disabled={disabled} onClick={() => void session.clearDraft("all")}><RefreshIcon /></IconButton> : null}
      </>
    );
  };

  const slotDeleteButton = details?.canDeleteSlot ? (
    <IconButton label={ZOOM_LABELS.deleteSlot} disabled={disabled || aiOpen} onClick={() => void session.requestSlotDeletion()} data-ii-zoom-delete-slot=""><TrashIcon /></IconButton>
  ) : null;
  const stateButton = (
    <IconButton label={ZOOM_LABELS.chatStateShort} title={ZOOM_LABELS.chatState} variant={stateOpen ? "subtle" : "ghost"} aria-pressed={stateOpen} onClick={() => setStateOpen(!stateOpen)} data-ii-zoom-state-toggle=""><ActivityIcon /></IconButton>
  );
  const saveBadge = session.saveStatus ? (
    <span class={cn("absolute right-3 z-30 max-w-96 truncate rounded-md px-2 py-1 text-2xs font-bold", mobile ? "top-16" : "top-14", session.saveStatus.tone === "success" ? "bg-success/18 text-success" : "bg-destructive/18 text-destructive")} title={session.saveStatus.detail} role="status">
      {session.saveStatus.label}
    </span>
  ) : null;

  const aiPanel = aiOpen && details ? (
    <AiEditPanel
      seed={details.seed}
      seedFixed={details.seedFixed}
      canRegenerate={details.canRegenerate}
      i2iAvailable={details.generationProvider === "novelai"}
      candidates={candidates}
      compact={mobile}
      onSeedFixed={(fixed) => void session.setSeedFixed(fixed)}
      onSubmit={(request) => session.requestAiEdit(request)}
      onClose={() => setAiOpen(false)}
      onRunningChange={setAiRunning}
    />
  ) : null;

  const dialogs = (
    <>
      <SlotDeleteDialog preview={session.slotDeletion} deleting={session.slotDeleting} onCancel={session.cancelSlotDeletion} onConfirm={() => void session.confirmSlotDeletion()} />
      <Dialog open={stateOpen} onOpenChange={setStateOpen} title={ZOOM_LABELS.chatState} className="w-[min(560px,calc(100%-32px))]">
        {stateOpen ? <ChatStatePanel app={app} chatId={session.target.chatId} actorNames={actorNames(sections)} /> : null}
      </Dialog>
    </>
  );

  const stage = (
    <Stage
      url={details?.url ?? ""}
      alt={details?.assetName ?? ""}
      width={details?.width ?? 832}
      height={details?.height ?? 1216}
      canStep={!locked && session.items.length > 1}
      onStep={session.stepItem}
      compact={mobile}
      board={board}
      bottomInset={mobile ? 88 : 0}
      onTap={mobile ? () => (panel !== "closed" ? setPanel("closed") : setChrome(!chrome)) : undefined}
    />
  );

  if (mobile) {
    return (
      <MobileZoom
        session={session}
        app={app}
        stage={stage}
        chrome={chrome && !aiOpen}
        panel={panel}
        setPanel={setPanel}
        badge={chatImagesBadge}
        developer={developer}
        disabled={disabled}
        locked={locked}
        editing={editing}
        coordEditing={!!coord}
        aiPanel={aiPanel}
        fields={fields(true)}
        infoActions={infoActions(true)}
        sizes={sizes}
        slotDeleteButton={slotDeleteButton}
        stateButton={stateButton}
        saveBadge={saveBadge}
        onClose={onClose}
      >
        {dialogs}
      </MobileZoom>
    );
  }

  const showFooterInInfo = !sidebarsOpen && !aiOpen && details;
  return (
    <div class={cn("relative grid h-full min-h-0 overflow-hidden bg-background/35 text-foreground backdrop-blur-xl", sidebarsOpen ? "grid-cols-[190px_minmax(0,1fr)_190px]" : "grid-cols-[minmax(0,1fr)]")} data-ii-zoom-workspace="desktop">
      {sidebarsOpen ? (
        <aside class="flex min-h-0 flex-col gap-2 overflow-hidden bg-sidebar/88 p-2.5" id="ii-am-zoom-chat-images" aria-label={ZOOM_LABELS.chatImages}>
          <header class="flex min-h-8 items-center justify-between gap-2 text-xs font-extrabold">
            <span class="inline-flex items-center gap-1.5"><ImagesIcon className="text-primary" />{ZOOM_LABELS.chatImages}</span>
            <span class="rounded-sm bg-surface-badge px-1.5 font-mono text-2xs text-muted-foreground">{chatImagesBadge}</span>
          </header>
          <div class="min-h-0 flex-1 overflow-y-auto pr-1">
            <ChatImagesList groups={session.groups} items={session.items} currentSlotId={session.target.slotId} disabled={locked} layout="sidebar" onSelect={session.selectItem} onStepRevision={(g, d) => void session.stepRevision(g, d)} />
          </div>
        </aside>
      ) : null}
      <main class="relative min-h-0 min-w-0 overflow-hidden bg-background/58">
        <div class="absolute right-3 top-3 z-30 flex items-center gap-1 rounded-md bg-background/72 p-1 backdrop-blur-xl" data-ii-zoom-stage-actions="">
          {slotDeleteButton}
          {stateButton}
          <IconButton label={infoMode === "info" ? ZOOM_LABELS.closeInfo : ZOOM_LABELS.openInfo} variant={infoMode === "info" ? "subtle" : "ghost"} aria-pressed={infoMode === "info"} aria-expanded={infoMode === "info"} aria-controls="ii-am-zoom-info-panel" disabled={editing || !!coord || aiOpen} onClick={() => setInfo("info")} data-ii-zoom-info-toggle=""><InfoIcon /></IconButton>
          {developer ? <IconButton label={infoMode === "analyzer" ? ZOOM_LABELS.closeAnalysis : ZOOM_LABELS.openAnalysis} variant={infoMode === "analyzer" ? "subtle" : "ghost"} aria-pressed={infoMode === "analyzer"} disabled={editing || !!coord || aiOpen} onClick={() => setInfo("analyzer")} data-ii-zoom-analyzer-toggle=""><BracesIcon /></IconButton> : null}
          <IconButton label={sidebarsOpen ? ZOOM_LABELS.hideSidebar : ZOOM_LABELS.showSidebar} aria-expanded={sidebarsOpen} disabled={!!coord} onClick={toggleSidebars}><ColumnsIcon /></IconButton>
          <IconButton label={ZOOM_LABELS.close} disabled={!!coord} onClick={onClose} data-ii-zoom-close=""><XIcon /></IconButton>
        </div>
        {saveBadge}
        <div class={cn("grid h-full min-h-0 w-full", infoMode !== "closed" ? "grid-cols-[minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)]")}>
          <div class={cn("grid min-h-0 min-w-0 overflow-hidden", aiOpen ? "grid-rows-[minmax(0,1fr)_auto]" : "grid-rows-[minmax(0,1fr)]")}>
            {stage}
            {aiPanel}
          </div>
          {infoMode === "analyzer" && details ? (
            <section class="grid min-h-0 w-112 max-w-md grid-rows-[auto_minmax(0,1fr)] gap-2 overflow-hidden bg-background/68 p-3 pt-16 backdrop-blur-2xl" aria-label={ZOOM_LABELS.analysis}>
              <div class="flex min-h-8 items-center justify-between gap-2 text-xs font-extrabold">
                <span class="inline-flex items-center gap-2"><BracesIcon className="text-primary" />{ZOOM_LABELS.analysis}</span>
                <CopyButton text={details.analyzerText} label={ZOOM_LABELS.copyAnalysis} copiedLabel={ZOOM_LABELS.copied} />
              </div>
              <AnalyzerText text={details.analyzerText} />
            </section>
          ) : infoMode === "info" ? (
            <section id="ii-am-zoom-info-panel" class="relative flex min-h-0 w-112 max-w-md flex-col gap-2 overflow-hidden bg-background/68 p-3 pr-2 backdrop-blur-2xl" aria-label={ZOOM_LABELS.info} data-ii-zoom-info="">
              <div class={cn("flex h-10 min-w-0 shrink-0 items-center gap-1", developer ? "pr-48" : "pr-40")}>
                {infoActions(false)}
                {details?.promptDraftActive ? <span class="rounded-sm bg-primary/18 px-1.5 text-3xs font-black text-primary">{ZOOM_LABELS.draftActive}</span> : null}
              </div>
              <div class="flex min-h-0 flex-1 flex-col">{fields(false)}</div>
              {showFooterInInfo ? (
                <GenerationFooter details={details!} sizes={sizes} disabled={disabled} layout="info" regenerating={session.regenerating || session.busy === "regenerate"} onSeedFixed={(f) => void session.setSeedFixed(f)} onSize={(id) => void session.setSizeId(id)} onRegenerate={() => void session.regenerate()} />
              ) : null}
            </section>
          ) : null}
        </div>
      </main>
      {sidebarsOpen ? (
        <aside class="flex min-h-0 flex-col gap-2 overflow-hidden bg-sidebar/88 p-2.5" id="ii-am-zoom-history" aria-label={ZOOM_LABELS.generationLog}>
          <header class="flex min-h-8 items-center justify-between gap-1 text-xs font-extrabold">
            {details ? <HistoryActions details={details} disabled={locked || historicalLock} onSave={session.download} onDelete={() => void session.deleteEntry()} /> : null}
            <span class="flex-1 truncate text-center">{ZOOM_LABELS.generationLog}</span>
          </header>
          <div class="min-h-0 flex-1 overflow-y-auto pr-1">
            {details ? <HistoryList details={details} disabled={locked} layout="sidebar" onSelect={session.selectEntry} /> : null}
          </div>
          {details && !aiOpen ? (
            <GenerationFooter details={details} sizes={sizes} disabled={disabled} layout="sidebar" regenerating={session.regenerating || session.busy === "regenerate"} onSeedFixed={(f) => void session.setSeedFixed(f)} onSize={(id) => void session.setSizeId(id)} onRegenerate={() => void session.regenerate()} />
          ) : null}
        </aside>
      ) : null}
      {dialogs}
    </div>
  );
}

function actorNames(sections: readonly ZoomPromptSection[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of sections) {
    if (s.target !== "actor") continue;
    const name = s.label.split(" (")[0]!.trim();
    const latin = (/\(([^)]+)\)/u.exec(s.label)?.[1] ?? "").toLowerCase();
    const keys = [name, name.toLowerCase(), latin.replace(/[^a-z0-9]+/gu, ""), ...latin.split(/[^a-z0-9]+/u)].filter((k) => k.length > 1);
    for (const key of keys) out[key] ??= s.label;
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------
 * Mobile layout (AM 165022-165268)
 * ---------------------------------------------------------------------------------------------- */

interface MobileZoomProps {
  session: ZoomSession;
  app: AppController;
  stage: ComponentChildren;
  chrome: boolean;
  panel: MobilePanel;
  setPanel: (panel: MobilePanel) => void;
  badge: string;
  developer: boolean;
  disabled: boolean;
  locked: boolean;
  editing: boolean;
  coordEditing: boolean;
  aiPanel: ComponentChildren;
  fields: ComponentChildren;
  infoActions: ComponentChildren;
  sizes: ReturnType<typeof sizeOptions>;
  slotDeleteButton: ComponentChildren;
  stateButton: ComponentChildren;
  saveBadge: ComponentChildren;
  onClose: () => void;
  children?: ComponentChildren;
}

function MobileZoom(props: MobileZoomProps) {
  const { session, panel, setPanel, chrome, developer, locked, editing, coordEditing } = props;
  const details = session.details;
  const toggle = (next: MobilePanel) => setPanel(panel === next ? "closed" : next);
  const panelTitle: Record<Exclude<MobilePanel, "closed">, string> = {
    images: `${ZOOM_LABELS.chatImages} ${props.badge}`,
    history: ZOOM_LABELS.generationLog,
    info: ZOOM_LABELS.info,
    generation: ZOOM_LABELS.generationSettings,
    analyzer: ZOOM_LABELS.analysis
  };
  const dockItems: Array<{ id: Exclude<MobilePanel, "closed" | "analyzer">; label: string; icon: ComponentChildren; count?: number }> = [
    { id: "images", label: ZOOM_LABELS.dockImages, icon: <ImagesIcon />, count: session.items.length },
    { id: "history", label: ZOOM_LABELS.dockLog, icon: <HistoryIcon />, count: details?.history.length ?? 0 },
    { id: "info", label: ZOOM_LABELS.dockPrompt, icon: <FileTextIcon /> },
    { id: "generation", label: ZOOM_LABELS.dockSettings, icon: <SlidersIcon /> }
  ];
  const regenerating = session.regenerating || session.busy === "regenerate";
  return (
    <div class="relative flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground" data-ii-zoom-workspace="mobile" data-chrome-visible={chrome ? "true" : "false"}>
      <div class="relative min-h-0 flex-1">
        <div class="absolute inset-0 grid">{props.stage}</div>
        <header class={cn("absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 bg-gradient-to-b from-background/86 to-transparent p-2 transition-opacity", chrome ? "opacity-100" : "pointer-events-none opacity-0")}>
          <div class="flex min-w-0 items-center gap-2">
            <button type="button" class="grid size-12 place-items-center rounded-full bg-background/72 backdrop-blur-xl disabled:opacity-45" aria-label={ZOOM_LABELS.closeMobile} title={ZOOM_LABELS.closeMobile} disabled={coordEditing} onClick={props.onClose} data-ii-zoom-close="">
              <ChevronLeftIcon className="size-5" />
            </button>
            <span class="truncate rounded-full bg-background/72 px-3 py-1.5 text-xs font-bold backdrop-blur-xl">{ZOOM_LABELS.chatImages} <span class="font-mono text-muted-foreground">{props.badge}</span></span>
          </div>
          <div class="flex items-center gap-1 rounded-full bg-background/72 p-1 backdrop-blur-xl">
            {props.slotDeleteButton}
            {props.stateButton}
            <IconButton label={panel === "info" ? ZOOM_LABELS.closeInfo : ZOOM_LABELS.openInfo} aria-pressed={panel === "info"} disabled={editing || coordEditing} onClick={() => toggle("info")} data-ii-zoom-info-toggle=""><InfoIcon /></IconButton>
            {developer ? <IconButton label={panel === "analyzer" ? ZOOM_LABELS.closeAnalysis : ZOOM_LABELS.openAnalysis} aria-pressed={panel === "analyzer"} disabled={editing || coordEditing} onClick={() => toggle("analyzer")}><BracesIcon /></IconButton> : null}
          </div>
        </header>
        {props.saveBadge}
        {panel !== "closed" && details ? (
          <aside class="absolute inset-x-0 bottom-0 z-30 flex max-h-[72%] min-h-0 flex-col gap-2 rounded-t-2xl bg-popover/96 p-3 shadow-2xl backdrop-blur-2xl" aria-label={ZOOM_LABELS.tools} data-ii-zoom-sheet={panel}>
            <header class="flex min-h-11 items-center justify-between gap-2">
              <div class="flex min-w-0 items-center gap-1">
                {panel === "history" ? <HistoryActions details={details} disabled={locked || (session.historical && !developer)} onSave={session.download} onDelete={() => void session.deleteEntry()} /> : null}
                {panel === "info" ? props.infoActions : null}
                <span class="truncate pl-1 text-sm font-extrabold">{panelTitle[panel]}</span>
                {panel === "generation" ? <span class="font-mono text-2xs text-muted-foreground">{details.width} × {details.height}</span> : null}
              </div>
              <div class="flex items-center gap-1">
                {panel === "analyzer" ? <CopyButton text={details.analyzerText} label={ZOOM_LABELS.copyAnalysis} copiedLabel={ZOOM_LABELS.copied} /> : null}
                <IconButton label={ZOOM_LABELS.closePanel} disabled={panel === "info" && editing} onClick={() => setPanel("closed")}><ChevronDownIcon /></IconButton>
              </div>
            </header>
            <div class="min-h-0 flex-1 overflow-y-auto">
              {panel === "images" ? <ChatImagesList groups={session.groups} items={session.items} currentSlotId={session.target.slotId} disabled={locked} layout="strip" onSelect={session.selectItem} onStepRevision={(g, d) => void session.stepRevision(g, d)} /> : null}
              {panel === "history" ? <HistoryList details={details} disabled={locked} layout="strip" onSelect={session.selectEntry} /> : null}
              {panel === "info" ? props.fields : null}
              {panel === "generation" ? <GenerationFooter details={details} sizes={props.sizes} disabled={props.disabled} layout="gallery" regenerating={regenerating} onSeedFixed={(f) => void session.setSeedFixed(f)} onSize={(id) => void session.setSizeId(id)} onRegenerate={() => void session.regenerate()} /> : null}
              {panel === "analyzer" ? <AnalyzerText text={details.analyzerText} /> : null}
            </div>
          </aside>
        ) : null}
      </div>
      {props.aiPanel ? (
        <div class="relative z-40">{props.aiPanel}</div>
      ) : (
        <nav class={cn("z-30 grid grid-cols-5 gap-1 bg-background/92 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-2xl transition-opacity", chrome || panel !== "closed" ? "opacity-100" : "pointer-events-none opacity-0")} aria-label={ZOOM_LABELS.tools} data-ii-zoom-dock="">
          {dockItems.map((item) => (
            <button
              key={item.id}
              type="button"
              class={cn("relative grid min-h-12 place-items-center gap-0.5 rounded-md text-3xs font-bold disabled:opacity-45", panel === item.id ? "bg-selected text-selected-foreground" : "text-muted-foreground")}
              aria-pressed={panel === item.id}
              disabled={editing || coordEditing}
              onClick={() => toggle(item.id)}
              data-ii-zoom-panel={item.id}
            >
              {item.icon}
              <span>{item.label}</span>
              {item.count ? <span class="absolute right-1.5 top-1 rounded-full bg-surface-badge px-1 font-mono text-3xs">{item.count}</span> : null}
            </button>
          ))}
          <button
            type="button"
            class="grid min-h-12 place-items-center gap-0.5 rounded-md bg-primary/14 text-3xs font-bold text-primary disabled:opacity-45"
            disabled={!details?.canRegenerate || props.disabled || regenerating}
            onClick={() => void session.regenerate()}
            aria-label={ZOOM_LABELS.regenerate}
            title={ZOOM_LABELS.regenerateTitle}
            data-ii-zoom-regenerate=""
          >
            {regenerating ? <LoaderIcon /> : <RefreshIcon />}
            <span>{ZOOM_LABELS.regenerate}</span>
          </button>
        </nav>
      )}
      {props.children}
    </div>
  );
}

