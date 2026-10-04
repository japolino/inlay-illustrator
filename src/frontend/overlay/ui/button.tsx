import type { ButtonHTMLAttributes, ComponentChildren } from "preact";
import { cn } from "./cn.js";

/** Asset Maid button variants (`tt`, AssetMaid.pretty.js 61970-62003). */
export const BUTTON_VARIANTS = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90",
  command: "bg-foreground text-background hover:bg-foreground/90",
  commandAction: "bg-surface-command-action text-secondary-foreground hover:bg-surface-command-action/82 hover:text-foreground",
  pageAction: "bg-surface-page-action text-muted-foreground hover:bg-surface-page-action/82 hover:text-primary",
  subtle: "bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground",
  ghost: "bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
  danger: "bg-destructive/18 text-destructive hover:bg-destructive/28"
} as const;

export const BUTTON_SIZES = {
  default: "h-8 px-3 max-md:h-11",
  sm: "h-7 px-2.5 max-md:h-11",
  icon: "size-8 p-0 max-md:size-11",
  workbenchIcon: "h-7.5 w-10 p-0 max-md:size-11",
  commandSm: "size-8.5 rounded-full p-0 max-md:size-11",
  command: "size-9.5 rounded-full p-0 max-md:size-11"
} as const;

export type ButtonVariant = keyof typeof BUTTON_VARIANTS;
export type ButtonSize = keyof typeof BUTTON_SIZES;

const BASE = "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-xs/3 font-bold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/55 disabled:pointer-events-none disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:size-4";

export function buttonClass(variant: ButtonVariant = "default", size: ButtonSize = "default", className?: string): string {
  return cn(BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className);
}

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "class" | "size"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children?: ComponentChildren;
};

export function Button({ variant, size = "default", className, type = "button", ...props }: ButtonProps) {
  const resolved = variant ?? (size === "command" || size === "commandSm" ? "command" : "default");
  return <button type={type} class={buttonClass(resolved, size, className)} {...props} />;
}

export type IconButtonProps = Omit<ButtonProps, "aria-label"> & { label: string };

/** Square icon button; `label` becomes aria-label and title. */
export function IconButton({ label, variant = "ghost", size = "icon", title, ...props }: IconButtonProps) {
  return <Button variant={variant} size={size} aria-label={label} title={title ?? label} {...props} />;
}
