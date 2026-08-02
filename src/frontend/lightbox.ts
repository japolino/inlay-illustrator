import type { SpindleFrontendContext } from "lumiverse-spindle-types";

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
  return {
    prompt: resolveInlayPrompt(attributePrompt, fallbackPrompt),
    negativePrompt: resolveInlayPrompt(attributeNegative, fallbackNegative),
    quote: (quote || "").trim()
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
  const imageUrl = image.getAttribute("src") || image.currentSrc || image.src;
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

function appendLightboxContent(
  root: HTMLElement,
  image: HTMLImageElement,
  details: InlayGenerationDetails,
  onAction: (operation: "reroll" | "sidecar", controls: LightboxControls) => void
): void {
  const layout = document.createElement("div");
  layout.className = "inlay-lightbox-layout";

  const preview = document.createElement("img");
  preview.className = "inlay-lightbox-image";
  preview.src = image.currentSrc || image.src;
  preview.alt = image.alt || "Generated illustration";

  const visual = document.createElement("div");
  visual.className = "inlay-lightbox-visual";
  visual.append(preview);
  if (details.quote) {
    const quote = document.createElement("blockquote");
    quote.className = "inlay-lightbox-quote";
    quote.textContent = details.quote;
    visual.append(quote);
  }

  const panel = document.createElement("section");
  panel.className = "inlay-lightbox-prompt-panel";
  const heading = document.createElement("h3");
  heading.textContent = "Generation details";
  panel.append(heading);
  panel.append(
    promptBlock("Positive prompt", details.prompt, "No prompt was recorded for this image."),
    promptBlock("Negative prompt", details.negativePrompt, "No negative prompt was recorded for this image.")
  );
  const actions = document.createElement("div");
  actions.className = "inlay-lightbox-actions";
  const reroll = document.createElement("button");
  reroll.type = "button";
  reroll.textContent = "Reroll image";
  const sidecar = document.createElement("button");
  sidecar.type = "button";
  sidecar.textContent = "Rerun sidecar";
  const status = document.createElement("div");
  status.className = "inlay-lightbox-action-status";
  status.setAttribute("aria-live", "polite");
  const controls = { status, buttons: [reroll, sidecar] };
  reroll.addEventListener("click", () => onAction("reroll", controls));
  sidecar.addEventListener("click", () => onAction("sidecar", controls));
  actions.append(reroll, sidecar, status);
  panel.append(actions);

  layout.append(visual, panel);
  root.replaceChildren(layout);
}

export function installInlayLightbox(ctx: SpindleFrontendContext): () => void {
  let activeModal: ModalHandle | null = null;
  let activeRequest: { id: string; modal: ModalHandle; controls: LightboxControls } | null = null;
  let activeDetailsRequest: { id: string; modal: ModalHandle; render: (details: InlayGenerationDetails) => void } | null = null;
  disableNativeInlayLightboxes(document);
  const observer = new MutationObserver(() => disableNativeInlayLightboxes(document));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  const unsubscribeResults = ctx.onBackendMessage((payload: unknown) => {
    if (!payload || typeof payload !== "object") return;
    const result = payload as Record<string, unknown>;
    if (result.type === "inlay_image_details_result" && String(result.requestId || "") === activeDetailsRequest?.id) {
      if (result.ok === true) {
        activeDetailsRequest.render(resolveInlayDetails(
          typeof result.prompt === "string" ? result.prompt : null,
          null,
          typeof result.negativePrompt === "string" ? result.negativePrompt : null,
          null,
          typeof result.quote === "string" ? result.quote : null
        ));
      }
      activeDetailsRequest = null;
      return;
    }
    if (result.type !== "inlay_image_action_result" || String(result.requestId || "") !== activeRequest?.id) return;
    if (result.ok === true) {
      activeRequest.controls.status.textContent = "Image replaced. Reopening will show its updated details.";
      activeRequest.modal.dismiss();
      activeRequest = null;
      return;
    }
    activeRequest.controls.status.textContent = String(result.error || "Image regeneration failed.");
    activeRequest.controls.buttons.forEach((button) => { button.disabled = false; });
    activeRequest = null;
  });

  const onClick = (event: MouseEvent): void => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const image = event.composedPath()
      .map((target) => findInlayImage(target ?? null))
      .find((candidate): candidate is HTMLImageElement => Boolean(candidate)) || findInlayImage(event.target);
    if (!image) return;

    const details = detailsForImage(image);
    const actionTarget = actionTargetForImage(image);
    try {
      activeModal?.dismiss();
      const modal = ctx.ui.showModal({
        title: image.alt || "Inlay illustration",
        width: 1440,
        maxHeight: Math.max(480, window.innerHeight - 48)
      });
      activeModal = modal;
      const render = (nextDetails: InlayGenerationDetails): void => appendLightboxContent(modal.root, image, nextDetails, (operation, controls) => {
        let chatId = actionTarget.chatId || "";
        if (!chatId) {
          try {
            chatId = String(ctx.getActiveChat().chatId || "");
          } catch {
            chatId = "";
          }
        }
        if (!chatId) {
          controls.status.textContent = "Open the image's chat before regenerating it.";
          return;
        }
        const requestId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `inlay-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        controls.buttons.forEach((button) => { button.disabled = true; });
        controls.status.textContent = operation === "sidecar" ? "Rerunning sidecar and generating..." : "Rerolling with a fresh seed...";
        activeRequest = { id: requestId, modal, controls };
        ctx.sendToBackend({
          type: operation === "sidecar" ? "rerun_image_sidecar" : "reroll_image",
          requestId,
          ...actionTarget,
          chatId
        });
      });
      render(details);
      if (!details.prompt && (actionTarget.imageId || actionTarget.messageId)) {
        let chatId = actionTarget.chatId || "";
        if (!chatId) {
          try {
            chatId = String(ctx.getActiveChat().chatId || "");
          } catch {
            chatId = "";
          }
        }
        if (chatId) {
          const requestId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `inlay-details-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          activeDetailsRequest = { id: requestId, modal, render };
          ctx.sendToBackend({ type: "get_inlay_image_details", requestId, ...actionTarget, chatId });
        }
      }
      modal.onDismiss(() => {
        if (activeModal === modal) activeModal = null;
        if (activeRequest?.modal === modal) activeRequest = null;
        if (activeDetailsRequest?.modal === modal) activeDetailsRequest = null;
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
  };
}
