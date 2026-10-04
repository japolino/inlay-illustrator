/**
 * AI prompt edit panel (AM `zxe` 161912-162616, spec/ui.md §5.4.3): instruction with `$` character mentions,
 * seed box + fix, NovelAI i2i with Strength / Noise, submit (request a proposal, then apply it).
 */
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { cn } from "../overlay/ui/cn.js";
import { Button, IconButton, Popover, Slider, useLayer } from "../overlay/ui/index.js";
import { AI_EDIT_LABELS, AI_EDIT_MAX_LENGTH, fill } from "./labels.js";
import { filterMentions, findMentionTrigger, insertMention, type MentionCandidate, type MentionTrigger } from "./model.js";
import { CommandIcon, KeyboardIcon, LoaderIcon, MaximizeIcon, MinimizeIcon, XIcon } from "./icons.js";
import type { AiPromptEditRequest } from "../../shared/contract/rpc.js";

export interface AiEditPanelProps {
  seed: string;
  seedFixed: boolean;
  canRegenerate: boolean;
  i2iAvailable: boolean;
  candidates: MentionCandidate[];
  compact?: boolean;
  onSeedFixed: (fixed: boolean) => void;
  onSubmit: (request: AiPromptEditRequest) => Promise<boolean>;
  onClose: () => void;
  onRunningChange?: (running: boolean) => void;
}

const STRENGTH_MIN = 0.4;

export function AiEditPanel({ seed, seedFixed, canRegenerate, i2iAvailable, candidates, compact, onSeedFixed, onSubmit, onClose, onRunningChange }: AiEditPanelProps) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [i2i, setI2i] = useState(false);
  const [strength, setStrength] = useState(STRENGTH_MIN);
  const [noise, setNoise] = useState(0);
  const [trigger, setTrigger] = useState<MentionTrigger | null>(null);
  const [caret, setCaret] = useState(0);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [focused, setFocused] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [i2iSettingsOpen, setI2iSettingsOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => onRunningChange?.(running), [running]);
  useEffect(() => {
    area.current?.focus({ preventScroll: true });
  }, []);

  const suggestions = useMemo(() => (trigger && !dismissed && focused && !running ? filterMentions(candidates, trigger.query) : []), [trigger, dismissed, focused, running, candidates]);
  const listOpen = suggestions.length > 0;
  // Escape: first closes the mention list, then the panel (not while running).
  useLayer(true, () => {
    if (listOpen) setDismissed(true);
    else if (!running) onClose();
  });
  useLayer(listOpen, () => setDismissed(true));

  useEffect(() => {
    if (highlight >= suggestions.length) setHighlight(0);
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [suggestions, highlight]);

  const updateTrigger = (value: string, position: number) => {
    setCaret(position);
    const next = findMentionTrigger(value, position);
    setTrigger(next);
    if (!next) setDismissed(false);
  };

  const insert = (candidate: MentionCandidate) => {
    if (!trigger) return;
    const result = insertMention(text, trigger, caret, candidate.name);
    if (!result) return;
    setText(result.text);
    setTrigger(null);
    requestAnimationFrame(() => {
      const el = area.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.caret, result.caret);
      setCaret(result.caret);
    });
  };

  const submit = async () => {
    const instruction = text.trim();
    if (!instruction || running) return;
    setRunning(true);
    try {
      const ok = await onSubmit({ instruction, imageToImage: i2i && i2iAvailable, ...(i2i && i2iAvailable ? { strength, noise } : {}) });
      if (ok) onClose();
    } finally {
      setRunning(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (listOpen && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setHighlight((h) => (h + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const candidate = suggestions[highlight];
        if (candidate) insert(candidate);
        return;
      }
    }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.isComposing) {
      event.preventDefault();
      void submit();
    }
  };

  const seedText = seed || "—";
  const settingsLabel = fill(AI_EDIT_LABELS.i2iSettings, { s: strength.toFixed(2), n: noise.toFixed(2) });
  const mentionList = listOpen ? (
    <div
      ref={listRef}
      role="listbox"
      id="ii-am-zoom-mentions"
      aria-label={AI_EDIT_LABELS.mentions}
      data-ii-zoom-mentions=""
      class="absolute bottom-full left-0 z-50 mb-1 grid max-h-52 w-full max-w-80 gap-0.5 overflow-y-auto rounded-md bg-popover p-1 shadow-2xl backdrop-blur-2xl"
    >
      {suggestions.map((candidate, index) => (
        <button
          key={candidate.id}
          type="button"
          role="option"
          aria-selected={index === highlight}
          class={cn("flex min-h-8 items-center justify-between gap-3 rounded-sm px-2 text-left text-xs mobile:min-h-11", index === highlight ? "bg-selected text-selected-foreground" : "hover:bg-accent")}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => insert(candidate)}
        >
          <span class="truncate font-bold">{candidate.name}</span>
          {candidate.ownerName && candidate.ownerName !== candidate.name ? <span class="truncate text-2xs text-muted-foreground">{candidate.ownerName}</span> : null}
        </button>
      ))}
    </div>
  ) : null;

  const textarea = (
    <div class="relative min-w-0 flex-1">
      {mentionList}
      <textarea
        ref={area}
        data-ii-zoom-ai-instruction=""
        value={text}
        maxLength={AI_EDIT_MAX_LENGTH}
        disabled={running}
        aria-label={AI_EDIT_LABELS.instruction}
        aria-autocomplete="list"
        aria-controls={listOpen ? "ii-am-zoom-mentions" : undefined}
        aria-expanded={listOpen}
        placeholder={compact ? AI_EDIT_LABELS.placeholderMobile : AI_EDIT_LABELS.placeholder}
        title={AI_EDIT_LABELS.mentionHint}
        class={cn("w-full resize-none rounded-md bg-input px-3 py-2 text-xs leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/65 focus-visible:ring-2 focus-visible:ring-ring/55 disabled:opacity-45 mobile:text-base", compact ? (expanded ? "h-56" : "h-28") : "h-20")}
        onInput={(event) => {
          const el = event.currentTarget as HTMLTextAreaElement;
          setText(el.value);
          setDismissed(false);
          updateTrigger(el.value, el.selectionStart ?? el.value.length);
        }}
        onKeyUp={(event) => {
          if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) return;
          const el = event.currentTarget as HTMLTextAreaElement;
          updateTrigger(el.value, el.selectionStart ?? el.value.length);
        }}
        onClick={(event) => {
          const el = event.currentTarget as HTMLTextAreaElement;
          updateTrigger(el.value, el.selectionStart ?? el.value.length);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </div>
  );

  const fixSeed = (
    <label class="inline-flex items-center gap-1.5 text-2xs font-bold" title={AI_EDIT_LABELS.fixTitle}>
      <input type="checkbox" class="size-3.5 accent-[var(--color-primary)]" checked={seedFixed} disabled={running || !seed || !canRegenerate} onChange={(e) => onSeedFixed((e.currentTarget as HTMLInputElement).checked)} />
      {AI_EDIT_LABELS.fix}
    </label>
  );
  const seedBox = (
    <span class="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-surface-badge px-2 py-1 text-2xs" title={seed || undefined} aria-label={fill(AI_EDIT_LABELS.currentSeed, { seed: seed || "—" })}>
      <span class="font-black text-muted-foreground">SEED</span>
      <span class="truncate font-mono">{seedText}</span>
    </span>
  );
  const sliders = (
    <div class="grid w-56 gap-3 p-1">
      {(["strength", "noise"] as const).map((key) => (
        <label key={key} class="grid gap-1 text-2xs font-bold">
          <span class="flex justify-between"><span>{key === "strength" ? AI_EDIT_LABELS.strength : AI_EDIT_LABELS.noise}</span><span class="font-mono">{(key === "strength" ? strength : noise).toFixed(2)}</span></span>
          <Slider value={key === "strength" ? strength : noise} min={key === "strength" ? STRENGTH_MIN : 0} max={1} step={0.01} onValueChange={key === "strength" ? setStrength : setNoise} aria-label={key === "strength" ? AI_EDIT_LABELS.strength : AI_EDIT_LABELS.noise} />
        </label>
      ))}
    </div>
  );
  const i2iToggle = (label: string) => (
    <label class={cn("inline-flex items-center gap-1.5 text-2xs font-bold", !i2iAvailable && "opacity-45")} title={i2iAvailable ? AI_EDIT_LABELS.i2iTitle : AI_EDIT_LABELS.i2iOnlyNovelAI}>
      <input type="checkbox" class="size-3.5 accent-[var(--color-primary)]" checked={i2i} disabled={running || !i2iAvailable} onChange={(e) => setI2i((e.currentTarget as HTMLInputElement).checked)} />
      {label}
    </label>
  );

  if (compact) {
    return (
      <section class="grid gap-2 bg-background/88 p-3 backdrop-blur-2xl" aria-label={AI_EDIT_LABELS.panel} data-ii-zoom-ai-panel="compact">
        <div class="flex items-center justify-between gap-2">
          <span class="text-xs font-extrabold">{AI_EDIT_LABELS.panel}</span>
          <div class="flex items-center gap-1">
            {focused ? <IconButton label={AI_EDIT_LABELS.hideKeyboard} onPointerDown={(e) => e.preventDefault()} onClick={() => area.current?.blur()}><KeyboardIcon /></IconButton> : null}
            <IconButton label={expanded ? "Shrink input area" : "Enlarge input area"} aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <MinimizeIcon /> : <MaximizeIcon />}</IconButton>
            <IconButton label={AI_EDIT_LABELS.close} disabled={running} onClick={onClose}><XIcon /></IconButton>
          </div>
        </div>
        {textarea}
        <div class="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" aria-expanded={optionsOpen} onClick={() => setOptionsOpen(!optionsOpen)}>{optionsOpen ? AI_EDIT_LABELS.hideOptions : AI_EDIT_LABELS.options}</Button>
          <span class="truncate text-2xs text-muted-foreground">{seedFixed ? AI_EDIT_LABELS.seedFixed : AI_EDIT_LABELS.seedRandom} · {i2i ? AI_EDIT_LABELS.i2iOn : AI_EDIT_LABELS.i2iOff}</span>
        </div>
        {optionsOpen ? (
          <div class="grid gap-2 rounded-md bg-surface-prompt-field p-2" aria-label={AI_EDIT_LABELS.context}>
            <div class="flex items-center gap-2">{seedBox}{fixSeed}</div>
            {i2iToggle(AI_EDIT_LABELS.i2iMobile)}
            {!i2iAvailable ? <p class="text-2xs text-muted-foreground">{AI_EDIT_LABELS.i2iOnlyNovelAI}</p> : i2i ? sliders : null}
          </div>
        ) : null}
        <Button disabled={!text.trim() || running} onClick={() => void submit()}>
          {running ? <LoaderIcon /> : <CommandIcon />}
          {running ? AI_EDIT_LABELS.requesting : AI_EDIT_LABELS.submitMobile}
        </Button>
      </section>
    );
  }

  return (
    <section class="grid gap-2 border-t border-border bg-background/72 p-3 backdrop-blur-2xl" aria-label={AI_EDIT_LABELS.panel} data-ii-zoom-ai-panel="">
      <div class="flex items-start gap-2">
        {textarea}
        <div class="flex shrink-0 flex-col gap-1">
          <IconButton label={AI_EDIT_LABELS.submit} variant="subtle" disabled={!text.trim() || running} onClick={() => void submit()}>{running ? <LoaderIcon /> : <CommandIcon />}</IconButton>
          <IconButton label={AI_EDIT_LABELS.close} disabled={running} onClick={onClose}><XIcon /></IconButton>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-3" role="group" aria-label={AI_EDIT_LABELS.context}>
        {seedBox}
        {fixSeed}
        {i2iToggle(AI_EDIT_LABELS.i2i)}
        <Popover
          open={i2iSettingsOpen}
          onOpenChange={setI2iSettingsOpen}
          align="start"
          className="w-64 p-3"
          aria-label={AI_EDIT_LABELS.i2iSettingsTitle}
          trigger={(props) => (
            <button
              {...props}
              type="button"
              class="rounded-md bg-surface-badge px-2 py-1 font-mono text-2xs disabled:opacity-45"
              disabled={running || !i2iAvailable}
              aria-label={fill(AI_EDIT_LABELS.i2iSettingsAria, { s: strength.toFixed(2), n: noise.toFixed(2) })}
              title={AI_EDIT_LABELS.i2iSettingsTitle}
            >
              {settingsLabel}
            </button>
          )}
        >
          {sliders}
        </Popover>
        {running ? <span class="inline-flex items-center gap-1.5 text-2xs text-muted-foreground"><LoaderIcon className="size-3.5" />{AI_EDIT_LABELS.requesting}</span> : null}
      </div>
    </section>
  );
}
