/** Lets screens outside the Atelier (settings) ask the shell to open it. The overlay App provides the opener. */
import { createContext } from "preact";
import { useContext } from "preact/hooks";

export const AtelierLauncherContext = createContext<(() => void) | null>(null);

export function useAtelierLauncher(): (() => void) | null {
  return useContext(AtelierLauncherContext);
}
