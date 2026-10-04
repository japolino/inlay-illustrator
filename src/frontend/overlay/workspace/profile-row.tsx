/**
 * Prompt profile row shared by the Prompts tab (AM `Pct` 103997) and the Persona tab (AM `g_t` 147580):
 * reference card, form header/editor, structured base prompt, gender, row analysis, reset, negative prompt.
 * Text edits go to the form draft (saved by the dock "Save" button); toggles are saved at once.
 */
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import {
  addForm,
  deleteForm,
  patchForm,
  setDefaultForm,
  type AssetRef,
  type FormCollection,
  type Gender
} from "../../../shared/contract/character.js";
import type { WorkspaceCtx } from "./context.js";
import { formSaver } from "./data.js";
import { useFormDraftView } from "./drafts.js";
import { BasePromptEditor, FormEditor, FormHeader, NegativeEditor, PromptRowLayout, ReferenceCard, useFormEditorState } from "./form-editor.js";
import { COMMON_LABELS, GENDER_LABELS } from "./labels/common.js";
import { findForm, formAnalysisEnabled, formReferenceEnabled, triState } from "./model.js";
import { GenderToggle, ImageViewer, LabeledCheckbox } from "./parts.js";

/** Sets `referenceAnalysisEnabled` on every reference entry (forms + outfits) (AM `_me` 93750). */
export function setAllAnalysis(collection: FormCollection, enabled: boolean): FormCollection {
  return {
    ...collection,
    forms: collection.forms.map((form) => ({
      ...form,
      reference: { ...(form.reference ?? {}), referenceAnalysisEnabled: enabled },
      outfits: form.outfits.map((o) => ({ ...o, referenceAnalysisEnabled: enabled }))
    }))
  };
}

export function analysisStates(collection: FormCollection): boolean[] {
  return collection.forms.flatMap((form) => [formAnalysisEnabled(form), ...form.outfits.filter((o) => o.referenceAsset).map((o) => o.referenceAnalysisEnabled !== false)]);
}

export interface ProfileRowProps {
  ctx: WorkspaceCtx;
  rowKey: string;
  draftKey: string;
  source: FormCollection;
  title: ComponentChildren;
  titleText: string;
  titleStart?: ComponentChildren;
  titleEnd?: ComponentChildren;
  exclusionAction?: ComponentChildren;
  /** Extra header actions before Reference/Analysis (promote) and after (outfit button). */
  leadingActions?: ComponentChildren;
  trailingActions?: ComponentChildren;
  hidden: boolean;
  selected: boolean;
  onActivate?: () => void;
  referenceVisible: boolean;
  referencesEnabled: boolean;
  referenceTitle?: string;
  referenceAsset: (collection: FormCollection, formId: string) => AssetRef | null;
  referenceFallbackUrl?: string | null;
  onOpenReference: (formId: string) => void;
  onCropReference?: (formId: string) => void;
  genderLabel: string;
  resetLabel: string;
  evidenceText: boolean;
  reclass: boolean;
  commandLocked: boolean;
  identityActions?: (formId: string) => ComponentChildren;
}

export function ProfileRow(props: ProfileRowProps) {
  const { ctx, rowKey, draftKey, source } = props;
  const { drafts, app, characterId, sessions, session } = ctx;
  const draft = useFormDraftView(drafts, draftKey, source);
  const collection = draft.value;
  const formId = session.formSelection[rowKey] ?? collection.defaultFormId;
  const form = findForm(collection, formId);
  const [zoomUrl, setZoomUrl] = useState<string | null>(null);
  const save = formSaver(app);
  const edit = (fn: (c: FormCollection) => FormCollection) => drafts.edit(draftKey, source, fn);
  const commit = (fn: (c: FormCollection) => FormCollection) => void drafts.commit(draftKey, source, fn, save);
  const selectForm = (id: string) => sessions.update(characterId, (s) => ({ formSelection: { ...s.formSelection, [rowKey]: id } }));
  const editor = useFormEditorState(
    form,
    (input) => {
      let created = "";
      edit((c) => {
        const r = addForm(c, { label: input.label, description: input.description, humanlike: input.humanlike, gender: "unknown" });
        created = r.formId;
        return r.collection;
      });
      if (created) selectForm(created);
    },
    (id, input) => edit((c) => patchForm(c, id, input))
  );
  const referenceAsset = props.referenceAsset(collection, form.id);
  const analysisList = analysisStates(collection);
  const analyzable = props.reclass || collection.forms.some((f) => !!f.reference?.defaultAsset) || !!referenceAsset;
  const textTitle = props.evidenceText && !props.reclass ? COMMON_LABELS.notTextApplied : undefined;
  const showAnalysis = props.referenceVisible || props.reclass;

  const actions = (
    <>
      {props.leadingActions}
      {props.referenceVisible ? (
        <LabeledCheckbox label={COMMON_LABELS.reference} background="control" title={props.referenceTitle} disabled={!props.referencesEnabled}
          checked={formReferenceEnabled(form)} onCheckedChange={(v) => commit((c) => { const f = findForm(c, form.id); return patchForm(c, f.id, { reference: { ...(f.reference ?? {}), enabled: v } }); })} />
      ) : null}
      {showAnalysis ? (
        <LabeledCheckbox label={COMMON_LABELS.analyze} background="control" title={textTitle} disabled={props.commandLocked || !analyzable}
          checked={triState(analysisList)} onCheckedChange={(v) => commit((c) => setAllAnalysis(c, v))} />
      ) : null}
      {props.trailingActions}
    </>
  );

  return (
    <>
      <PromptRowLayout
        rowId={rowKey}
        title={props.title}
        titleStart={props.titleStart}
        titleEnd={props.titleEnd}
        exclusionAction={props.exclusionAction}
        selected={props.selected}
        hidden={props.hidden}
        onActivate={props.onActivate}
        actions={actions}
        referenceVisible={props.referenceVisible}
        referenceCard={
          <ReferenceCard
            asset={referenceAsset}
            fallbackUrl={props.referenceFallbackUrl}
            selectLabel={COMMON_LABELS.selectReferenceOf(props.titleText)}
            onSelect={() => props.onOpenReference(form.id)}
            onCrop={props.onCropReference && referenceAsset ? () => props.onCropReference!(form.id) : undefined}
            onZoom={setZoomUrl}
          />
        }
        formHeader={
          <FormHeader
            collection={collection}
            formId={form.id}
            onSelect={selectForm}
            onSetDefault={(id) => edit((c) => setDefaultForm(c, id))}
            onDelete={(id) => { edit((c) => deleteForm(c, id)); selectForm(collection.defaultFormId); }}
            editor={editor.editor}
            onBeginEdit={editor.beginEdit}
            onBeginAdd={editor.beginAdd}
            onCancel={editor.cancel}
            onSave={editor.save}
          />
        }
        formEditor={editor.editor ? <FormEditor editor={editor.editor} onChange={editor.change} onCancel={editor.cancel} onSave={editor.save} /> : undefined}
        basePromptEditor={
          <BasePromptEditor groups={form.basePromptGroups} gender={form.gender} identityActions={props.identityActions?.(form.id)}
            onChange={(groups) => edit((c) => patchForm(c, form.id, { basePromptGroups: groups }))} />
        }
        genderControl={<GenderToggle value={form.gender} label={props.genderLabel} onChange={(g: Gender) => commit((c) => patchForm(c, form.id, { gender: g }))} />}
        rowAnalysisControl={showAnalysis ? (
          <LabeledCheckbox label={COMMON_LABELS.analyze} className="px-1.5" title={textTitle} disabled={props.commandLocked || (!props.reclass && !referenceAsset)}
            checked={formAnalysisEnabled(form)} onCheckedChange={(v) => commit((c) => { const f = findForm(c, form.id); return patchForm(c, f.id, { reference: { ...(f.reference ?? {}), referenceAnalysisEnabled: v } }); })} />
        ) : undefined}
        resetLabel={props.resetLabel}
        onReset={() => edit((c) => patchForm(c, form.id, { basePromptGroups: {}, negativePrompt: "" }))}
        negativePromptEditor={<NegativeEditor value={form.negativePrompt} onChange={(v) => edit((c) => patchForm(c, form.id, { negativePrompt: v }))} />}
      />
      <ImageViewer open={!!zoomUrl} url={zoomUrl} alt={props.titleText} onClose={() => setZoomUrl(null)} />
    </>
  );
}

export { GENDER_LABELS };
