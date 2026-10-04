/** Model settings page (Asset Maid `axt` panel "model" 143574, message test `K0t` 142288, JEV `B0t` 142469). */
import { useEffect, useRef, useState } from "preact/hooks";
import { THINKING_LEVELS, type InlayConfig, type ReasoningMode, type ThinkingLevel } from "../../../shared/contract/config.js";
import type { LlmConnectionSummary, RpcError } from "../../../shared/contract/rpc.js";
import { useApp, useRpcQuery } from "../../state/app-state.js";
import { toRpcError } from "../../rpc/client.js";
import { Button, IconButton, Select, StopIcon, Switch, TextArea, TextField, cn, type SelectOption } from "../ui/index.js";
import { useConfigForm } from "./config-form.js";
import { CopyIcon, ResetIcon, SendIcon, SpinnerIcon } from "./icons.js";
import { COMMON_LABELS as C, MODEL_LABELS as M, PAGE_TITLES } from "./labels.js";
import { Badge, Card, Column, Columns, ErrorBanner, Field, LoadingBox, NumberField, SaveActions, SettingsFrame, useFieldId } from "./parts.js";

/** Connection select options ("" = the Lumiverse default connection). */
export function llmConnectionOptions(connections: readonly LlmConnectionSummary[], current: string): SelectOption[] {
  const fallback = connections.find((c) => c.isDefault);
  const options: SelectOption[] = [{ value: "", label: fallback ? `${C.connectionDefault} (${fallback.name})` : C.connectionDefault }];
  for (const connection of connections) options.push({ value: connection.id, label: `${connection.name} · ${connection.provider}${connection.model ? ` · ${connection.model}` : ""}` });
  if (current && !connections.some((c) => c.id === current)) options.push({ value: current, label: C.existingValue(current) });
  return options;
}

/** Model select options ("" = the connection's model; the saved model is kept when missing from the list). */
export function modelOptions(models: readonly { id: string; label: string }[], current: string, connectionModel: string): SelectOption[] {
  const options: SelectOption[] = [{ value: "", label: C.connectionModel(connectionModel) }];
  for (const model of models) options.push({ value: model.id, label: model.label || model.id });
  if (current && !models.some((m) => m.id === current)) options.splice(1, 0, { value: current, label: C.existingValue(current) });
  return options;
}

export function ModelSettingsPage() {
  const form = useConfigForm();
  const config = form.config;
  const connections = useRpcQuery("connections.listLlm", {});
  const list = connections.data?.connections ?? [];
  const connectionId = config?.analysis.connectionId ?? "";
  const resolved = list.find((c) => c.id === connectionId) ?? (connectionId ? undefined : list.find((c) => c.isDefault));
  const models = useRpcQuery("connections.listLlmModels", resolved ? { connectionId: resolved.id } : null);
  const ids = { connection: useFieldId("ii-model-connection"), temperature: useFieldId("ii-model-temperature"), timeout: useFieldId("ii-model-timeout"), maxTokens: useFieldId("ii-model-max-tokens") };

  const actions = <SaveActions dirty={form.dirty} saving={form.saving} error={form.error} onSave={() => void form.save()} />;
  if (!config) return <SettingsFrame section="model" title={PAGE_TITLES.model} actions={actions}><LoadingBox /></SettingsFrame>;
  const analysis = config.analysis;
  const reasoningOptions: SelectOption<ReasoningMode>[] = (["inherit", "off", "custom"] as const).map((mode) => ({ value: mode, label: M.reasoningModes[mode] }));
  const effortOptions: SelectOption<ThinkingLevel>[] = THINKING_LEVELS.map((level) => ({ value: level, label: M.efforts[level] }));
  const visionOptions: SelectOption<"auto" | "supported" | "unsupported">[] = (["auto", "supported", "unsupported"] as const).map((v) => ({ value: v, label: M.visions[v] }));

  return (
    <SettingsFrame section="model" title={PAGE_TITLES.model} actions={actions} banner={<ErrorBanner message={form.error} />} className="gap-8">
      <Card data-model-dialog-analysis="">
        <Columns>
          <Column>
            <Field label={M.connection} htmlFor={ids.connection} hint={list.length || connections.loading ? M.connectionHint : M.noConnections}>
              <Select id={ids.connection} aria-label={M.connectionAria} value={analysis.connectionId} options={llmConnectionOptions(list, analysis.connectionId)}
                disabled={connections.loading && !list.length}
                onValueChange={(value) => void form.apply({ analysis: { connectionId: value, model: "" } })} />
            </Field>
            <Field label={M.model} hint={models.loading ? M.modelsLoading : models.error ? M.modelsFailed : undefined}>
              <Select aria-label={M.modelAria} value={analysis.model} options={modelOptions(models.data?.models ?? [], analysis.model, resolved?.model ?? "")}
                onValueChange={(value) => void form.apply({ analysis: { model: value } })} />
            </Field>
            <div class="flex min-h-11 items-center justify-between gap-3 rounded-md bg-surface-prompt-field px-3">
              <span class="grid gap-0.5">
                <span class="text-xs font-bold text-foreground">{M.jsonMode}</span>
                <span class="text-3xs font-medium text-muted-foreground">{M.jsonModeHint}</span>
              </span>
              <Switch aria-label={M.jsonMode} checked={analysis.jsonMode} onCheckedChange={(checked) => void form.apply({ analysis: { jsonMode: checked } })} />
            </div>
          </Column>
          <Column>
            <Field label={M.temperature} htmlFor={ids.temperature}>
              <NumberField id={ids.temperature} value={analysis.temperature} min={0} max={2} step={0.1} onValueChange={(value) => form.draft({ analysis: { temperature: value } })} />
            </Field>
            <div class="grid grid-cols-2 gap-3">
              <Field label={M.reasoning}>
                <Select aria-label={M.reasoningAria} value={analysis.reasoning.mode} options={reasoningOptions}
                  onValueChange={(mode) => void form.apply({ analysis: { reasoning: { mode } } })} />
              </Field>
              <Field label={M.effort}>
                <Select aria-label={M.effort} value={analysis.reasoning.effort} options={effortOptions} disabled={analysis.reasoning.mode !== "custom"}
                  onValueChange={(effort) => void form.apply({ analysis: { reasoning: { mode: "custom", effort } } })} />
              </Field>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <Field label={M.timeout} htmlFor={ids.timeout}>
                <NumberField id={ids.timeout} value={analysis.timeoutMs} min={1000} max={300000} step={1000} onValueChange={(value) => form.draft({ analysis: { timeoutMs: value } })} />
              </Field>
              <Field label={M.maxTokens} htmlFor={ids.maxTokens} hint={M.maxTokensHint}>
                <NumberField id={ids.maxTokens} value={analysis.maxTokens} min={0} step={256} onValueChange={(value) => form.draft({ analysis: { maxTokens: value } })} />
              </Field>
            </div>
            <Field label={M.vision}>
              <Select aria-label={M.vision} value={analysis.vision} options={visionOptions} onValueChange={(vision) => void form.apply({ analysis: { vision } })} />
            </Field>
          </Column>
        </Columns>
      </Card>
      <MessageTest dirty={form.dirty} analysis={form.dirty ? config.analysis : undefined} />
      <Card title={M.jev} end={<Badge>{C.later}</Badge>} className="opacity-60" aria-disabled="true" data-model-jev="">
        <p class="text-xs text-muted-foreground">{M.jevDescription}</p>
        <Field label={M.jevModel}>
          <TextField className="bg-surface-prompt-field" value={config.jevConnection.model} disabled aria-label={M.jevModel} />
        </Field>
        <p class="text-2xs text-muted-foreground">{M.jevLater}</p>
      </Card>
    </SettingsFrame>
  );
}

type TestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; answer: string; latencyMs: number }
  | { status: "error"; message: string }
  | { status: "cancelled" };

/** Maps a test error to the Asset Maid message table (`L0t` 142196). */
export function testErrorMessage(error: RpcError | undefined): string {
  if (!error) return M.sendFailed;
  if (error.code === "timeout") return "Response timed out. Check the timeout setting."; // 응답 시간이 초과되었습니다. 타임아웃 설정을 확인하세요.
  if (error.code === "cancelled") return M.cancelled;
  return error.message || M.sendFailed;
}

/** Message test card (`K0t`). Tests the draft analyzer settings when the page has unsaved changes. */
function MessageTest({ dirty, analysis }: { dirty: boolean; analysis?: InlayConfig["analysis"] }) {
  const app = useApp();
  const [message, setMessage] = useState<string>(M.testDefault);
  const [state, setState] = useState<TestState>({ status: "idle" });
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const loading = state.status === "loading";
  const validation = message.trim() ? "" : M.emptyMessage;

  const send = async () => {
    if (validation || loading) return;
    const controller = new AbortController();
    abort.current = controller;
    setState({ status: "loading" });
    setCopy("idle");
    try {
      const result = await app.call("analyzer.testMessage", { text: message, ...(analysis ? { analysis } : {}) }, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setState(result.ok ? { status: "success", answer: result.reply ?? "", latencyMs: result.latencyMs } : { status: "error", message: testErrorMessage(result.error) });
    } catch (caught) {
      if (controller.signal.aborted) setState({ status: "cancelled" });
      else setState({ status: "error", message: testErrorMessage(toRpcError(caught)) });
    } finally {
      if (abort.current === controller) abort.current = null;
    }
  };
  const stop = () => {
    abort.current?.abort();
    setState({ status: "cancelled" });
  };
  const reset = () => {
    abort.current?.abort();
    setMessage(M.testDefault);
    setState({ status: "idle" });
  };
  const copyAnswer = async (answer: string) => {
    try {
      await navigator.clipboard.writeText(answer);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  };
  const statusText = state.status === "loading" ? M.waiting : state.status === "error" ? state.message : state.status === "cancelled" ? M.cancelled : "";

  return (
    <Card title={M.messageTest} data-model-message-test=""
      end={
        <>
          <IconButton label={M.resetTest} onClick={reset}><ResetIcon /></IconButton>
          {loading
            ? <IconButton variant="subtle" label={M.stopSend} onClick={stop}><StopIcon /></IconButton>
            : <IconButton variant="commandAction" label={M.send} disabled={!!validation} onClick={() => void send()}><SendIcon /></IconButton>}
        </>
      }>
      <div class="grid min-w-0 grid-cols-2 gap-2.5 mobile:grid-cols-1" data-model-message-columns="">
        <div class="h-24 min-w-0 overflow-hidden rounded-md bg-surface-prompt-field">
          <TextArea value={message} aria-label={M.testMessage} placeholder={M.testPlaceholder} disabled={loading}
            className="size-full min-h-0 rounded-none bg-transparent px-2.5 py-2 text-xs leading-5 focus-visible:ring-0"
            onInput={(event) => setMessage((event.currentTarget as HTMLTextAreaElement).value)} />
        </div>
        <div role="region" aria-label={M.testResult} class="flex h-24 min-w-0 flex-col overflow-hidden rounded-md bg-surface-prompt-field px-2.5 py-2">
          <div class="min-h-0 flex-1 overflow-y-auto [overflow-wrap:anywhere]">
            {validation ? <p class="text-xs leading-5 text-muted-foreground">{validation}</p> : null}
            <p role="status" aria-live="polite" class={!statusText ? "sr-only" : cn("flex min-w-0 items-start gap-2 text-xs leading-5", state.status === "error" ? "text-destructive" : "text-muted-foreground")}>
              {loading ? <SpinnerIcon className="mt-0.5 size-3.5" /> : null}
              {statusText}
            </p>
            {state.status === "success" ? <p tabIndex={0} aria-label={M.modelAnswer} class="whitespace-pre-wrap break-words text-xs leading-5 select-text max-md:text-base">{state.answer}</p> : null}
            {state.status === "idle" && dirty ? <p class="text-2xs leading-5 text-muted-foreground">{M.draftNote}</p> : null}
          </div>
          {state.status === "success" ? (
            <div class="flex shrink-0 items-center justify-end gap-2">
              <span class="text-2xs text-muted-foreground tabular-nums">{M.done((state.latencyMs / 1000).toFixed(2))}</span>
              <Button variant="ghost" size="icon" className="size-6" aria-label={M.copyAnswer} title={copy === "copied" ? M.copiedAnswer : copy === "failed" ? M.copyFailed : M.copyAnswer}
                onClick={() => void copyAnswer(state.answer)}>
                <CopyIcon className="size-3.5" />
              </Button>
              <span class="sr-only" role="status">{copy === "copied" ? M.copiedAnswer : copy === "failed" ? M.copyFailed : ""}</span>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
