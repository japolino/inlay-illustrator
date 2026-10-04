/** Extra Lucide-style icons used by the settings pages (shapes redrawn as plain paths, ISC licence). */
import type { JSX } from "preact";
import { cn } from "../ui/index.js";

type IconProps = { className?: string };

function Icon({ className, children }: IconProps & { children: JSX.Element | JSX.Element[] }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={1.8}
      stroke-linecap="round" stroke-linejoin="round" class={cn("size-4 shrink-0", className)} aria-hidden="true">
      {children}
    </svg>
  );
}

/** Save (`ms`). */
export const SaveIcon = (p: IconProps) => <Icon {...p}><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" /><path d="M7 3v4a1 1 0 0 0 1 1h7" /></Icon>;
/** Rotate / reset (`Jd`). */
export const ResetIcon = (p: IconProps) => <Icon {...p}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></Icon>;
/** Plus (`ad`). */
export const PlusIcon = (p: IconProps) => <Icon {...p}><path d="M5 12h14" /><path d="M12 5v14" /></Icon>;
/** Minus (`qA`). */
export const MinusIcon = (p: IconProps) => <Icon {...p}><path d="M5 12h14" /></Icon>;
/** Pencil (`Zd`). */
export const PencilIcon = (p: IconProps) => <Icon {...p}><path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z" /><path d="m15 5 4 4" /></Icon>;
/** Send (`_7e`). */
export const SendIcon = (p: IconProps) => <Icon {...p}><path d="M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.64l-19 6.5a.5.5 0 0 0-.03.94l7.93 3.18a2 2 0 0 1 1.11 1.11z" /><path d="m21.85 2.15-10.94 10.94" /></Icon>;
/** Copy. */
export const CopyIcon = (p: IconProps) => <Icon {...p}><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></Icon>;
/** Plug (`bK`). */
export const PlugIcon = (p: IconProps) => <Icon {...p}><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" /></Icon>;
/** Spinner (`Xr`). */
export const SpinnerIcon = ({ className }: IconProps) => <Icon className={cn("animate-spin motion-reduce:animate-none", className)}><path d="M21 12a9 9 0 1 1-6.22-8.56" /></Icon>;
/** Analyze sparkle (`uc`). */
export const SparkleIcon = (p: IconProps) => <Icon {...p}><path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.13-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.13a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.13 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.13a.5.5 0 0 1-.96 0z" /></Icon>;
/** Image (built-in scene icon). */
export const ImageIcon = (p: IconProps) => <Icon {...p}><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" /></Icon>;
/** Comic panels (scene-comic). */
export const PanelsIcon = (p: IconProps) => <Icon {...p}><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 12h18" /><path d="M12 3v18" /></Icon>;
/** Eye (scene-pov). */
export const EyeIcon = (p: IconProps) => <Icon {...p}><path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" /><circle cx="12" cy="12" r="3" /></Icon>;
/** Users (scene-ensemble). */
export const GroupIcon = (p: IconProps) => <Icon {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></Icon>;
/** Ratio (image-ratio presets). */
export const RatioIcon = (p: IconProps) => <Icon {...p}><rect width="12" height="20" x="6" y="2" rx="2" /><rect width="20" height="12" x="2" y="6" rx="2" /></Icon>;
/** Shuffle / free (image-ratio-unspecified). */
export const ShuffleIcon = (p: IconProps) => <Icon {...p}><path d="m18 14 4 4-4 4" /><path d="m18 2 4 4-4 4" /><path d="M2 18h1.97a4 4 0 0 0 3.3-1.7l5.46-8.6A4 4 0 0 1 16.03 6H22" /><path d="M2 6h1.97a4 4 0 0 1 3.3 1.7l5.46 8.6a4 4 0 0 0 3.3 1.7H22" /></Icon>;
/** Alert circle (`Coe`). */
export const AlertCircleIcon = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="10" /><path d="M12 8v4" /><path d="M12 16h.01" /></Icon>;
