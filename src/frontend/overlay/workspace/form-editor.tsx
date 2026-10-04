/**
 * Form / base prompt editing blocks shared by the Prompts and Persona tabs:
 * form header `Ape` (97382), form editor `kpe` (97323) + hook `Ppe` (97559), structured base prompt editor
 * `Fat` (95568) with fields `Zme`/`Dat`, negative prompt field `_pe` (97283), reference card `vpe` (97090),
 * and the prompt row layout `hce` (62978).
 */
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { APPEARANCE_UI, type AssetRef, type BasePromptGroups, type Form, type FormCollection, type Gender } from "../../../shared/contract/character.js";
import { Button, CheckIcon, IconButton, PencilIcon, PlusIcon, MoreIcon, Select, XIcon, cn } from "../ui/index.js";
import { CropIcon, ImagePlusIcon, RotateCcwIcon, ZoomInIcon } from "./icons.js";
import { BASE_PROMPT_LABELS, COMMON_LABELS, FORM_LABELS, GENDER_LABELS } from "./labels/common.js";
import { catalogOptions, composedPrompt, formDisplayLabel, joinTags, splitTags } from "./model.js";
import { AssetImage, Checkbox, Menu, OverlayBadge, WorkbenchRow, useAssetUrl } from "./parts.js";

/* ------------------------------------------------------------------------------------------------
 * Form header + editor
 * ---------------------------------------------------------------------------------------------- */

export interface FormDraftInput { label: string; description: string; humanlike: boolean }
export type FormEditorState = ({ kind: "add" | "edit" } & FormDraftInput) | null;

function formSubtitle(form: Form): string {
  const kind = form.humanlike ? FORM_LABELS.humanlike : FORM_LABELS.freeform;
  const gender = form.gender === "female" ? GENDER_LABELS.female : form.gender === "male" ? GENDER_LABELS.male : GENDER_LABELS.unknownShort;
  return `${kind} · ${gender} · ${FORM_LABELS.outfitsCount(form.outfits.length)}`;
}

/** Form select + actions (`Ape`). In draft mode shows the editor title with cancel/save. */
export function FormHeader({ collection, formId, onSelect, onSetDefault, onDelete, editor, onBeginEdit, onBeginAdd, onCancel, onSave }: {
  collection: FormCollection;
  formId: string;
  onSelect: (formId: string) => void;
  onSetDefault: (formId: string) => void;
  onDelete: (formId: string) => void;
  editor: FormEditorState;
  onBeginEdit: () => void;
  onBeginAdd: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setConfirmDelete(false), [formId]);
  const form = collection.forms.find((f) => f.id === formId) ?? collection.forms[0]!;
  const isDefault = form.id === collection.defaultFormId;
  if (editor) {
    return (
      <div class="flex h-7.5 min-w-0 items-center gap-1 max-md:h-11" data-form-header="draft">
        <span class="min-w-0 flex-1 truncate text-2xs font-bold text-muted-foreground">{editor.kind === "add" ? FORM_LABELS.addForm : FORM_LABELS.editTitle(formDisplayLabel(form.label))}</span>
        <IconButton size="workbenchIcon" label={COMMON_LABELS.cancel} onClick={onCancel}><XIcon /></IconButton>
        <IconButton size="workbenchIcon" variant="subtle" label={COMMON_LABELS.save} disabled={!editor.label.trim()} onClick={onSave}><CheckIcon /></IconButton>
      </div>
    );
  }
  const options = collection.forms.map((f) => {
    const label = formDisplayLabel(f.label);
    return { value: f.id, label: `${FORM_LABELS.prefix} ${f.id === collection.defaultFormId ? `★ ${label}` : label}`, description: formSubtitle(f) };
  });
  return (
    <div class="flex h-7.5 min-w-0 items-center gap-1 max-md:h-11" data-form-header="">
      <div class="min-w-0 flex-1" title={isDefault ? FORM_LABELS.defaultTitle(formDisplayLabel(form.label)) : undefined}>
        <Select value={form.id} options={options} onValueChange={onSelect} aria-label={FORM_LABELS.select} className="h-7.5 bg-surface-prompt-field text-2xs" />
      </div>
      {!isDefault ? (
        confirmDelete ? (
          <Button size="sm" variant="danger" aria-label={FORM_LABELS.deleteConfirmAria(form.outfits.length)} title={FORM_LABELS.deleteConfirmTitle(form.outfits.length)} onClick={() => { setConfirmDelete(false); onDelete(form.id); }}>
            {FORM_LABELS.deleteConfirm(form.outfits.length)}
          </Button>
        ) : (
          <Menu label={FORM_LABELS.actions} trigger={<MoreIcon />} items={[
            { id: "default", label: FORM_LABELS.setDefault, onSelect: () => onSetDefault(form.id) },
            { id: "delete", label: FORM_LABELS.deleteForm, destructive: true, onSelect: () => setConfirmDelete(true) }
          ]} />
        )
      ) : null}
      <IconButton size="workbenchIcon" label={FORM_LABELS.editForm} onClick={onBeginEdit}><PencilIcon /></IconButton>
      <IconButton size="workbenchIcon" label={FORM_LABELS.addForm} onClick={onBeginAdd}><PlusIcon /></IconButton>
    </div>
  );
}

/** Form add/edit body (`kpe`): Esc cancels, Enter in name or Ctrl/Cmd+Enter saves. */
export function FormEditor({ editor, onChange, onCancel, onSave }: { editor: NonNullable<FormEditorState>; onChange: (patch: Partial<FormDraftInput>) => void; onCancel: () => void; onSave: () => void }) {
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); }
    else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onSave(); }
  };
  return (
    <section aria-label={editor.kind === "add" ? FORM_LABELS.addForm : FORM_LABELS.editForm} class="grid h-full min-h-0 content-start gap-2 overflow-y-auto rounded-md bg-surface-prompt-field p-2.5" onKeyDown={onKeyDown} data-form-editor="">
      <label class="grid gap-1 text-2xs font-bold text-muted-foreground">
        {FORM_LABELS.name}
        <input
          ref={nameRef}
          maxLength={80}
          value={editor.label}
          onInput={(e) => onChange({ label: (e.currentTarget as HTMLInputElement).value })}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); onSave(); } }}
          class="h-8 rounded-md bg-input px-2.5 text-xs font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/55"
        />
      </label>
      <span class="inline-flex items-center gap-2 text-2xs font-bold text-secondary-foreground" title={FORM_LABELS.humanlikeTitle}>
        <Checkbox checked={editor.humanlike} label={FORM_LABELS.humanlike} onCheckedChange={(v) => onChange({ humanlike: v })} />
        {FORM_LABELS.humanlike}
      </span>
      <label class="grid gap-1 text-2xs font-bold text-muted-foreground">
        {FORM_LABELS.description}
        <textarea maxLength={240} placeholder={FORM_LABELS.descriptionPlaceholder} value={editor.description} onInput={(e) => onChange({ description: (e.currentTarget as HTMLTextAreaElement).value })}
          class="min-h-14 resize-none rounded-md bg-input px-2.5 py-2 text-2xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/55" />
      </label>
    </section>
  );
}

/** Editor state hook (`Ppe`): draft resets when the selected form changes. */
export function useFormEditorState(form: Form, onAdd: (input: FormDraftInput) => void, onEdit: (formId: string, input: FormDraftInput) => void) {
  const [editor, setEditor] = useState<FormEditorState>(null);
  useEffect(() => setEditor(null), [form.id]);
  return {
    editor,
    beginEdit: () => setEditor({ kind: "edit", label: form.label, description: form.description, humanlike: form.humanlike }),
    beginAdd: () => setEditor({ kind: "add", label: "", description: "", humanlike: form.humanlike }),
    change: (patch: Partial<FormDraftInput>) => setEditor((e) => (e ? { ...e, ...patch } : e)),
    cancel: () => setEditor(null),
    save: () => {
      if (!editor) return;
      const input = { label: editor.label.trim(), description: editor.description.trim(), humanlike: editor.humanlike };
      if (!input.label) return;
      if (editor.kind === "add") onAdd(input);
      else onEdit(form.id, input);
      setEditor(null);
    }
  };
}

/* ------------------------------------------------------------------------------------------------
 * Structured base prompt editor (`Fat`)
 * ---------------------------------------------------------------------------------------------- */

const GROUPS = APPEARANCE_UI.APPEARANCE_FIELD_GROUPS_UI;
const EMPTY = APPEARANCE_UI.APPEARANCE_EMPTY_OPTION_SENTINEL;

/** Tag text input: keeps the typed text while focused, commits parsed tags on every input (`Zme`). */
function TagInput({ values, onChange, placeholder, label, multiline = false, className, readOnly }: { values: string[]; onChange: (values: string[]) => void; placeholder: string; label: string; multiline?: boolean; className?: string; readOnly?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? joinTags(values);
  const props = {
    value: shown,
    placeholder,
    "aria-label": label,
    readOnly,
    onFocus: () => setText(joinTags(values)),
    onBlur: () => setText(null),
    onInput: (event: Event) => {
      const value = (event.currentTarget as HTMLInputElement).value;
      setText(value);
      onChange(splitTags(value));
    },
    class: cn("w-full min-w-0 rounded-md bg-surface-prompt-field px-2.5 text-2xs text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/55 max-md:text-sm", multiline ? "h-full min-h-0 resize-none py-2 leading-relaxed" : "h-7.5 max-md:h-11", className)
  };
  return multiline ? <textarea {...props} /> : <input {...props} />;
}

export function BasePromptEditor({ groups, gender, onChange, identityActions, readOnly }: { groups: BasePromptGroups; gender: Gender; onChange: (groups: BasePromptGroups) => void; identityActions?: ComponentChildren; readOnly?: boolean }) {
  const [tab, setTab] = useState("final");
  const group = GROUPS.find((g) => g.id === tab) ?? GROUPS[0]!;
  const L = BASE_PROMPT_LABELS;
  const set = (fieldId: string, values: string[]) => {
    const next = { ...groups } as Record<string, string[]>;
    if (values.length) next[fieldId] = values;
    else delete next[fieldId];
    onChange(next as BasePromptGroups);
  };
  let body: ComponentChildren;
  if (group.id === "final") {
    body = <textarea readOnly aria-label={L.combined} value={composedPrompt({ basePromptGroups: groups, gender })} class="h-full min-h-0 w-full resize-none rounded-md bg-surface-prompt-field px-2.5 py-2 text-2xs leading-relaxed text-muted-foreground outline-none" />;
  } else if (group.fallbackFieldId) {
    // Flat textarea editing all fields of the group (`pje` join / `hje` split: fragments go to "custom" unless they are known per-field tags).
    const fieldIds = group.fields.map((f) => f.id);
    const all = fieldIds.flatMap((id) => (groups as Record<string, string[]>)[id] ?? []);
    body = (
      <TagInput
        multiline
        readOnly={readOnly}
        label={L.groupPrompt(L.groups[group.id] ?? group.label)}
        placeholder={L.otherGroupPlaceholder}
        values={all}
        onChange={(values) => {
          const next = { ...groups } as Record<string, string[]>;
          const known = new Map<string, string>();
          for (const id of fieldIds) for (const v of (groups as Record<string, string[]>)[id] ?? []) known.set(v, id);
          for (const id of fieldIds) delete next[id];
          for (const v of values) {
            const id = known.get(v) ?? group.fallbackFieldId!;
            (next[id] ??= []).push(v);
          }
          onChange(next as BasePromptGroups);
        }}
      />
    );
  } else {
    body = (
      <div class="grid content-start gap-1.5 overflow-y-auto" data-base-prompt-fields="">
        {group.fields.map((field) => {
          const meta = L.fields[field.id] ?? { label: field.label, placeholder: field.placeholder };
          const values = (groups as Record<string, string[]>)[field.id] ?? [];
          const options = catalogOptions(field.id);
          const control = options.length ? (
            <div class="min-w-0 flex-1" title={field.id === "body.breast_size" && gender === "male" ? L.breastMaleTitle : undefined}>
              <Select
                value={values[0] ?? EMPTY}
                options={[{ value: EMPTY, label: L.none }, ...options]}
                onValueChange={(v) => set(field.id, v === EMPTY ? [] : [v])}
                disabled={readOnly || (field.id === "body.breast_size" && gender === "male")}
                aria-label={meta.label}
                placeholder={meta.placeholder}
                className="h-7.5 bg-surface-prompt-field text-2xs"
              />
            </div>
          ) : (
            <TagInput values={values} onChange={(v) => set(field.id, v)} placeholder={meta.placeholder || L.tagPlaceholder} label={meta.label} readOnly={readOnly} />
          );
          return (
            <div key={field.id} class="grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2">
              <span class="truncate text-2xs font-bold text-muted-foreground">{meta.label}</span>
              <div class="flex min-w-0 items-center gap-1">
                {control}
                {field.id === "identity.character_tag" ? identityActions : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <section aria-label={L.section} class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-1.5" data-base-prompt-editor="">
      <nav aria-label={L.nav} class="scrollbar-none flex min-w-0 gap-0.5 overflow-x-auto">
        {GROUPS.map((g) => (
          <button key={g.id} type="button" aria-pressed={g.id === tab} onClick={() => setTab(g.id)}
            class={cn("h-6 shrink-0 rounded px-2 text-3xs font-bold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55 max-md:h-9 max-md:text-2xs", g.id === tab && "bg-selected text-selected-foreground")}>
            {L.groups[g.id] ?? g.label}
          </button>
        ))}
      </nav>
      {body}
    </section>
  );
}

/** Negative prompt textarea with caption (`kct` / `_pe`). */
export function NegativeEditor({ value, onChange, label }: { value: string; onChange: (value: string) => void; label?: string }) {
  return (
    <div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_1.5rem] overflow-hidden rounded-md bg-surface-prompt-field" data-negative-editor="">
      <textarea aria-label={label ?? FORM_LABELS.negativeCaption} value={value} onInput={(e) => onChange((e.currentTarget as HTMLTextAreaElement).value)}
        class="min-h-0 w-full resize-none bg-transparent px-2.5 py-2 text-2xs leading-relaxed text-foreground outline-none" />
      <span class="flex items-center justify-end px-2.5 text-3xs font-bold text-muted-foreground">{FORM_LABELS.negativeCaption}</span>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Reference card (`vpe`)
 * ---------------------------------------------------------------------------------------------- */

export function ReferenceCard({ asset, fallbackUrl, selectLabel, onSelect, onCrop, onZoom, badge = COMMON_LABELS.reference, className, metadataBadge }: {
  asset: AssetRef | null;
  fallbackUrl?: string | null;
  selectLabel: string;
  onSelect?: () => void;
  onCrop?: () => void;
  onZoom?: (url: string | null) => void;
  badge?: string;
  className?: string;
  metadataBadge?: ComponentChildren;
}) {
  const url = useAssetUrl(asset);
  const shown = url ?? fallbackUrl ?? null;
  const hasCrop = !!(asset?.cropReference && typeof asset.cropReference === "object");
  const name = asset?.name ?? "";
  return (
    <div class={cn("group/ref relative h-full min-h-0 w-full overflow-hidden rounded-md bg-surface-control", className)} data-reference-card="">
      <button type="button" class="absolute inset-0 grid place-items-center outline-none focus-visible:ring-2 focus-visible:ring-ring/55" aria-label={selectLabel} title={COMMON_LABELS.selectReference} onClick={onSelect} disabled={!onSelect}>
        {shown ? <img src={shown} alt="" class="size-full object-cover" draggable={false} /> : <ImagePlusIcon className="size-6 text-muted-foreground" />}
      </button>
      {asset || fallbackUrl ? <OverlayBadge tone="primary" className="pointer-events-none absolute top-1.5 left-1.5">{badge}</OverlayBadge> : null}
      {asset && onCrop ? (
        <IconButton size="icon" label={COMMON_LABELS.cropOf(name)} title={COMMON_LABELS.crop} onClick={onCrop}
          className={cn("absolute top-1 right-1 size-7 bg-background/70 text-foreground hover:bg-background/90", hasCrop && "opacity-0 group-hover/ref:opacity-100 focus-visible:opacity-100")}>
          <CropIcon />
        </IconButton>
      ) : null}
      {shown && onZoom ? (
        <IconButton size="icon" label={COMMON_LABELS.zoomOf(name || selectLabel)} title={COMMON_LABELS.zoom} onClick={() => onZoom(shown)} className="absolute bottom-1 left-1 size-7 bg-background/70 text-foreground hover:bg-background/90">
          <ZoomInIcon />
        </IconButton>
      ) : null}
      {metadataBadge ? <span class="absolute right-1 bottom-1">{metadataBadge}</span> : null}
    </div>
  );
}

/** Reference thumbnail used inside AssetImage-based cards. */
export { AssetImage };

/* ------------------------------------------------------------------------------------------------
 * Prompt row layout (`hce`)
 * ---------------------------------------------------------------------------------------------- */

export function PromptRowLayout({ title, titleStart, titleEnd, exclusionAction, selected, hidden, onActivate, actions, referenceVisible, referenceCard, formHeader, formEditor, basePromptEditor, genderControl, rowAnalysisControl, resetLabel, onReset, negativePromptEditor, rowId }: {
  title: ComponentChildren;
  titleStart?: ComponentChildren;
  titleEnd?: ComponentChildren;
  exclusionAction?: ComponentChildren;
  selected: boolean;
  hidden?: boolean;
  onActivate?: () => void;
  actions: ComponentChildren;
  referenceVisible: boolean;
  referenceCard?: ComponentChildren;
  formHeader: ComponentChildren;
  formEditor?: ComponentChildren;
  basePromptEditor: ComponentChildren;
  genderControl: ComponentChildren;
  rowAnalysisControl?: ComponentChildren;
  resetLabel: string;
  onReset: () => void;
  negativePromptEditor: ComponentChildren;
  rowId?: string;
}) {
  return (
    <WorkbenchRow
      title={title}
      titleStart={titleStart}
      titleEnd={titleEnd}
      exclusionAction={exclusionAction}
      active={selected}
      hidden={hidden}
      data-prompt-key={rowId}
      actions={<div class="flex w-max shrink-0 items-center gap-1.5 md:gap-2" data-prompt-row-actions="">{actions}</div>}
      className="@container"
      bodyClassName="@max-[40rem]:h-auto @max-[40rem]:max-h-none"
    >
      <div
        class={cn(
          "grid size-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-2 @max-[40rem]:grid-rows-none",
          referenceVisible ? "grid-cols-[9rem_minmax(0,1fr)_11.875rem] @max-[40rem]:grid-cols-[6rem_minmax(0,1fr)]" : "grid-cols-[minmax(0,1fr)_11.875rem] @max-[40rem]:grid-cols-1"
        )}
        data-prompt-row-layout=""
        onFocusCapture={onActivate}
        onPointerDownCapture={onActivate}
      >
        {referenceVisible ? <div class="row-span-2 min-h-0 min-w-0 @max-[40rem]:h-36" data-prompt-reference-slot="">{referenceCard}</div> : null}
        <div class="min-w-0 @max-[40rem]:self-start" data-prompt-form-header="">{formHeader}</div>
        <div class="grid h-7.5 min-w-0 grid-cols-[minmax(0,1fr)_auto_2.5rem] items-center max-md:h-11 @max-[40rem]:col-start-2 @max-[40rem]:self-start" data-prompt-row-controls="">
          <div class="min-w-0">{genderControl}</div>
          {rowAnalysisControl != null ? <div class="ml-1.5 md:ml-2">{rowAnalysisControl}</div> : <span />}
          <IconButton size="workbenchIcon" label={resetLabel} onClick={onReset}><RotateCcwIcon /></IconButton>
        </div>
        <div class="h-full min-h-0 min-w-0 @max-[40rem]:col-span-full @max-[40rem]:h-44" data-prompt-main-editor="">{formEditor ?? basePromptEditor}</div>
        <div class="h-full min-h-0 min-w-0 @max-[40rem]:col-span-full @max-[40rem]:h-28" data-prompt-negative-editor="">{negativePromptEditor}</div>
      </div>
    </WorkbenchRow>
  );
}
