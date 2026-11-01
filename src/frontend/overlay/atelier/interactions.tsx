/**
 * Interactions (AM `Kbe` 125240 tabs, `Pct` 125291 categories, `alt` 129090 list, `nlt` 128752 editor): categories ->
 * interactions -> editor (direction A → B, output target, prompts, linked shared sub-groups). The sub-group tab lists the
 * shared detail tag groups (AM renders them with the tag-group table in details mode).
 */
import { useState } from "preact/hooks";
import { Button, PlusIcon, Select } from "../ui/index.js";
import { Badge } from "../workspace/parts.js";
import { SearchField } from "../shell/filters.js";
import { ATELIER_HELP, ATELIER_LABELS as L } from "./labels.js";
import { ActiveHeader, ActiveSwitch, Choice, CommitText, CountChip, EmptyRow, FieldRow, HelpCard, Notice, PromptEditor, ReorderHandle, Row, RowActions, Section, Table, Td, Th } from "./kit.js";
import {
  categoriesOf,
  clone,
  deleteCategory,
  deleteGroup,
  deleteInteraction,
  detailGroupsOf,
  interactionMode,
  moveItem,
  newGroup,
  newInteraction,
  promptText,
  renameCategory,
  renameInteraction,
  rulesReferencing,
  setInteractionMode,
  textMatches,
  triState,
  uniqueId,
  validateCategory,
  validateInteractionId,
  type PresetDocument,
  type PresetInteraction
} from "./model.js";
import { useAtelier, useAtelierStore } from "./store.js";

const UNCATEGORIZED = "";
const MODE_LABEL = { mutual: L.interactions.mutual, directed: L.interactions.directed, both: L.interactions.mixed } as const;

function updateInteraction(doc: PresetDocument, id: string, fn: (i: PresetInteraction) => PresetInteraction): PresetDocument {
  const next = clone(doc);
  next.content.interactions = (next.content.interactions ?? []).map((i) => (i.id === id ? fn(i) : i));
  return next;
}
const setEnabledOf = (ids: string[], on: boolean) => (d: PresetDocument): PresetDocument => {
  const next = clone(d);
  for (const i of next.content.interactions ?? []) if (ids.includes(i.id)) { if (on) delete i.enabled; else i.enabled = false; }
  return next;
};

export function InteractionsPage() {
  const atelier = useAtelierStore();
  const view = useAtelier((s) => s.view);
  const doc = useAtelier((s) => s.draft?.doc ?? null);
  if (!doc) return null;
  const query = view.query.interactions ?? "";
  return (
    <div class="grid min-w-0 gap-3" data-atelier-section="interactions">
      <div class="flex flex-wrap items-center gap-2">
        <Choice label={L.interactions.tabs} value={view.interactionTab} options={[{ value: "basics", label: L.interactions.basics }, { value: "subGroups", label: L.interactions.subGroups }]} onChange={(interactionTab) => atelier.updateView({ interactionTab, editor: null })} />
        <SearchField className="min-w-40 flex-1" label={L.interactions.search} placeholder={L.interactions.searchPlaceholder} value={query} onChange={(v) => atelier.setQuery("interactions", v)} />
      </div>
      {view.guideOpen ? <HelpCard text={ATELIER_HELP.interactions} /> : null}
      {view.interactionTab === "subGroups" ? <SubGroupTable doc={doc} query={query} /> : view.category !== null && !query.trim() ? <InteractionList doc={doc} category={view.category} /> : <CategoryList doc={doc} query={query} />}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ categories (Pct) */

function CategoryList({ doc, query }: { doc: PresetDocument; query: string }) {
  const atelier = useAtelierStore();
  const interactions = doc.content.interactions ?? [];
  const categories = categoriesOf(doc);
  const hasUncategorized = interactions.some((i) => !i.category);
  const all = [...categories, ...(hasUncategorized ? [UNCATEGORIZED] : [])];
  const itemsOf = (c: string) => interactions.filter((i) => (i.category ?? UNCATEGORIZED) === c);
  const filtered = !!query.trim();
  const matches = filtered ? interactions.filter((i) => textMatches(query, i.id, i.category, i.description, promptText(i.prompt?.tag), ...(i.detailGroups ?? []))) : [];
  const add = () => {
    const category = uniqueId("category", categories);
    atelier.edit((d) => ({ ...d, content: { ...d.content, interactionCategories: [...(d.content.interactionCategories ?? []), category] } }));
    atelier.openEditor({ type: "category", category });
  };
  if (filtered) {
    return (
      <Table label={L.interactions.categoryList} head={<><Th>{L.expressions.colId}</Th><Th>{L.interactions.colCategory}</Th><Th>{L.interactions.colDirection}</Th></>}>
        {matches.length === 0 ? <EmptyRow colSpan={3} filtered hint="" onClear={() => atelier.setQuery("interactions", "")} /> : null}
        {matches.map((i) => (
          <Row key={i.id} label={i.id} onOpen={() => atelier.openEditor({ type: "interaction", id: i.id })}>
            <Td className="font-mono font-bold">{i.id}</Td><Td>{i.category || L.interactions.uncategorized}</Td><Td>{MODE_LABEL[interactionMode(i)]}</Td>
          </Row>
        ))}
      </Table>
    );
  }
  return (
    <Section end={<><CountChip shown={all.length} total={all.length} /><Button size="sm" variant="subtle" onClick={add}><PlusIcon />{L.interactions.addCategory}</Button></>}>
      <Table label={L.interactions.categoryList} head={<><Th className="w-12">{L.table.active}</Th><Th>{L.interactions.colCategory}</Th><Th>{L.interactions.colItems}</Th><Th className="w-40" /></>}>
        <tr class="border-b border-border/50" data-atelier-ai-row="interaction">
          <td colSpan={4} class="px-3 py-2 text-2xs text-muted-foreground"><strong class="text-foreground">{L.interactions.aiRowTitle}</strong> — {L.interactions.aiRowText}</td>
        </tr>
        {all.length === 0 ? <EmptyRow colSpan={4} filtered={false} hint={L.interactions.emptyCategories} onAdd={add} addLabel={L.interactions.addCategory} /> : null}
        {all.map((c) => {
          const items = itemsOf(c);
          const name = c || L.interactions.uncategorized;
          return (
            <Row key={c || "-"} rowKey={c} label={L.interactions.listOf(name)} onOpen={() => atelier.updateView({ category: c, editor: c ? { type: "category", category: c } : null })}>
              <Td><ActiveHeader state={triState(items.map((i) => i.enabled !== false))} disabled={!items.length} onChange={(on) => atelier.edit(setEnabledOf(items.map((i) => i.id), on), "auto")} /></Td>
              <Td className="font-mono font-bold">{name}</Td>
              <Td>{items.length}</Td>
              <Td>{c ? <RowActions name={name} onDelete={() => atelier.edit((d) => deleteCategory(d, c))} /> : null}</Td>
            </Row>
          );
        })}
      </Table>
    </Section>
  );
}

/** Category editor (rename / delete notes). */
export function CategoryEditor({ category }: { category: string }) {
  const atelier = useAtelierStore();
  const doc = useAtelier((s) => s.draft?.doc ?? null);
  if (!doc) return null;
  const items = (doc.content.interactions ?? []).filter((i) => i.category === category);
  const rules = items.reduce((n, i) => n + rulesReferencing(doc, { interaction: i.id }), 0);
  return (
    <div class="grid gap-3" data-atelier-editor="category">
      <FieldRow label={L.interactions.categoryName}>
        <CommitText label={L.interactions.categoryName} mono value={category} validate={(v) => validateCategory(v, categoriesOf(doc), category)} onInvalid={(bad) => atelier.setIncomplete(`category:${category}`, bad)} onCommit={(v) => {
          atelier.edit((d) => renameCategory(d, category, v.trim()));
          atelier.updateView({ category: v.trim(), editor: { type: "category", category: v.trim() } });
        }} />
      </FieldRow>
      <Notice tone="warning">{L.interactions.deleteWithItems(items.length)} {L.interactions.deleteWithRules(rules)}</Notice>
      <div><RowActions name={category} onDelete={() => { atelier.edit((d) => deleteCategory(d, category)); atelier.updateView({ category: null, editor: null }); }} /></div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ list (alt) */

function InteractionList({ doc, category }: { doc: PresetDocument; category: string }) {
  const atelier = useAtelierStore();
  const editor = useAtelier((s) => s.view.editor);
  const all = doc.content.interactions ?? [];
  const rows = all.filter((i) => (i.category ?? UNCATEGORIZED) === category);
  const name = category || L.interactions.uncategorized;
  const add = () => {
    const item = newInteraction(doc, category || undefined);
    atelier.edit((d) => ({ ...d, content: { ...d.content, interactions: [...(d.content.interactions ?? []), item] } }));
    atelier.openEditor({ type: "interaction", id: item.id });
  };
  return (
    <Section title={L.interactions.listOf(name)} end={<><Button size="sm" variant="ghost" onClick={() => atelier.updateView({ category: null, editor: null })}>{L.interactions.backToList}</Button><Button size="sm" variant="subtle" onClick={add}><PlusIcon />{L.interactions.addInteraction}</Button></>}>
      <Table label={L.interactions.listOf(name)} head={<>
        <Th className="w-8" />
        <Th className="w-12"><ActiveHeader state={triState(rows.map((i) => i.enabled !== false))} disabled={!rows.length} onChange={(on) => atelier.edit(setEnabledOf(rows.map((i) => i.id), on), "auto")} /></Th>
        <Th>{L.expressions.colId}</Th><Th>{L.interactions.colDirection}</Th><Th>{L.interactions.colSubGroups}</Th><Th>{L.fields.prompt}</Th><Th className="w-28" />
      </>}>
        {rows.length === 0 ? <EmptyRow colSpan={7} filtered={false} hint={L.interactions.emptyInteractions} onAdd={add} addLabel={L.interactions.addInteraction} /> : null}
        {rows.map((i, index) => (
          <Row key={i.id} rowKey={i.id} data-atelier-reorder-row="" label={i.id} inactive={i.enabled === false} selected={editor?.type === "interaction" && editor.id === i.id} onOpen={() => atelier.openEditor({ type: "interaction", id: i.id })}>
            <Td><ReorderHandle name={i.id} index={index} count={rows.length} onMove={(from, to) => atelier.edit((d) => {
              const next = clone(d);
              const list = next.content.interactions ?? [];
              const subset = list.filter((x) => (x.category ?? UNCATEGORIZED) === category);
              const moved = moveItem(subset, from, to);
              let k = 0;
              next.content.interactions = list.map((x) => (subset.includes(x) ? moved[k++]! : x));
              return next;
            }, "auto")} /></Td>
            <Td><ActiveSwitch name={i.id} checked={i.enabled !== false} onChange={(on) => atelier.edit(setEnabledOf([i.id], on), "auto")} /></Td>
            <Td className="font-mono font-bold">{i.id || L.interactions.unnamed}</Td>
            <Td>{MODE_LABEL[interactionMode(i)]}</Td>
            <Td>{i.detailGroups?.length ? L.interactions.subGroupCount(i.detailGroups.length) : L.interactions.none}</Td>
            <Td className="max-w-48 truncate">{promptText(i.prompt?.tag)}</Td>
            <Td><RowActions name={i.id} onDuplicate={() => atelier.edit((d) => {
              const next = clone(d);
              const list = next.content.interactions ?? [];
              const at = list.findIndex((x) => x.id === i.id);
              list.splice(at + 1, 0, { ...clone(i), id: uniqueId(`${i.id}_copy`, list.map((x) => x.id)) });
              return next;
            })} onDelete={() => { atelier.edit((d) => deleteInteraction(d, i.id)); if (editor?.type === "interaction" && editor.id === i.id) atelier.closeEditor(); }} /></Td>
          </Row>
        ))}
      </Table>
      <p class="text-3xs text-muted-foreground">{L.interactions.aiMayCreate}</p>
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------------ editor (nlt) */

export function InteractionEditor({ id }: { id: string }) {
  const atelier = useAtelierStore();
  const doc = useAtelier((s) => s.draft?.doc ?? null);
  const [pick, setPick] = useState<string | null>(null);
  if (!doc) return null;
  const item = (doc.content.interactions ?? []).find((i) => i.id === id);
  if (!item) return <Notice tone="warning">{L.guidelines.notFound}</Notice>;
  const used = (doc.content.interactions ?? []).map((i) => i.id);
  const patch = (fn: (i: PresetInteraction) => PresetInteraction, mode: "auto" | "draft" = "draft") => atelier.edit((d) => updateInteraction(d, id, fn), mode);
  const mode = interactionMode(item);
  const categories = categoriesOf(doc);
  const detailGroups = detailGroupsOf(doc);
  const linked = item.detailGroups ?? [];
  const unlinked = detailGroups.filter((g) => !linked.includes(g.id));
  const destination = item.destination ?? "relation";
  const destinationOptions: Array<{ value: string; label: string }> = [
    { value: "relation", label: L.interactions.relation },
    { value: "source", label: L.interactions.source },
    { value: "target", label: L.interactions.targetSide },
    { value: "female", label: L.scopes.female },
    { value: "male", label: L.scopes.male }
  ];
  if (!destinationOptions.some((o) => o.value === destination)) destinationOptions.push({ value: destination, label: L.interactions.legacyValue(destination) });
  return (
    <div class="grid gap-3" data-atelier-editor="interaction">
      <FieldRow label={L.interactions.id}>
        <div class="flex items-center gap-1.5">
          <Select aria-label={L.interactions.colCategory} className="w-40" value={item.category ?? ""} options={[{ value: "", label: L.interactions.uncategorized }, ...categories.map((c) => ({ value: c, label: c }))]} onValueChange={(c) => patch((i) => { const n = { ...i }; if (c) n.category = c; else delete n.category; return n; })} />
          <span class="text-muted-foreground">.</span>
          <CommitText className="flex-1" label={L.interactions.id} mono value={item.id} validate={(v) => validateInteractionId(v, used, item.id)} onInvalid={(bad) => atelier.setIncomplete(`interaction:${id}`, bad)} onCommit={(v) => { atelier.edit((d) => renameInteraction(d, id, v.trim())); atelier.openEditor({ type: "interaction", id: v.trim() }); }} />
        </div>
      </FieldRow>
      <FieldRow label={L.interactions.direction}>
        <Choice label={L.interactions.direction} value={mode === "directed" ? "directed" : "mutual"} options={[{ value: "mutual", label: L.interactions.directionMutual }, { value: "directed", label: L.interactions.directionDirected }]} onChange={(m) => patch((i) => setInteractionMode(i, m), "auto")} />
        {mode === "both" ? <span class="text-3xs text-muted-foreground">{L.interactions.legacyValue(L.interactions.mixed)}</span> : null}
      </FieldRow>
      <FieldRow label={L.interactions.target}>
        {mode === "mutual" ? <span class="text-xs text-foreground" data-atelier-target="both">{L.interactions.both}</span> : (
          <Select aria-label={L.interactions.target} className="w-48" value={destination} options={destinationOptions} onValueChange={(v) => patch((i) => ({ ...i, destination: v }), "auto")} />
        )}
      </FieldRow>
      <FieldRow label={L.fields.description}>
        <CommitText multiline rows={2} label={`${item.id} ${L.fields.description}`} value={item.description ?? ""} onCommit={(v) => patch((i) => { const n = { ...i }; if (v) n.description = v; else delete n.description; return n; })} />
      </FieldRow>
      <Section title={L.interactions.promptTable}>
        <PromptEditor name={item.id} prompt={item.prompt?.tag} onChange={(tag) => patch((i) => ({ ...i, prompt: { ...i.prompt, tag } }))} />
      </Section>
      <Section title={L.interactions.linked} description={L.interactions.sharedNote}>
        {linked.length === 0 ? <p class="text-2xs text-muted-foreground">{L.interactions.emptyLinks}</p> : null}
        {linked.map((gid) => {
          const group = detailGroups.find((g) => g.id === gid);
          return (
            <div key={gid} class="flex flex-wrap items-center gap-2 rounded-md bg-surface-control px-2 py-1.5 text-2xs">
              <Button size="sm" variant="ghost" className="font-mono" onClick={() => atelier.openEditor({ type: "group", id: gid, detail: true, tab: "options", fromInteraction: id })}>{gid}</Button>
              {group ? <Badge>{group.options.length}</Badge> : <Badge tone="danger">{L.rules.missingGroup(gid)}</Badge>}
              {group ? <ActiveSwitch name={L.interactions.linked + " " + gid} checked={group.enabled !== false} onChange={(on) => atelier.edit((d) => {
                const next = clone(d);
                for (const g of next.content.definitions ?? []) if (g.id === gid) { if (on) delete g.enabled; else g.enabled = false; }
                return next;
              }, "auto")} /> : null}
              <span class="flex-1" />
              <Button size="sm" variant="ghost" onClick={() => patch((i) => { const n = { ...i, detailGroups: (i.detailGroups ?? []).filter((g) => g !== gid) }; if (!n.detailGroups.length) delete (n as Partial<PresetInteraction>).detailGroups; return n; })}>{L.interactions.unlink}</Button>
            </div>
          );
        })}
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-2xs font-bold text-muted-foreground">{L.interactions.linkGroups}</span>
          {unlinked.length ? (
            <Select aria-label={L.interactions.pickExisting} className="w-48" value={pick} placeholder={L.interactions.pickExisting} options={unlinked.map((g) => ({ value: g.id, label: g.id }))} onValueChange={(gid) => { setPick(null); patch((i) => ({ ...i, detailGroups: [...(i.detailGroups ?? []), gid] })); }} />
          ) : null}
          <Button size="sm" variant="subtle" onClick={() => {
            const group = newGroup(doc, atelier.system().ids, true);
            atelier.edit((d) => {
              const next = clone(d);
              next.content.definitions = [...(next.content.definitions ?? []), group];
              return updateInteraction(next, id, (i) => ({ ...i, detailGroups: [...(i.detailGroups ?? []), group.id] }));
            });
            atelier.openEditor({ type: "group", id: group.id, detail: true, tab: "options", fromInteraction: id });
          }}><PlusIcon />{L.interactions.createGroup}</Button>
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ sub-groups */

function SubGroupTable({ doc, query }: { doc: PresetDocument; query: string }) {
  const atelier = useAtelierStore();
  const all = detailGroupsOf(doc);
  const rows = all.filter((g) => textMatches(query, g.id, ...g.options.map((o) => o.id)));
  const linkCount = (gid: string) => (doc.content.interactions ?? []).filter((i) => i.detailGroups?.includes(gid)).length;
  const add = () => {
    const group = newGroup(doc, atelier.system().ids, true);
    atelier.edit((d) => ({ ...d, content: { ...d.content, definitions: [...(d.content.definitions ?? []), group] } }));
    atelier.openEditor({ type: "group", id: group.id, detail: true, tab: "options" });
  };
  return (
    <Section end={<><CountChip shown={rows.length} total={all.length} /><Button size="sm" variant="subtle" onClick={add}><PlusIcon />{L.expressions.addGroup}</Button></>}>
      <Table label={L.interactions.subGroups} head={<><Th className="w-12">{L.table.active}</Th><Th>{L.expressions.colId}</Th><Th>{L.expressions.colOptions}</Th><Th>{L.expressions.colLinks}</Th><Th className="w-28" /></>}>
        {rows.length === 0 ? <EmptyRow colSpan={5} filtered={!!query.trim()} hint={L.expressions.addGroupHint} onClear={() => atelier.setQuery("interactions", "")} onAdd={add} addLabel={L.expressions.addGroup} /> : null}
        {rows.map((g) => (
          <Row key={g.id} rowKey={g.id} label={L.expressions.editGroup(g.id)} inactive={g.enabled === false} onOpen={() => atelier.openEditor({ type: "group", id: g.id, detail: true, tab: "options" })}>
            <Td><ActiveSwitch name={g.id} checked={g.enabled !== false} onChange={(on) => atelier.edit((d) => {
              const next = clone(d);
              for (const x of next.content.definitions ?? []) if (x.id === g.id) { if (on) delete x.enabled; else x.enabled = false; }
              return next;
            }, "auto")} /></Td>
            <Td className="font-mono font-bold">{g.id}</Td>
            <Td>{g.options.length}</Td>
            <Td>{linkCount(g.id) ? L.tagGroup.links(linkCount(g.id)) : L.expressions.unlinked}</Td>
            <Td><RowActions name={g.id} onDelete={() => atelier.edit((d) => deleteGroup(d, g.id))} /></Td>
          </Row>
        ))}
      </Table>
    </Section>
  );
}
