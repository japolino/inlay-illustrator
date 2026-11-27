/**
 * Roster export / import (port addition): "Export" downloads the registered people of the current character as a
 * roster file; "Import" reads one, shows who will be matched or created on this character, then loads it.
 * Unsaved appearance edits (Prompts tab drafts) of the character are offered for saving first: the file is built from
 * the saved document, and an import would leave those drafts on a stale base.
 */
import { useRef, useState } from "preact/hooks";
import { buildRosterExport, parseRosterExport, planRosterImport, rosterExportFileName, type RosterExportFile, type RosterImportStep } from "../../../shared/contract/roster-transfer.js";
import type { WorkspaceSnapshot } from "../../../shared/contract/rpc.js";
import { useApp } from "../../state/app-state.js";
import { downloadJson } from "../atelier/store.js";
import { Button, Dialog } from "../ui/index.js";
import { formSaver } from "../workspace/data.js";
import { draftStoreFor, useDraftsSummary } from "../workspace/drafts.js";
import { ROSTER_LABELS as L } from "./labels.js";

type Preview = { fileName: string; file: RosterExportFile; steps: RosterImportStep[] };

function stepLabel(step: RosterImportStep): string {
  if (step.action === "create") return L.importCreates;
  const target = step.target!;
  const via = target.kind === "custom" ? L.importMatchCustom : step.matchedBy === "entry" ? L.importMatchEntry : L.importMatchName;
  return target.title === step.title ? via : `${via} · ${target.title}`;
}

export function RosterTransfer({ snapshot, disabled }: { snapshot: WorkspaceSnapshot; disabled?: boolean }) {
  const app = useApp();
  const drafts = draftStoreFor(app);
  const unsaved = useDraftsSummary(drafts, `char:${snapshot.characterId}:`).keys;
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  /** Number of unsaved drafts when Export was clicked (0 = closed). */
  const [exportGate, setExportGate] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const registered = snapshot.roster.filter((item) => item.registered).length;

  /** Saves this character's unsaved appearance drafts; false (with the error shown) when one fails. */
  const saveDrafts = async (): Promise<boolean> => {
    const save = formSaver(app);
    for (const key of drafts.dirtyKeys(`char:${snapshot.characterId}:`)) {
      if (!(await drafts.save(key, save))) {
        setError(L.saveEditsFailed(drafts.entry(key)?.error ?? ""));
        return false;
      }
    }
    return true;
  };

  const download = () => {
    // The snapshot in the app state carries the collections the saves just wrote.
    const current = app.state.workspace?.characterId === snapshot.characterId ? app.state.workspace : snapshot;
    const file = buildRosterExport(current);
    downloadJson(rosterExportFileName(current.characterName), JSON.stringify(file, null, 2), root.current?.ownerDocument ?? document);
    app.notify({ tone: "success", message: L.exported(file.people.length) });
  };

  const exportRoster = () => {
    // Read the store at click time: the hook value can lag behind an edit made just before.
    const dirty = drafts.dirtyKeys(`char:${snapshot.characterId}:`).length;
    if (dirty) setExportGate(dirty);
    else download();
  };

  const saveAndExport = async () => {
    setBusy(true);
    try {
      if (!(await saveDrafts())) return;
      setExportGate(0);
      download();
    } finally {
      setBusy(false);
    }
  };

  const readFile = async (file: File) => {
    const parsed = parseRosterExport(await file.text());
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setPreview({ fileName: file.name, file: parsed.file, steps: planRosterImport(parsed.file, snapshot) });
  };

  const confirmImport = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      if (!(await saveDrafts())) return;
      const result = await app.mutateWorkspace("roster.import", { characterId: snapshot.characterId, file: preview.file });
      setPreview(null);
      app.notify({ tone: "success", message: L.imported(result.summary.matched, result.summary.created) });
    } catch {
      /* toast shown by mutateWorkspace */
    } finally {
      setBusy(false);
    }
  };

  const created = preview?.steps.filter((s) => s.action === "create").length ?? 0;
  const replaced = preview?.steps.filter((s) => s.replacesForms).length ?? 0;
  const notes = [created ? L.importCreatedNote(created) : "", replaced ? L.importReplacedNote(replaced) : "", unsaved.length ? L.importSavesEdits(unsaved.length) : ""].filter(Boolean);

  return (
    <div ref={root} class="flex items-center gap-1" data-roster-transfer="">
      <Button size="sm" variant="ghost" className="px-1.5" disabled={disabled || busy || registered === 0} aria-label={L.exportRosterAria} title={L.exportRosterAria} data-roster-export="" onClick={exportRoster}>
        {L.exportRoster}
      </Button>
      <Button size="sm" variant="ghost" className="px-1.5" disabled={disabled || busy} aria-label={L.importRosterAria} title={L.importRosterAria} data-roster-import="" onClick={() => input.current?.click()}>
        {L.importRoster}
      </Button>
      <input ref={input} type="file" accept=".json,application/json" class="hidden" tabIndex={-1} aria-hidden="true" data-roster-import-input="" onChange={(e) => {
        const element = e.currentTarget as HTMLInputElement;
        const file = element.files?.[0];
        element.value = "";
        if (file) void readFile(file).catch(() => setError(L.importReadFailed));
      }} />
      <Dialog
        open={exportGate > 0}
        onOpenChange={(open) => { if (!open && !busy) setExportGate(0); }}
        role="alertdialog"
        title={L.exportUnsavedTitle}
        description={L.exportUnsavedDescription(exportGate)}
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setExportGate(0)}>{L.cancel}</Button>
            <Button variant="ghost" disabled={busy} data-roster-export-saved="" onClick={() => { setExportGate(0); download(); }}>{L.exportSavedVersion}</Button>
            <Button disabled={busy} aria-busy={busy} data-roster-export-save="" onClick={() => void saveAndExport()}>{busy ? L.savingEdits : L.saveAndExport}</Button>
          </>
        }
      />
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => { if (!open && !busy) setPreview(null); }}
        title={L.importTitle(snapshot.characterName)}
        description={preview ? L.importDescription(preview.fileName, preview.file.source.characterName) : undefined}
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setPreview(null)}>{L.cancel}</Button>
            <Button disabled={busy} aria-busy={busy} data-roster-import-confirm="" onClick={() => void confirmImport()}>{busy ? L.importing : L.importConfirm(preview?.steps.length ?? 0)}</Button>
          </>
        }
      >
        <ul class="grid max-h-[50vh] gap-1 overflow-y-auto text-2xs" aria-label={L.importPeople} data-roster-import-preview="">
          {(preview?.steps ?? []).map((step) => (
            <li key={step.index} class="flex min-w-0 items-center justify-between gap-2 rounded-md bg-secondary px-2 py-1.5" data-roster-import-step={step.action}>
              <strong class="min-w-0 truncate font-bold">{step.title}</strong>
              <span class="shrink-0 text-muted-foreground">{stepLabel(step)}</span>
            </li>
          ))}
        </ul>
        {notes.length ? <p class="text-2xs text-muted-foreground" data-roster-import-notes="">{notes.join(" ")}</p> : null}
      </Dialog>
      <Dialog open={error !== null} onOpenChange={() => setError(null)} role="alertdialog" title={L.transferFailedTitle} footer={<Button onClick={() => setError(null)}>{L.close}</Button>}>
        <p class="text-2xs text-destructive" data-roster-import-error="">{error}</p>
      </Dialog>
    </div>
  );
}
