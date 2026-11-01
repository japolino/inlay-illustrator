/**
 * Expression elements (AM `Ect` 125790): scope switch preset / system (`Act`), kind switch tag groups / free tags /
 * natural language (`Rst`), tag-group table (`Cct`), tag-group editor (`elt` 128074 with group settings `Jct`, option
 * detail), channel table (`Mst`) and channel editor (`Dst` 120317).
 */
import { useState } from "preact/hooks";
import { Button, PlusIcon, TextField, cn } from "../ui/index.js";
import { Badge, Checkbox } from "../workspace/parts.js";
import { SearchField } from "../shell/filters.js";
import { ATELIER_HELP, ATELIER_LABELS as L } from "./labels.js";
import {
  ActiveHeader,
  ActiveSwitch,
  AttributeTable,
  Choice,
  CommitText,
  CountChip,
  EmptyRow,
  FieldRow,
  FormatField,
  HelpCard,
  Notice,
  PromptEditor,
  ReorderHandle,
  Row,
  RowActions,
  ScopePicker,
  Section,
  Table,
  Td,
  Th
} from "./kit.js";
import {
  clone,
  deleteChannel,
  deleteGroup,
  duplicateGroup,
  formatOf,
  groupsOf,
  moveItem,
  newChannel,
  newGroup,
  promptText,
  renameChannel,
  renameGroup,
  renameOption,
  scopesOf,
  scopeValue,
  setSystemGroupEnabled,
  SYSTEM_CHANNELS,
  textMatches,
  triState,
  uniqueId,
  validateChannelId,
  validateGroupId,
  type PresetChannel,
  type PresetDocument,
  type PresetGroup,
  type PresetOption,
  type Scope
} from "./model.js";
import { useAtelier, useAtelierStore } from "./store.js";

const FORMAT_LABEL = { common: L.fields.common, illustration: L.fields.illustration, comic: L.fields.comic, invalid: L.table.checkSettings } as const;
const scopeText = (scopes: readonly Scope[]) => scopes.map((s) => L.scopes[s] ?? s).join(", ") || L.table.notSet;

/** Edits one definition (by id) of the draft. */
export function updateGroup(doc: PresetDocument, id: string, fn: (group: PresetGroup) => PresetGroup): PresetDocument {
  const next = clone(doc);
  next.content.definitions = (next.content.definitions ?? []).map((g) => (g.id === id ? fn(g) : g));
  return next;
}
function updateChannel(doc: PresetDocument, id: string, fn: (channel: PresetChannel) => PresetChannel): PresetDocument {
  const next = clone(doc);
  next.content.channels = (next.content.channels ?? []).map((c) => (c.id === id ? fn(c) : c));
  return next;
}
/** Moves one row of a filtered sub-list inside the full definitions array. */
function moveWithin<T>(all: readonly T[], subset: readonly T[], from: number, to: number): T[] {
  const moved = moveItem(subset, from, to);
  let i = 0;
  return all.map((item) => (subset.includes(item) ? moved[i++]! : item));
}

/* ------------------------------------------------------------------------------------------------ page */

export function ExpressionsPage() {
  const atelier = useAtelierStore();
  const view = useAtelier((s) => s.view);
  const doc = useAtelier((s) => s.draft?.doc ?? null);
  const query = view.query.expressions ?? "";
  if (!doc) return null;
  return (
    <div class="grid min-w-0 gap-3" data-atelier-section="expressions">
      <div class="flex flex-wrap items-center gap-2">
        <Choice label={L.expressions.scope} value={view.scope} options={[{ value: "preset", label: L.expressions.scopePreset }, { value: "system", label: L.expressions.scopeSystem }]} onChange={(scope) => atelier.updateView({ scope, editor: null })} />
        <Choice label={L.expressions.kind} value={view.expressionKind} options={[{ value: "groups", label: L.expressions.tagGroups }, { value: "free", label: L.expressions.freeTags }, { value: "text", label: L.expressions.naturalLanguage }]} onChange={(expressionKind) => atelier.updateView({ expressionKind, editor: null })} />
        <SearchField className="min-w-40 flex-1" label={L.expressions.search} placeholder={L.expressions.searchPlaceholder} value={query} onChange={(v) => atelier.setQuery("expressions", v)} />
      </div>
      {view.guideOpen ? <HelpCard text={ATELIER_HELP.expressions} /> : null}
      {view.scope === "system" ? <Notice>{L.expressions.systemNote}</Notice> : null}
      {view.expressionKind === "groups"
        ? view.scope === "system" ? <SystemGroupTable doc={doc} query={query} /> : <GroupTable doc={doc} query={query} />
        : <ChannelTable doc={doc} query={query} kind={view.expressionKind} system={view.scope === "system"} />}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ tag group table (Cct) */

function GroupTable({ doc, query }: { doc: PresetDocument; query: string }) {
  const atelier = useAtelierStore();
  const editor = useAtelier((s) => s.view.editor);
  const all = groupsOf(doc);
  const rows = all.filter((g) => textMatches(query, g.id, g.description, ...g.options.map((o) => o.id), ...g.options.map((o) => promptText(o.prompt))));
  const filtered = !!query.trim();
  const linked = (id: string) => (doc.content.interactions ?? []).filter((i) => i.detailGroups?.includes(id)).length;
  const add = () => {
    const group = newGroup(doc, atelier.system().ids);
    atelier.edit((d) => ({ ...d, content: { ...d.content, definitions: [...(d.content.definitions ?? []), group] } }));
    atelier.setQuery("expressions", "");
    atelier.openEditor({ type: "group", id: group.id, tab: "options" });
  };
  const setEnabled = (ids: string[], on: boolean) => atelier.edit((d) => {
    const next = clone(d);
    for (const g of next.content.definitions ?? []) if (ids.includes(g.id)) { if (on) delete g.enabled; else g.enabled = false; }
    return next;
  }, "auto");
  return (
    <Section end={<><CountChip shown={rows.length} total={all.length} /><Button size="sm" variant="subtle" onClick={add}><PlusIcon />{L.expressions.addGroup}</Button></>}>
      <Table label={L.expressions.tagGroups} head={<>
        <Th className="w-8"><span class="sr-only">{L.table.reorder("")}</span></Th>
        <Th className="w-12"><ActiveHeader state={triState(rows.map((g) => g.enabled !== false))} disabled={!rows.length} onChange={(on) => setEnabled(rows.map((g) => g.id), on)} /></Th>
        <Th>{L.expressions.colId}</Th>
        <Th>{L.expressions.colOptions}</Th>
        <Th>{L.expressions.colScope}</Th>
        <Th>{L.expressions.colContinuity}</Th>
        <Th>{L.expressions.colFormat}</Th>
        <Th>{L.expressions.colLinks}</Th>
        <Th className="w-28"><span class="sr-only">{L.table.delete}</span></Th>
      </>}>
        {rows.length === 0 ? <EmptyRow colSpan={9} filtered={filtered} hint={filtered ? L.expressions.emptyGroups : L.expressions.addGroupHint} onClear={() => atelier.setQuery("expressions", "")} onAdd={add} addLabel={L.expressions.addGroup} /> : null}
        {rows.map((g, index) => {
          const links = linked(g.id);
          return (
            <Row key={g.id} rowKey={g.id} data-atelier-reorder-row="" label={L.expressions.editGroup(g.id)} inactive={g.enabled === false} selected={editor?.type === "group" && editor.id === g.id} onOpen={() => atelier.openEditor({ type: "group", id: g.id, tab: "options" })}>
              <Td><ReorderHandle name={g.id} index={index} count={rows.length} disabled={filtered} onMove={(from, to) => atelier.edit((d) => {
                const next = clone(d);
                const defs = next.content.definitions ?? [];
                const subset = defs.filter((x) => x.usage !== "interaction_detail");
                next.content.definitions = moveWithin(defs, subset, from, to);
                return next;
              }, "auto")} /></Td>
              <Td><ActiveSwitch name={g.id} checked={g.enabled !== false} onChange={(on) => setEnabled([g.id], on)} /></Td>
              <Td className="font-mono font-bold">{g.id || L.expressions.unnamedGroup}</Td>
              <Td>{g.options.length}</Td>
              <Td>{scopeText(scopesOf(g))}</Td>
              <Td>{g.continuity ? L.expressions.usesPrevious : L.expressions.noPrevious}</Td>
              <Td><Badge tone={formatOf(g) === "invalid" ? "danger" : "neutral"}>{FORMAT_LABEL[formatOf(g)]}</Badge></Td>
              <Td>{links ? L.tagGroup.linkedInteractions(links) : L.expressions.unlinked}</Td>
              <Td><RowActions name={g.id} onDuplicate={() => {
                let id = "";
                atelier.edit((d) => { const r = duplicateGroup(d, g.id, atelier.system().ids); id = r.id; return r.doc; });
                if (id) atelier.openEditor({ type: "group", id, tab: "options" });
              }} onDelete={() => {
                atelier.edit((d) => deleteGroup(d, g.id));
                if (editor?.type === "group" && editor.id === g.id) atelier.closeEditor();
              }} /></Td>
            </Row>
          );
        })}
      </Table>
      <p class="text-3xs text-muted-foreground">{L.save.autoNote}</p>
    </Section>
  );
}

function SystemGroupTable({ doc, query }: { doc: PresetDocument; query: string }) {
  const atelier = useAtelierStore();
  const editor = useAtelier((s) => s.view.editor);
  const system = atelier.system();
  const rows = system.groups.filter((g) => textMatches(query, g.id, g.prompt, ...g.options.map((o) => o.id)));
  const setEnabled = (ids: string[], on: boolean) => atelier.edit((d) => ids.reduce((acc, id) => setSystemGroupEnabled(acc, id, on), d), "auto");
  return (
    <Section end={<CountChip shown={rows.length} total={system.groups.length} />}>
      <Table label={`${L.expressions.tagGroups} · ${L.table.system}`} head={<>
        <Th className="w-12"><ActiveHeader state={triState(rows.map((g) => g.enabled))} disabled={!rows.length} onChange={(on) => setEnabled(rows.map((g) => g.id), on)} /></Th>
        <Th>{L.expressions.colId}</Th>
        <Th>{L.expressions.colOptions}</Th>
        <Th>{L.expressions.colScope}</Th>
        <Th>{L.fields.prompt}</Th>
      </>}>
        {rows.length === 0 ? <EmptyRow colSpan={5} filtered={!!query.trim()} hint={L.expressions.emptyGroups} onClear={() => atelier.setQuery("expressions", "")} /> : null}
        {rows.map((g) => (
          <Row key={g.id} rowKey={g.id} label={L.expressions.editGroup(g.id)} inactive={!g.enabled} selected={editor?.type === "group" && editor.id === g.id} onOpen={() => atelier.openEditor({ type: "group", id: g.id, system: true, tab: "options" })}>
            <Td><ActiveSwitch name={g.id} checked={g.enabled} onChange={(on) => setEnabled([g.id], on)} /></Td>
            <Td className="font-mono font-bold">{g.id} <Badge>{L.table.system}</Badge></Td>
            <Td>{g.options.length}</Td>
            <Td>{scopeText(g.scopes)}</Td>
            <Td className="max-w-60 truncate text-muted-foreground" title={g.prompt}>{g.prompt}</Td>
          </Row>
        ))}
      </Table>
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------------ tag group editor (elt) */

export function GroupEditor({ id, system, tab = "options", option }: { id: string; system?: boolean; tab?: "options" | "settings"; option?: string | null }) {
  const atelier = useAtelierStore();
  const doc = useAtelier((s) => s.draft?.doc ?? null);
  if (!doc) return null;
  if (system) {
    const group = atelier.system().groups.find((g) => g.id === id);
    if (!group) return <Notice tone="warning">{L.guidelines.notFound}</Notice>;
    return (
      <div class="grid gap-3" data-atelier-editor="system-group">
        <div class="flex items-center gap-2"><Badge>{L.table.readOnly}</Badge><span class="text-2xs text-muted-foreground">{L.tagGroup.readOnly}</span></div>
        <FieldRow label={L.tagGroup.scope}><span class="text-xs text-foreground">{scopeText(group.scopes)}</span></FieldRow>
        <Table label={L.tagGroup.optionTable} head={<><Th>{L.expressions.colId}</Th><Th>{L.fields.prompt}</Th></>}>
          {group.options.map((o) => <Row key={o.id}><Td className="font-mono">{o.id}</Td><Td>{promptText(o.prompt)}</Td></Row>)}
        </Table>
      </div>
    );
  }
  const group = (doc.content.definitions ?? []).find((g) => g.id === id);
  if (!group) return <Notice tone="warning">{L.guidelines.notFound}</Notice>;
  const used = (doc.content.definitions ?? []).map((g) => g.id).concat(atelier.system().ids, (doc.content.panels ?? []).map((p) => p.id));
  const patch = (fn: (g: PresetGroup) => PresetGroup, mode: "auto" | "draft" = "draft") => atelier.edit((d) => updateGroup(d, id, fn), mode);
  const setTab = (next: "options" | "settings") => atelier.openEditor({ type: "group", id, tab: next, option: option ?? null });
  const linked = (doc.content.interactions ?? []).filter((i) => i.detailGroups?.includes(id));
  return (
    <div class="grid gap-3" data-atelier-editor="group">
      <FieldRow label={L.tagGroup.id}>
        <CommitText label={L.tagGroup.id} mono value={group.id} validate={(v) => validateGroupId(v, used, { current: group.id, minSegments: group.usage === "interaction_detail" ? 1 : 2 })} onInvalid={(bad) => atelier.setIncomplete(`group:${id}`, bad)} onCommit={(v) => {
          atelier.edit((d) => renameGroup(d, id, v.trim()));
          atelier.openEditor({ type: "group", id: v.trim(), tab, option: option ?? null });
        }} />
      </FieldRow>
      {group.usage === "interaction_detail" ? (
        <div class="grid gap-1 text-2xs text-muted-foreground">
          <span>{L.tagGroup.links(linked.length)}</span>
          <div class="flex flex-wrap gap-1">{linked.map((i) => <Button key={i.id} size="sm" variant="ghost" onClick={() => atelier.updateView({ section: "interactions", editor: { type: "interaction", id: i.id } })}>{i.id}</Button>)}</div>
        </div>
      ) : null}
      <div role="tablist" aria-label={L.tagGroup.tabs} class="flex gap-1">
        {(["options", "settings"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} class={cn("h-8 rounded-md px-3 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring/55", tab === t ? "bg-primary text-primary-foreground" : "bg-surface-control text-muted-foreground")} onClick={() => setTab(t)}
            onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); setTab(tab === "options" ? "settings" : "options"); } }}>
            {t === "options" ? L.tagGroup.optionsTab : L.tagGroup.settingsTab}
          </button>
        ))}
      </div>
      {tab === "options" ? <OptionsTab group={group} option={option ?? null} patch={patch} /> : <GroupSettings group={group} patch={patch} />}
    </div>
  );
}

function OptionsTab({ group, option, patch }: { group: PresetGroup; option: string | null; patch: (fn: (g: PresetGroup) => PresetGroup, mode?: "auto" | "draft") => void }) {
  const atelier = useAtelierStore();
  const [lastError, setLastError] = useState<string | null>(null);
  const setOption = (oid: string, fn: (o: PresetOption) => PresetOption, mode: "auto" | "draft" = "draft") => patch((g) => ({ ...g, options: g.options.map((o) => (o.id === oid ? fn(o) : o)) }), mode);
  const detail = option ? group.options.find((o) => o.id === option) : undefined;
  const open = (oid: string | null) => atelier.openEditor({ type: "group", id: group.id, tab: "options", option: oid });
  return (
    <div class="grid gap-2">
      <Table label={L.tagGroup.optionTable} head={<><Th className="w-8" /><Th className="w-12">{L.table.active}</Th><Th>{L.expressions.colId}</Th><Th>{L.fields.prompt}</Th><Th className="w-40" /></>}>
        {group.options.length === 0 ? <EmptyRow colSpan={5} filtered={false} hint={L.tagGroup.emptyOptions} /> : null}
        {group.options.map((o, index) => (
          <Row key={o.id} rowKey={o.id} data-atelier-reorder-row="" inactive={o.enabled === false} selected={option === o.id}>
            <Td><ReorderHandle name={o.id} index={index} count={group.options.length} onMove={(from, to) => patch((g) => ({ ...g, options: moveItem(g.options, from, to) }), "auto")} /></Td>
            <Td><ActiveSwitch name={o.id} checked={o.enabled !== false} onChange={(on) => setOption(o.id, (x) => { const n = { ...x }; if (on) delete n.enabled; else n.enabled = false; return n; }, "auto")} /></Td>
            <Td><CommitText label={`${L.expressions.colId} ${o.id}`} mono value={o.id} validate={(v) => !/^[a-z0-9][a-z0-9_-]*$/.test(v.trim()) ? L.fields.interactionChars : v.trim() !== o.id && group.options.some((x) => x.id === v.trim()) ? L.fields.idInUse : null} onInvalid={(bad) => atelier.setIncomplete(`option:${group.id}:${o.id}`, bad)} onCommit={(v) => atelier.edit((d) => renameOption(d, group.id, o.id, v.trim()))} /></Td>
            <Td className="min-w-60"><PromptEditor name={o.id} prompt={o.prompt} onChange={(prompt) => setOption(o.id, (x) => ({ ...x, prompt }))} /></Td>
            <Td>
              <span class="inline-flex items-center gap-1">
                <Button size="sm" variant={option === o.id ? "subtle" : "ghost"} aria-pressed={option === o.id} onClick={() => open(option === o.id ? null : o.id)}>{L.tagGroup.optionDetail}</Button>
                <RowActions name={o.id} onDelete={() => {
                  if (group.options.length <= 1) { setLastError(L.tagGroup.lastOption); return; }
                  patch((g) => ({ ...g, options: g.options.filter((x) => x.id !== o.id) }));
                  if (option === o.id) open(null);
                }} />
              </span>
            </Td>
          </Row>
        ))}
      </Table>
      {lastError ? <Notice tone="warning">{lastError}</Notice> : null}
      <div><Button size="sm" variant="subtle" onClick={() => {
        const oid = uniqueId("option", group.options.map((o) => o.id));
        patch((g) => ({ ...g, options: [...g.options, { id: oid, prompt: null }] }));
        setLastError(null);
      }}><PlusIcon />{L.tagGroup.addOption}</Button></div>
      {detail ? (
        <Section title={`${L.tagGroup.optionDetail} · ${detail.id}`} end={<Button size="sm" variant="ghost" onClick={() => open(null)}>{L.tagGroup.closeDetail}</Button>} data-atelier-option-detail="">
          <FieldRow label={L.tagGroup.sceneDescription}>
            <CommitText multiline rows={3} label={`${detail.id} ${L.tagGroup.sceneDescription}`} value={detail.description ?? ""} onCommit={(v) => setOption(detail.id, (x) => { const n = { ...x }; if (v) n.description = v; else delete n.description; return n; })} />
          </FieldRow>
          <FieldRow label={L.tagGroup.optionAttributes}>
            <AttributeTable label={`${detail.id} ${L.tagGroup.optionAttributes}`} value={detail.attributes} onChange={(attributes) => setOption(detail.id, (x) => { const n = { ...x }; if (attributes) n.attributes = attributes; else delete n.attributes; return n; })} />
          </FieldRow>
          <FieldRow label={L.fields.format}>
            <FormatField value={detail.formatRestriction} onChange={(formatRestriction) => setOption(detail.id, (x) => { const n = { ...x }; if (formatRestriction) n.formatRestriction = formatRestriction; else delete n.formatRestriction; return n; })} />
          </FieldRow>
        </Section>
      ) : null}
    </div>
  );
}

/** Group settings tab (AM `Jct`). */
function GroupSettings({ group, patch }: { group: PresetGroup; patch: (fn: (g: PresetGroup) => PresetGroup, mode?: "auto" | "draft") => void }) {
  const scopes = scopesOf(group);
  const by = group.select?.by ?? "ai";
  const max = group.select?.max;
  const single = max === 1;
  const detail = group.usage === "interaction_detail";
  const set = <K extends keyof PresetGroup>(key: K, value: PresetGroup[K] | undefined) => patch((g) => { const n = { ...g }; if (value === undefined) delete n[key]; else n[key] = value; return n; });
  return (
    <div class="grid gap-3" data-atelier-group-settings="">
      {!detail ? (
        <FieldRow label={L.tagGroup.scope} error={scopes.length === 0 ? L.scopes.pickOne : null}>
          <ScopePicker value={scopes} onChange={(next) => patch((g) => { const n = { ...g }; delete n.subjects; const v = scopeValue(next); if (v) n.scope = v; else delete n.scope; return n; })} />
        </FieldRow>
      ) : <FieldRow label={L.tagGroup.scope}><span class="text-xs text-foreground">{L.scopes.interaction}</span></FieldRow>}
      <div class="flex flex-wrap gap-3">
        <label class="inline-flex items-center gap-2 text-2xs font-bold"><Checkbox checked={!!group.requires?.humanlike} label={L.tagGroup.humanlikeOnly} onCheckedChange={(on) => set("requires", on ? { humanlike: true } : undefined)} />{L.tagGroup.humanlikeOnly}</label>
        <label class="inline-flex items-center gap-2 text-2xs font-bold"><Checkbox checked={!!group.continuity} label={L.tagGroup.usePrevious} onCheckedChange={(on) => set("continuity", on ? true : undefined)} />{L.tagGroup.usePrevious}</label>
      </div>
      <FieldRow label={L.tagGroup.selection}>
        <div class="flex flex-wrap items-center gap-2">
          <Choice label={L.tagGroup.selection} value={single ? "single" : "multiple"} options={[{ value: "single", label: L.tagGroup.single }, { value: "multiple", label: L.tagGroup.multiple }]} onChange={(v) => set("select", { ...group.select, by, max: v === "single" ? 1 : null })} />
          {!single ? (
            <span class="inline-flex items-center gap-1.5 text-2xs">
              {L.fields.maxSelect}
              <TextField aria-label={L.fields.maxSelect} className="w-16" inputMode="numeric" placeholder={L.fields.noLimit} value={max === null || max === undefined ? "" : String(max)} onInput={(e) => {
                const t = (e.currentTarget as HTMLInputElement).value.trim();
                const n = Number(t);
                if (!t) set("select", { ...group.select, by, max: null });
                else if (Number.isInteger(n) && n >= (by === "ai" ? 1 : 0)) set("select", { ...group.select, by, max: n });
              }} />
            </span>
          ) : null}
        </div>
      </FieldRow>
      <FieldRow label={L.tagGroup.chooser}>
        <Choice label={L.tagGroup.chooser} value={by} options={[{ value: "ai", label: L.tagGroup.byAi }, { value: "local", label: L.tagGroup.byRules }]} onChange={(v) => set("select", { ...group.select, by: v as "ai" | "local", max: group.select?.max ?? 1 })} />
      </FieldRow>
      <FieldRow label={L.fields.format}><FormatField value={group.formatRestriction} onChange={(v) => set("formatRestriction", v)} /></FieldRow>
      <FieldRow label={L.tagGroup.description}>
        <CommitText multiline rows={3} label={L.tagGroup.description} value={group.description ?? ""} onCommit={(v) => set("description", v || undefined)} />
      </FieldRow>
      <FieldRow label={L.tagGroup.commonPrompt}><PromptEditor name={L.tagGroup.commonPrompt} prompt={group.prompt} onChange={(prompt) => set("prompt", prompt ?? undefined)} /></FieldRow>
      <FieldRow label={L.tagGroup.attributes} hint={L.tagGroup.attributesNote}>
        <AttributeTable label={L.tagGroup.attributes} value={group.optionAttributes} onChange={(v) => set("optionAttributes", v)} />
      </FieldRow>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ channels (Mst / Dst) */

function ChannelTable({ doc, query, kind, system }: { doc: PresetDocument; query: string; kind: "free" | "text"; system: boolean }) {
  const atelier = useAtelierStore();
  const editor = useAtelier((s) => s.view.editor);
  const channels = system
    ? atelier.system().channels.filter((c) => c.kind === kind).map((c) => ({ id: c.id, kind: c.kind, scope: c.scope, instruction: c.instruction, order: c.order } as PresetChannel))
    : (doc.content.channels ?? []).filter((c) => c.kind === kind);
  const rows = channels.filter((c) => textMatches(query, c.id, c.name, c.instruction));
  const filtered = !!query.trim();
  const add = () => {
    const channel = newChannel(doc, kind);
    atelier.edit((d) => ({ ...d, content: { ...d.content, channels: [...(d.content.channels ?? []), channel] } }));
    atelier.setQuery("expressions", "");
    atelier.openEditor({ type: "channel", id: channel.id });
  };
  const setEnabled = (ids: string[], on: boolean) => atelier.edit((d) => {
    const next = clone(d);
    for (const c of next.content.channels ?? []) if (ids.includes(c.id)) { if (on) delete c.enabled; else c.enabled = false; }
    return next;
  }, "auto");
  return (
    <Section end={<><CountChip shown={rows.length} total={channels.length} />{!system ? <Button size="sm" variant="subtle" onClick={add}><PlusIcon />{L.expressions.addChannel}</Button> : null}</>}>
      <Table label={L.expressions.channelTable} description={L.expressions.channelList} head={<>
        <Th className="w-12">{!system ? <ActiveHeader state={triState(rows.map((c) => c.enabled !== false))} disabled={!rows.length} onChange={(on) => setEnabled(rows.map((c) => c.id), on)} /> : L.table.active}</Th>
        <Th>{L.expressions.colChannel}</Th>
        <Th>{L.expressions.colScope}</Th>
        <Th>{L.expressions.colContinuity}</Th>
        <Th className="w-28" />
      </>}>
        {rows.length === 0 ? <EmptyRow colSpan={5} filtered={filtered} hint={system ? L.expressions.emptyChannels : kind === "free" ? L.expressions.addFreeHint : L.expressions.addTextHint} onClear={() => atelier.setQuery("expressions", "")} onAdd={system ? undefined : add} addLabel={L.expressions.addChannel} /> : null}
        {rows.map((c) => (
          <Row key={c.id} rowKey={c.id} label={L.expressions.editChannel(c.id)} inactive={c.enabled === false} selected={editor?.type === "channel" && editor.id === c.id} onOpen={() => atelier.openEditor({ type: "channel", id: c.id, system })}>
            <Td><ActiveSwitch name={c.id} checked={c.enabled !== false} locked={system} onChange={(on) => setEnabled([c.id], on)} /></Td>
            <Td className="font-mono font-bold">{c.id}{system ? <> <Badge>{L.table.system}</Badge></> : null}</Td>
            <Td>{L.scopes[c.scope]}</Td>
            <Td>{c.continuity ? L.expressions.used : L.expressions.notUsed}</Td>
            <Td>{!system ? <RowActions name={c.id} onDelete={() => { atelier.edit((d) => deleteChannel(d, c.id)); if (editor?.type === "channel" && editor.id === c.id) atelier.closeEditor(); }} /> : null}</Td>
          </Row>
        ))}
      </Table>
    </Section>
  );
}

/** Channel editor (AM `Dst`). */
export function ChannelEditor({ id, system }: { id: string; system?: boolean }) {
  const atelier = useAtelierStore();
  const doc = useAtelier((s) => s.draft?.doc ?? null);
  if (!doc) return null;
  if (system) {
    const c = atelier.system().channels.find((x) => x.id === id);
    if (!c) return <Notice tone="warning">{L.guidelines.notFound}</Notice>;
    return (
      <div class="grid gap-3" data-atelier-editor="system-channel">
        <Badge>{L.table.readOnly}</Badge>
        <FieldRow label={L.expressions.colScope}><span class="text-xs text-foreground">{L.scopes[c.scope]}</span></FieldRow>
        <FieldRow label={L.channel.guideline}><p class="whitespace-pre-wrap text-2xs font-medium text-foreground">{c.instruction}</p></FieldRow>
      </div>
    );
  }
  const channel = (doc.content.channels ?? []).find((c) => c.id === id);
  if (!channel) return <Notice tone="warning">{L.guidelines.notFound}</Notice>;
  const used = (doc.content.channels ?? []).map((c) => c.id).concat(Object.keys(SYSTEM_CHANNELS));
  const patch = (fn: (c: PresetChannel) => PresetChannel, mode: "auto" | "draft" = "draft") => atelier.edit((d) => updateChannel(d, id, fn), mode);
  const set = <K extends keyof PresetChannel>(key: K, value: PresetChannel[K] | undefined) => patch((c) => { const n = { ...c }; if (value === undefined) delete n[key]; else n[key] = value; return n; });
  const limited = channel.maxLength !== undefined;
  return (
    <div class="grid gap-3" data-atelier-editor="channel">
      <FieldRow label={channel.kind === "free" ? L.channel.freeId : L.channel.textId}>
        <CommitText label={channel.kind === "free" ? L.channel.freeId : L.channel.textId} mono value={channel.id} validate={(v) => validateChannelId(v, used, channel.id)} onInvalid={(bad) => atelier.setIncomplete(`channel:${id}`, bad)} onCommit={(v) => { atelier.edit((d) => renameChannel(d, id, v.trim())); atelier.openEditor({ type: "channel", id: v.trim() }); }} />
      </FieldRow>
      <FieldRow label={L.expressions.colScope}>
        <Choice label={L.expressions.colScope} value={channel.scope} options={[{ value: "scene", label: L.scopes.scene }, { value: "actor", label: L.scopes.actor }]} onChange={(v) => set("scope", v)} />
      </FieldRow>
      <label class="inline-flex items-center gap-2 text-2xs font-bold"><Checkbox checked={!!channel.continuity} label={L.channel.usePrevious} onCheckedChange={(on) => set("continuity", on ? true : undefined)} />{L.channel.usePrevious}</label>
      <div class="flex flex-wrap gap-3">
        {channel.kind === "free" ? (
          <FieldRow label={L.channel.maxTags}>
            <TextField aria-label={L.channel.maxTags} className="w-20" inputMode="numeric" value={channel.maxTags === undefined ? "" : String(channel.maxTags)} onInput={(e) => {
              const t = (e.currentTarget as HTMLInputElement).value.trim();
              const n = Number(t);
              if (!t) set("maxTags", undefined);
              else if (Number.isInteger(n) && n >= 1 && n <= 64) set("maxTags", n);
            }} />
          </FieldRow>
        ) : null}
        <FieldRow label={L.channel.weight}>
          <TextField aria-label={L.channel.weight} className="w-20" inputMode="decimal" value={channel.weight === undefined ? "" : String(channel.weight)} onInput={(e) => {
            const t = (e.currentTarget as HTMLInputElement).value.trim();
            const n = Number(t);
            if (!t) set("weight", undefined);
            else if (Number.isFinite(n) && n >= 0 && n <= 10) set("weight", n);
          }} />
        </FieldRow>
      </div>
      <div class="grid gap-1.5">
        <label class="inline-flex items-center gap-2 text-2xs font-bold"><Checkbox checked={limited} label={L.channel.limit} onCheckedChange={(on) => patch((c) => {
          const n = { ...c };
          if (on) { n.maxLength = c.rememberedMaxLength ?? 80; delete n.rememberedMaxLength; }
          else { if (c.maxLength !== undefined) n.rememberedMaxLength = c.maxLength; delete n.maxLength; }
          return n;
        })} />{L.channel.limit}</label>
        {limited ? (
          <TextField aria-label={L.channel.maxLength} className="w-24" inputMode="numeric" value={String(channel.maxLength)} onInput={(e) => {
            const n = Number((e.currentTarget as HTMLInputElement).value.trim());
            if (Number.isInteger(n) && n >= 1 && n <= 160) set("maxLength", n);
          }} />
        ) : null}
      </div>
      <FieldRow label={L.fields.format}>
        <FormatField value={channel.formats ? { enabled: true, selected: channel.formats } : undefined} onChange={(v) => set("formats", v?.selected)} />
      </FieldRow>
      <FieldRow label={L.channel.guideline}>
        <CommitText multiline rows={6} label={L.channel.guideline} value={channel.instruction ?? ""} onCommit={(v) => set("instruction", v)} />
      </FieldRow>
    </div>
  );
}
