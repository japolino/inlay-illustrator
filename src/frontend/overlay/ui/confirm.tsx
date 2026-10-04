import { createContext, type ComponentChildren } from "preact";
import { useCallback, useContext, useRef, useState } from "preact/hooks";
import { Button } from "./button.js";
import { Dialog } from "./dialog.js";
import { TrashIcon } from "./icons.js";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" (default) shows the destructive style with a trash icon. */
  tone?: "danger" | "default";
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(async () => false);

/** Returns `confirm(options) => Promise<boolean>` (false on cancel, Escape or backdrop). */
export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

/**
 * Confirm-dialog primitive modelled on Asset Maid's `P0t`: title, description,
 * ghost "Cancel" and a danger confirm button, no close X.
 */
export function ConfirmProvider({ children, defaultCancelLabel = "Cancel" }: { children: ComponentChildren; defaultCancelLabel?: string }) {
  const [request, setRequest] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setRequest(null);
  };

  const confirm = useCallback<ConfirmFn>((options) => {
    resolver.current?.(false);
    setRequest(options);
    return new Promise<boolean>((resolve) => { resolver.current = resolve; });
  }, []);

  const danger = (request?.tone ?? "danger") === "danger";
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={request !== null}
        onOpenChange={(open) => { if (!open) settle(false); }}
        role="alertdialog"
        title={request?.title ?? ""}
        description={request?.description}
        showCloseButton={false}
        className="w-[min(420px,calc(100%-32px))] gap-4"
        initialFocus={confirmButton}
        footer={
          <>
            <Button variant="ghost" onClick={() => settle(false)}>{request?.cancelLabel ?? defaultCancelLabel}</Button>
            <Button ref={confirmButton} variant={danger ? "danger" : "default"} onClick={() => settle(true)}>
              {danger ? <TrashIcon /> : null}
              {request?.confirmLabel}
            </Button>
          </>
        }
      />
    </ConfirmContext.Provider>
  );
}
