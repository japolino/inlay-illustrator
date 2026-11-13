/**
 * Generation guidelines (AM `Ust` 121417 list, `Lst` free-generation kind switch, `Xst` 121667 editor router, `Wst`
 * directing editor + `wbe` restore dialog, `Vst` ratio editor, `Fst` free-generation criteria). Not tied to a preset:
 * every edit goes through the `atelier.instructions.*` RPCs; text fields are drafts saved with the AM field check.
 */
import { useState } from "preact/hooks";
import type { FreeGenerationKind, GuidelineKind, SceneInstruction } from "../../../shared/contract/atelier.js";
import { normalizeCustomImageSizes } from "../../../shared/contract/config.js";
import { useAppState } from "../../state/app-state.js";
import { sizeCandidates } from "../settings/directions.js";
import { Button, Dialog, PlusIcon, TextArea, TextField } from "../ui/index.js";
import { Badge, Checkbox } from "../workspace/parts.js";
import { SearchField } from "../shell/filters.js";
import { ATELIER_HELP, ATELIER_LABELS as L } from "./labels.js";
import { Choice, CountChip, EmptyRow, FieldRow, HelpCard, Notice, Row, RowActions, Section, Table, Td, Th } from "./kit.js";
import { guidelineName, guidelineRows, isBuiltInGuideline, isFixedDefault, presetLibraryOf, restoreDescription, textMatches } from "./model.js";
import { guidelineDraftKey, useAtelier, useAtelierStore, type GuidelineTab } from "./store.js";

export function guidelineKindOf(tab: GuidelineTab, free: FreeGenerationKind): GuidelineKind {
  return tab === "free" ? free : tab;
}
export function kindLabel(kind: GuidelineKind): string {
  return kind === "scene" ? L.guidelines.kindScene : kind === "imageRatio" ? L.guidelines.kindRatio : kind === "character" ? L.guidelines.kindCharacter : L.guidelines.kindOutfit;
}

export function GuidelinesPage() {
  const atelier = useAtelierStore();
  const view = useAtelier((s) => s.view);
  const editor = useAtelier((s) => s.view.editor);
  const state = useAppState((s) => s.atelier);
  const kind = guidelineKindOf(view.guidelineTab, view.freeKind);
  const label = kindLabel(kind);
  if (!state) return null;
  const query = view.query[`guidelines:${kind}`] ?? "";
  const all = guidelineRows(state, kind);
  const rows = all.filter((r) => textMatches(query, r.name, r.text));
  return (
    <div class="grid min-w-0 gap-3" data-atelier-section="guidelines" data-atelier-guideline-kind={kind}>
      <div class="flex flex-wrap items-center gap-2">
        {view.guidelineTab === "free" ? <Choice label={L.guidelines.freeKind} value={view.freeKind} options={[{ value: "character", label: L.guidelines.character }, { value: "outfit", label: L.guidelines.outfit }]} onChange={(freeKind) => atelier.updateView({ freeKind, editor: null })} /> : null}
        {kind === "imageRatio" ? <Badge>{L.guidelines.illustrationOnly}</Badge> : null}
        <SearchField className="min-w-40 flex-1" label={L.guidelines.search(label)} placeholder={L.guidelines.searchPlaceholder} value={query} onChange={(v) => atelier.setQuery(`guidelines:${kind}`, v)} />
      </div>
      {view.guideOpen ? <HelpCard text={ATELIER_HELP.guidelines} /> : null}
      {state.pendingDefaults.length && (kind === "scene" || kind === "imageRatio") ? <Notice tone="warning">{L.recovery.pendingDefaults}</Notice> : null}
      <Section end={<><CountChip shown={rows.length} total={all.length} /><Button size="sm" variant="subtle" onClick={() => void atelier.createGuideline(kind)}><PlusIcon />{L.guidelines.add(label)}</Button></>}>
        <Table label={L.guidelines.table(label)} head={<>
          <Th className="w-20">{L.guidelines.colSelect}</Th><Th>{L.guidelines.colName}</Th>{kind === "scene" ? <Th>{L.guidelines.colFormat}</Th> : null}<Th>{L.guidelines.colText}</Th><Th className="w-28" />
        </>}>
          {rows.length === 0 ? <EmptyRow colSpan={kind === "scene" ? 5 : 4} filtered={!!query.trim()} hint={L.guidelines.empty(label)} onClear={() => atelier.setQuery(`guidelines:${kind}`, "")} onAdd={() => void atelier.createGuideline(kind)} addLabel={L.guidelines.add(label)} /> : null}
          {rows.map((r) => (
            <Row key={r.id} rowKey={r.id} label={r.name} selected={editor?.type === "guideline" && editor.kind === kind && editor.id === r.id} onOpen={() => atelier.openEditor({ type: "guideline", kind, id: r.id })}>
              <Td>
                <label class="inline-flex items-center gap-1.5 text-2xs font-bold">
                  <input type="radio" name={`ii-atelier-${kind}`} checked={r.selected} aria-label={L.guidelines.useForGeneration(label)} onChange={() => void atelier.selectGuideline(kind, r.id)} />
                  {r.selected ? <Badge tone="primary">{L.guidelines.inUse}</Badge> : null}
                </label>
              </Td>
              <Td className="font-bold">{r.name}{r.builtIn ? <> <Badge>{isFixedDefault(kind, r.id) ? L.guidelines.defaultBadge : L.guidelines.providedBadge}</Badge></> : null}</Td>
              {kind === "scene" ? <Td>{r.outputMode === "comic" ? L.fields.comic : L.fields.illustration}</Td> : null}
              <Td className="max-w-80 truncate text-muted-foreground" title={r.text}>{r.text}</Td>
              <Td><RowActions name={r.name} onDuplicate={() => void atelier.createGuideline(kind, r.id)} onDelete={r.builtIn || (kind !== "scene" && kind !== "imageRatio" && r.id === "default") ? undefined : () => void atelier.removeGuideline(kind, r.id)} /></Td>
            </Row>
          ))}
        </Table>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ editors (Xst) */

export function GuidelineEditor({ kind, id }: { kind: GuidelineKind; id: string }) {
  const state = useAppState((s) => s.atelier);
  const documentId = useAtelier((s) => s.documentId);
  if (!state) return null;
  // AM 0.9.91: the guideline view shows the library with the open preset's directing rules (`zc(snapshot, shownId)`).
  const library = presetLibraryOf(state, documentId).library;
  const exists = kind === "scene" || kind === "imageRatio" ? !!library[kind].items[id] : !!state.freeGeneration[kind].items[id];
  if (!exists) return <Notice tone="warning">{L.guidelines.notFound}</Notice>;
  return (
    <div class="grid gap-3" data-atelier-editor="guideline" data-atelier-guideline={`${kind}:${id}`}>
      {state.pendingDefaults.length && (kind === "scene" || kind === "imageRatio") ? <Notice tone="warning">{L.recovery.pendingDefaults}</Notice> : null}
      {kind === "scene" ? <DirectingEditor id={id} /> : kind === "imageRatio" ? <RatioEditor id={id} /> : <FreeEditor kind={kind} id={id} />}
      <GuidelineSaveBar kind={kind} id={id} />
    </div>
  );
}

/** Draft-backed text field of a guideline. */
function DraftText({ kind, id, field, label, multiline, readOnly, placeholder }: { kind: GuidelineKind; id: string; field: string; label: string; multiline?: boolean; readOnly?: boolean; placeholder?: string }) {
  const atelier = useAtelierStore();
  const draft = useAtelier((s) => s.guidelineDrafts[guidelineDraftKey(kind, id, field)]);
  useAppState((s) => s.atelier?.storeRevision);
  const stored = atelier.guidelineValue(kind, id, field);
  const value = draft ? (draft.value ?? "") : (stored ?? "");
  const onInput = (text: string) => atelier.editGuideline(kind, id, field, text);
  return (
    <FieldRow label={label}>
      {multiline ? (
        <TextArea aria-label={label} rows={8} readOnly={readOnly} placeholder={placeholder} value={String(value)} onInput={(e) => onInput((e.currentTarget as HTMLTextAreaElement).value)} />
      ) : (
        <TextField aria-label={label} readOnly={readOnly} value={String(value)} onInput={(e) => onInput((e.currentTarget as HTMLInputElement).value)} />
      )}
    </FieldRow>
  );
}

function GuidelineSaveBar({ kind, id }: { kind: GuidelineKind; id: string }) {
  const atelier = useAtelierStore();
  const dirty = useAtelier((s) => Object.values(s.guidelineDrafts).some((d) => d.kind === kind && d.id === id));
  const error = useAtelier((s) => s.guidelineError);
  const busy = useAtelier((s) => s.busy);
  return (
    <div class="grid gap-2">
      {error ? (
        <Notice tone="warning" actions={error.conflict ? <>
          <Button size="sm" variant="subtle" onClick={() => atelier.rebaseGuidelineDraft(kind, id, true)}>{L.recovery.useLatest}</Button>
          <Button size="sm" variant="ghost" onClick={() => { atelier.rebaseGuidelineDraft(kind, id, false); void atelier.saveGuideline(kind, id); }}>{L.recovery.overwrite}</Button>
        </> : undefined}>
          {error.message}
          {error.conflict ? <pre class="mt-1 max-h-32 overflow-auto whitespace-pre-wrap font-mono text-3xs">{String(error.conflict.actual ?? "")}</pre> : null}
        </Notice>
      ) : null}
      <div class="flex gap-1.5">
        <Button size="sm" disabled={!dirty || busy} onClick={() => void atelier.saveGuideline(kind, id)} data-atelier-guideline-save="">{L.guidelines.save}</Button>
        <Button size="sm" variant="ghost" disabled={!dirty} onClick={() => atelier.dropGuidelineDrafts(kind, id)}>{L.guidelines.discard}</Button>
      </div>
    </div>
  );
}

function DirectingEditor({ id }: { id: string }) {
  const atelier = useAtelierStore();
  const state = useAppState((s) => s.atelier)!;
  const documentId = useAtelier((s) => s.documentId);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const library = presetLibraryOf(state, documentId).library;
  const item = library.scene.items[id] as SceneInstruction;
  const fixed = isFixedDefault("scene", id);
  const builtIn = isBuiltInGuideline("scene", id);
  const mode = item.outputMode ?? "illustration";
  const controls = state.execution.controls;
  return (
    <>
      <DraftText kind="scene" id={id} field="name" label={L.guidelines.name} readOnly={fixed} />
      <FieldRow label={L.fields.format} hint={fixed ? L.guidelines.defaultFormatFixed : undefined}>
        <Choice label={L.fields.format} value={mode} disabled={fixed} options={[{ value: "illustration", label: L.fields.illustration }, { value: "comic", label: L.fields.comic }]} onChange={(m) => void atelier.setOutputMode(id, m)} />
      </FieldRow>
      <DraftText kind="scene" id={id} field="instruction" label={L.guidelines.text} multiline />
      {library.scene.selected === id && (mode === "comic" || id === "system-pov") ? (
        <Section title={L.guidelines.executionTitle}>
          {mode === "comic" ? (
            <FieldRow label={L.guidelines.comicFrame}>
              <Choice label={L.guidelines.comicFrame} value={String(controls["comic.frame"] ?? 0)} options={[{ value: "0", label: L.guidelines.frameNone }, { value: "1", label: L.guidelines.frameThin }, { value: "2", label: L.guidelines.frameBold }]} onChange={(v) => void atelier.setExecution({ controls: { ...controls, "comic.frame": Number(v) as 0 | 1 | 2 } })} />
            </FieldRow>
          ) : null}
          {id === "system-pov" ? (
            <label class="inline-flex items-center gap-2 text-2xs font-bold"><Checkbox checked={controls["pov.hands"] !== false} label={L.guidelines.povHands} onCheckedChange={(on) => void atelier.setExecution({ controls: { ...controls, "pov.hands": on } })} />{L.guidelines.povHands}</label>
          ) : null}
        </Section>
      ) : null}
      <div class="flex flex-wrap gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => atelier.updateView({ mode: "preset", section: "rules", rulesScope: "directing", rulesDirection: id, editor: null })}>{L.guidelines.relatedRules}</Button>
        {builtIn ? <Button size="sm" variant="ghost" onClick={() => setRestoreOpen(true)}>{L.guidelines.restore}</Button> : <Button size="sm" variant="danger" onClick={() => setDeleteOpen(true)}>{L.guidelines.delete}</Button>}
      </div>
      <Dialog open={restoreOpen} onOpenChange={setRestoreOpen} title={L.guidelines.restoreTitle} description={restoreDescription(id)} footer={<>
        <Button variant="ghost" onClick={() => setRestoreOpen(false)}>{L.save.cancel}</Button>
        <Button onClick={async () => { setRestoreOpen(false); await atelier.restoreGuideline(id); }}>{L.guidelines.restore}</Button>
      </>} />
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen} title={L.guidelines.delete} description={L.guidelines.deleteDescription} role="alertdialog" footer={<>
        <Button variant="ghost" onClick={() => setDeleteOpen(false)}>{L.save.cancel}</Button>
        <Button variant="danger" onClick={async () => { setDeleteOpen(false); await atelier.removeGuideline("scene", id); }}>{L.guidelines.delete}</Button>
      </>} />
    </>
  );
}

function RatioEditor({ id }: { id: string }) {
  const atelier = useAtelierStore();
  const state = useAppState((s) => s.atelier)!;
  const customImageSizes = useAppState((s) => s.config?.runtime.customImageSizes ?? []);
  const documentId = useAtelier((s) => s.documentId);
  const [error, setError] = useState<string | null>(null);
  const item = presetLibraryOf(state, documentId).library.imageRatio.items[id]!;
  const fixed = id === "default";
  const carried = normalizeCustomImageSizes(item.customSizes ?? []);
  const candidates = sizeCandidates([...customImageSizes, ...carried.filter((c) => !customImageSizes.some((x) => x.id === c.id))]);
  const allowed = item.allowedSizeIds;
  const toggle = (sizeId: number, on: boolean) => {
    const next = on ? [...allowed, sizeId] : allowed.filter((x) => x !== sizeId);
    if (!next.length) { setError(L.guidelines.sizeRequired); return; }
    setError(null);
    const customSizes = candidates.filter((c) => c.custom && next.includes(c.id)).map(({ id: cid, width, height }) => ({ id: cid, width, height }));
    void atelier.setSizes(id, next, customSizes);
  };
  return (
    <>
      <DraftText kind="imageRatio" id={id} field="name" label={L.guidelines.ratioName} readOnly={fixed} />
      <FieldRow label={L.guidelines.allowedSizes} error={error}>
        <div class="flex flex-wrap gap-1.5" role="group" aria-label={L.guidelines.allowedSizes}>
          {candidates.map((c) => (
            <label key={c.id} class="inline-flex h-7.5 items-center gap-2 rounded-md bg-surface-control px-2.5 font-mono text-2xs">
              <Checkbox checked={allowed.includes(c.id)} disabled={fixed} label={`${c.width}×${c.height}`} onCheckedChange={(on) => toggle(c.id, on)} />
              {c.width}×{c.height}{c.custom ? ` (${L.guidelines.custom})` : ""}
            </label>
          ))}
        </div>
      </FieldRow>
      <DraftText kind="imageRatio" id={id} field="instruction" label={L.guidelines.text} multiline readOnly={fixed} />
      {!fixed ? <div><Button size="sm" variant="danger" onClick={() => void atelier.removeGuideline("imageRatio", id)}>{L.guidelines.delete}</Button></div> : null}
    </>
  );
}

function FreeEditor({ kind, id }: { kind: FreeGenerationKind; id: string }) {
  const atelier = useAtelierStore();
  const state = useAppState((s) => s.atelier)!;
  const builtIn = state.freeGeneration[kind].items.default;
  const fixed = id === "default";
  const criteria = kind === "character" ? L.guidelines.characterCriteria : L.guidelines.outfitCriteria;
  const design = kind === "character" ? L.guidelines.characterDesign : L.guidelines.outfitDesign;
  const outfit = state.freeGeneration.outfit;
  const outfitName = guidelineName("outfit", outfit.selected, outfit.items[outfit.selected]?.name ?? "");
  const restore = (field: "instruction" | "designInstruction") => atelier.editGuideline(kind, id, field, null);
  return (
    <>
      <DraftText kind={kind} id={id} field="name" label={L.guidelines.freeName(kindLabel(kind))} readOnly={fixed} />
      <DraftText kind={kind} id={id} field="instruction" label={criteria} multiline readOnly={fixed} placeholder={builtIn?.instruction} />
      {!fixed ? <div><Button size="sm" variant="ghost" onClick={() => restore("instruction")}>{L.guidelines.restoreField(criteria)}</Button></div> : null}
      <DraftText kind={kind} id={id} field="designInstruction" label={design} multiline readOnly={fixed} placeholder={builtIn?.designInstruction} />
      {!fixed ? <div><Button size="sm" variant="ghost" onClick={() => restore("designInstruction")}>{L.guidelines.restoreField(design)}</Button></div> : null}
      <p class="text-3xs text-muted-foreground">{kind === "character" ? L.guidelines.firstOutfitNote(outfitName) : L.guidelines.outfitNote}</p>
      {!fixed ? <div><Button size="sm" variant="danger" onClick={() => void atelier.removeGuideline(kind, id)}>{L.guidelines.delete}</Button></div> : null}
    </>
  );
}
