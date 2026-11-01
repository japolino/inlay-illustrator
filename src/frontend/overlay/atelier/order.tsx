/**
 * Output order (sidebar mode, AM `kct` 124731, lanes `Fbe` 124682, rows `K_` 121926, fixed rows `G_`): main prompt and
 * character prompt, each with fixed system rows, a tag lane and a natural-language lane. Reorders are saved at once.
 */
import { Button } from "../ui/index.js";
import { Badge } from "../workspace/parts.js";
import { ATELIER_HELP, ATELIER_LABELS as L } from "./labels.js";
import { ReorderHandle } from "./kit.js";
import { laneOf, movePromptOrder, orderRows, restorePromptOrder, type OrderLane, type OrderRow, type OrderTarget } from "./model.js";
import { useAtelier, useAtelierStore, type AtelierEditor } from "./store.js";

const KIND_LABEL: Record<OrderRow["kind"], string> = { group: L.order.kindGroup, free: L.order.kindFree, text: L.order.kindText, interaction: L.order.kindInteraction };
const FIXED: Record<OrderTarget, string[]> = { main: [L.order.rating, L.order.count, L.order.artist], actor: [L.order.base, L.order.outfit] };

export function OutputOrder() {
  const atelier = useAtelierStore();
  const doc = useAtelier((s) => s.draft?.doc ?? null);
  const blocked = useAtelier((s) => s.saving || s.stale || !!s.draft?.readError || s.view.rawOpen);
  const guide = useAtelier((s) => s.view.guideOpen);
  if (!doc) return null;
  const system = atelier.system();
  const open = (row: OrderRow) => {
    let editor: AtelierEditor = null;
    if (row.kind === "interaction") {
      atelier.updateView({ mode: "preset", section: "interactions", interactionTab: "basics", category: null, editor: null });
      return;
    }
    if (row.kind === "group") editor = { type: "group", id: row.id, system: row.system, tab: "options" };
    else editor = { type: "channel", id: row.id, system: row.system };
    atelier.updateView({ mode: "preset", section: "expressions", scope: row.system ? "system" : "preset", expressionKind: row.kind === "group" ? "groups" : row.kind, editor });
  };
  return (
    <div class="grid min-h-0 content-start gap-4 overflow-y-auto px-2.5 pb-4" data-atelier-order="">
      {guide ? <p class="text-3xs leading-relaxed text-muted-foreground">{ATELIER_HELP.order}</p> : null}
      {(["main", "actor"] as OrderTarget[]).map((target) => {
        const rows = orderRows(doc, system, target);
        const title = target === "main" ? L.order.main : L.order.actor;
        return (
          <section key={target} class="grid gap-1.5" aria-label={title}>
            <header class="flex items-center justify-between gap-2">
              <h3 class="text-3xs font-black uppercase text-muted-foreground">{title}</h3>
              <Button size="sm" variant="ghost" disabled={blocked} onClick={() => atelier.edit((d) => restorePromptOrder(d, target), "auto")}>{L.order.restore}</Button>
            </header>
            {FIXED[target].map((name) => (
              <div key={name} class="flex h-7 items-center gap-2 rounded-sm px-2 text-2xs text-muted-foreground opacity-75">{L.table.systemFixed(name)}</div>
            ))}
            {(["tag", "instruction"] as OrderLane[]).map((lane) => {
              const laneRows = rows.filter((r) => laneOf(r) === lane);
              if (!laneRows.length) return null;
              const laneLabel = lane === "tag" ? L.order.tagLane(title) : L.order.textLane(title);
              return (
                <ol key={lane} class="grid gap-0.5" aria-label={laneLabel} data-atelier-order-lane={`${target}:${lane}`}>
                  {laneRows.map((row, index) => (
                    <li key={row.key} data-atelier-reorder-row="" data-atelier-order-row={row.key} class={`flex h-8 items-center gap-1.5 rounded-sm bg-surface-control/60 px-1 text-2xs ${row.enabled ? "" : "opacity-55"}`}>
                      <ReorderHandle name={row.id} index={index} count={laneRows.length} disabled={blocked} onMove={(from, to) => atelier.edit((d) => movePromptOrder(d, system, target, lane, laneRows[from]!.key, laneRows[to]!.key), "auto")} />
                      <Badge>{KIND_LABEL[row.kind]}</Badge>
                      <button type="button" class="min-w-0 flex-1 truncate text-left font-mono outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/55" onClick={() => open(row)}>
                        {row.kind === "interaction" ? L.order.interactionRow : row.id}{row.enabled ? "" : L.order.disabled}
                      </button>
                      {row.system ? <span class="text-3xs text-muted-foreground">{L.table.system}</span> : null}
                    </li>
                  ))}
                </ol>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
