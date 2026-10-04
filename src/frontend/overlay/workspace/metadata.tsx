/**
 * Asset metadata badge `CT` (96950) and inspector panel `Iit` (96992), shown as a dialog in the port.
 * Field builder follows `yit` (96863): provider, size, main/negative prompt, per-character prompts/coordinates, comment.
 */
import { useEffect, useState } from "preact/hooks";
import type { AssetRef, MetadataSummary } from "../../../shared/contract/character.js";
import { useApp } from "../../state/app-state.js";
import { Dialog } from "../ui/index.js";
import { COMMON_LABELS, METADATA_LABELS } from "./labels/common.js";
import { OverlayBadge, Spinner } from "./parts.js";

export interface MetaField { key: string; label: string; kind: "input" | "textarea"; value: string }

function text(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value.replace(/\s+/gu, " ").trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

/** Builds the displayed fields from a metadata summary (first non-empty wins per field). */
export function metadataFields(summary: MetadataSummary | null): MetaField[] {
  if (!summary) return [];
  const s = summary as Record<string, unknown>;
  const L = METADATA_LABELS.fields;
  const out: MetaField[] = [];
  const add = (key: string, label: string, value: unknown, kind: MetaField["kind"] = "textarea") => {
    const v = text(value);
    if (v) out.push({ key, label, kind, value: v });
  };
  add("provider", L.provider, s.provider, "input");
  const w = Number(s.width), h = Number(s.height);
  if (w > 0 && h > 0) out.push({ key: "size", label: L.size, kind: "input", value: `${w} x ${h}` });
  add("main", L.main, s.prompt ?? s.description ?? s.mainPrompt);
  add("negative", L.negative, s.negativePrompt ?? s.uc);
  const characters = Array.isArray(s.characterPrompts) ? (s.characterPrompts as Record<string, unknown>[]) : [];
  characters.forEach((c, i) => {
    add(`char-${i}`, L.characterPrompt(i + 1), c.prompt);
    add(`char-${i}-neg`, L.characterNegative(i + 1), c.negative ?? c.uc);
    const center = c.center as { x?: number; y?: number } | undefined;
    if (center && typeof center.x === "number" && typeof center.y === "number") out.push({ key: `char-${i}-xy`, label: L.characterCoords(i + 1), kind: "input", value: `${center.x}, ${center.y}` });
  });
  add("comment", L.comment, s.comment);
  return out;
}

/** "None" / "Present" pill; with metadata it opens the inspector. */
export function MetadataBadge({ asset, hasMetadata, characterId }: { asset: AssetRef; hasMetadata: boolean | undefined; characterId: string | null }) {
  const [open, setOpen] = useState(false);
  if (hasMetadata === undefined) return null;
  if (!hasMetadata) return <OverlayBadge tone="danger">{METADATA_LABELS.none}</OverlayBadge>;
  return (
    <>
      <button type="button" aria-label={METADATA_LABELS.viewOf(asset.name)} title={METADATA_LABELS.view} onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        class="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-background/82 px-1.5 py-0.5 text-3xs font-semibold text-success outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-ring/55" data-metadata-badge="">
        {METADATA_LABELS.present}
      </button>
      {open ? <MetadataInspector asset={asset} characterId={characterId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function MetadataInspector({ asset, characterId, onClose }: { asset: AssetRef; characterId: string | null; onClose: () => void }) {
  const app = useApp();
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; fields: MetaField[]; error?: string }>({ status: "loading", fields: [] });
  useEffect(() => {
    app.call("assets.inspectMetadata", { characterId: characterId ?? "", asset })
      .then((r) => setState({ status: "ready", fields: r.hasMetadata ? metadataFields(r.summary) : [] }))
      .catch((e: unknown) => setState({ status: "error", fields: [], error: e instanceof Error ? e.message : METADATA_LABELS.readFailed }));
  }, [asset.key, asset.name]);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }} title={asset.name} closeLabel={METADATA_LABELS.close} className="w-[min(640px,calc(100%-32px))]">
      <section aria-label={METADATA_LABELS.sectionOf(asset.name)} class="grid max-h-[60vh] gap-2 overflow-y-auto" data-metadata-inspector="">
        {state.status === "loading" ? <p class="flex items-center gap-2 text-xs text-muted-foreground"><Spinner />{METADATA_LABELS.loading}</p>
          : state.status === "error" ? <p class="text-xs text-destructive">{state.error ?? METADATA_LABELS.readFailed}</p>
          : state.fields.length === 0 ? <p class="text-xs text-muted-foreground">{METADATA_LABELS.empty}</p>
          : state.fields.map((field) => field.kind === "input" ? (
            <label key={field.key} class="grid gap-1 text-2xs font-bold text-muted-foreground">
              {field.label}
              <input readOnly value={field.value} class="h-8 rounded-md bg-input px-2.5 text-xs text-foreground outline-none" />
            </label>
          ) : (
            <div key={field.key} class="grid gap-1 rounded-md bg-card p-2.5">
              <strong class="text-2xs font-bold">{field.label}</strong>
              <pre class="whitespace-pre-wrap break-words font-sans text-2xs leading-relaxed text-muted-foreground">{field.value}</pre>
            </div>
          ))}
      </section>
      <span class="sr-only">{COMMON_LABELS.close}</span>
    </Dialog>
  );
}
