/**
 * Unique tag search pane (AM `Ect` 104771 + `Nct` dock). The Danbooru search service is an optional later
 * feature (PORT-PLAN); this stub lists the prompt characters with their current character tag and says the
 * search is not available yet.
 */
import { useWorkspaceCtx } from "./context.js";
import { InfoIcon } from "../ui/index.js";
import { UNIQUE_TAG_LABELS } from "./labels/common.js";
import { characterCollection, findForm, formDisplayLabel, isRosterActive, registeredRows } from "./model.js";
import { Badge } from "./parts.js";

export function UniqueTagPanel() {
  const { workspace, session } = useWorkspaceCtx();
  const rows = registeredRows(workspace?.roster ?? []).filter(isRosterActive);
  return (
    <div class="mx-auto grid w-full min-w-0 max-w-190 grid-cols-[minmax(0,1fr)] content-start gap-4 px-5 py-5 mobile:px-3" data-unique-tag-search="">
      <header class="flex min-h-8 items-center justify-between gap-3">
        <h1 class="truncate text-lg leading-tight font-extrabold">{UNIQUE_TAG_LABELS.paneTitle}</h1>
      </header>
      <div role="status" class="flex gap-2 rounded-lg bg-card p-3 text-xs leading-relaxed text-muted-foreground">
        <InfoIcon className="mt-0.5 shrink-0 text-primary" />
        <p>{UNIQUE_TAG_LABELS.unavailable}<br />{UNIQUE_TAG_LABELS.manualHint}</p>
      </div>
      {rows.length === 0 ? <p class="text-center text-xs text-muted-foreground">{UNIQUE_TAG_LABELS.empty}</p> : (
        <ul class="grid gap-1.5" aria-label={UNIQUE_TAG_LABELS.targets}>
          {rows.map((row) => {
            const collection = characterCollection(workspace?.document, row.promptKey);
            const form = findForm(collection, session.formSelection[row.promptKey]);
            const tags = form.basePromptGroups["identity.character_tag"] ?? [];
            return (
              <li key={row.promptKey} class="flex min-w-0 flex-wrap items-center gap-2 rounded-md bg-surface-workbench px-3 py-2" title={`${row.title} · ${formDisplayLabel(form.label)}`}>
                <span class="min-w-0 truncate text-xs font-bold">{row.title} :</span>
                {tags.length ? tags.map((t) => <Badge key={t} tone="success">{t}</Badge>) : <span class="text-2xs text-muted-foreground">{UNIQUE_TAG_LABELS.tagMissing}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
