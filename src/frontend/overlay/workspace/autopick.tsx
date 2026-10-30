/**
 * Outfit auto-pick dialog (Inlay addition, no Asset Maid original). Scan: one naming-scheme call groups the card's images
 * by character and outfit. Tag: the chosen characters' untagged groups go on numbered contact sheets (25 tiles per call,
 * built here because the backend cannot decode WebP), several jobs in a row. Review: every group is a card with its
 * reference image, name and parts; "Add" turns the checked ones into outfits.
 */
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { AUTOPICK_PARTS, proposedParts, type AutoPickGroup, type AutoPickParts, type AutoPickState } from "../../../shared/contract/autopick.js";
import type { RosterItem } from "../../../shared/contract/rpc.js";
import { useAppState, type AnalysisJobState, type AppController } from "../../state/app-state.js";
import { Button, Dialog, TextField, cn } from "../ui/index.js";
import { planSheets, renderSheet } from "./autopick-sheets.js";
import { useWorkspaceCtx } from "./context.js";
import { draftKeyForCharacter } from "./drafts.js";
import { AUTOPICK_LABELS as L } from "./labels/autopick.js";
import { PROMPTS_LABELS } from "./labels/prompts.js";
import { useRunningJob } from "./notices.js";
import { Badge, Checkbox, OverlayBadge, Spinner } from "./parts.js";

/** Cards with at most this many groups start with every character chosen; bigger ones with the characters seen in the chat. */
const SELECT_ALL_LIMIT = 40;

type Part = (typeof AUTOPICK_PARTS)[number];
interface Edit { checked?: boolean; candidate?: number; label?: string; parts?: Partial<AutoPickParts> }
interface GroupValue { checked: boolean; candidate: number; label: string; parts: AutoPickParts; fromText: Part[] }
interface CharacterEntry { key: string; known: boolean; item?: RosterItem; title: string; groups: AutoPickGroup[] }

const EMPTY_PARTS: AutoPickParts = { head: "", top: "", bottom: "", legs: "", feet: "" };

function groupValue(group: AutoPickGroup, edit: Edit | undefined): GroupValue {
  const proposal = group.tags ? proposedParts(group.tags) : { parts: EMPTY_PARTS, fromText: [] as Part[] };
  return {
    checked: edit?.checked ?? (!!group.tags && !group.nude && !group.tags.nude && !group.tags.explicit && !group.appliedOutfitId),
    candidate: edit?.candidate ?? group.tags?.candidate ?? 0,
    label: edit?.label ?? (group.tags?.label || group.outfit),
    parts: { ...proposal.parts, ...edit?.parts },
    fromText: proposal.fromText.filter((p) => edit?.parts?.[p] === undefined)
  };
}

function waitForJob(app: AppController, jobId: string): Promise<AnalysisJobState | undefined> {
  return new Promise((resolve) => {
    const check = () => {
      const job = app.state.analysisJobs[jobId];
      if (job && !job.finishedAt) return;
      off();
      resolve(job);
    };
    const off = app.store.subscribe(check);
    check();
  });
}

function GroupCard({ group, value, disabled, onChange }: { group: AutoPickGroup; value: GroupValue; disabled: boolean; onChange: (edit: Edit) => void }) {
  const count = group.candidates.length;
  const candidate = group.candidates[value.candidate] ?? group.candidates[0];
  if (!candidate) return null;
  return (
    <div class={cn("grid content-start gap-1.5 rounded-md bg-surface-control p-1.5", value.checked && "ring-1 ring-primary/60")} data-autopick-group={group.id}>
      <div class="relative aspect-[5/7] overflow-hidden rounded bg-black/30">
        <button type="button" class="size-full disabled:cursor-default" title={count > 1 ? L.nextCandidate : candidate.name} disabled={count < 2}
          onClick={() => onChange({ candidate: (value.candidate + 1) % count })}>
          <img src={candidate.thumbnailUrl || candidate.url} alt={candidate.name} loading="lazy" decoding="async" draggable={false} class="size-full object-contain" />
        </button>
        <div class="pointer-events-none absolute top-1 left-1 flex flex-wrap gap-1">
          {group.appliedOutfitId ? <OverlayBadge tone="success">{L.added}</OverlayBadge> : null}
          {!group.tags && !group.nude ? <OverlayBadge>{L.untagged}</OverlayBadge> : null}
          {group.nude || group.tags?.nude ? <OverlayBadge tone="warning">{L.nude}</OverlayBadge> : null}
          {group.tags?.explicit ? <OverlayBadge tone="danger">{L.explicit}</OverlayBadge> : null}
        </div>
        {count > 1 ? <OverlayBadge className="pointer-events-none absolute right-1 bottom-1">{L.candidate(value.candidate + 1, count)}</OverlayBadge> : null}
      </div>
      <div class="flex items-center gap-1.5">
        <Checkbox checked={value.checked} disabled={disabled} label={L.include} onCheckedChange={(checked) => onChange({ checked })} />
        <TextField className="h-7 px-2" value={value.label} disabled={disabled} aria-label={L.label} onInput={(e) => onChange({ label: e.currentTarget.value })} />
      </div>
      <p class="truncate text-3xs text-muted-foreground" title={candidate.name}>{candidate.name} · {L.images(group.assetCount)}</p>
      {AUTOPICK_PARTS.map((part) => (
        <label key={part} class="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-1 text-3xs text-muted-foreground">
          <span class="flex items-center gap-1">
            {L.parts[part]}
            {value.fromText.includes(part) ? <span class="font-bold text-warning" title={L.fromText}>{L.fromTextBadge}</span> : null}
          </span>
          <TextField className="h-6 px-2 text-2xs" value={value.parts[part]} disabled={disabled} aria-label={L.parts[part]}
            onInput={(e) => onChange({ parts: { [part]: e.currentTarget.value } })} />
        </label>
      ))}
    </div>
  );
}

export function AutoPickDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { app, characterId, workspace, drafts } = useWorkspaceCtx();
  const chatId = useAppState((s) => s.status?.activeChatId ?? null);
  const running = useRunningJob(characterId, ["outfit-autopick"]);
  const [state, setState] = useState<AutoPickState | null>(null);
  const [seen, setSeen] = useState<string[]>([]);
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [tagging, setTagging] = useState<{ from: number; to: number; total: number } | null>(null);
  const [applying, setApplying] = useState(false);
  const stopped = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; stopped.current = true; }, []);

  const reload = async () => {
    if (!characterId) return;
    try {
      const result = await app.call("autopick.get", { characterId, ...(chatId ? { chatId } : {}) });
      if (!mounted.current) return;
      setState(result.state);
      setSeen(result.seenPromptKeys);
    } catch (error) {
      app.notifyError(error);
    }
  };
  useEffect(() => { setState(null); setChosen(null); setEdits({}); }, [characterId]);
  useEffect(() => { if (open && characterId) void reload(); }, [open, characterId]);

  const roster = workspace?.roster ?? [];
  const characters = useMemo(() => {
    const byKey = new Map<string, CharacterEntry>();
    for (const g of state?.groups ?? []) {
      const key = g.promptKey || `token:${g.characterToken}`;
      let entry = byKey.get(key);
      if (!entry) {
        const item = roster.find((r) => r.promptKey === g.promptKey);
        entry = { key, known: !!g.promptKey, ...(item ? { item } : {}), title: item?.title || g.characterToken || "?", groups: [] };
        byKey.set(key, entry);
      }
      entry.groups.push(g);
    }
    return [...byKey.values()].sort((a, b) => Number(b.known) - Number(a.known) || Number(seen.includes(b.key)) - Number(seen.includes(a.key)) || a.title.localeCompare(b.title));
  }, [state, roster, seen]);
  const known = characters.filter((c) => c.known);

  useEffect(() => {
    if (!state?.groups.length || chosen) return;
    const keys = known.map((c) => c.key);
    setChosen(new Set(state.groups.length <= SELECT_ALL_LIMIT ? keys : keys.filter((k) => seen.includes(k))));
  }, [state, seen]);

  const picked = chosen ?? new Set<string>();
  const value = (g: AutoPickGroup) => groupValue(g, edits[g.id]);
  const jobs = useMemo(() => planSheets(state?.groups ?? [], picked, (g) => value(g).candidate), [state, chosen, edits]);
  const sheetCount = jobs.reduce((n, job) => n + job.length, 0);
  const tileCount = jobs.reduce((n, job) => n + job.reduce((m, sheet) => m + sheet.length, 0), 0);
  // Only the chosen characters' cards are shown: a hidden card cannot be reviewed or unchecked.
  const toAdd = (state?.groups ?? []).filter((g) => g.promptKey && picked.has(g.promptKey) && value(g).checked);
  const busy = !!running || !!tagging || applying;

  const edit = (id: string, patch: Edit) => setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch, parts: { ...prev[id]?.parts, ...patch.parts } } }));
  const choose = (keys: string[], on: boolean) => setChosen((prev) => {
    const next = new Set(prev ?? []);
    for (const k of keys) on ? next.add(k) : next.delete(k);
    return next;
  });

  const scan = async () => {
    if (!characterId) return;
    const jobId = await app.startAnalysis({ kind: "outfit-autopick", characterId, autopick: { phase: "plan" } });
    if (!jobId) return;
    await waitForJob(app, jobId);
    await reload();
  };

  const tag = async () => {
    if (!characterId || !jobs.length) return;
    stopped.current = false;
    let done = 0;
    try {
      for (const job of jobs) {
        if (stopped.current) break;
        setTagging({ from: done + 1, to: done + job.length, total: sheetCount });
        const sheets = (await Promise.all(job.map((tiles) => renderSheet(tiles)))).filter((s) => s !== null);
        if (!sheets.length) { app.notify({ tone: "danger", message: L.sheetFailed }); break; }
        if (stopped.current) break;
        const jobId = await app.startAnalysis({ kind: "outfit-autopick", characterId, autopick: { phase: "tag", sheets } });
        if (!jobId) break;
        const result = await waitForJob(app, jobId);
        done += job.length;
        await reload();
        if (!result || result.status === "error" || result.status === "cancelled") break;
      }
    } finally {
      if (mounted.current) setTagging(null);
    }
  };

  const stop = () => {
    stopped.current = true;
    if (running) void app.cancelAnalysis(running.jobId);
  };

  const apply = async () => {
    if (!characterId || !toAdd.length) return;
    const keys = new Set(toAdd.map((g) => g.promptKey));
    const dirty = new Set(drafts.dirtyKeys(`char:${characterId}:`));
    if ([...keys].some((k) => dirty.has(draftKeyForCharacter(characterId, k)))) {
      app.notify({ tone: "warning", message: PROMPTS_LABELS.saveFirst });
      return;
    }
    setApplying(true);
    try {
      const items = toAdd.map((g) => {
        const v = value(g);
        return { groupId: g.id, candidate: v.candidate, label: v.label, parts: v.parts };
      });
      const result = await app.call("autopick.apply", { characterId, items });
      if (mounted.current) {
        const ids = new Set(toAdd.map((g) => g.id));
        setState(result.state);
        setEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.has(id))));
      }
      // Outfits of unregistered characters would not show on the Prompts tab.
      const unregistered = roster.filter((r) => keys.has(r.promptKey) && !r.registered && r.kind !== "custom");
      if (unregistered.length) await app.mutateWorkspace("roster.setRegistered", { characterId, items: unregistered.map((r) => ({ memberKey: r.memberKey, selectionId: r.selectionId })), registered: true });
      app.notify({ tone: "success", message: L.applied(result.added, result.skipped) });
    } catch (error) {
      app.notifyError(error);
    } finally {
      if (mounted.current) setApplying(false);
    }
  };

  const scheme = state?.scheme ?? null;
  const progress = tagging
    ? [L.tagging(tagging.from, tagging.to, tagging.total), running?.progress.label].filter(Boolean).join(" · ")
    : running?.progress.label ?? "";

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={L.title}
      description={L.description}
      closeLabel={L.close}
      className="w-[min(1040px,calc(100%-32px))]"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{L.close}</Button>
          <Button disabled={busy || !toAdd.length} onClick={() => void apply()}>{applying ? <Spinner /> : null}{L.apply(toAdd.length)}</Button>
        </>
      }
    >
      <div class="flex flex-wrap items-center gap-2" data-autopick-toolbar="">
        <Button variant="subtle" disabled={busy} onClick={() => void scan()}>{running && !tagging ? <Spinner /> : null}{scheme ? L.rescan : L.scan}</Button>
        {scheme ? (
          <Button disabled={busy || !tileCount} onClick={() => void tag()}>{tagging ? <Spinner /> : null}{tileCount ? L.tag(tileCount, sheetCount) : L.allTagged}</Button>
        ) : null}
        {running || tagging ? <Button variant="danger" onClick={stop}>{L.stop}</Button> : null}
        <span class="min-w-0 flex-1 truncate text-2xs text-muted-foreground" aria-live="polite">{progress}</span>
      </div>
      {scheme ? (
        <p class="text-2xs text-muted-foreground" title={scheme.regex}>{L.summary(scheme.assetCount, state?.groups.length ?? 0, known.length, Math.round(scheme.coverage * 100), scheme.calls)}</p>
      ) : state ? <p class="text-xs text-muted-foreground">{L.noScan}</p> : <Spinner className="size-5 text-muted-foreground" />}
      {known.length ? (
        <div class="flex flex-wrap items-center gap-1 text-2xs text-muted-foreground">
          <span class="mr-1">{L.selectHint}</span>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => choose(known.map((c) => c.key), true)}>{L.selectAll}</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setChosen(new Set())}>{L.selectNone}</Button>
        </div>
      ) : null}
      <div class="grid gap-2" data-autopick-characters="">
        {characters.map((c) => {
          const on = c.known && picked.has(c.key);
          const tagged = c.groups.filter((g) => g.tags).length;
          return (
            <section key={c.key} class="grid gap-2 rounded-md bg-card p-2" data-autopick-character={c.key}>
              <div class="flex min-w-0 items-center gap-2">
                {c.known ? <Checkbox checked={on} disabled={busy} label={c.title} onCheckedChange={(v) => choose([c.key], v)} /> : null}
                <button type="button" class="min-w-0 truncate text-left text-xs font-bold disabled:cursor-default" disabled={!c.known || busy} onClick={() => choose([c.key], !on)}>{c.title}</button>
                {seen.includes(c.key) ? <Badge tone="primary">{L.seenInChat}</Badge> : null}
                {!c.known ? <Badge tone="warning" title={L.unknownHint}>{L.unknownCharacter}</Badge> : c.item && !c.item.registered ? <Badge>{L.notInRoster}</Badge> : null}
                <span class="ml-auto shrink-0 text-2xs text-muted-foreground">{L.groupsOf(c.groups.length, tagged)}</span>
              </div>
              {on ? (
                <div class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
                  {c.groups.map((g) => <GroupCard key={g.id} group={g} value={value(g)} disabled={applying} onChange={(patch) => edit(g.id, patch)} />)}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </Dialog>
  );
}
