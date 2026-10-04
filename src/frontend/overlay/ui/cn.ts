import { twMerge } from "tailwind-merge";

export type ClassValue = string | false | null | undefined | 0;

/** Joins class names and resolves Tailwind conflicts (last one wins), like Asset Maid's `ut`. */
export function cn(...classes: ClassValue[]): string {
  return twMerge(classes.filter(Boolean).join(" "));
}
