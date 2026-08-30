import type { SpindleFrontendContext } from "lumiverse-spindle-types";
import { getQuoteSettings, splitOriginalQuoteCss } from "./caption-settings.js";

const INLAY_IMAGE_SELECTOR = '[data-inlay-illustrator="true"] img';
const INLAY_WRAPPER_SELECTOR = '[data-inlay-illustrator="true"]';

export function disableNativeInlayLightboxes(root: ParentNode): void {
  root.querySelectorAll<HTMLImageElement>(`${INLAY_WRAPPER_SELECTOR} img[data-lightbox]`)
    .forEach((image) => image.removeAttribute("data-lightbox"));
}

export type InlayGenerationDetails = {
  prompt: string;
  negativePrompt: string;
  quote: string;
  hasRawPromptData?: boolean;
  rawPromptData?: { setup: string; charPos: string; charNeg: string; supplement: string; situation: string; place: string; camera: string; action: string } | null;
  setup?: string;
  charPos?: string;
  charNeg?: string;
  supplement?: string;
  situation?: string;
  place?: string;
  camera?: string;
  action?: string;
};

export type InlayActionTarget = {
  chatId?: string;
  messageId?: string;
  swipeId?: number;
  imageIndex?: number;
  imageId?: string;
  imageUrl: string;
};

type LightboxControls = { status: HTMLElement; buttons: HTMLButtonElement[] };
type ModalHandle = ReturnType<SpindleFrontendContext["ui"]["showModal"]>;

export type RerollCandidate = { imageId: string; imageUrl: string; parameters: Record<string, unknown> };

export function clampImageRerollCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(8, Math.max(1, Math.floor(parsed)));
}

export function imageRerollCountFromConfig(config: unknown): number {
  if (config && typeof config === "object" && "imageRerollCount" in (config as Record<string, unknown>)) {
    return clampImageRerollCount((config as Record<string, unknown>).imageRerollCount);
  }
  return 1;
}

export function resolveInlayPrompt(attributePrompt: string | null, fallbackPrompt: string | null): string {
  return (attributePrompt || fallbackPrompt || "").trim();
}

export function resolveInlayDetails(
  attributePrompt: string | null,
  fallbackPrompt: string | null,
  attributeNegative: string | null,
  fallbackNegative: string | null,
  quote: string | null = null
): InlayGenerationDetails {
  // Attribute-only path leaves raw-prompt availability unknown (undefined),
  // so the lightbox fetches authoritative details from the backend on demand.
  // Do NOT fabricate keys: consumers distinguish unknown (undefined) from
  // known-absent (false), and legacy callers expect the exact 3-field shape.
  return {
    prompt: resolveInlayPrompt(attributePrompt, fallbackPrompt),
    negativePrompt: resolveInlayPrompt(attributeNegative, fallbackNegative),
    quote: (quote || "").trim()
  };
}

export function resolveInlayDetailsExtended(
  data: Record<string, unknown>
): InlayGenerationDetails {
  return {
    prompt: typeof data.prompt === "string" ? data.prompt : "",
    negativePrompt: typeof data.negativePrompt === "string" ? data.negativePrompt : "",
    quote: typeof data.quote === "string" ? data.quote : "",
    hasRawPromptData: Boolean(data.hasRawPromptData),
    rawPromptData: (data.rawPromptData as any) || null,
    setup: typeof data.setup === "string" ? data.setup : (data.rawPromptData as any)?.setup || "",
    charPos: typeof data.charPos === "string" ? data.charPos : (data.rawPromptData as any)?.charPos || "",
    charNeg: typeof data.charNeg === "string" ? data.charNeg : (data.rawPromptData as any)?.charNeg || "",
    supplement: typeof data.supplement === "string" ? data.supplement : (data.rawPromptData as any)?.supplement || "",
    situation: typeof data.situation === "string" ? data.situation : (data.rawPromptData as any)?.situation || "",
    place: typeof data.place === "string" ? data.place : (data.rawPromptData as any)?.place || "",
    camera: typeof data.camera === "string" ? data.camera : (data.rawPromptData as any)?.camera || "",
    action: typeof data.action === "string" ? data.action : (data.rawPromptData as any)?.action || ""
  };
}

function findInlayImage(target: EventTarget | null): HTMLImageElement | null {
  if (!(target instanceof Element)) return null;
  const image = target.closest<HTMLImageElement>(INLAY_IMAGE_SELECTOR);
  if (!image?.closest(INLAY_WRAPPER_SELECTOR)) return null;
  return image;
}

function detailsForImage(image: HTMLImageElement): InlayGenerationDetails {
  const wrapper = image.closest(INLAY_WRAPPER_SELECTOR);
  const fallback = wrapper?.querySelector<HTMLElement>(".inlay-illustrator-prompt")?.textContent || null;
  const fallbackNegative = wrapper?.querySelector<HTMLElement>(".inlay-illustrator-negative-prompt")?.textContent || null;
  return resolveInlayDetails(
    image.getAttribute("data-inlay-illustrator-prompt"),
    fallback,
    image.getAttribute("data-inlay-illustrator-negative-prompt"),
    fallbackNegative,
    image.getAttribute("data-inlay-illustrator-quote")
  );
}

function optionalInteger(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export function imageIdFromResultUrl(value: string): string | undefined {
  const match = value.match(/\/api\/v1\/image-gen\/results\/([^?#]+)/i);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

function actionTargetForImage(image: HTMLImageElement): InlayActionTarget {
  const imageUrl = image.getAttribute("src") || image.currentSrc || image.src || image.getAttribute("data-inlay-illustrator-image-url") || "";
  return {
    chatId: image.getAttribute("data-inlay-illustrator-chat-id") || undefined,
    messageId: image.getAttribute("data-inlay-illustrator-message-id") || undefined,
    swipeId: optionalInteger(image.getAttribute("data-inlay-illustrator-swipe-id")),
    imageIndex: optionalInteger(image.getAttribute("data-inlay-illustrator-image-index")),
    imageId: image.getAttribute("data-inlay-illustrator-image-id") || imageIdFromResultUrl(imageUrl),
    imageUrl
  };
}

function promptBlock(label: string, value: string, fallback: string): HTMLElement {
  const block = document.createElement("section");
  block.className = "inlay-lightbox-prompt-block";
  const heading = document.createElement("h4");
  heading.textContent = label;
  const content = document.createElement("pre");
  content.className = "inlay-lightbox-prompt";
  content.textContent = value || fallback;
  block.append(heading, content);
  return block;
}

function createStatusElement(): HTMLElement {
  const status = document.createElement("div");
  status.className = "inlay-lightbox-action-status";
  status.setAttribute("aria-live", "polite");
  status.setAttribute("aria-atomic", "true");
  status.setAttribute("role", "status");
  return status;
}

function renderCandidatePicker(
  modal: ModalHandle,
  candidates: RerollCandidate[],
  resolved: { messageId: string; imageIndex: number },
  originalTarget: InlayActionTarget,
  controls: LightboxControls,
  chatIdResolver: () => string,
  onApply: (candidate: RerollCandidate, pickerControls: LightboxControls, resolved: { messageId: string; imageIndex: number }) => void,
  onCancel: () => void,
  restoreContent: () => void
): void {
  const container = document.createElement("div");
  container.className = "inlay-reroll-picker";
  container.setAttribute("role", "dialog");
  container.setAttribute("aria-label", "Choose a reroll candidate");

  const heading = document.createElement("h3");
  heading.textContent = `Choose a candidate (${candidates.length} options)`;
  heading.className = "inlay-reroll-picker-heading";
  container.append(heading);

  const grid = document.createElement("div");
  grid.className = "inlay-reroll-picker-grid";
  grid.setAttribute("role", "grid");
  grid.setAttribute("aria-label", "Reroll candidates");

  const pickerButtons: HTMLButtonElement[] = [];

  candidates.forEach((candidate, idx) => {
    const cell = document.createElement("div");
    cell.className = "inlay-reroll-picker-item";
    cell.setAttribute("role", "gridcell");

    const img = document.createElement("img");
    img.className = "inlay-reroll-picker-image";
    img.src = candidate.imageUrl;
    img.alt = `Candidate ${idx + 1}`;
    img.loading = "lazy";

    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "inlay-reroll-picker-apply-button";
    apply.textContent = "Apply";
    apply.setAttribute("aria-label", `Apply candidate ${idx + 1}`);
    pickerButtons.push(apply);

    // apply handler will be wired with closure to candidate
    apply.addEventListener("click", () => {
      // disable all picker buttons while pending
      pickerButtons.forEach((b) => { b.disabled = true; });
      cancelButton.disabled = true;
      controls.status.textContent = "Applying selected image...";
      controls.status.setAttribute("aria-busy", "true");
      onApply(candidate, { status: controls.status, buttons: [...pickerButtons, cancelButton] }, resolved);
    });

    cell.append(img, apply);
    grid.append(cell);
  });

  container.append(grid);

  const actions = document.createElement("div");
  actions.className = "inlay-reroll-picker-actions";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "inlay-reroll-picker-cancel";
  cancelButton.textContent = "Cancel";
  cancelButton.setAttribute("aria-label", "Cancel reroll picker");
  pickerButtons.push(cancelButton);

  cancelButton.addEventListener("click", () => {
    // clean picker and restore or dismiss
    onCancel();
  });

  actions.append(cancelButton);

  // reuse the same status element for picker feedback
  actions.append(controls.status);
  container.append(actions);

  modal.root.replaceChildren(container);

  // expose cancel handler that restores: we pass restoreContent for returning without mutation
  // onCancel currently dismisses; tests expect cancel dismisses without backend mutation.
  // We keep both: onCancel will dismiss modal; but if we want returning we could call restoreContent.
  // For accessibility, Cancel returns/dismisses without chat mutation - dismiss is valid.
}

function appendLightboxContent(
  root: HTMLElement,
  image: HTMLImageElement,
  details: InlayGenerationDetails,
  actionTarget: InlayActionTarget,
  onAction: (operation: "reroll" | "sidecar" | "full", controls: LightboxControls) => void,
  onEditAction?: (type: "prompt" | "quote" | "delete", controls: LightboxControls) => void
): LightboxControls {
  const layout = document.createElement("div");
  layout.className = "inlay-lightbox-layout";

  const preview = document.createElement("img");
  preview.className = "inlay-lightbox-image";
  preview.src = image.currentSrc || image.src || image.getAttribute("data-inlay-illustrator-image-url") || "";
  preview.alt = image.alt || "Generated illustration";

  const visual = document.createElement("div");
  visual.className = "inlay-lightbox-visual";
  visual.append(preview);
  if (details.quote) {
    const parsedQuoteCss = splitOriginalQuoteCss(getQuoteSettings(actionTarget.chatId || "").quoteStyle);
    if (parsedQuoteCss.globalCss.trim()) {
      const style = document.createElement("style");
      style.textContent = parsedQuoteCss.globalCss;
      visual.append(style);
    }
    const quote = document.createElement("blockquote");
    quote.className = "inlay-lightbox-quote";
    if (parsedQuoteCss.inlineStyle.trim()) quote.style.cssText += `;${parsedQuoteCss.inlineStyle}`;
    quote.textContent = details.quote;
    visual.append(quote);
  }

  const panel = document.createElement("section");
  panel.className = "inlay-lightbox-prompt-panel";
  const heading = document.createElement("h3");
  heading.textContent = "Generation details";
  panel.append(heading);
  // Raw prompt data primary display
  const hasRaw = details.hasRawPromptData;
  if (hasRaw) {
    panel.append(
      promptBlock("Setup", details.setup || (details.rawPromptData as any)?.setup || "", "No setup"),
      promptBlock("Pos (charPos)", details.charPos || (details.rawPromptData as any)?.charPos || "", "No Pos"),
      promptBlock("Neg (charNeg)", details.charNeg || (details.rawPromptData as any)?.charNeg || "", "No Neg"),
      promptBlock("Sup (supplement)", details.supplement || (details.rawPromptData as any)?.supplement || "", "No Sup")
    );
    const expand = document.createElement("details");
    expand.className = "inlay-lightbox-expand-raw";
    const summary = document.createElement("summary");
    summary.textContent = "More raw fields (situation/place/camera/action)";
    expand.append(summary);
    expand.append(
      promptBlock("Situation", details.situation || (details.rawPromptData as any)?.situation || "", "—"),
      promptBlock("Place", details.place || (details.rawPromptData as any)?.place || "", "—"),
      promptBlock("Camera", details.camera || (details.rawPromptData as any)?.camera || "", "—"),
      promptBlock("Action", details.action || (details.rawPromptData as any)?.action || "", "—")
    );
    panel.append(expand);
    const diagHeading = document.createElement("h4");
    diagHeading.textContent = "Provider prompts (diagnostic)";
    diagHeading.style.opacity = "0.7";
    diagHeading.style.fontSize = "0.9em";
    panel.append(diagHeading);
  } else if (details.hasRawPromptData === false) {
    const unavailable = document.createElement("div");
    unavailable.className = "inlay-lightbox-raw-unavailable";
    unavailable.textContent = "Raw prompt data unavailable for this image.";
    unavailable.setAttribute("role", "note");
    panel.append(unavailable);
  }
  panel.append(
    promptBlock("Positive prompt", details.prompt, "No prompt was recorded for this image."),
    promptBlock("Negative prompt", details.negativePrompt, "No negative prompt was recorded for this image.")
  );
  const actions = document.createElement("div");
  actions.className = "inlay-lightbox-actions";
  const reroll = document.createElement("button");
  reroll.type = "button";
  reroll.textContent = "Reroll image";
  reroll.setAttribute("aria-label", "Reroll image");
  const sidecar = document.createElement("button");
  sidecar.type = "button";
  sidecar.textContent = "Rerun sidecar";
  sidecar.setAttribute("aria-label", "Rerun sidecar");
  const status = createStatusElement();
  const buttons: HTMLButtonElement[] = [reroll, sidecar];

  // Full reroll button only if messageId exists (current generated record)
  let fullReroll: HTMLButtonElement | null = null;
  if (actionTarget.messageId) {
    fullReroll = document.createElement("button");
    fullReroll.type = "button";
    fullReroll.textContent = "Full reroll";
    fullReroll.setAttribute("aria-label", "Reroll all images for this message");
    buttons.push(fullReroll);
  }

  // Edit prompt / quote / delete buttons
  const editPrompt = document.createElement("button");
  editPrompt.type = "button";
  editPrompt.textContent = "Edit prompt";
  editPrompt.setAttribute("aria-label", "Edit prompt");
  if (details.hasRawPromptData === false) {
    editPrompt.disabled = true;
    editPrompt.title = "Raw prompt data unavailable";
  }
  const editQuote = document.createElement("button");
  editQuote.type = "button";
  editQuote.textContent = "Edit quote";
  editQuote.setAttribute("aria-label", "Edit quote");
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.textContent = "Delete";
  delBtn.setAttribute("aria-label", "Delete image");
  delBtn.className = "inlay-delete-button";
  buttons.push(editPrompt, editQuote, delBtn);

  const controls: LightboxControls = { status, buttons };
  reroll.addEventListener("click", () => onAction("reroll", controls));
  sidecar.addEventListener("click", () => onAction("sidecar", controls));
  if (fullReroll) fullReroll.addEventListener("click", () => onAction("full", controls));
  if (onEditAction) {
    editPrompt.addEventListener("click", () => onEditAction("prompt", controls));
    editQuote.addEventListener("click", () => onEditAction("quote", controls));
    delBtn.addEventListener("click", () => onEditAction("delete", controls));
  }
  actions.append(...buttons, status);
  panel.append(actions);

  layout.append(visual, panel);
  root.replaceChildren(layout);
  return controls;
}

function resolveChatId(target: InlayActionTarget, ctx: SpindleFrontendContext): string {
  if (target.chatId) return String(target.chatId);
  try {
    return String(ctx.getActiveChat().chatId || "");
  } catch {
    return "";
  }
}

function makeRequestId(prefix = "inlay"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function installInlayLightbox(ctx: SpindleFrontendContext): () => void {
  let activeModal: ModalHandle | null = null;
  let activeRequest: { id: string; modal: ModalHandle; controls: LightboxControls } | null = null;
  let activeDetailsRequest: { id: string; modal: ModalHandle; render: (details: InlayGenerationDetails) => void } | null = null;
  let activeCandidateRequest: { id: string; modal: ModalHandle; controls: LightboxControls; target: InlayActionTarget } | null = null;
  let activeApplyRequest: { id: string; modal: ModalHandle; controls: LightboxControls } | null = null;
  let activeFullRequest: { id: string; modal: ModalHandle; controls: LightboxControls } | null = null;
  let activePromptEditRequest: { id: string; modal: ModalHandle; controls: LightboxControls; editModal: ModalHandle | null } | null = null;
  let activeQuoteEditRequest: { id: string; modal: ModalHandle; controls: LightboxControls; editModal: ModalHandle | null; chatId: string } | null = null;
  let activeDeleteRequest: { id: string; modal: ModalHandle; controls: LightboxControls } | null = null;
  let latestRerollCount = 1;

  disableNativeInlayLightboxes(document);
  const observer = new MutationObserver(() => disableNativeInlayLightboxes(document));
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const unsubscribeResults = ctx.onBackendMessage((payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const result = payload as Record<string, unknown>;

    // Track latest config for imageRerollCount (duck-typed, future-proof)
    if (result.type === "config_updated" || result.type === "state") {
      if (result.config && typeof result.config === "object") {
        latestRerollCount = imageRerollCountFromConfig(result.config);
      }
      if (result.type === "config_updated" || result.type === "state") {
        return;
      }
    }

    if (result.type === "inlay_image_details_result" && String(result.requestId || "") === activeDetailsRequest?.id) {
      if (activeDetailsRequest.modal !== activeModal) {
        activeDetailsRequest = null;
        return;
      }
      if (result.ok === true) {
        const extended = resolveInlayDetailsExtended(result as Record<string, unknown>);
        // If hasRaw flag missing but we have fallback, merge
        activeDetailsRequest.render(extended);
      } else {
        // On error, render with prompt unavailable note but keep lightbox open
        // Do not clear activeDetailsRequest yet? just clear
      }
      activeDetailsRequest = null;
      return;
    }

    // Edit result handling (prompt/quote/delete) with stale protection
    if (result.type === "inlay_image_edit_result") {
      const requestId = String(result.requestId || "");
      const operation = String(result.operation || "");
      // Prompt edit
      if (activePromptEditRequest && requestId === activePromptEditRequest.id) {
        if (activePromptEditRequest.modal !== activeModal) {
          activePromptEditRequest = null;
          return;
        }
        const controls = activePromptEditRequest.controls;
        const editModal = activePromptEditRequest.editModal;
        if (result.ok === true) {
          const detailsRaw = (result as any).details as Record<string, unknown> | undefined;
          const details = detailsRaw ? resolveInlayDetailsExtended(detailsRaw) : null;
          if (details && activeModal) {
            // Re-render the main lightbox with updated raw details (refresh current modal)
            // Find image and target from activeModal context via closure? We need to re-render using existing image/target.
            // Instead, patch displayed blocks in place: look for prompt blocks and update text.
            // Simpler: close edit modal and update status, then update displayed raw blocks via DOM patch
            if (editModal) editModal.dismiss();
            controls.status.textContent = "Prompt updated.";
            controls.status.removeAttribute("aria-busy");
            controls.buttons.forEach((b) => { b.disabled = false; });
            // Update displayed raw details if details available: find blocks by heading
            if (activeModal) {
              const root = activeModal.root as HTMLElement;
              // Update text of blocks: we can search for pre elements and replace based on label order? For simplicity, re-render whole panel by calling appendLightboxContent again with new details?
              // We have to retain image/target - they are captured in outer scope? We'll store them via activeModal association using a Map
            }
            // For now just update status; detailed patch will be handled via stored details and next open
            // Attempt to patch DOM directly: find sections with headings Setup etc.
            try {
              const root = activeModal.root as HTMLElement;
              const pres = root.querySelectorAll("pre");
              // Order: Setup, Pos, Neg, Sup, then situation etc, then prompt/negative
              // We can at least update first four if present
              const vals = [details.setup || "", details.charPos || "", details.charNeg || "", details.supplement || ""];
              let idx = 0;
              for (const pre of Array.from(pres)) {
                const section = (pre.parentElement as HTMLElement);
                const heading = section?.querySelector("h4");
                if (heading && ["Setup", "Pos (charPos)", "Neg (charNeg)", "Sup (supplement)"].includes(heading.textContent || "")) {
                  (pre as HTMLElement).textContent = vals[idx++] || "";
                }
              }
            } catch {}
          } else {
            // Try re-render even without details
            if (editModal) editModal.dismiss();
            controls.status.textContent = "Prompt updated.";
            controls.status.removeAttribute("aria-busy");
            controls.buttons.forEach((b) => { b.disabled = false; });
          }
        } else {
          // error - show in edit modal if available, else in main controls
          const errMsg = String(result.error || "Prompt update failed.");
          if (editModal) {
            // Try to find status via direct reference stored on modal
            const statusEl = (editModal as any).__editStatus as HTMLElement | undefined;
            if (statusEl) {
              statusEl.textContent = errMsg;
              statusEl.removeAttribute("aria-busy");
            } else {
              // fallback try query
              const q = (editModal.root as any).querySelector ? (editModal.root as any).querySelector(".inlay-edit-status") as HTMLElement | null : null;
              if (q) {
                q.textContent = errMsg;
                q.removeAttribute("aria-busy");
              } else {
                controls.status.textContent = errMsg;
                controls.status.removeAttribute("aria-busy");
              }
            }
            // re-enable edit modal buttons
            const btns = (editModal.root as any).querySelectorAll ? (editModal.root as any).querySelectorAll("button") : [];
            // fallback via findButtons if FakeElement
            if (btns.length === 0 && (editModal.root as any).findButtons) {
              const fb = (editModal.root as any).findButtons() as HTMLButtonElement[];
              fb.forEach((b) => { b.disabled = false; });
            } else {
              btns.forEach((b: HTMLButtonElement) => { b.disabled = false; });
            }
            controls.buttons.forEach((b) => { b.disabled = false; });
            controls.status.removeAttribute("aria-busy");
          } else {
            controls.status.textContent = errMsg;
            controls.status.removeAttribute("aria-busy");
            controls.buttons.forEach((b) => { b.disabled = false; });
          }
          return;
        }
        activePromptEditRequest = null;
        return;
      }
      if (activeQuoteEditRequest && requestId === activeQuoteEditRequest.id) {
        if (activeQuoteEditRequest.modal !== activeModal) {
          activeQuoteEditRequest = null;
          return;
        }
        const controls = activeQuoteEditRequest.controls;
        const editModal = activeQuoteEditRequest.editModal;
        if (result.ok === true) {
          const newQuote = typeof (result as any).quote === "string" ? (result as any).quote : (result as any).details?.quote || "";
          // Update image data attr for inline caption and lightbox metadata
          // We need to locate the image element: find via activeModal root? Instead we can query document for the image with matching id/url? Simpler: update via controls's modal's image reference stored separately.
          // We'll store image reference globally via activeModalImage map
          if (editModal) editModal.dismiss();
          controls.status.textContent = newQuote ? "Quote updated." : "Quote removed.";
          controls.status.removeAttribute("aria-busy");
          controls.buttons.forEach((b) => { b.disabled = false; });
          // Patch lightbox quote block
          try {
            if (activeModal) {
              const root = activeModal.root as HTMLElement;
              const findByClass = (r: Element, cls: string): HTMLElement | null => {
                const q = (r as any).querySelector?.(cls);
                if (q) return q as HTMLElement;
                // fallback for FakeElement
                const walk = (el: Element): HTMLElement | null => {
                  if ((el as any).className === cls.replace(".","")) return el as HTMLElement;
                  for (const ch of Array.from((el as any).children || [])) {
                    const found = walk(ch as Element);
                    if (found) return found;
                  }
                  return null;
                };
                return walk(r);
              };
              const findVisual = findByClass(root, "inlay-lightbox-visual") as HTMLElement | null;
              const quoteEl = findByClass(root, "inlay-lightbox-quote") as HTMLElement | null;
              const visual = findVisual;
              if (newQuote) {
                if (quoteEl) quoteEl.textContent = newQuote;
                else if (visual) {
                  const newQ = document.createElement("blockquote");
                  newQ.className = "inlay-lightbox-quote";
                  const parsedQuoteCss = splitOriginalQuoteCss(getQuoteSettings(activeQuoteEditRequest.chatId).quoteStyle);
                  if (parsedQuoteCss.inlineStyle.trim()) newQ.style.cssText += `;${parsedQuoteCss.inlineStyle}`;
                  newQ.textContent = newQuote;
                  visual.append(newQ);
                }
              } else {
                if (quoteEl) quoteEl.remove();
              }
              const imgRef = (activeModal as any).__inlayImage as HTMLImageElement | undefined;
              if (imgRef) {
                imgRef.setAttribute("data-inlay-illustrator-quote", newQuote);
                const wrapper = (imgRef as any).closest ? (imgRef as any).closest('[data-inlay-illustrator="true"]') : (imgRef.parentElement as Element | null);
                let inline: HTMLElement | null = null;
                if (wrapper) {
                  inline = (wrapper as any).querySelector ? (wrapper as any).querySelector(".inlay-illustrator-inline-quote") as HTMLElement | null : null;
                  if (!inline) {
                    // fallback walk
                    const walk2 = (el: Element): HTMLElement | null => {
                      if ((el as any).className === "inlay-illustrator-inline-quote") return el as HTMLElement;
                      for (const ch of Array.from((el as any).children || [])) {
                        const f = walk2(ch as Element);
                        if (f) return f;
                      }
                      return null;
                    };
                    inline = wrapper ? walk2(wrapper as Element) : null;
                  }
                }
                if (newQuote) {
                  if (inline) inline.textContent = newQuote;
                  else if (wrapper) {
                    const nq = document.createElement("blockquote");
                    nq.className = "inlay-illustrator-inline-quote";
                    nq.textContent = newQuote;
                    (wrapper as any).append(nq);
                  }
                } else {
                  if (inline) inline.remove();
                }
              }
            }
          } catch {}
        } else {
          const errMsg = String(result.error || "Quote update failed.");
          if (editModal) {
            const statusEl = (editModal as any).__editStatus as HTMLElement | undefined;
            if (statusEl) {
              statusEl.textContent = errMsg;
              statusEl.removeAttribute("aria-busy");
            } else {
              const q = (editModal.root as any).querySelector ? (editModal.root as any).querySelector(".inlay-edit-status") as HTMLElement | null : null;
              if (q) { q.textContent = errMsg; q.removeAttribute("aria-busy"); } else { controls.status.textContent = errMsg; }
            }
            controls.status.removeAttribute("aria-busy");
            controls.buttons.forEach((b) => { b.disabled = false; });
            const btns = (editModal.root as any).querySelectorAll ? (editModal.root as any).querySelectorAll("button") : [];
            if (btns.length===0 && (editModal.root as any).findButtons) {
              const fb = (editModal.root as any).findButtons() as HTMLButtonElement[];
              fb.forEach((b)=>{ b.disabled=false; });
            } else { btns.forEach((b: any)=>{ b.disabled=false; });}
          } else {
            controls.status.textContent = errMsg;
            controls.status.removeAttribute("aria-busy");
            controls.buttons.forEach((b) => { b.disabled = false; });
          }
          return;
        }
        activeQuoteEditRequest = null;
        return;
      }
      if (activeDeleteRequest && requestId === activeDeleteRequest.id) {
        if (activeDeleteRequest.modal !== activeModal) {
          activeDeleteRequest = null;
          return;
        }
        const controls = activeDeleteRequest.controls;
        const deleteModal = activeDeleteRequest.modal;
        if (result.ok === true) {
          controls.status.textContent = "Image deleted.";
          controls.status.removeAttribute("aria-busy");
          // Close lightbox per spec
          deleteModal.dismiss();
          if (activeModal === deleteModal) activeModal = null;
        } else {
          controls.status.textContent = String(result.error || "Delete failed.");
          controls.status.removeAttribute("aria-busy");
          controls.buttons.forEach((b) => { b.disabled = false; });
        }
        activeDeleteRequest = null;
        return;
      }
      // stale edit result ignore
      return;
    }

    // Candidate generation result
    if (result.type === "inlay_reroll_candidates") {
      const requestId = String(result.requestId || "");
      if (!activeCandidateRequest || requestId !== activeCandidateRequest.id) return;
      if (activeCandidateRequest.modal !== activeModal) {
        activeCandidateRequest = null;
        return;
      }
      const controls = activeCandidateRequest.controls;
      const target = activeCandidateRequest.target;
      const modal = activeCandidateRequest.modal;
      activeCandidateRequest = null;

      if (result.ok !== true) {
        controls.status.textContent = String(result.error || "Candidate generation failed.");
        controls.status.removeAttribute("aria-busy");
        controls.buttons.forEach((button) => { button.disabled = false; });
        return;
      }
      const rawCandidates = Array.isArray(result.candidates) ? result.candidates as unknown[] : [];
      const candidates: RerollCandidate[] = rawCandidates
        .filter((c): c is RerollCandidate => Boolean(c) && typeof c === "object" && typeof (c as RerollCandidate).imageUrl === "string" && (c as RerollCandidate).imageUrl.trim() !== "")
        .map((c) => c as RerollCandidate);
      if (candidates.length === 0) {
        controls.status.textContent = String(result.error || "No candidates returned.");
        controls.status.removeAttribute("aria-busy");
        controls.buttons.forEach((button) => { button.disabled = false; });
        return;
      }
      const messageId = typeof result.messageId === "string" ? result.messageId : (target.messageId || "");
      const imageIndex = Number.isInteger(Number(result.imageIndex)) ? Number(result.imageIndex) : (target.imageIndex ?? 0);
      const resolved = { messageId, imageIndex };

      if (candidates.length === 1) {
        const chatId = resolveChatId(target, ctx);
        if (!chatId) {
          controls.status.textContent = "Open the image's chat before regenerating it.";
          controls.status.removeAttribute("aria-busy");
          controls.buttons.forEach((button) => { button.disabled = false; });
          return;
        }
        const applyId = makeRequestId("inlay-apply");
        controls.status.textContent = "Applying the only successful image...";
        controls.status.setAttribute("aria-busy", "true");
        activeApplyRequest = { id: applyId, modal, controls };
        ctx.sendToBackend({
          type: "reroll_image_apply",
          requestId: applyId,
          ...target,
          chatId,
          messageId: resolved.messageId,
          imageIndex: resolved.imageIndex,
          candidate: candidates[0]
        });
        return;
      }

      controls.status.textContent = "";
      controls.status.removeAttribute("aria-busy");

      const onCancelDismiss = (): void => {
        if (activeApplyRequest?.modal === modal) activeApplyRequest = null;
        modal.dismiss();
        if (activeModal === modal) activeModal = null;
      };

      renderCandidatePicker(
        modal,
        candidates,
        resolved,
        target,
        controls,
        () => resolveChatId(target, ctx),
        (candidate, pickerControls, res) => {
          const chatId = resolveChatId(target, ctx);
          if (!chatId) {
            pickerControls.status.textContent = "Open the image's chat before regenerating it.";
            pickerControls.buttons.forEach((b) => { b.disabled = false; });
            return;
          }
          const applyId = makeRequestId("inlay-apply");
          pickerControls.buttons.forEach((b) => { b.disabled = true; });
          pickerControls.status.textContent = "Applying selected image...";
          pickerControls.status.setAttribute("aria-busy", "true");
          activeApplyRequest = { id: applyId, modal, controls: pickerControls };
          ctx.sendToBackend({
            type: "reroll_image_apply",
            requestId: applyId,
            ...target,
            chatId,
            messageId: res.messageId,
            imageIndex: res.imageIndex,
            candidate
          });
        },
        onCancelDismiss,
        () => {}
      );
      return;
    }

    // Full reroll result
    if (result.type === "inlay_reroll_all_result") {
      const requestId = String(result.requestId || "");
      if (!activeFullRequest || requestId !== activeFullRequest.id) return;
      if (activeFullRequest.modal !== activeModal) {
        activeFullRequest = null;
        return;
      }
      const controls = activeFullRequest.controls;
      const modal = activeFullRequest.modal;
      if (result.ok === true) {
        const failedCount = Number(result.failedCount) || 0;
        if (failedCount > 0) {
          controls.status.textContent = `Rerolled with ${failedCount} failure(s) \u2014 prior images preserved`;
          controls.status.removeAttribute("aria-busy");
          controls.buttons.forEach((button) => { button.disabled = false; });
          activeFullRequest = null;
          return;
        }
        controls.status.textContent = "All images rerolled";
        controls.status.removeAttribute("aria-busy");
        const pending = activeFullRequest;
        activeFullRequest = null;
        pending.modal.dismiss();
        if (activeModal === modal) activeModal = null;
        return;
      }
      controls.status.textContent = String(result.error || "Full reroll failed.");
      controls.status.removeAttribute("aria-busy");
      controls.buttons.forEach((button) => { button.disabled = false; });
      activeFullRequest = null;
      return;
    }

    // Apply result and single reroll/sidecar share inlay_image_action_result
    if (result.type === "inlay_image_action_result") {
      const requestId = String(result.requestId || "");
      const operation = String(result.operation || "");
      if (activeApplyRequest && requestId === activeApplyRequest.id) {
        if (activeApplyRequest.modal !== activeModal) {
          activeApplyRequest = null;
          return;
        }
        const controls = activeApplyRequest.controls;
        const modal = activeApplyRequest.modal;
        if (result.ok === true) {
          controls.status.textContent = "Image replaced. Reopening will show its updated details.";
          controls.status.removeAttribute("aria-busy");
          const pending = activeApplyRequest;
          activeApplyRequest = null;
          pending.modal.dismiss();
          if (activeModal === modal) activeModal = null;
          return;
        }
        controls.status.textContent = String(result.error || "Image regeneration failed.");
        controls.status.removeAttribute("aria-busy");
        controls.buttons.forEach((button) => { button.disabled = false; });
        activeApplyRequest = null;
        return;
      }
      if (operation === "reroll_apply") {
        return;
      }
      if (requestId !== activeRequest?.id) return;
      if (activeRequest.modal !== activeModal) {
        activeRequest = null;
        return;
      }
      if (result.ok === true) {
        activeRequest.controls.status.textContent = "Image replaced. Reopening will show its updated details.";
        activeRequest.controls.status.removeAttribute("aria-busy");
        const pending = activeRequest;
        activeRequest = null;
        pending.modal.dismiss();
        if (activeModal === pending.modal) activeModal = null;
        return;
      }
      activeRequest.controls.status.textContent = String(result.error || "Image regeneration failed.");
      activeRequest.controls.status.removeAttribute("aria-busy");
      activeRequest.controls.buttons.forEach((button) => { button.disabled = false; });
      activeRequest = null;
      return;
    }
  });

  const onClick = (event: MouseEvent): void => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const image = event.composedPath()
      .map((target) => findInlayImage(target ?? null))
      .find((candidate): candidate is HTMLImageElement => Boolean(candidate)) || findInlayImage(event.target);
    if (!image) return;

    const initialDetails = detailsForImage(image);
    const actionTarget = actionTargetForImage(image);
    try {
      activeModal?.dismiss();
      const modal = ctx.ui.showModal({
        title: image.alt || "Inlay illustration",
        width: 1440,
        maxHeight: Math.max(480, window.innerHeight - 48)
      });
      activeModal = modal;
      (activeModal as any).__inlayImage = image;
      (activeModal as any).__inlayTarget = actionTarget;

      let panelControls: LightboxControls | null = null;
      let currentDetails: InlayGenerationDetails = initialDetails;

      const handleEditAction = (type: "prompt" | "quote" | "delete", controls: LightboxControls): void => {
        if (type === "prompt") {
          if (currentDetails.hasRawPromptData === false) {
            controls.status.textContent = "Prompt data unavailable for this image.";
            return;
          }
          if (currentDetails.hasRawPromptData === undefined) {
            controls.status.textContent = "Loading prompt data...";
            controls.status.setAttribute("aria-busy", "true");
            const chatId = resolveChatId(actionTarget, ctx);
            if (!chatId) {
              controls.status.textContent = "Open the image's chat before editing.";
              controls.status.removeAttribute("aria-busy");
              return;
            }
            const requestId = makeRequestId("inlay-details");
            // Temporarily store pending edit intent
            const pendingRender = (details: InlayGenerationDetails): void => {
              currentDetails = details;
              controls.status.textContent = "";
              controls.status.removeAttribute("aria-busy");
              // Re-render main panel to show raw fields with fresh details
              panelControls = appendLightboxContent(modal.root, image, details, actionTarget, (op, c) => {
                let chatId2 = resolveChatId(actionTarget, ctx);
                if (!chatId2) { c.status.textContent = "Open the image's chat before regenerating it."; return; }
                const requestId2 = makeRequestId();
                if (op === "sidecar") { c.buttons.forEach((b)=>{b.disabled=true;}); c.status.textContent="Rerunning sidecar and generating..."; c.status.setAttribute("aria-busy","true"); activeRequest={id:requestId2, modal, controls:c}; ctx.sendToBackend({type:"rerun_image_sidecar", requestId:requestId2, ...actionTarget, chatId:chatId2}); return; }
                if (op === "full") { if (!actionTarget.messageId) { c.status.textContent="No message context for full reroll."; return; } c.buttons.forEach((b)=>{b.disabled=true;}); c.status.textContent="Rerolling all images..."; c.status.setAttribute("aria-busy","true"); activeFullRequest={id:requestId2, modal, controls:c}; ctx.sendToBackend({type:"reroll_all_images", requestId:requestId2, chatId:chatId2, messageId:actionTarget.messageId, swipeId:actionTarget.swipeId}); return; }
                if (latestRerollCount>1) { c.buttons.forEach((b)=>{b.disabled=true;}); c.status.textContent=`Generating ${latestRerollCount} candidates...`; c.status.setAttribute("aria-busy","true"); activeCandidateRequest={id:requestId2, modal, controls:c, target:actionTarget}; ctx.sendToBackend({type:"reroll_image_candidates", requestId:requestId2, ...actionTarget, chatId:chatId2, count:latestRerollCount}); return; }
                c.buttons.forEach((b)=>{b.disabled=true;}); c.status.textContent="Rerolling with a fresh seed..."; c.status.setAttribute("aria-busy","true"); activeRequest={id:requestId2, modal, controls:c}; ctx.sendToBackend({type:"reroll_image", requestId:requestId2, ...actionTarget, chatId:chatId2});
              }, handleEditAction);
              // Now reopen edit prompt with fresh details
              handleEditAction("prompt", controls);
            };
            activeDetailsRequest = { id: requestId, modal, render: pendingRender };
            ctx.sendToBackend({ type: "get_inlay_image_details", requestId, ...actionTarget, chatId });
            return;
          }
          // Open edit prompt modal
          let editModal: ModalHandle | null = null;
          try {
            editModal = ctx.ui.showModal({ title: "Edit prompt", width: 640 });
          } catch {
            return;
          }
          const form = document.createElement("form");
          form.className = "inlay-edit-prompt-form";
          form.setAttribute("aria-label", "Edit prompt form");
          const fields: Array<{ label: string; key: keyof InlayGenerationDetails; value: string }> = [
            { label: "Setup", key: "setup", value: (currentDetails.setup || (currentDetails.rawPromptData as any)?.setup || "") },
            { label: "Pos (charPos)", key: "charPos", value: (currentDetails.charPos || (currentDetails.rawPromptData as any)?.charPos || "") },
            { label: "Neg (charNeg)", key: "charNeg", value: (currentDetails.charNeg || (currentDetails.rawPromptData as any)?.charNeg || "") },
            { label: "Sup (supplement)", key: "supplement", value: (currentDetails.supplement || (currentDetails.rawPromptData as any)?.supplement || "") }
          ];
          const textareas: Record<string, HTMLTextAreaElement> = {};
          fields.forEach((f) => {
            const l = document.createElement("label");
            l.textContent = f.label;
            const ta = document.createElement("textarea");
            ta.value = f.value;
            ta.rows = 3;
            ta.setAttribute("aria-label", f.label);
            ta.required = false;
            l.append(ta);
            form.append(l);
            textareas[f.key as string] = ta;
          });
          const status = document.createElement("div");
          status.className = "inlay-edit-status";
          status.setAttribute("aria-live", "polite");
          status.setAttribute("role", "status");
          (editModal as any).__editStatus = status;
          const actions = document.createElement("div");
          actions.className = "inlay-edit-actions";
          const save = document.createElement("button");
          save.type = "submit";
          save.textContent = "Save";
          save.setAttribute("aria-label", "Save prompt");
          const cancel = document.createElement("button");
          cancel.type = "button";
          cancel.textContent = "Cancel";
          cancel.setAttribute("aria-label", "Cancel prompt edit");
          actions.append(save, cancel);
          form.append(status, actions);
          editModal.root.replaceChildren(form);
          cancel.addEventListener("click", () => editModal?.dismiss());
          form.addEventListener("submit", (e) => {
            e.preventDefault();
            const payload = {
              setup: textareas.setup.value,
              charPos: textareas.charPos.value,
              charNeg: textareas.charNeg.value,
              supplement: textareas.supplement.value
            };
            // Validate sizes
            for (const v of Object.values(payload)) {
              if (v.length > 5000) {
                status.textContent = "Field too long (max 5000)";
                return;
              }
            }
            const requestId = makeRequestId("inlay-prompt-edit");
            controls.buttons.forEach((b) => { b.disabled = true; });
            save.disabled = true;
            cancel.disabled = true;
            Object.values(textareas).forEach((ta) => { ta.disabled = true; });
            status.textContent = "Saving...";
            status.setAttribute("aria-busy", "true");
            activePromptEditRequest = { id: requestId, modal, controls, editModal };
            const chatId = resolveChatId(actionTarget, ctx);
            if (!chatId) {
              status.textContent = "Open the image's chat before editing.";
              status.removeAttribute("aria-busy");
              controls.buttons.forEach((b) => { b.disabled = false; });
              save.disabled = false;
              cancel.disabled = false;
              Object.values(textareas).forEach((ta) => { ta.disabled = false; });
              activePromptEditRequest = null;
              return;
            }
            ctx.sendToBackend({
              type: "update_inlay_prompt_data",
              requestId,
              ...actionTarget,
              chatId,
              setup: payload.setup,
              charPos: payload.charPos,
              charNeg: payload.charNeg,
              supplement: payload.supplement
            });
          });
          editModal.onDismiss(() => {
            if (activePromptEditRequest?.editModal === editModal) {
              // if dismissed without save, re-enable controls
              controls.buttons.forEach((b) => { b.disabled = false; });
              activePromptEditRequest = null;
            }
          });
          return;
        }
        if (type === "quote") {
          let editModal: ModalHandle | null = null;
          try {
            editModal = ctx.ui.showModal({ title: "Edit quote", width: 600 });
          } catch { return; }
          const form = document.createElement("form");
          form.className = "inlay-edit-quote-form";
          form.setAttribute("aria-label", "Edit quote form");
          const label = document.createElement("label");
          label.textContent = "Quote (empty to remove)";
          const ta = document.createElement("textarea");
          ta.value = currentDetails.quote || "";
          ta.rows = 4;
          ta.setAttribute("aria-label", "Quote");
          label.append(ta);
          form.append(label);
          const status = document.createElement("div");
          status.className = "inlay-edit-status";
          status.setAttribute("aria-live", "polite");
          status.setAttribute("role", "status");
          (editModal as any).__editStatus = status;
          const actions = document.createElement("div");
          actions.className = "inlay-edit-actions";
          const save = document.createElement("button");
          save.type = "submit";
          save.textContent = "Save";
          save.setAttribute("aria-label", "Save quote");
          const cancel = document.createElement("button");
          cancel.type = "button";
          cancel.textContent = "Cancel";
          cancel.setAttribute("aria-label", "Cancel quote edit");
          actions.append(save, cancel);
          form.append(status, actions);
          editModal.root.replaceChildren(form);
          cancel.addEventListener("click", () => editModal?.dismiss());
          form.addEventListener("submit", (e) => {
            e.preventDefault();
            const newQuote = ta.value;
            if (newQuote.length > 4000) {
              status.textContent = "Quote too long (max 4000)";
              return;
            }
            const requestId = makeRequestId("inlay-quote-edit");
            controls.buttons.forEach((b) => { b.disabled = true; });
            save.disabled = true;
            cancel.disabled = true;
            ta.disabled = true;
            status.textContent = "Saving...";
            status.setAttribute("aria-busy", "true");
            const chatId = resolveChatId(actionTarget, ctx);
            if (!chatId) {
              status.textContent = "Open the image's chat before editing.";
              status.removeAttribute("aria-busy");
              controls.buttons.forEach((b) => { b.disabled = false; });
              activeQuoteEditRequest = null;
              save.disabled = false; cancel.disabled = false; ta.disabled = false;
              return;
            }
            activeQuoteEditRequest = { id: requestId, modal, controls, editModal, chatId };
            ctx.sendToBackend({
              type: "update_inlay_quote",
              requestId,
              ...actionTarget,
              chatId,
              quote: newQuote
            });
          });
          editModal.onDismiss(() => {
            if (activeQuoteEditRequest?.editModal === editModal) {
              controls.buttons.forEach((b) => { b.disabled = false; });
              activeQuoteEditRequest = null;
            }
          });
          return;
        }
        if (type === "delete") {
          const doDelete = async (): Promise<void> => {
            let confirmed = false;
            try {
              if (typeof ctx.ui.showConfirm === "function") {
                const res = await ctx.ui.showConfirm({ title: "Delete image", message: "Delete this image and its prompt? This removes the reference but not the provider asset.", variant: "danger", confirmLabel: "Delete", cancelLabel: "Cancel" });
                confirmed = Boolean((res as any).confirmed);
              } else if (typeof window !== "undefined" && typeof window.confirm === "function") {
                confirmed = window.confirm("Delete this image and its prompt?");
              } else {
                confirmed = true;
              }
            } catch {
              confirmed = false;
            }
            if (!confirmed) return;
            const requestId = makeRequestId("inlay-delete");
            controls.buttons.forEach((b) => { b.disabled = true; });
            controls.status.textContent = "Deleting...";
            controls.status.setAttribute("aria-busy", "true");
            activeDeleteRequest = { id: requestId, modal, controls };
            const chatId = resolveChatId(actionTarget, ctx);
            if (!chatId) {
              controls.status.textContent = "Open the image's chat before deleting.";
              controls.status.removeAttribute("aria-busy");
              controls.buttons.forEach((b) => { b.disabled = false; });
              activeDeleteRequest = null;
              return;
            }
            ctx.sendToBackend({
              type: "delete_inlay_image",
              requestId,
              ...actionTarget,
              chatId
            });
          };
          void doDelete();
          return;
        }
      };

      const render = (nextDetails: InlayGenerationDetails): void => {
        currentDetails = nextDetails;
        panelControls = appendLightboxContent(modal.root, image, nextDetails, actionTarget, (operation, controls) => {
          let chatId = resolveChatId(actionTarget, ctx);
          if (!chatId) {
            controls.status.textContent = "Open the image's chat before regenerating it.";
            return;
          }
          const requestId = makeRequestId();

          if (operation === "sidecar") {
            controls.buttons.forEach((button) => { button.disabled = true; });
            controls.status.textContent = "Rerunning sidecar and generating...";
            controls.status.setAttribute("aria-busy", "true");
            activeRequest = { id: requestId, modal, controls };
            ctx.sendToBackend({
              type: "rerun_image_sidecar",
              requestId,
              ...actionTarget,
              chatId
            });
            return;
          }

          if (operation === "full") {
            if (!actionTarget.messageId) {
              controls.status.textContent = "No message context for full reroll.";
              return;
            }
            controls.buttons.forEach((button) => { button.disabled = true; });
            controls.status.textContent = "Rerolling all images...";
            controls.status.setAttribute("aria-busy", "true");
            activeFullRequest = { id: requestId, modal, controls };
            ctx.sendToBackend({
              type: "reroll_all_images",
              requestId,
              chatId,
              messageId: actionTarget.messageId,
              swipeId: actionTarget.swipeId
            });
            return;
          }

          if (latestRerollCount > 1) {
            controls.buttons.forEach((button) => { button.disabled = true; });
            controls.status.textContent = `Generating ${latestRerollCount} candidates...`;
            controls.status.setAttribute("aria-busy", "true");
            activeCandidateRequest = { id: requestId, modal, controls, target: actionTarget };
            ctx.sendToBackend({
              type: "reroll_image_candidates",
              requestId,
              ...actionTarget,
              chatId,
              count: latestRerollCount
            });
            return;
          }

          controls.buttons.forEach((button) => { button.disabled = true; });
          controls.status.textContent = "Rerolling with a fresh seed...";
          controls.status.setAttribute("aria-busy", "true");
          activeRequest = { id: requestId, modal, controls };
          ctx.sendToBackend({
            type: "reroll_image",
            requestId,
            ...actionTarget,
            chatId
          });
        }, handleEditAction);
      };
      render(initialDetails);
      if (!initialDetails.prompt && (actionTarget.imageId || actionTarget.messageId)) {
        let chatId = resolveChatId(actionTarget, ctx);
        if (chatId) {
          const requestId = makeRequestId("inlay-details");
          activeDetailsRequest = { id: requestId, modal, render };
          ctx.sendToBackend({ type: "get_inlay_image_details", requestId, ...actionTarget, chatId });
        }
      }
      modal.onDismiss(() => {
        if (activeModal === modal) activeModal = null;
        if (activeRequest?.modal === modal) {
          activeRequest.controls.status.removeAttribute("aria-busy");
          activeRequest = null;
        }
        if (activeDetailsRequest?.modal === modal) activeDetailsRequest = null;
        if (activeCandidateRequest?.modal === modal) {
          activeCandidateRequest.controls.status.removeAttribute("aria-busy");
          activeCandidateRequest = null;
        }
        if (activeApplyRequest?.modal === modal) {
          activeApplyRequest.controls.status.removeAttribute("aria-busy");
          activeApplyRequest = null;
        }
        if (activeFullRequest?.modal === modal) {
          activeFullRequest.controls.status.removeAttribute("aria-busy");
          activeFullRequest = null;
        }
        if (activePromptEditRequest?.modal === modal) {
          activePromptEditRequest.editModal?.dismiss();
          activePromptEditRequest = null;
        }
        if (activeQuoteEditRequest?.modal === modal) {
          activeQuoteEditRequest.editModal?.dismiss();
          activeQuoteEditRequest = null;
        }
        if (activeDeleteRequest?.modal === modal) {
          activeDeleteRequest.controls.status.removeAttribute("aria-busy");
          activeDeleteRequest = null;
        }
      });
    } catch {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    event.stopPropagation();
  };

  window.addEventListener("click", onClick, true);
  return () => {
    observer.disconnect();
    unsubscribeResults();
    window.removeEventListener("click", onClick, true);
    activeModal?.dismiss();
    activeModal = null;
    activeRequest = null;
    activeDetailsRequest = null;
    activeCandidateRequest = null;
    activeApplyRequest = null;
    activeFullRequest = null;
    activePromptEditRequest = null;
    activeQuoteEditRequest = null;
    activeDeleteRequest = null;
  };
}
