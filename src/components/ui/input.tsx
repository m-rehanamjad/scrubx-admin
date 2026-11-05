import * as React from "react";
import { cn } from "../../lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-9 w-full rounded-md border border-line-strong bg-surface px-3 py-1 text-sm text-ink shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors",
        "placeholder:text-ink-muted focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20",
        "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-muted",
        "aria-[invalid=true]:border-rose-400 aria-[invalid=true]:ring-rose-500/15",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[92px] w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors",
      "placeholder:text-ink-muted focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/20",
      "disabled:cursor-not-allowed disabled:bg-surface-muted",
      "aria-[invalid=true]:border-rose-400 aria-[invalid=true]:ring-rose-500/15",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
