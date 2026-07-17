import type { SpindleFrontendContext } from "lumiverse-spindle-types";

const INLAY_IMAGE_SELECTOR = 'img[data-inlay-illustrator-prompt]';
const INLAY_WRAPPER_SELECTOR = '[data-inlay-illustrator="true"]';

export function resolveInlayPrompt(attributePrompt: string | null, fallbackPrompt: string | null): string {
  return (attributePrompt || fallbackPrompt || "").trim();
}

function findInlayImage(target: EventTarget | null): HTMLImageElement | null {
  if (!(target instanceof Element)) return null;
  const image = target.closest<HTMLImageElement>(INLAY_IMAGE_SELECTOR);
  if (!image?.closest(INLAY_WRAPPER_SELECTOR)) return null;
  return image;
}

function promptForImage(image: HTMLImageElement): string {
  const wrapper = image.closest(INLAY_WRAPPER_SELECTOR);
  const fallback = wrapper?.querySelector<HTMLElement>(".inlay-illustrator-prompt")?.textContent || null;
  return resolveInlayPrompt(image.getAttribute("data-inlay-illustrator-prompt"), fallback);
}

function appendLightboxContent(root: HTMLElement, image: HTMLImageElement, prompt: string): void {
  const layout = document.createElement("div");
  layout.className = "inlay-lightbox-layout";

  const preview = document.createElement("img");
  preview.className = "inlay-lightbox-image";
  preview.src = image.currentSrc || image.src;
  preview.alt = image.alt || "Generated illustration";

  const panel = document.createElement("section");
  panel.className = "inlay-lightbox-prompt-panel";
  const heading = document.createElement("h3");
  heading.textContent = "Generation prompt";
  const promptText = document.createElement("pre");
  promptText.className = "inlay-lightbox-prompt";
  promptText.textContent = prompt || "No prompt was recorded for this image.";
  panel.append(heading, promptText);

  layout.append(preview, panel);
  root.replaceChildren(layout);
}

export function installInlayLightbox(ctx: SpindleFrontendContext): () => void {
  let activeModal: ReturnType<SpindleFrontendContext["ui"]["showModal"]> | null = null;

  const onClick = (event: MouseEvent): void => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const image = findInlayImage(event.target);
    if (!image) return;

    const prompt = promptForImage(image);
    try {
      activeModal?.dismiss();
      const modal = ctx.ui.showModal({
        title: image.alt || "Inlay illustration",
        width: 1440,
        maxHeight: Math.max(480, window.innerHeight - 48)
      });
      activeModal = modal;
      appendLightboxContent(modal.root, image, prompt);
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
    window.removeEventListener("click", onClick, true);
    activeModal?.dismiss();
    activeModal = null;
  };
}
