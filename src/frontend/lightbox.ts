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
  perspectiveMode: "creative" | "static" | "dynamic" | null;
  perspectiveSource: "adaptive" | "manual" | null;
};

export function resolveInlayPrompt(attributePrompt: string | null, fallbackPrompt: string | null): string {
  return (attributePrompt || fallbackPrompt || "").trim();
}

export function resolveInlayDetails(
  attributePrompt: string | null,
  fallbackPrompt: string | null,
  attributeNegative: string | null,
  fallbackNegative: string | null,
  perspectiveMode: string | null,
  perspectiveSource: string | null
): InlayGenerationDetails {
  const normalizedMode = perspectiveMode?.trim().toLowerCase();
  const normalizedSource = perspectiveSource?.trim().toLowerCase();
  return {
    prompt: resolveInlayPrompt(attributePrompt, fallbackPrompt),
    negativePrompt: resolveInlayPrompt(attributeNegative, fallbackNegative),
    perspectiveMode: normalizedMode === "creative" || normalizedMode === "static" || normalizedMode === "dynamic"
      ? normalizedMode
      : null,
    perspectiveSource: normalizedSource === "adaptive" || normalizedSource === "manual" ? normalizedSource : null
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
    image.getAttribute("data-inlay-illustrator-perspective"),
    image.getAttribute("data-inlay-illustrator-perspective-source")
  );
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

function appendLightboxContent(root: HTMLElement, image: HTMLImageElement, details: InlayGenerationDetails): void {
  const layout = document.createElement("div");
  layout.className = "inlay-lightbox-layout";

  const preview = document.createElement("img");
  preview.className = "inlay-lightbox-image";
  preview.src = image.currentSrc || image.src;
  preview.alt = image.alt || "Generated illustration";

  const panel = document.createElement("section");
  panel.className = "inlay-lightbox-prompt-panel";
  const heading = document.createElement("h3");
  heading.textContent = "Generation details";
  panel.append(heading);
  if (details.perspectiveMode || details.perspectiveSource) {
    const metadata = document.createElement("div");
    metadata.className = "inlay-lightbox-meta";
    if (details.perspectiveMode) {
      const mode = document.createElement("span");
      mode.textContent = `Perspective: ${details.perspectiveMode[0].toUpperCase()}${details.perspectiveMode.slice(1)}`;
      metadata.append(mode);
    }
    if (details.perspectiveSource) {
      const source = document.createElement("span");
      source.textContent = `Selection: ${details.perspectiveSource === "adaptive" ? "Adaptive" : "Manual"}`;
      metadata.append(source);
    }
    panel.append(metadata);
  }
  panel.append(
    promptBlock("Positive prompt", details.prompt, "No prompt was recorded for this image."),
    promptBlock("Negative prompt", details.negativePrompt, "No negative prompt was recorded for this image.")
  );

  layout.append(preview, panel);
  root.replaceChildren(layout);
}

export function installInlayLightbox(ctx: SpindleFrontendContext): () => void {
  let activeModal: ReturnType<SpindleFrontendContext["ui"]["showModal"]> | null = null;
  disableNativeInlayLightboxes(document);
  const observer = new MutationObserver(() => disableNativeInlayLightboxes(document));
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const onClick = (event: MouseEvent): void => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const image = event.composedPath()
      .map((target) => findInlayImage(target ?? null))
      .find((candidate): candidate is HTMLImageElement => Boolean(candidate)) || findInlayImage(event.target);
    if (!image) return;

    const details = detailsForImage(image);
    try {
      activeModal?.dismiss();
      const modal = ctx.ui.showModal({
        title: image.alt || "Inlay illustration",
        width: 1440,
        maxHeight: Math.max(480, window.innerHeight - 48)
      });
      activeModal = modal;
      appendLightboxContent(modal.root, image, details);
      modal.onDismiss(() => {
        if (activeModal === modal) activeModal = null;
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
    window.removeEventListener("click", onClick, true);
    activeModal?.dismiss();
    activeModal = null;
  };
}
