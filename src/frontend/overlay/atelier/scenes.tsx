/**
 * Scene definitions (AM `Oct` 125615 table, `tlt` 128687 editor). Scene definitions are the options of the preset's
 * panel group (`content.panels[0]`, id `panel.group`, chosen locally by description).
 */
import { Button, PlusIcon } from "../ui/index.js";
import { Badge } from "../workspace/parts.js";
import { SearchField } from "../shell/filters.js";
import { ATELIER_HELP, ATELIER_LABELS as L } from "./labels.js";
import { ActiveHeader, ActiveSwitch, CommitText, CountChip, EmptyRow, FieldRow, FormatField, HelpCard, Notice, PromptEditor, ReorderHandle, Row, RowActions, Section, Table, Td, Th } from "./kit.js";
import { addScene, clone, formatOf, moveItem, promptText, renameOption, scenesOf, textMatches, triState, type PresetDocument, type PresetOption } from "./model.js";
import { useAtelier, useAtelierStore } from "./store.js";

const FORMAT_LABEL = { common: L.fields.common, illustration: L.fields.illustration, comic: L.fields.comic, invalid: L.table.checkSettings } as const;

function updateScenes(doc: PresetDocument, fn: (options: PresetOption[]) => PresetOption[]): PresetDocument {
  const next = clone(doc);
  const group = next.content.panels?.[0];
  if (group) group.options = fn(group.options);
  return next;
}

export function ScenesPage() {
  const atelier = useAtelierStore();
  const view = useAtelier((s) => s.view);
  const doc = useAtelier((s) => s.draft?.doc ?? null);
  if (!doc) return null;
  const query = view.query.scenes ?? "";
  const all = scenesOf(doc);
  const rows = all.filter((o) => textMatches(query, o.id, o.description, promptText(o.prompt)));
  const filtered = !!query.trim();
  const group = doc.content.panels?.[0];
  const add = () => {
    let id = "";
    atelier.edit((d) => { const r = addScene(d); id = r.id; return r.doc; });
    atelier.setQuery("scenes", "");
    atelier.openEditor({ type: "scene", id });
  };
  const setEnabled = (ids: string[], on: boolean) => atelier.edit((d) => updateScenes(d, (list) => list.map((o) => {
    if (!ids.includes(o.id)) return o;
    const n = { ...o };
    if (on) delete n.enabled; else n.enabled = false;
    return n;
  })), "auto");
  return (
    <div class="grid min-w-0 gap-3" data-atelier-section="scenes">
      <div class="flex flex-wrap items-center gap-2">
        <SearchField className="min-w-40 flex-1" label={L.scenes.search} placeholder={L.scenes.search} value={query} onChange={(v) => atelier.setQuery("scenes", v)} />
      </div>
      {view.guideOpen ? <HelpCard text={ATELIER_HELP.scenes} /> : null}
      {group?.enabled === false ? <Notice tone="warning">{L.scenes.groupOff}</Notice> : null}
      <Section end={<><CountChip shown={rows.length} total={all.length} /><Button size="sm" variant="subtle" onClick={add}><PlusIcon />{L.scenes.add}</Button></>}>
        <Table label={L.scenes.table} description={L.scenes.tableDescription} head={<>
          <Th className="w-8" />
          <Th className="w-12"><ActiveHeader state={triState(rows.map((o) => o.enabled !== false))} disabled={!rows.length} onChange={(on) => setEnabled(rows.map((o) => o.id), on)} /></Th>
          <Th>{L.expressions.colId}</Th><Th>{L.expressions.colFormat}</Th><Th>{L.fields.description}</Th><Th className="w-28" />
        </>}>
          <tr class="border-b border-border/50" data-atelier-ai-row="scene">
            <td colSpan={6} class="px-3 py-2 text-2xs text-muted-foreground"><strong class="text-foreground">{L.scenes.aiRowTitle}</strong> — {L.scenes.aiRowText}</td>
          </tr>
          {rows.length === 0 ? <EmptyRow colSpan={6} filtered={filtered} hint={L.scenes.empty} onClear={() => atelier.setQuery("scenes", "")} onAdd={add} addLabel={L.scenes.add} /> : null}
          {rows.map((o, index) => (
            <Row key={o.id} rowKey={o.id} data-atelier-reorder-row="" label={o.id || L.scenes.unnamed} inactive={o.enabled === false} onOpen={() => atelier.openEditor({ type: "scene", id: o.id })}>
              <Td><ReorderHandle name={o.id} index={index} count={rows.length} disabled={filtered} onMove={(from, to) => atelier.edit((d) => updateScenes(d, (list) => moveItem(list, from, to)), "auto")} /></Td>
              <Td><ActiveSwitch name={o.id} checked={o.enabled !== false} onChange={(on) => setEnabled([o.id], on)} /></Td>
              <Td className="font-mono font-bold">{o.id || L.scenes.unnamed}</Td>
              <Td><Badge tone={formatOf(o) === "invalid" ? "danger" : "neutral"}>{FORMAT_LABEL[formatOf(o)]}</Badge></Td>
              <Td className="max-w-72 truncate" title={o.description}>{o.description}</Td>
              <Td><RowActions name={o.id} onDelete={() => atelier.edit((d) => updateScenes(d, (list) => list.filter((x) => x.id !== o.id)))} /></Td>
            </Row>
          ))}
        </Table>
      </Section>
    </div>
  );
}

/** Scene editor (AM `tlt`): ID, description, prompt, weight. */
export function SceneEditor({ id }: { id: string }) {
  const atelier = useAtelierStore();
  const doc = useAtelier((s) => s.draft?.doc ?? null);
  if (!doc) return null;
  const group = doc.content.panels?.[0];
  const scene = scenesOf(doc).find((o) => o.id === id);
  if (!group || !scene) return <Notice tone="warning">{L.guidelines.notFound}</Notice>;
  const patch = (fn: (o: PresetOption) => PresetOption) => atelier.edit((d) => updateScenes(d, (list) => list.map((o) => (o.id === id ? fn(o) : o))));
  return (
    <div class="grid gap-3" data-atelier-editor="scene">
      {group.enabled === false ? <Notice tone="warning">{L.scenes.groupOff}</Notice> : null}
      <FieldRow label={L.scenes.id}>
        <CommitText label={L.scenes.id} mono value={scene.id} validate={(v) => !/^[a-z0-9][a-z0-9_-]*$/.test(v.trim()) ? L.fields.interactionChars : v.trim() !== id && scenesOf(doc).some((o) => o.id === v.trim()) ? L.fields.idInUse : null} onInvalid={(bad) => atelier.setIncomplete(`scene:${id}`, bad)} onCommit={(v) => { atelier.edit((d) => renameOption(d, group.id, id, v.trim())); atelier.openEditor({ type: "scene", id: v.trim() }); }} />
      </FieldRow>
      <FieldRow label={L.scenes.description}>
        <CommitText multiline rows={4} label={L.scenes.description} value={scene.description ?? ""} onCommit={(v) => patch((o) => ({ ...o, description: v }))} />
      </FieldRow>
      <FieldRow label={`${L.scenes.prompt} · ${L.scenes.weight}`}>
        <PromptEditor name={L.scenes.prompt} prompt={scene.prompt} onChange={(prompt) => patch((o) => ({ ...o, prompt }))} />
      </FieldRow>
      <FieldRow label={L.fields.format}>
        <FormatField value={scene.formatRestriction} onChange={(v) => patch((o) => { const n = { ...o }; if (v) n.formatRestriction = v; else delete n.formatRestriction; return n; })} />
      </FieldRow>
    </div>
  );
}
