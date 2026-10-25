import { useEffect, useRef, useState } from "preact/hooks";
import type { PersonaFormSelection } from "../../shared/contract/rpc.js";
import { useAppState, type AppController } from "../state/app-state.js";
import { Button, Select } from "./ui/index.js";

/** Keyed by chat so pending responses from the previous chat cannot update this control. */
export function PersonaFormControl({ app, chatId }: { app: AppController; chatId: string }) {
  const status = useAppState((s) => s.status);
  const config = useAppState((s) => s.config);
  const settings = useAppState((s) => s.chatImageGeneration);
  const revision = useAppState((s) => s.chatDataRevision[chatId] ?? 0);
  const [value, setValue] = useState<PersonaFormSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const request = useRef(0);
  useEffect(() => {
    const id = ++request.current;
    setBusy(true);
    void app.call("personaForm.get", { chatId }).then((next) => {
      if (id === request.current) { setValue(next); setError(""); }
    }).catch((e: unknown) => {
      if (id === request.current) setError(e instanceof Error ? e.message : String(e));
    }).finally(() => { if (id === request.current) setBusy(false); });
    return () => { ++request.current; };
  }, [app, chatId, status, config, settings, revision, reload]);

  const save = async (formId: string) => {
    if (!value?.personaId || busy) return;
    const id = ++request.current;
    setBusy(true);
    try {
      const next = await app.call("personaForm.set", { chatId, personaId: value.personaId, formId: formId === "" ? null : formId });
      if (id === request.current) { setValue(next); setError(""); }
    } catch (e) {
      if (id === request.current) { setError(e instanceof Error ? e.message : String(e)); setValue(null); }
    } finally {
      if (id === request.current) setBusy(false);
    }
  };
  return (
    <section class="grid gap-1.5 rounded-md bg-card px-3 py-2">
      <label class="text-xs font-bold" htmlFor="ii-persona-form">Persona form{value?.personaName ? ` · ${value.personaName}` : ""}</label>
      <Select native id="ii-persona-form" aria-label="Persona form" placeholder="" value={value?.selectedFormId ?? ""} disabled={busy || !value?.personaId || (!value.supported && !value.selectedFormId) || !!error}
        options={[{ value: "", label: "Auto" }, ...(value?.missingForm && value.selectedFormId ? [{ value: value.selectedFormId, label: "Removed form (choose again)", disabled: true }] : []), ...(value?.forms ?? []).map((f) => ({ value: f.id, label: f.label, disabled: !value?.supported }))]}
        onValueChange={(id) => void save(id)} />
      <p class="text-2xs text-muted-foreground">{busy ? "Loading…" : !value?.personaId ? "No active persona." : !value.supported ? "Manual selection is available for V5 illustrations." : "This chat only. Applies to the next scene analysis; saved image prompts keep their original form."}</p>
      {value?.missingForm ? <p role="alert" class="text-2xs text-destructive">The saved form was removed. Choose a form or Auto before generating.</p> : null}
      {error ? <div><p role="alert" class="text-2xs text-destructive">{error}</p><Button variant="subtle" onClick={() => setReload((n) => n + 1)}>Reload forms</Button></div> : null}
    </section>
  );
}
