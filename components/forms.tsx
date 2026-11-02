"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "../lib/auth/action.ts";
import { Button, cx } from "./ui";

type Action = (previous: ActionResult | null, form: FormData) => Promise<ActionResult>;

export function Submit({ children, variant = "primary", size, className }: { children: ReactNode; variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} aria-busy={pending} className={className}>
      {pending ? "Saving…" : children}
    </Button>
  );
}

/** A form bound to a server action, showing its result in a live region. */
export function ActionForm({
  action,
  hidden,
  children,
  className,
  resetOnOk,
  onResult,
}: {
  action: Action;
  hidden?: Record<string, string>;
  children: ReactNode;
  className?: string;
  resetOnOk?: boolean;
  onResult?: (result: ActionResult) => void;
}) {
  const [result, run] = useActionState(action, null);
  const form = useRef<HTMLFormElement>(null);
  const latest = useRef(onResult);
  useEffect(() => {
    latest.current = onResult;
  });
  useEffect(() => {
    if (!result) return;
    latest.current?.(result);
    if (result.ok && resetOnOk) form.current?.reset();
  }, [result, resetOnOk]);

  return (
    <form ref={form} action={run} className={className}>
      {Object.entries(hidden ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <p role="status" aria-live="polite" className={cx("text-sm empty:hidden", result?.error ? "text-bad" : "text-good")}>
        {result?.error ?? result?.ok ?? ""}
      </p>
    </form>
  );
}

/** A filter form in the URL. Picking from a dropdown applies it; typed boxes apply on Enter or the button. */
export function FilterForm({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <form
      method="get"
      role="search"
      className={className}
      onChange={(event) => {
        if (event.target instanceof HTMLSelectElement) event.currentTarget.requestSubmit();
      }}
    >
      {children}
    </form>
  );
}

/** A native dialog: focus trap, Escape and inert background come for free. */
export function Dialog({ trigger, title, children, triggerVariant = "secondary", triggerSize }: { trigger: ReactNode; title: string; children: ReactNode; triggerVariant?: "primary" | "secondary" | "ghost" | "danger"; triggerSize?: "sm" | "md" }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button type="button" variant={triggerVariant} size={triggerSize} onClick={() => dialog.current?.showModal()}>
        {trigger}
      </Button>
      <dialog ref={dialog} className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-modal border border-line-strong bg-panel p-6 text-fg shadow-modal backdrop:bg-scrim">
        <div className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            <form method="dialog">
              <Button variant="ghost" size="sm">Close</Button>
            </form>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

/** Tick-all for a table of checkboxes that share a name. */
export function SelectAll({ name }: { name: string }) {
  return (
    <input
      type="checkbox"
      aria-label="Select all"
      className="size-4 accent-(--accent)"
      onChange={(event) => {
        const boxes = event.currentTarget.form?.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`);
        boxes?.forEach((box) => (box.checked = event.currentTarget.checked));
      }}
    />
  );
}
