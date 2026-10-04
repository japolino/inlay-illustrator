/** Custom character editor (AM `uct` 103029) and its Command Dock (AM `fct` 103205). */
import { useEffect, useMemo, useState } from "preact/hooks";
import { findDuplicateRecognitionKeys, splitRecognitionKeys, validateCustomCharacterInput } from "../../../shared/contract/character.js";
import { useApp, useAppState } from "../../state/app-state.js";
import { useSelector } from "../../state/store.js";
import { CommandDock, DockLayout, PageHeader } from "../shell/dock.js";
import { Button, CheckIcon, EyeIcon, IconButton, SpinnerIcon, TextArea, TextField, TrashIcon, XIcon, cn } from "../ui/index.js";
import { useSourceUi, useWorkspaceUiStore } from "../workspace-ui.js";
import { EDITOR_LABELS as L } from "./labels.js";

type Draft = { title: string; keys: string; appearance: string };
const EMPTY: Draft = { title: "", keys: "", appearance: "" };

export function CustomCharacterEditor() {
  const app = useApp();
  const ui = useWorkspaceUiStore();
  const characterId = useAppState((s) => s.selectedCharacterId);
  const snapshot = useAppState((s) => s.workspace);
  const { editor } = useSourceUi(characterId);
  const guard = useSelector(ui.guard, (g) => g);
  const entry = editor?.mode === "edit" ? snapshot?.document.customCharacters.find((c) => c.id === editor.customId) : undefined;
  const baseline = useMemo<Draft>(() => (entry ? { title: entry.title, keys: entry.recognitionKeys.join(", "), appearance: entry.appearanceDescription } : EMPTY), [entry?.id, entry?.title, entry?.recognitionKeys.join("|"), entry?.appearanceDescription]);
  const [draft, setDraft] = useState<Draft>(baseline);
  const [errors, setErrors] = useState<Partial<Record<"title" | "recognitionKeys", string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const editorKey = editor ? (editor.mode === "edit" ? editor.customId : "create") : "";
  /** Revision guard: the document revision this client has (a stale snapshot -> `conflict` instead of a lost write). */
  const baseUpdatedAt = () => (snapshot?.document.updatedAt ? { baseUpdatedAt: snapshot.document.updatedAt } : {});
  useEffect(() => {
    setDraft(baseline);
    setErrors({});
    setError(null);
    setConfirmDelete(false);
  }, [editorKey, baseline]);
  const dirty = draft.title !== baseline.title || draft.keys !== baseline.keys || draft.appearance !== baseline.appearance;
  useEffect(() => {
    ui.guard.patch({ dirty: !!editor && dirty });
  }, [dirty, editor]);
  useEffect(() => () => ui.guard.set({ dirty: false, pending: null }), []);

  if (!editor || !characterId) return null;
  const others = (snapshot?.document.customCharacters ?? []).filter((c) => c.id !== entry?.id);
  const shared = findDuplicateRecognitionKeys(others, draft.keys);
  const close = () => {
    ui.guard.set({ dirty: false, pending: null });
    ui.updateSource(characterId, { editor: null });
  };

  async function save(): Promise<boolean> {
    const input = { title: draft.title, recognitionKeys: splitRecognitionKeys(draft.keys), appearanceDescription: draft.appearance };
    const issues = validateCustomCharacterInput(input);
    if (issues.length) {
      setErrors(Object.fromEntries(issues.map((issue) => [issue.field, issue.field === "title" ? L.nameError : L.keysError])));
      return false;
    }
    setErrors({});
    setSaving(true);
    setError(null);
    try {
      if (editor!.mode === "create") {
        await app.mutateWorkspace("customCharacters.create", { characterId: characterId!, input, ...baseUpdatedAt() });
        ui.guard.set({ dirty: false, pending: null });
        ui.updateSource(characterId, { editor: null, navigationView: "characters" });
      } else {
        await app.mutateWorkspace("customCharacters.update", { characterId: characterId!, customId: editor!.customId, input, ...baseUpdatedAt() });
      }
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return false;
    } finally {
      setSaving(false);
    }
  }

  const runPending = () => {
    const action = ui.guard.get().pending;
    ui.guard.set({ dirty: false, pending: null });
    action?.();
  };

  const title = editor.mode === "create" ? L.addCharacter : L.editCharacter(entry?.title ?? "");
  return (
    <div class="relative flex min-h-0 flex-1 flex-col" data-workspace-pane="primary" data-character-editor={editor.mode}>
      <div class="min-h-0 flex-1 overflow-y-auto" data-workspace-scroll="" style={{ paddingBottom: "4.375rem" }}>
        <div class="mx-auto grid w-full max-w-190 content-start gap-4 px-5 py-5 mobile:px-3">
          <PageHeader title={title} />
          {guard.pending ? (
            <section role="alert" class="grid gap-2 rounded-lg bg-warning/12 p-3 text-xs" data-editor-guard="">
              <p class="font-semibold">{L.unsaved(draft.title || entry?.title || "")}</p>
              <div class="flex flex-wrap gap-1.5">
                <Button size="sm" onClick={async () => { if (await save()) runPending(); }}>{L.saveAndOpen}</Button>
                <Button size="sm" variant="subtle" onClick={() => { setDraft(baseline); runPending(); }}>{L.discardAndOpen}</Button>
                <Button size="sm" variant="ghost" onClick={() => ui.guard.patch({ pending: null })}>{L.keepEditing}</Button>
              </div>
            </section>
          ) : null}
          <form id="asset-maid-character-editor-form" onSubmit={(event) => event.preventDefault()}>
            <fieldset disabled={saving} class="grid gap-4 rounded-lg bg-card p-4">
              <label class="grid gap-1.5" for="character-editor-title">
                <span class="text-xs font-bold">{L.name}</span>
                <TextField id="character-editor-title" value={draft.title} placeholder={L.namePlaceholder} onInput={(e) => setDraft({ ...draft, title: (e.currentTarget as HTMLInputElement).value })} aria-invalid={!!errors.title} />
                {errors.title ? <span class="text-2xs text-destructive" role="alert">{errors.title}</span> : null}
              </label>
              <div class="grid gap-1.5">
                <div class="flex items-center justify-between gap-2">
                  <label class="text-xs font-bold" for="character-editor-activation-keys">{L.keys}</label>
                  <Button size="sm" variant={inspecting ? "subtle" : "ghost"} aria-pressed={inspecting} aria-label={inspecting ? "Close asset check" : "Asset check"} onClick={() => setInspecting(!inspecting)} disabled>
                    <EyeIcon />Asset check
                  </Button>
                </div>
                <span class="text-2xs text-muted-foreground">{L.keysHint}</span>
                <TextField id="character-editor-activation-keys" value={draft.keys} placeholder={L.keysPlaceholder} onInput={(e) => setDraft({ ...draft, keys: (e.currentTarget as HTMLInputElement).value })} aria-invalid={!!errors.recognitionKeys} />
                {errors.recognitionKeys ? <span class="text-2xs text-destructive" role="alert">{errors.recognitionKeys}</span> : null}
                {shared.length ? <span class="text-2xs text-warning" role="status">{L.sharedKeys(shared.join(", "))}</span> : null}
              </div>
              <label class="grid gap-1.5" for="character-editor-appearance">
                <span class="text-xs font-bold">{L.appearance}</span>
                <TextArea id="character-editor-appearance" rows={6} value={draft.appearance} placeholder={L.appearancePlaceholder} onInput={(e) => setDraft({ ...draft, appearance: (e.currentTarget as HTMLTextAreaElement).value })} />
              </label>
              {error ? <p role="alert" class="text-xs text-destructive">{error}</p> : null}
            </fieldset>
          </form>
        </div>
      </div>
      <CommandDock>
        <DockLayout
          leading={editor.mode === "edit" ? (confirmDelete ? (
            <>
              <IconButton variant="danger" size="command" label={L.confirmDeleteCharacter} title={L.confirmDelete} disabled={saving} onClick={async () => {
                setSaving(true);
                try {
                  await app.mutateWorkspace("customCharacters.remove", { characterId, customId: editor.customId });
                  close();
                } catch (caught) {
                  setError(caught instanceof Error ? caught.message : String(caught));
                } finally {
                  setSaving(false);
                }
              }}><TrashIcon /></IconButton>
              <IconButton variant="commandAction" size="command" label={L.cancelDeleteCharacter} title={L.cancelDelete} disabled={saving} onClick={() => setConfirmDelete(false)}><XIcon /></IconButton>
            </>
          ) : (
            <IconButton variant="danger" size="command" label={L.deleteCharacter} title={L.delete} disabled={saving} onClick={() => setConfirmDelete(true)}><TrashIcon /></IconButton>
          )) : null}
          controls={(
            <>
              <IconButton variant="commandAction" size="command" disabled={saving}
                label={editor.mode === "create" ? L.cancelAdd : L.cancelChanges} title={editor.mode === "create" ? L.cancelAddShort : L.cancelChangesShort}
                onClick={close}><XIcon /></IconButton>
              <IconButton variant="commandAction" size="command" disabled={saving} className={cn(dirty && "text-primary")}
                label={editor.mode === "create" ? L.save : L.saveChanges} title={saving ? L.saving : L.saveShort}
                onClick={() => void save()}>{saving ? <SpinnerIcon /> : <CheckIcon />}</IconButton>
            </>
          )}
        />
      </CommandDock>
    </div>
  );
}
