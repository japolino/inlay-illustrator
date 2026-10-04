/**
 * Chat message widgets (Preact): the illustration footer (generate / reroll / retry / stop + revision pager),
 * the edge controls over each baked image (history ‹ ›, count, regenerate ⟳, busy spinner) and the pending
 * placeholder shown while a message job runs before any image exists.
 * Markup follows Asset Maid `sIe`/`tPt` (171716-171431) and `Ybe`/`Wbe` (121451-121489); styles: ./styles.ts.
 */
import {
  CHAT_ACTION_ATTR,
  CHAT_EDGE_CONTROLS_CLASS,
  CHAT_FOOTER_CLASS,
  type ChatAction,
  type ChatMessageUiState,
  type ChatSlotUi,
  type IllustrationAttributes
} from "../../shared/contract/chat-dom.js";
import type { GenerationJobSnapshot } from "../../shared/contract/rpc.js";
import { EDGE_LABELS, fill, FOOTER_LABELS, PENDING_LABELS } from "./labels.js";
import { runningDetail } from "./toast-model.js";

const svgProps = { viewBox: "0 0 24 24", "aria-hidden": "true" as const, fill: "none", stroke: "currentColor", "stroke-width": 1.8, "stroke-linecap": "round" as const, "stroke-linejoin": "round" as const };

/** AM 171732: diamond (initial). */
export const GenerateIcon = () => <svg {...svgProps}><path d="M12 2.5 20 12 12 21.5 4 12Z" /><path d="M12 7 16.5 12 12 17 7.5 12Z" /></svg>;
/** AM 171734: lucide rotate-ccw (reroll). */
export const RerollIcon = () => <svg {...svgProps}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>;
/** AM `G_e` 170949: lucide refresh-ccw-dot (retry). */
export const RetryIcon = () => (
  <svg {...svgProps} class="ii-am-chat-footer__retry-icon">
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 16h5v5" /><circle cx="12" cy="12" r="1" />
  </svg>
);

function actionAttr(action: ChatAction): Record<string, string> {
  return { [CHAT_ACTION_ATTR]: action };
}

/** Active revision position (0-based) and count. */
export function revisionPosition(state: Pick<ChatMessageUiState, "revisions" | "activeRevisionId">): { index: number; count: number } {
  const count = state.revisions.length;
  if (count === 0) return { index: -1, count: 0 };
  const index = state.revisions.findIndex((revision) => revision.revisionId === state.activeRevisionId);
  return { index: index >= 0 ? index : count - 1, count };
}

export type FooterAction = Extract<ChatAction, "generate" | "cancel" | "revision-previous" | "revision-next">;

export interface ChatFooterProps {
  state: ChatMessageUiState;
  job?: GenerationJobSnapshot;
  /** A click was sent and no job has arrived yet. */
  pending?: boolean;
  onAction: (action: FooterAction) => void;
}

/** Footer under each eligible assistant message (AM `x-risu-am-illustration-footer`). */
export function ChatFooter({ state, job, pending, onAction }: ChatFooterProps) {
  const busy = state.busy || !!job || !!pending;
  const attempt = state.attempt;
  const label = busy ? FOOTER_LABELS.stop : FOOTER_LABELS[attempt];
  const { index, count } = revisionPosition(state);
  const icon = attempt === "initial" ? <GenerateIcon /> : attempt === "reroll" ? <RerollIcon /> : <RetryIcon />;
  return (
    <div
      class={`ii-am-root ${CHAT_FOOTER_CLASS} ii-am-chat-footer${busy ? " is-generating" : ""}`}
      data-ii-message-key={state.messageKey}
      data-ii-state={state.planStatus}
      data-ii-busy={busy ? "true" : "false"}
      role="group"
      aria-label={FOOTER_LABELS.footerGroup}
    >
      <button
        type="button"
        class="ii-am-chat-footer__generate"
        {...actionAttr(busy ? "cancel" : "generate")}
        data-ii-attempt={attempt}
        aria-label={label}
        title={label}
        aria-busy={busy ? "true" : undefined}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onAction(busy ? "cancel" : "generate");
        }}
      >
        {busy ? <span class="ii-am-chat-spinner" aria-hidden="true" /> : icon}
      </button>
      {count >= 2 ? (
        <span class="ii-am-chat-footer__revisions" role="group" aria-label={fill(FOOTER_LABELS.revisionGroup, { i: index + 1, n: count })}>
          <button
            type="button"
            class="ii-am-chat-footer__revision-action"
            {...actionAttr("revision-previous")}
            aria-label={FOOTER_LABELS.revisionPrevious}
            title={FOOTER_LABELS.revisionPrevious}
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); onAction("revision-previous"); }}
          >
            <span aria-hidden="true">&lt;</span>
          </button>
          <span class="ii-am-chat-footer__revision-count" aria-hidden="true">{index + 1}/{count}</span>
          <button
            type="button"
            class="ii-am-chat-footer__revision-action"
            {...actionAttr("revision-next")}
            aria-label={FOOTER_LABELS.revisionNext}
            title={FOOTER_LABELS.revisionNext}
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); onAction("revision-next"); }}
          >
            <span aria-hidden="true">&gt;</span>
          </button>
        </span>
      ) : null}
      {state.allSlotsDeleted ? <span class="ii-am-chat-footer__empty">{FOOTER_LABELS.allSlotsDeleted}</span> : null}
    </div>
  );
}

/** Slot history position: from the message state when known, else from the baked attributes. */
export function historyPosition(attrs: IllustrationAttributes, slot: ChatSlotUi | undefined): { index: number; count: number } {
  if (slot && slot.entries.length > 0) {
    const selected = attrs.entryId || slot.selectedEntryId;
    const index = slot.entries.findIndex((entry) => entry.entryId === selected);
    return { index: index >= 0 ? index : slot.entries.length - 1, count: slot.entries.length };
  }
  const count = Math.max(0, attrs.entryCount);
  return { index: count > 0 ? Math.min(count, Math.max(1, attrs.entryIndex)) - 1 : -1, count };
}

export type EdgeAction = Extract<ChatAction, "history-previous" | "history-next" | "regenerate">;

export interface EdgeControlsProps {
  attrs: IllustrationAttributes;
  slot?: ChatSlotUi;
  /** Regeneration running or a history switch in flight. */
  busy?: boolean;
  /** Whole-message job running (controls are greyed, AM `wIe`). */
  messageBusy?: boolean;
  onAction: (action: EdgeAction) => void;
}

/** Edge controls over one baked image (AM `Ybe`). */
export function EdgeControls({ attrs, slot, busy, messageBusy, onAction }: EdgeControlsProps) {
  const { index, count } = historyPosition(attrs, slot);
  const hasHistory = count > 1;
  const canRegenerate = (slot?.canRegenerate ?? attrs.canRegenerate) === true;
  const regenerating = !!busy || !!slot?.regenerating;
  if (!hasHistory && !canRegenerate && !regenerating) return null;
  const groupLabel = hasHistory ? fill(EDGE_LABELS.group, { i: index + 1, n: count }) : EDGE_LABELS.controls;
  const click = (action: EdgeAction) => (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!regenerating) onAction(action);
  };
  return (
    <div
      class={`ii-am-root ${CHAT_EDGE_CONTROLS_CLASS} ii-am-chat-edge`}
      data-ii-slot-id={attrs.slotId}
      data-ii-busy={regenerating ? "true" : "false"}
      data-ii-dimmed={messageBusy ? "true" : undefined}
      role="group"
      aria-label={groupLabel}
    >
      {regenerating ? (
        <span class="ii-am-chat-edge__loading" role="status" aria-label={EDGE_LABELS.regenerating}>
          <span class="ii-am-chat-edge__spinner" aria-hidden="true" />
        </span>
      ) : (
        <>
          {hasHistory ? (
            <>
              <button type="button" class="ii-am-chat-edge__action ii-am-chat-edge__action--previous" {...actionAttr("history-previous")} aria-label={EDGE_LABELS.previous} title={EDGE_LABELS.previous} onClick={click("history-previous")}>
                <span aria-hidden="true">&#10094;</span>
              </button>
              <button type="button" class="ii-am-chat-edge__action ii-am-chat-edge__action--next" {...actionAttr("history-next")} aria-label={EDGE_LABELS.next} title={EDGE_LABELS.next} onClick={click("history-next")}>
                <span aria-hidden="true">&#10095;</span>
              </button>
            </>
          ) : null}
          <span class="ii-am-chat-edge__bottom">
            {hasHistory ? <span class="ii-am-chat-edge__count" aria-hidden="true">{index + 1}/{count}</span> : null}
            {canRegenerate ? (
              <button type="button" class="ii-am-chat-edge__regenerate" {...actionAttr("regenerate")} aria-label={EDGE_LABELS.regenerate} title={EDGE_LABELS.regenerate} onClick={click("regenerate")}>
                <span aria-hidden="true">&#10227;</span>
              </button>
            ) : null}
          </span>
        </>
      )}
    </div>
  );
}

/** Loading placeholder while a message job runs and no image is baked yet (AM `hbt` loading state). */
export function PendingPlaceholder({ job, count }: { job?: GenerationJobSnapshot; count: number }) {
  const n = Math.max(1, Math.min(4, count));
  const detail = job ? runningDetail(job) : PENDING_LABELS.preparing;
  return (
    <div class="ii-am-root ii-am-chat-pending" role="status" aria-label={PENDING_LABELS.generating}>
      <div class="ii-am-chat-pending__frames">
        {Array.from({ length: n }, (_, i) => (
          <span key={i} class="ii-am-chat-pending__frame" aria-hidden="true">
            <span class="ii-am-chat-pending__skeleton" />
            {i === 0 ? <span class="ii-am-chat-spinner ii-am-chat-pending__spinner" /> : null}
          </span>
        ))}
      </div>
      <span class="ii-am-chat-pending__label">{detail || PENDING_LABELS.generating}</span>
    </div>
  );
}
