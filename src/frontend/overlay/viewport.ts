import { useEffect, useState } from "preact/hooks";
import { MOBILE_MEDIA_QUERY } from "./constants.js";

/** True when the Lumiverse mobile rule (<=600px or coarse pointer) matches. */
export function isMobileViewport(win: Pick<Window, "matchMedia"> | undefined = typeof window === "undefined" ? undefined : window): boolean {
  try {
    return Boolean(win?.matchMedia?.(MOBILE_MEDIA_QUERY).matches);
  } catch {
    return false;
  }
}

export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => isMobileViewport());
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia(MOBILE_MEDIA_QUERY);
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return mobile;
}

/** Height covered by the on-screen keyboard (visual viewport vs layout viewport). */
export function keyboardInset(win: { innerHeight: number; visualViewport?: { height: number; offsetTop: number } | null }): number {
  const viewport = win.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, Math.round(win.innerHeight - viewport.height - viewport.offsetTop));
}

/** Keeps `--ii-am-keyboard-inset` on `element` in sync with the visual viewport. */
export function trackKeyboardInset(element: HTMLElement, win: Window): () => void {
  const update = () => element.style.setProperty("--ii-am-keyboard-inset", `${keyboardInset(win)}px`);
  update();
  const viewport = win.visualViewport;
  viewport?.addEventListener("resize", update);
  viewport?.addEventListener("scroll", update);
  return () => {
    viewport?.removeEventListener("resize", update);
    viewport?.removeEventListener("scroll", update);
  };
}
