import type { InputHTMLAttributes, TextareaHTMLAttributes } from "preact";
import { cn } from "./cn.js";

export type TextFieldProps = {
  className?: string;
  type?: "text" | "search" | "number" | "password" | "email" | "url";
  value?: string | number;
  defaultValue?: string | number;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  id?: string;
  name?: string;
  min?: number;
  max?: number;
  step?: number;
  maxLength?: number;
  autoComplete?: string;
  inputMode?: "text" | "numeric" | "decimal" | "search";
  onInput?: InputHTMLAttributes<HTMLInputElement>["onInput"];
  onChange?: InputHTMLAttributes<HTMLInputElement>["onChange"];
  onBlur?: InputHTMLAttributes<HTMLInputElement>["onBlur"];
  onKeyDown?: InputHTMLAttributes<HTMLInputElement>["onKeyDown"];
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
};

/** Asset Maid text input (`eo`). */
export function TextField({ className, type = "text", ...props }: TextFieldProps) {
  const attributes = {
    ...props,
    type,
    class: cn("h-9 w-full min-w-0 rounded-md border-0 bg-input px-3 text-xs text-foreground outline-none placeholder:text-muted-foreground/65 focus-visible:ring-2 focus-visible:ring-ring/55 disabled:cursor-not-allowed disabled:opacity-45 max-md:h-11 max-md:text-base", className)
  };
  // Preact types model <input> as a union keyed by `type`; the props above are valid for every type we allow.
  return <input {...(attributes as {})} />;
}

export type TextAreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "class"> & { className?: string };

/** Asset Maid textarea (`fc`). */
export function TextArea({ className, ...props }: TextAreaProps) {
  return (
    <textarea
      class={cn("min-h-24 w-full resize-none rounded-md border-0 bg-input px-3 py-2.5 text-2xs leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/65 focus-visible:ring-2 focus-visible:ring-ring/55 disabled:cursor-not-allowed disabled:opacity-45 max-md:text-base", className)}
      {...props}
    />
  );
}
