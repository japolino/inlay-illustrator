/**
 * Maid Atelier workspace (AM `Elt` 142287 shell wiring, `Olt` 142212 main router, `mve` 142122 save indicator +
 * workspace switch, unsaved-changes guard 142470ff, recovery banner `ilt` 129301). Rendered by the overlay App in place of
 * the Inlay Illustrator workspace while the Atelier mode is on.
 */
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { useApp, useAppState } from "../../state/app-state.js";
import { ArrowLeftIcon, Button, Dialog, IconButton, MenuIcon, PanelLeftIcon, Tabs, TextArea, XIcon, cn, useFocusTrap, useLayer } from "../ui/index.js";
import { useIsMobile } from "../viewport.js";
import { ChannelEditor, ExpressionsPage, GroupEditor } from "./expressions.js";
import { GuidelineEditor, GuidelinesPage, guidelineKindOf, kindLabel } from "./guidelines.js";
import { CategoryEditor, InteractionEditor, InteractionsPage } from "./interactions.js";
import { ATELIER_LABELS as L } from "./labels.js";
import { Notice } from "./kit.js";
import { diagnosticText } from "./model.js";
import { RulesPage } from "./rules.js";
import { SceneEditor, ScenesPage } from "./scenes.js";
import { AtelierSidebar } from "./sidebar.js";
import { AtelierContext, AtelierStore, useAtelier, useAtelierStore, type AtelierEditor, type AtelierSection, type GuidelineTab } from "./store.js";

const TAB_PREFIX = "ii-atelier";
const SECTIONS: Array<{ id: AtelierSection; label: string }> = [
  { id: "expressions", label: L.tabs.expressions },
  { id: "interactions", label: L.tabs.interactions },
  { id: "scenes", label: L.tabs.scenes },
  { id: "rules", label: L.tabs.rules }
];
const GUIDELINE_TABS: Array<{ id: GuidelineTab; label: string }> = [
  { id: "scene", label: L.tabs.scene },
  { id: "imageRatio", label: L.tabs.imageRatio },
  { id: "free", label: L.tabs.free }
];

export interface AtelierWorkspaceProps {
  store: AtelierStore;
  /** Leave the Atelier (back to the Inlay Illustrator workspace). */
  onExit: () => void;
  /** Leave the Atelier and open the settings. */
  onSettings: () => void;
  /** Close the overlay. */
  onClose: () => void;
  /** Called with the guard so the host can route its own transitions through it. */
  onGuard?: (guard: (action: () => void) => void) => void;
}

/** Root of the Atelier mode (provider + layout). */
export function AtelierWorkspace(props: AtelierWorkspaceProps) {
  useEffect(() => {
    void props.store.open();
    return () => props.store.close();
  }, [props.store]);
  return (
    <AtelierContext.Provider value={props.store}>
      <AtelierLayout {...props} />
    </AtelierContext.Provider>
  );
}

function AtelierLayout({ onExit, onSettings, onClose, onGuard }: AtelierWorkspaceProps) {
  const atelier = useAtelierStore();
  const app = useApp();
  const mobile = useIsMobile();
  const loadState = useAppState((s) => s.atelierState);
  const loadError = useAppState((s) => s.atelierError);
  const hasState = useAppState((s) => !!s.atelier);
  const view = useAtelier((s) => s.view);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [saving, setSaving] = useState(false);

  /** Transition guard (AM `requestTransition`): unsaved edits ask "Save changes?" first. */
  const guarded = (action: () => void) => {
    if (!atelier.hasUnsaved()) { action(); return; }
    setPending(() => action);
  };
  useEffect(() => { onGuard?.(guarded); }, [onGuard]);
  // Leaving the page with unsaved edits (AM blocks `beforeunload` while dirty).
  useEffect(() => {
    const view = typeof window !== "undefined" ? window : null;
    if (!view) return;
    const block = (event: BeforeUnloadEvent) => { if (atelier.hasUnsaved()) { event.preventDefault(); event.returnValue = ""; } };
    view.addEventListener("beforeunload", block);
    return () => view.removeEventListener("beforeunload", block);
  }, [atelier]);

  const exitButton = (
    <Button variant="command" size="sm" aria-label={L.shell.backToWorkspaceAria} title={L.shell.backToWorkspaceAria} data-atelier-exit="" onClick={() => guarded(onExit)}>{L.shell.backToWorkspace}</Button>
  );
  const closeButton = <IconButton label={L.shell.exit} onClick={() => guarded(onClose)}><XIcon /></IconButton>;

  if (!hasState) {
    return (
      <div class="grid h-full w-full place-items-center bg-workspace-pane p-6 text-foreground" data-ii-atelier="loading">
        {loadState === "error" ? (
          <div class="grid justify-items-center gap-3 text-center">
            <p class="text-xs text-destructive" role="alert">{L.shell.loadFailed} {loadError?.message}</p>
            <div class="flex gap-2"><Button onClick={() => void atelier.open()}>{L.shell.retry}</Button>{exitButton}</div>
          </div>
        ) : <p class="text-xs text-muted-foreground" role="status">{L.shell.loading}</p>}
      </div>
    );
  }

  const sidebar = <AtelierSidebar guarded={guarded} onSettings={() => guarded(onSettings)} />;
  const editor = view.editor;
  const secondary = editor ? <EditorPane editor={editor} mobile={mobile} /> : null;
  const header = <AtelierHeader mobile={mobile} exit={exitButton} close={closeButton} onMenu={() => (mobile ? setDrawer(true) : setSidebarOpen(!sidebarOpen))} sidebarOpen={sidebarOpen} />;
  const main = <AtelierMain />;
  const guard = (
    <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null); }} title={L.save.guardTitle} description={L.save.guardDescription} role="alertdialog" footer={<>
      <Button variant="ghost" onClick={() => setPending(null)}>{L.save.cancel}</Button>
      <Button variant="danger" data-atelier-discard="" onClick={() => { const action = pending; setPending(null); atelier.discardAll(); action?.(); }}>{L.save.discard}</Button>
      <Button disabled={saving} data-atelier-save-continue="" onClick={async () => {
        const action = pending;
        setSaving(true);
        const ok = await atelier.saveAll();
        setSaving(false);
        setPending(null);
        if (ok) action?.();
      }}>{L.save.saveAndContinue}</Button>
    </>} />
  );

  if (mobile) {
    return (
      <div class="flex h-full min-h-0 w-full flex-col bg-workspace-pane text-foreground" data-ii-atelier="mobile">
        {secondary ? (
          <>
            <header class="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2">
              <IconButton label={L.shell.back} onClick={() => atelier.closeEditor()}><ArrowLeftIcon /></IconButton>
              <div class="min-w-0 flex-1 truncate text-sm font-extrabold">{editorTitle(editor)}</div>
              <SaveIndicator />
            </header>
            <div class="min-h-0 flex-1 overflow-y-auto p-3">{secondary}</div>
          </>
        ) : (
          <>
            {header}
            <div class="min-h-0 flex-1 overflow-y-auto">{main}</div>
          </>
        )}
        {drawer ? <MobileDrawer label={L.shell.menu} onClose={() => setDrawer(false)}>{sidebar}</MobileDrawer> : null}
        {guard}
      </div>
    );
  }

  return (
    <div class="grid h-full min-h-0 w-full bg-workspace-pane text-foreground" style={{ gridTemplateColumns: `${sidebarOpen ? 280 : 0}px minmax(0,1fr)` }} data-ii-atelier="desktop">
      <aside aria-label={L.shell.menu} inert={!sidebarOpen} class={cn("min-h-0 min-w-0 overflow-hidden border-r border-border bg-sidebar", !sidebarOpen && "opacity-0")}>{sidebar}</aside>
      <section class="flex min-h-0 min-w-0 flex-col">
        {header}
        <div class="relative flex min-h-0 flex-1">
          <div class={cn("min-h-0 min-w-0 overflow-y-auto", secondary ? "flex-[1.1]" : "flex-1")} data-atelier-pane="main">{main}</div>
          {secondary ? (
            <div class="flex min-h-0 min-w-0 flex-1 flex-col border-l border-border" data-atelier-pane="secondary">
              <header class="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
                {editor?.type === "group" && editor.fromInteraction ? <IconButton label={L.interactions.backToList} onClick={() => atelier.openEditor({ type: "interaction", id: editor.fromInteraction! })}><ArrowLeftIcon /></IconButton> : null}
                <h2 class="min-w-0 flex-1 truncate text-sm font-extrabold">{editorTitle(editor)}</h2>
              </header>
              <div class="min-h-0 flex-1 overflow-y-auto p-4">{secondary}</div>
            </div>
          ) : null}
        </div>
      </section>
      {guard}
    </div>
  );
}

function editorTitle(editor: AtelierEditor): string {
  if (!editor) return "";
  switch (editor.type) {
    case "group": return L.expressions.editGroup(editor.id);
    case "channel": return L.expressions.editChannel(editor.id);
    case "interaction": return editor.id;
    case "category": return L.interactions.editCategory(editor.category);
    case "scene": return editor.id || L.scenes.unnamed;
    case "guideline": return kindLabel(editor.kind);
  }
}

function EditorPane({ editor }: { editor: NonNullable<AtelierEditor>; mobile: boolean }) {
  switch (editor.type) {
    case "group": return <GroupEditor id={editor.id} system={editor.system} tab={editor.tab} option={editor.option} />;
    case "channel": return <ChannelEditor id={editor.id} system={editor.system} />;
    case "interaction": return <InteractionEditor id={editor.id} />;
    case "category": return <CategoryEditor category={editor.category} />;
    case "scene": return <SceneEditor id={editor.id} />;
    case "guideline": return <GuidelineEditor kind={editor.kind} id={editor.id} />;
  }
}

/* ------------------------------------------------------------------------------------------------ header */

function AtelierHeader({ mobile, exit, close, onMenu, sidebarOpen }: { mobile: boolean; exit: ComponentChildren; close: ComponentChildren; onMenu: () => void; sidebarOpen: boolean }) {
  const atelier = useAtelierStore();
  const view = useAtelier((s) => s.view);
  const editorOpen = useAtelier((s) => !!s.view.editor);
  const tabs = view.mode === "guidelines" ? (
    <Tabs idPrefix={`${TAB_PREFIX}-kind`} aria-label={L.tabs.guidelineKind} items={GUIDELINE_TABS.map((t) => ({ id: t.id, label: t.label }))} value={view.guidelineTab} onValueChange={(guidelineTab) => atelier.updateView({ guidelineTab, editor: null })} />
  ) : (
    <Tabs idPrefix={TAB_PREFIX} aria-label={L.shell.content} items={SECTIONS.map((s) => ({ id: s.id, label: mobile ? s.label.replace(/\s+/g, "") : s.label, ariaLabel: s.label }))} value={view.section} onValueChange={(section) => atelier.updateView({ section, editor: null, category: null })} />
  );
  return (
    <header class={cn("flex shrink-0 items-center gap-2 border-b border-border px-3", mobile ? "h-auto flex-wrap py-2" : "h-12")} data-atelier-header="">
      <IconButton label={mobile ? L.shell.menu : `${L.shell.menu}`} aria-pressed={mobile ? undefined : sidebarOpen} onClick={onMenu}>{mobile ? <MenuIcon /> : <PanelLeftIcon />}</IconButton>
      <nav class="min-w-0 flex-1 overflow-x-auto" aria-label={L.shell.navigation(view.mode === "guidelines" ? L.sidebar.guidelines : "")}>{tabs}</nav>
      <Button size="sm" variant="ghost" aria-pressed={view.guideOpen} onClick={() => atelier.updateView({ guideOpen: !view.guideOpen })} data-atelier-guide="">{view.guideOpen ? L.shell.hideGuide : L.shell.showGuide}</Button>
      <SaveIndicator />
      {exit}
      {editorOpen && !mobile ? <IconButton label={L.shell.collapseWork} onClick={() => atelier.closeEditor()}><PanelLeftIcon className="rotate-180" /></IconButton> : null}
      {close}
    </header>
  );
}

/** Save dot + Save button (AM `mve`). */
export function SaveIndicator() {
  const atelier = useAtelierStore();
  const dirty = useAtelier((s) => !!s.draft?.dirty);
  const saving = useAtelier((s) => s.saving);
  const failure = useAtelier((s) => s.failure);
  const stale = useAtelier((s) => s.stale);
  const incomplete = useAtelier((s) => s.incomplete.length > 0);
  const title = stale || failure === "conflict" ? L.save.checkLatest : saving ? L.save.saving : failure ? L.save.retry : dirty ? L.save.save : L.save.saved;
  return (
    <span class="inline-flex items-center gap-1.5" data-atelier-save="">
      <span role="status" aria-label={dirty ? L.save.unsaved : L.save.clean} class={cn("size-2 rounded-full", dirty ? "bg-warning" : "bg-muted-foreground/40")} />
      {incomplete ? <span class="text-3xs font-bold text-muted-foreground">{L.save.typing}</span> : null}
      {failure && failure !== "conflict" ? <span class="text-3xs font-bold text-destructive">{L.save.failed}</span> : null}
      <Button size="sm" variant={dirty ? "default" : "subtle"} title={title} disabled={!dirty || saving || incomplete || stale} data-atelier-save-button="" onClick={() => void atelier.save()}>{title}</Button>
    </span>
  );
}

/* ------------------------------------------------------------------------------------------------ main */

function AtelierMain() {
  const atelier = useAtelierStore();
  const view = useAtelier((s) => s.view);
  const draft = useAtelier((s) => s.draft);
  const readFailures = useAppState((s) => s.atelier?.readFailures ?? []);
  const name = useAppState((s) => s.atelier?.catalog.documents.find((d) => d.id === draft?.id));
  return (
    <div class="mx-auto grid w-full max-w-240 content-start gap-3 px-5 py-4 max-md:px-3" data-atelier-main="">
      <h1 class="text-base font-extrabold">{L.shell.navigation(view.mode === "guidelines" ? kindLabel(guidelineKindOf(view.guidelineTab, view.freeKind)) : name?.builtIn ? L.sidebar.defaultPresetName : name?.name ?? "")}</h1>
      {readFailures.map((f) => (
        <Notice key={f.code} tone="danger" actions={<Button size="sm" variant="subtle" onClick={() => void atelier.repair(f.code === "library-invalid" ? "library" : f.code === "free-generation-invalid" ? "freeGeneration" : "catalog")}>{L.recovery.repair}</Button>}>{L.recovery.readFailure} {f.message}</Notice>
      ))}
      {view.mode === "preset" ? <RecoveryNotices /> : <GuidelineErrorNotice />}
      {view.mode === "guidelines" ? <GuidelinesPage /> : draft?.readError || view.rawOpen ? <RawEditor /> : (
        view.section === "expressions" ? <ExpressionsPage /> : view.section === "interactions" ? <InteractionsPage /> : view.section === "scenes" ? <ScenesPage /> : <RulesPage />
      )}
    </div>
  );
}

function GuidelineErrorNotice() {
  const error = useAtelier((s) => s.guidelineError);
  const editorOpen = useAtelier((s) => s.view.editor?.type === "guideline");
  if (!error || editorOpen) return null;
  return <Notice tone="warning">{error.message}</Notice>;
}

/** Conflict / validation / kept drafts banner (AM `ilt` + `yH`). */
function RecoveryNotices() {
  const atelier = useAtelierStore();
  const failure = useAtelier((s) => s.failure);
  const stale = useAtelier((s) => s.stale);
  const error = useAtelier((s) => s.saveError);
  const diagnostics = useAtelier((s) => s.diagnostics);
  const recoveries = useAtelier((s) => s.recoveries);
  const guidelineError = useAtelier((s) => s.guidelineError);
  return (
    <>
      {stale || failure === "conflict" ? (
        <Notice tone="warning" data-atelier-conflict="" actions={<>
          <Button size="sm" variant="subtle" onClick={() => void atelier.keepAndReload()}>{L.recovery.keepAndLoad}</Button>
          <Button size="sm" variant="ghost" onClick={() => void atelier.saveOverLatest()}>{L.recovery.saveEdits}</Button>
          <Button size="sm" variant="ghost" onClick={() => void atelier.reload()}>{L.recovery.reload}</Button>
        </>}>{L.recovery.conflict}</Notice>
      ) : null}
      {failure === "validation" || failure === "io" ? (
        <Notice tone="danger" data-atelier-save-error="" actions={failure === "io" ? <Button size="sm" variant="subtle" onClick={() => void atelier.save()}>{L.recovery.retry}</Button> : undefined}>
          {error?.message}
          {diagnostics.length ? <ul class="mt-1 list-disc pl-4">{diagnostics.slice(0, 12).map((d, i) => <li key={i}>{diagnosticText(d)}</li>)}</ul> : null}
        </Notice>
      ) : null}
      {guidelineError && !stale ? <Notice tone="warning">{guidelineError.message}</Notice> : null}
      {recoveries.length ? (
        <Notice data-atelier-recoveries="" actions={<>
          <Button size="sm" variant="ghost" onClick={() => atelier.exportRecoveries()}>{L.recovery.exportAll}</Button>
          {recoveries.map((r) => <Button key={r.id} size="sm" variant="subtle" onClick={() => void atelier.restoreRecovery(r.id)}>{L.recovery.createCopy(r.name)}</Button>)}
        </>}>
          <strong>{L.recovery.kept(recoveries.length)}</strong> — {L.recovery.keptNote}
        </Notice>
      ) : null}
    </>
  );
}

/** Raw JSON editor (AM `Olt` raw branch): read errors are repaired here. */
function RawEditor() {
  const atelier = useAtelierStore();
  const draft = useAtelier((s) => s.draft);
  const saving = useAtelier((s) => s.saving);
  const stored = useMemo(() => {
    if (!draft) return "";
    try { return JSON.stringify(JSON.parse(draft.baseJson), null, 2); } catch { return draft.baseJson; }
  }, [draft?.baseJson]);
  if (!draft) return null;
  const text = draft.rawText ?? stored;
  return (
    <section class="grid gap-2" data-atelier-raw="">
      {draft.readError ? <Notice tone="danger">{L.recovery.readError} {draft.readError}</Notice> : null}
      <TextArea aria-label={L.raw.title} rows={22} className="font-mono text-2xs" value={text} onInput={(e) => atelier.setRawText((e.currentTarget as HTMLTextAreaElement).value)} />
      <div class="flex flex-wrap gap-1.5">
        <Button size="sm" disabled={draft.rawText === null || saving} onClick={() => void atelier.save()}>{L.raw.save}</Button>
        <Button size="sm" variant="ghost" onClick={() => void atelier.exportRaw(draft.id)}>{L.raw.backup}</Button>
        {!draft.readError ? <Button size="sm" variant="ghost" onClick={() => { atelier.setRawText(null); atelier.discardAll(); atelier.updateView({ rawOpen: false }); }}>{L.raw.close}</Button> : null}
      </div>
    </section>
  );
}

function MobileDrawer({ label, onClose, children }: { label: string; onClose: () => void; children: ComponentChildren }) {
  const panel = useRef<HTMLDivElement>(null);
  useLayer(true, onClose);
  useFocusTrap(panel, true);
  return (
    <div class="fixed inset-0 z-90">
      <button type="button" tabIndex={-1} aria-label={label} class="absolute inset-0 bg-black/50" onClick={onClose} />
      <div ref={panel} role="dialog" aria-modal="true" aria-label={label} class="absolute inset-y-0 left-0 flex w-[min(320px,86%)] flex-col bg-sidebar shadow-2xl">{children}</div>
    </div>
  );
}

