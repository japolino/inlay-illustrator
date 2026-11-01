/**
 * Rules (AM `Vct` 127715, scope tabs `Nct`): common rules of the preset (`Uct` 127058: table + JSON mode, AM selection
 * rules `{when, action, from, to}`), the rule object picker (`tve`/`eve`/`Ybe`/`Xbe`) and the directing rules of a
 * directing guideline (`Xct` 127422; port: rule list with active toggles + JSON editor of the guideline's `system`).
 */
import { useEffect, useMemo, useState } from "preact/hooks";
import type { SceneRule, SceneSystem } from "../../../shared/contract/atelier.js";
import { Button, Dialog, PlusIcon, Select, TextArea } from "../ui/index.js";
import { Badge, Checkbox } from "../workspace/parts.js";
import { SearchField } from "../shell/filters.js";
import { ATELIER_LABELS as L, RULES_GUIDE } from "./labels.js";
import { ActiveHeader, ActiveSwitch, Choice, CountChip, EmptyRow, HelpCard, Notice, ReorderHandle, Row, RowActions, Section, Table, Td, Th } from "./kit.js";
import {
  checkRuleReferences,
  clone,
  formatRulesJson,
  isSelectionRule,
  moveItem,
  newRule,
  parseRulesJson,
  refLabel,
  ruleAllowsActors,
  ruleChannelWarning,
  ruleMatches,
  ruleObjectCatalog,
  RULE_AT,
  textMatches,
  triState,
  type PresetDocument,
  type PresetRule,
  type RuleAt,
  type RuleObjectCatalog,
  type RuleRef,
  type SelectionRule
} from "./model.js";
import { useAtelier, useAtelierStore } from "./store.js";
import { useAppState } from "../../state/app-state.js";

function setRules(doc: PresetDocument, rules: PresetRule[]): PresetDocument {
  const next = clone(doc);
  if (rules.length) next.content.rules = rules;
  else delete next.content.rules;
  return next;
}

export function RulesPage() {
  const atelier = useAtelierStore();
  const view = useAtelier((s) => s.view);
  return (
    <div class="grid min-w-0 gap-3" data-atelier-section="rules">
      <div class="flex flex-wrap items-center gap-2">
        <Choice label={L.rules.scope} value={view.rulesScope} options={[{ value: "directing", label: L.rules.directing }, { value: "common", label: L.rules.common }]} onChange={(rulesScope) => atelier.updateView({ rulesScope })} />
        <Badge>{L.rules.priority}</Badge>
      </div>
      {view.guideOpen ? (
        <HelpCard text={RULES_GUIDE.intro}>
          <dl class="grid gap-1">{RULES_GUIDE.rows.map((r) => <div key={r.term} class="grid gap-0.5"><dt class="font-bold text-foreground">{r.term}</dt><dd>{r.text}</dd></div>)}</dl>
          <p class="italic">{RULES_GUIDE.example}</p>
        </HelpCard>
      ) : null}
      {view.rulesScope === "common" ? <CommonRules /> : <DirectingRules />}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ common rules (Uct) */

function CommonRules() {
  const atelier = useAtelierStore();
  const draft = useAtelier((s) => s.draft);
  const view = useAtelier((s) => s.view);
  const state = useAppState((s) => s.atelier);
  const doc = draft?.doc;
  const catalog = useMemo(() => (doc ? ruleObjectCatalog(doc, atelier.system()) : null), [doc]);
  if (!doc || !catalog) return null;
  const rules = doc.content.rules ?? [];
  const name = state?.catalog.documents.find((d) => d.id === draft!.id)?.name ?? "";
  if (view.rulesMode === "json") return <RulesJson name={name} catalog={catalog} />;
  const query = view.query.rules ?? "";
  const shown = rules.map((rule, index) => ({ rule, index })).filter(({ rule }) => ruleMatches(rule, query));
  const filtered = !!query.trim();
  const problems = checkRuleReferences(rules, catalog, atelier.system().ids);
  const write = (next: PresetRule[]) => atelier.edit((d) => setRules(d, next), "auto");
  const patchRule = (index: number, fn: (r: SelectionRule) => SelectionRule) => write(rules.map((r, i) => (i === index && isSelectionRule(r) ? fn(r) : r)));
  const add = () => { atelier.setQuery("rules", ""); write([...rules, newRule()]); };
  return (
    <Section end={<>
      <CountChip shown={shown.length} total={rules.length} />
      <Button size="sm" variant="ghost" onClick={() => { atelier.setRulesText(formatRulesJson(rules)); atelier.updateView({ rulesMode: "json" }); }}>{L.rules.jsonView}</Button>
      <Button size="sm" variant="subtle" onClick={add}><PlusIcon />{L.rules.addRule}</Button>
    </>}>
      <SearchField label={L.rules.search} placeholder={L.rules.searchPlaceholder} value={query} onChange={(v) => atelier.setQuery("rules", v)} />
      {problems.length ? <Notice tone="warning"><strong>{L.rules.references(problems.length)}</strong><ul class="list-disc pl-4">{problems.map((p) => <li key={p}>{p}</li>)}</ul></Notice> : null}
      <Table label={L.rules.table} head={<>
        <Th className="w-8">{L.rules.colPriority}</Th>
        <Th className="w-12"><ActiveHeader state={triState(shown.map(({ rule }) => rule.enabled !== false))} disabled={!shown.length} onChange={(on) => write(rules.map((r, i) => (shown.some((s) => s.index === i) ? withEnabled(r, on) : r)))} /></Th>
        <Th>{L.rules.colWhen}</Th><Th>{L.rules.colFrom}</Th><Th>{L.rules.colAction}</Th><Th>{L.rules.colTo}</Th><Th className="w-16" />
      </>}>
        {shown.length === 0 ? <EmptyRow colSpan={7} filtered={filtered} hint={L.rules.empty} onClear={() => atelier.setQuery("rules", "")} onAdd={add} addLabel={L.rules.addRule} /> : null}
        {shown.map(({ rule, index }, position) => {
          const label = L.rules.rowLabel(index + 1);
          if (!isSelectionRule(rule)) {
            return (
              <Row key={index} rowKey={String(index)} data-atelier-reorder-row="" label={label} inactive={(rule as { enabled?: boolean }).enabled === false}>
                <Td><ReorderHandle name={label} index={position} count={shown.length} disabled={filtered} onMove={(from, to) => write(moveItem(rules, from, to))} /></Td>
                <Td><ActiveSwitch name={label} checked={(rule as { enabled?: boolean }).enabled !== false} onChange={(on) => write(rules.map((r, i) => (i === index ? withEnabled(r, on) : r)))} /></Td>
                <Td colSpan={4} className="font-mono text-3xs text-muted-foreground">{JSON.stringify(rule).slice(0, 120)}{L.rules.legacy}</Td>
                <Td><RowActions name={label} onDelete={() => write(rules.filter((_, i) => i !== index))} /></Td>
              </Row>
            );
          }
          const actors = ruleAllowsActors(rule, catalog);
          return (
            <Row key={index} rowKey={String(index)} data-atelier-reorder-row="" label={label} inactive={rule.enabled === false}>
              <Td><ReorderHandle name={label} index={position} count={shown.length} disabled={filtered} onMove={(from, to) => write(moveItem(rules, from, to))} /></Td>
              <Td><ActiveSwitch name={label} checked={rule.enabled !== false} onChange={(on) => patchRule(index, (r) => withEnabled(r, on) as SelectionRule)} /></Td>
              <Td><Select aria-label={`${label} ${L.rules.colWhen}`} className="w-32" value={rule.when} options={[{ value: "any", label: L.rules.any }, { value: "all", label: L.rules.all }, { value: "none", label: L.rules.none }]} onValueChange={(when) => patchRule(index, (r) => ({ ...r, when }))} /></Td>
              <Td><RefList side="from" refs={rule.from} catalog={catalog} rule={rule} actors={actors} label={`${label} ${L.rules.colFrom}`} onChange={(from) => patchRule(index, (r) => ({ ...r, from }))} /></Td>
              <Td><Select aria-label={`${label} ${L.rules.colAction}`} className="w-24" value={rule.action} options={[{ value: "add", label: L.rules.add }, { value: "remove", label: L.rules.remove }]} onValueChange={(action) => patchRule(index, (r) => ({ ...r, action }))} /></Td>
              <Td>
                <RefList side="to" refs={rule.to} catalog={catalog} rule={rule} actors={actors} label={`${label} ${L.rules.colTo}`} onChange={(to) => patchRule(index, (r) => ({ ...r, to }))} />
                {ruleChannelWarning(rule, catalog) ? <p class="mt-1 text-3xs text-warning" role="alert">{L.rules.channelWarning}</p> : null}
              </Td>
              <Td><RowActions name={label} onDelete={() => write(rules.filter((_, i) => i !== index))} /></Td>
            </Row>
          );
        })}
      </Table>
      <p class="text-3xs text-muted-foreground">{L.save.autoNote}</p>
    </Section>
  );
}

function withEnabled(rule: PresetRule, on: boolean): PresetRule {
  const next = { ...(rule as Record<string, unknown>) };
  if (on) delete next.enabled;
  else next.enabled = false;
  return next as PresetRule;
}

/** JSON mode (AM `Uct` JSON): format, validation, reference check; the text is part of the preset draft. */
function RulesJson({ name, catalog }: { name: string; catalog: RuleObjectCatalog }) {
  const atelier = useAtelierStore();
  const text = useAtelier((s) => s.draft?.rulesText ?? "");
  const parsed = parseRulesJson(text);
  const problems = parsed.rules ? checkRuleReferences(parsed.rules, catalog, atelier.system().ids) : [];
  return (
    <Section end={<>
      <Button size="sm" variant="ghost" disabled={!parsed.rules} onClick={() => parsed.rules && atelier.setRulesText(formatRulesJson(parsed.rules))}>{L.rules.format}</Button>
      <Button size="sm" variant="subtle" disabled={!parsed.rules} onClick={() => {
        if (!parsed.rules) return;
        const rules = parsed.rules;
        atelier.edit((d) => setRules(d, rules));
        atelier.setRulesText(null);
        atelier.updateView({ rulesMode: "table" });
      }}>{L.rules.tableView}</Button>
    </>}>
      <TextArea aria-label={L.rules.jsonLabel(name)} rows={18} className="font-mono text-2xs" value={text} onInput={(e) => atelier.setRulesText((e.currentTarget as HTMLTextAreaElement).value)} />
      {parsed.error ? <Notice tone="danger">{parsed.error}</Notice> : null}
      {problems.length ? <Notice tone="warning"><strong>{L.rules.references(problems.length)}</strong><ul class="list-disc pl-4">{problems.map((p) => <li key={p}>{p}</li>)}</ul></Notice> : null}
    </Section>
  );
}

/* ------------------------------------------------------------------------------------------------ object picker (tve/eve/Ybe) */

const AT_LABEL: Record<RuleAt, string> = { current: L.picker.current, source: L.picker.source, target: L.picker.target, scene: L.picker.scene, persona: L.picker.persona, actor: L.picker.actor };

function RefList({ side, refs, catalog, rule, actors, label, onChange }: { side: "from" | "to"; refs: RuleRef[]; catalog: RuleObjectCatalog; rule: SelectionRule; actors: boolean; label: string; onChange: (refs: RuleRef[]) => void }) {
  const [editing, setEditing] = useState<number | "new" | null>(null);
  return (
    <div class="flex max-w-80 flex-wrap items-center gap-1" data-atelier-refs={side}>
      {refs.map((ref, i) => (
        <button key={i} type="button" class="max-w-48 truncate rounded-sm bg-surface-control px-1.5 py-0.5 text-left font-mono text-3xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/55" aria-label={L.picker.editItem(label, i + 1)} title={refLabel(ref)} onClick={() => setEditing(i)}>
          {refLabel(ref)}{ref.at ? ` @${AT_LABEL[ref.at]}` : ""}
        </button>
      ))}
      <Button size="iconCompact" variant="ghost" aria-label={L.picker.addTo(label)} title={L.picker.addTo(label)} onClick={() => setEditing("new")}><PlusIcon /></Button>
      {editing !== null ? (
        <ObjectPicker
          side={side}
          catalog={catalog}
          action={rule.action}
          actors={actors}
          initial={editing === "new" ? null : refs[editing] ?? null}
          onClose={() => setEditing(null)}
          onRemove={editing === "new" ? undefined : () => { onChange(refs.filter((_, i) => i !== editing)); setEditing(null); }}
          onApply={(ref) => { onChange(editing === "new" ? [...refs, ref] : refs.map((r, i) => (i === editing ? ref : r))); setEditing(null); }}
        />
      ) : null}
    </div>
  );
}

type PickKind = "group" | "interaction" | "channel";
export function ObjectPicker({ side, catalog, action, actors, initial, onApply, onClose, onRemove }: {
  side: "from" | "to";
  catalog: RuleObjectCatalog;
  action: "add" | "remove";
  actors: boolean;
  initial: RuleRef | null;
  onApply: (ref: RuleRef) => void;
  onClose: () => void;
  onRemove?: () => void;
}) {
  const initialKind: PickKind = initial?.interaction ? "interaction" : initial?.group && catalog.channels.some((c) => c.id === initial.group) ? "channel" : "group";
  const [kind, setKind] = useState<PickKind>(initialKind);
  const [id, setId] = useState<string>(initial?.interaction ?? initial?.group ?? "");
  const [options, setOptions] = useState<string[]>(initial?.options ?? []);
  const [at, setAt] = useState<RuleAt | "">(initial?.at ?? "");
  const [query, setQuery] = useState("");
  useEffect(() => { if (kind === "channel") setOptions([]); }, [kind]);
  const positions = RULE_AT.filter((p) => actors || (p !== "source" && p !== "target"));
  const channelsAllowed = side === "to" && action === "remove";
  const kinds: Array<{ value: PickKind; label: string }> = [{ value: "group", label: L.picker.kindGroup }, ...(side === "from" ? [{ value: "interaction" as PickKind, label: L.picker.kindInteraction }] : []), ...(channelsAllowed ? [{ value: "channel" as PickKind, label: L.picker.kindChannel }] : [])];
  const list = kind === "group" ? catalog.groups.map((g) => ({ id: g.id, options: g.options })) : kind === "interaction" ? catalog.interactions.map((i) => ({ id: i, options: [] as string[] })) : catalog.channels.map((c) => ({ id: c.id, options: [] as string[] }));
  const shown = list.filter((x) => textMatches(query, x.id, ...x.options));
  const chosen = list.find((x) => x.id === id);
  const apply = () => {
    if (!id) return;
    const ref: RuleRef = kind === "interaction" ? { interaction: id } : { group: id, ...(options.length ? { options } : {}) };
    if (at) ref.at = at;
    onApply(ref);
  };
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }} title={L.picker.title} closeLabel={L.picker.close} className="w-[min(560px,calc(100%-32px))]"
      footer={<>
        {onRemove ? <Button variant="danger" onClick={onRemove}>{L.picker.remove}</Button> : null}
        <span class="flex-1" />
        <Button variant="ghost" onClick={onClose}>{L.save.cancel}</Button>
        <Button disabled={!id} onClick={apply}>{L.picker.apply}</Button>
      </>}>
      <div class="grid gap-2" data-atelier-picker="">
        <Choice label={L.picker.title} value={kind} options={kinds} onChange={(k) => { setKind(k); setId(""); setOptions([]); }} />
        <SearchField label={L.picker.search} placeholder={L.picker.searchPlaceholder} value={query} onChange={setQuery} />
        <div class="grid max-h-64 gap-0.5 overflow-y-auto rounded-md bg-card p-1" role="listbox" aria-label={L.picker.title}>
          {list.length === 0 ? <p class="p-2 text-2xs text-muted-foreground">{L.picker.empty}</p> : shown.length === 0 ? <p class="p-2 text-2xs text-muted-foreground">{L.picker.noResults}</p> : null}
          {shown.map((x) => (
            <button key={x.id} type="button" role="option" aria-selected={x.id === id} class={`flex h-7 items-center rounded-sm px-2 text-left font-mono text-2xs outline-none focus-visible:ring-2 focus-visible:ring-ring/55 ${x.id === id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`} onClick={() => { setId(x.id); setOptions([]); }}>
              {x.id}
            </button>
          ))}
        </div>
        {kind === "group" && chosen && chosen.options.length ? (
          <div class="grid gap-1" role="group" aria-label={chosen.id}>
            <label class="inline-flex items-center gap-2 text-2xs font-bold"><Checkbox checked={options.length === 0} label={L.picker.wholeGroup} onCheckedChange={() => setOptions([])} />{L.picker.wholeGroup}</label>
            <div class="flex flex-wrap gap-1.5">
              {chosen.options.map((o) => (
                <label key={o} class="inline-flex items-center gap-1.5 rounded-sm bg-surface-control px-1.5 py-1 font-mono text-3xs">
                  <Checkbox checked={options.includes(o)} label={o} onCheckedChange={(on) => setOptions(on ? [...options, o] : options.filter((x) => x !== o))} />{o}
                </label>
              ))}
            </div>
            <span class="text-3xs text-muted-foreground">{L.picker.selectedCount(options.length)}</span>
          </div>
        ) : null}
        <div class="grid gap-1">
          <span class="text-2xs font-bold text-muted-foreground">{L.picker.position}</span>
          <Select aria-label={L.picker.position} value={at} options={[{ value: "", label: L.table.notSet }, ...positions.map((p) => ({ value: p, label: AT_LABEL[p] }))]} onValueChange={(v) => setAt(v as RuleAt | "")} />
          {!actors ? <span class="text-3xs text-muted-foreground">{L.picker.sourceTargetNote}</span> : null}
        </div>
      </div>
    </Dialog>
  );
}

/* ------------------------------------------------------------------------------------------------ directing rules (Xct) */

function effectSummary(rule: SceneRule): string {
  const e = rule.effect;
  switch (e.kind) {
    case "path": return `${e.action} ${e.path}`;
    case "paths": return `${e.action} ${e.targets.map((t) => t.path).join(", ")}`;
    case "output": return `${e.action} ${e.target}:${e.path}`;
    case "role": return `role ${e.role}`;
    case "participant": return `participant ${e.target}`;
    case "selection": return `${e.action} ${e.definition} / ${e.options.join(", ")}`;
    case "contribution": return `${e.action} ${e.target}: ${e.groups.join(", ")}`;
    case "coordinates": return `coordinates ${e.policy}`;
    case "instruction": return e.text.slice(0, 60);
    default: return "";
  }
}

function DirectingRules() {
  const atelier = useAtelierStore();
  const state = useAppState((s) => s.atelier);
  const view = useAtelier((s) => s.view);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [incomplete, setIncomplete] = useState<string[]>([]);
  const items = state?.library.scene.items ?? {};
  const id = items[view.rulesDirection] ? view.rulesDirection : state?.library.scene.selected ?? "default";
  const item = items[id];
  useEffect(() => { setText(null); setError(null); }, [id, state?.storeRevision]);
  if (!state || !item) return null;
  const system: SceneSystem = item.system ?? { options: [], values: {}, rules: [] };
  const owned = new Set(state.ownedRuleIds[id] ?? []);
  const query = view.query.directing ?? "";
  const rules = system.rules.filter((r) => textMatches(query, r.id, effectSummary(r)));
  const save = async (next: SceneSystem) => {
    const result = await atelier.setSystem(id, next);
    if (result) setIncomplete(result);
    return result !== null;
  };
  return (
    <Section end={<CountChip shown={rules.length} total={system.rules.length} />}>
      <div class="flex flex-wrap items-center gap-2">
        <Select aria-label={L.rules.directingPick} className="w-56" value={id} options={Object.entries(items).map(([key, it]) => ({ value: key, label: it.name }))} onValueChange={(rulesDirection) => atelier.updateView({ rulesDirection })} />
        <SearchField className="min-w-40 flex-1" label={L.rules.search} placeholder={L.rules.searchPlaceholder} value={query} onChange={(v) => atelier.setQuery("directing", v)} />
      </div>
      <p class="text-2xs text-muted-foreground">{L.rules.directingNote}</p>
      {incomplete.length ? <Notice tone="warning">{L.rules.incomplete(incomplete.join(", "))}</Notice> : null}
      <Table label={L.rules.directingTable} head={<><Th className="w-12">{L.table.active}</Th><Th>ID</Th><Th>{L.rules.condition}</Th><Th>{L.rules.effect}</Th></>}>
        {rules.length === 0 ? <EmptyRow colSpan={4} filtered={!!query.trim()} hint={L.rules.directingEmpty} onClear={() => atelier.setQuery("directing", "")} /> : null}
        {rules.map((rule) => (
          <Row key={rule.id} rowKey={rule.id} label={rule.id} inactive={rule.enabled === false}>
            <Td><ActiveSwitch name={rule.id} checked={rule.enabled !== false} onChange={(on) => void save({ ...system, rules: system.rules.map((r) => (r.id === rule.id ? { ...r, enabled: on } : r)) })} /></Td>
            <Td className="font-mono font-bold">{rule.id}{owned.has(rule.id) ? <> <Badge>{L.expressions.scopePreset}</Badge></> : null}</Td>
            <Td className="font-mono text-3xs">{rule.condition.direction}{rule.condition.option ? ` / ${rule.condition.option}` : ""}</Td>
            <Td className="text-3xs">{effectSummary(rule)}</Td>
          </Row>
        ))}
      </Table>
      <Section title={L.rules.directingJson(item.name)}>
        <TextArea aria-label={L.rules.directingJson(item.name)} rows={12} className="font-mono text-2xs" value={text ?? JSON.stringify(system, null, 2)} onInput={(e) => { setText((e.currentTarget as HTMLTextAreaElement).value); setError(null); }} />
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div class="flex gap-1.5">
          <Button size="sm" disabled={text === null} onClick={async () => {
            let next: SceneSystem;
            try {
              next = JSON.parse(text ?? "") as SceneSystem;
            } catch {
              setError(L.rules.jsonInvalid);
              return;
            }
            if (await save(next)) setText(null);
          }}>{L.rules.saveRules}</Button>
          <Button size="sm" variant="ghost" disabled={text === null} onClick={() => { setText(null); setError(null); }}>{L.save.discard}</Button>
        </div>
      </Section>
    </Section>
  );
}
