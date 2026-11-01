/**
 * Atelier sidebar (AM `Ict` 124818, rows `xct` 124333, menu `yct` 124221) with the JSON import (file input 124938,
 * `kbe` validation) and the export dialog (`Sct` 124987).
 */
import { useRef, useState } from "preact/hooks";
import { ATELIER_BUILTIN_DOCUMENT_ID, type AtelierDocumentSelection, type AtelierDocumentView } from "../../../shared/contract/atelier.js";
import { useAppState } from "../../state/app-state.js";
import { ArrowLeftIcon, Button, CheckIcon, Dialog, IconButton, ListIcon, PlusIcon, SettingsIcon, TextField, XIcon, cn, useConfirm } from "../ui/index.js";
import { Badge, Checkbox, Menu } from "../workspace/parts.js";
import { ATELIER_LABELS as L } from "./labels.js";
import { defaultExportSelection, isBuiltInGuideline } from "./model.js";
import { OutputOrder } from "./order.js";
import { useAtelier, useAtelierStore } from "./store.js";

export function AtelierSidebar({ guarded, onSettings }: { guarded: (action: () => void) => void; onSettings: () => void }) {
  const atelier = useAtelierStore();
  const state = useAppState((s) => s.atelier);
  const view = useAtelier((s) => s.view);
  const documentId = useAtelier((s) => s.documentId);
  const busy = useAtelier((s) => s.busy);
  const fileInput = useRef<HTMLInputElement>(null);
  const [importErrors, setImportErrors] = useState<string[] | null>(null);
  const [exportId, setExportId] = useState<string | null>(null);
  const documents = state?.catalog.documents ?? [];
  return (
    <div class="flex h-full min-h-0 flex-col" data-atelier-sidebar="">
      <header class="flex h-12 shrink-0 items-center gap-2 px-3">
        <h2 class="min-w-0 flex-1 truncate text-sm font-extrabold">{L.shell.title}</h2>
        <IconButton label={view.orderOpen ? L.sidebar.backToPresets : L.sidebar.openOrder} aria-pressed={view.orderOpen} disabled={view.mode === "guidelines"} onClick={() => atelier.updateView({ orderOpen: !view.orderOpen })} data-atelier-order-toggle="">
          {view.orderOpen ? <ArrowLeftIcon /> : <ListIcon />}
        </IconButton>
      </header>
      {view.orderOpen && view.mode === "preset" ? <OutputOrder /> : (
        <nav class="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto px-2.5 pb-3" aria-label={L.shell.menu}>
          <button type="button" aria-current={view.mode === "guidelines" ? "page" : undefined} data-atelier-guidelines-entry=""
            class={cn("flex h-9 items-center rounded-md px-2.5 text-left text-xs font-bold outline-none hover:bg-surface-navigation-hover focus-visible:ring-2 focus-visible:ring-ring/55", view.mode === "guidelines" ? "bg-surface-navigation-selected text-selected-foreground" : "text-muted-foreground")}
            onClick={() => atelier.updateView({ mode: "guidelines", editor: null, orderOpen: false })}>
            {L.sidebar.guidelines}
          </button>
          <section class="grid gap-0.5">
            <h3 class="flex h-7 items-center px-2 text-3xs font-black uppercase text-muted-foreground">{L.sidebar.presets}</h3>
            {documents.map((d) => (
              <PresetRow key={d.id} doc={d} active={state!.catalog.activeId === d.id} current={view.mode === "preset" && documentId === d.id} guarded={guarded} onExport={() => setExportId(d.id)} />
            ))}
          </section>
        </nav>
      )}
      <footer class="flex shrink-0 items-center gap-1 border-t border-border px-2 py-2">
        <IconButton label={L.shell.settings} onClick={onSettings} data-atelier-settings=""><SettingsIcon /></IconButton>
        <span class="flex-1" />
        <Button size="sm" variant="ghost" aria-label={L.sidebar.addAria} disabled={busy} onClick={() => guarded(() => void atelier.createDocument())}><PlusIcon />{L.sidebar.add}</Button>
        <Button size="sm" variant="ghost" aria-label={L.sidebar.importAria} disabled={busy} onClick={() => fileInput.current?.click()}>{L.sidebar.import}</Button>
        <input ref={fileInput} type="file" accept=".json,application/json" class="hidden" data-atelier-import-input="" onChange={(e) => {
          const input = e.currentTarget as HTMLInputElement;
          const file = input.files?.[0];
          input.value = "";
          if (!file) return;
          guarded(() => void atelier.importFile(file).then((r) => {
            if (!r.ok) setImportErrors(r.errors);
            else atelier.app.notify({ tone: "success", message: [L.importing.imported(file.name), r.merged ? L.importing.merged(r.merged) : ""].filter(Boolean).join(" ") });
          }));
        }} />
      </footer>
      <Dialog open={importErrors !== null} onOpenChange={() => setImportErrors(null)} title={L.importing.title} role="alertdialog" footer={<Button onClick={() => setImportErrors(null)}>{L.importing.close}</Button>}>
        <ul class="grid gap-1 text-2xs text-destructive" data-atelier-import-errors="">{(importErrors ?? []).map((e, i) => <li key={i}>{e}</li>)}</ul>
      </Dialog>
      {exportId ? <ExportDialog id={exportId} onClose={() => setExportId(null)} /> : null}
    </div>
  );
}

function PresetRow({ doc, active, current, guarded, onExport }: { doc: AtelierDocumentView; active: boolean; current: boolean; guarded: (action: () => void) => void; onExport: () => void }) {
  const atelier = useAtelierStore();
  const confirm = useConfirm();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = doc.builtIn ? L.sidebar.defaultPresetName : doc.name;
  const commitRename = async () => {
    if (renaming === null) return;
    const problem = await atelier.renameDocument(doc.id, renaming);
    if (problem) setError(problem);
    else { setRenaming(null); setError(null); }
  };
  return (
    <div class={cn("grid gap-1 rounded-md px-1.5 py-1", current && "bg-surface-navigation-selected")} data-atelier-preset={doc.id}>
      <div class="flex min-w-0 items-center gap-1">
        <button type="button" role="radio" aria-checked={active} aria-label={active ? `${name}: ${L.sidebar.inUseAria}` : `${name}: ${L.sidebar.useForGeneration}`} title={active ? L.sidebar.inUseAria : L.sidebar.useForGeneration}
          class={cn("grid size-6 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/55", active ? "bg-primary text-primary-foreground" : "bg-surface-control text-muted-foreground")}
          data-atelier-activate="" onClick={() => { if (!active) void atelier.activateDocument(doc.id); }}>
          {active ? <CheckIcon className="size-3.5" /> : null}
        </button>
        {renaming !== null ? (
          <span class="flex min-w-0 flex-1 items-center gap-1">
            <TextField aria-label={L.sidebar.renameField(name)} value={renaming} className="h-7 min-w-0 flex-1" onInput={(e) => { setRenaming((e.currentTarget as HTMLInputElement).value); setError(null); }} onKeyDown={(e) => { if (e.key === "Enter") void commitRename(); if (e.key === "Escape") { e.stopPropagation(); setRenaming(null); setError(null); } }} />
            <IconButton size="iconCompact" label={L.sidebar.confirm} onClick={() => void commitRename()}><CheckIcon /></IconButton>
            <IconButton size="iconCompact" label={L.save.cancel} onClick={() => { setRenaming(null); setError(null); }}><XIcon /></IconButton>
          </span>
        ) : (
          <button type="button" aria-current={current ? "page" : undefined} class="min-w-0 flex-1 truncate rounded-sm px-1 text-left text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring/55" title={name} onClick={() => guarded(() => atelier.selectDocument(doc.id))}>
            {name}
          </button>
        )}
        {renaming === null ? (
          <Menu label={L.sidebar.menu(name)} trigger={<span aria-hidden="true">⋯</span>} items={[
            { id: "use", label: L.sidebar.useForGeneration, disabled: active, onSelect: () => void atelier.activateDocument(doc.id) },
            ...(!doc.builtIn ? [{ id: "rename", label: L.sidebar.rename, onSelect: () => setRenaming(doc.name) }] : []),
            { id: "duplicate", label: L.sidebar.duplicate, onSelect: () => void atelier.duplicateDocument(doc.id) },
            { id: "export", label: L.sidebar.exportJson, disabled: !!doc.readError, onSelect: onExport },
            { id: "raw", label: L.sidebar.openRaw, onSelect: () => guarded(() => { atelier.selectDocument(doc.id); atelier.updateView({ rawOpen: true }); }) },
            ...(doc.id === ATELIER_BUILTIN_DOCUMENT_ID ? [{ id: "restore", label: L.sidebar.restoreOriginal, onSelect: () => void confirm({ title: L.sidebar.restoreTitle, description: L.sidebar.restoreDescription(name), confirmLabel: L.sidebar.restoreOriginal, tone: "default" }).then((ok) => { if (ok) void atelier.resetBuiltIn(); }) }] : []),
            ...(!doc.builtIn ? [{ id: "delete", label: L.sidebar.delete, destructive: true, onSelect: () => void confirm({ title: L.sidebar.deleteTitle, description: active ? L.sidebar.deleteActiveDescription(name) : L.sidebar.deleteDescription(name), confirmLabel: L.sidebar.delete }).then((ok) => { if (ok) void atelier.deleteDocument(doc.id); }) }] : [])
          ]} />
        ) : null}
      </div>
      <div class="flex items-center gap-1 pl-7">
        <Badge>{doc.builtIn ? L.sidebar.builtIn : L.sidebar.userDocument}</Badge>
        {active ? <Badge tone="primary">{L.sidebar.inUse}</Badge> : null}
        {doc.readError ? <Badge tone="danger">{L.table.checkSettings}</Badge> : null}
      </div>
      {error ? <span class="pl-7 text-3xs text-destructive" role="alert">{error}</span> : null}
    </div>
  );
}

/** JSON export dialog (AM `Sct`): guideline checkboxes grouped by kind, default = AM `S8`. */
export function ExportDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const atelier = useAtelierStore();
  const state = useAppState((s) => s.atelier);
  const [selection, setSelection] = useState<AtelierDocumentSelection | null>(() => (state ? defaultExportSelection(state) : null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!state || !selection) return null;
  type Group = { key: "scene" | "imageRatio" | "character" | "outfit"; title: string; items: Array<{ id: string; name: string }> };
  const groups: Group[] = [
    { key: "scene", title: L.exporting.scene, items: Object.entries(state.library.scene.items).filter(([k]) => !isBuiltInGuideline("scene", k)).map(([k, v]) => ({ id: k, name: v.name })) },
    { key: "imageRatio", title: L.exporting.imageRatio, items: Object.entries(state.library.imageRatio.items).filter(([k]) => k !== "default").map(([k, v]) => ({ id: k, name: v.name })) },
    { key: "character", title: L.exporting.character, items: Object.entries(state.freeGeneration.character.items).map(([k, v]) => ({ id: k, name: v.name })) },
    { key: "outfit", title: L.exporting.outfit, items: Object.entries(state.freeGeneration.outfit.items).map(([k, v]) => ({ id: k, name: v.name })) }
  ];
  const selected = (g: Group): string[] => (g.key === "scene" || g.key === "imageRatio" ? selection[g.key] : selection.freeGeneration?.[g.key] ?? []);
  const set = (g: Group, ids: string[]) => setSelection(g.key === "scene" || g.key === "imageRatio" ? { ...selection, [g.key]: ids } : { ...selection, freeGeneration: { ...selection.freeGeneration, [g.key]: ids } });
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title={L.exporting.title} description={L.exporting.description} footer={<>
      <Button variant="ghost" onClick={onClose}>{L.save.cancel}</Button>
      <Button disabled={saving} data-atelier-export-confirm="" onClick={async () => {
        setSaving(true);
        const problem = await atelier.exportDocument(id, selection);
        setSaving(false);
        if (problem) setError(problem);
        else onClose();
      }}>{saving ? L.exporting.exporting : L.exporting.export}</Button>
    </>}>
      <div class="grid max-h-80 gap-3 overflow-y-auto" data-atelier-export="">
        {groups.every((g) => !g.items.length) ? <p class="text-2xs text-muted-foreground">{L.exporting.none}</p> : null}
        {groups.filter((g) => g.items.length).map((g) => (
          <fieldset key={g.key} class="grid gap-1">
            <legend class="text-2xs font-black text-muted-foreground">{g.title}</legend>
            {g.items.map((item) => (
              <label key={item.id} class="inline-flex items-center gap-2 text-xs">
                <Checkbox checked={selected(g).includes(item.id)} label={`${g.title}: ${item.name}`} onCheckedChange={(on) => set(g, on ? [...selected(g), item.id] : selected(g).filter((x) => x !== item.id))} />
                {item.name}
              </label>
            ))}
          </fieldset>
        ))}
        {error ? <p class="text-2xs text-destructive" role="alert">{error}</p> : null}
      </div>
    </Dialog>
  );
}
