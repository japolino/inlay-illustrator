import type { SpindleFrontendContext } from "lumiverse-spindle-types";

type SettingsMountUi = Pick<SpindleFrontendContext["ui"], "mount">;

export type InlaySettingsHost = {
  root: HTMLElement;
  destroy(): void;
};

/**
 * Mount an extension-owned child inside Lumiverse's shared Extensions settings
 * surface. The shared mount must never be cleared or passed to a renderer that
 * replaces innerHTML because it also contains other extensions.
 */
export function mountInlaySettingsHost(ui: SettingsMountUi): InlaySettingsHost {
  const sharedMount = ui.mount("settings_extensions");
  const root = document.createElement("section");
  root.className = "inlay-settings-host";
  root.setAttribute("data-inlay-illustrator-settings", "true");
  root.setAttribute("aria-label", "Inlay Illustrator settings");
  sharedMount.appendChild(root);

  let destroyed = false;
  return {
    root,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (root.parentNode === sharedMount) sharedMount.removeChild(root);
    }
  };
}
