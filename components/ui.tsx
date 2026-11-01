import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const BUTTONS = {
  primary: "bg-(image:--gradient-accent) text-on-accent font-semibold shadow-glow hover:brightness-110",
  secondary: "bg-control text-fg border border-line-strong hover:bg-control-hover",
  ghost: "text-fg-soft hover:bg-hover hover:text-fg",
  danger: "bg-bad-soft text-bad border border-bad hover:brightness-110",
};

export function buttonClass(variant: keyof typeof BUTTONS = "secondary", size: "sm" | "md" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-1.5 rounded-full whitespace-nowrap transition duration-(--dur-fast) active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none",
    size === "sm" ? "h-(--control-sm) px-3.5 text-xs" : "h-(--control-md) px-4.5 text-sm",
    BUTTONS[variant],
  );
}

export function Button({ variant, size, className, ...props }: ComponentProps<"button"> & { variant?: keyof typeof BUTTONS; size?: "sm" | "md" }) {
  return <button {...props} className={cx(buttonClass(variant, size), className)} />;
}

export function LinkButton({ variant, size, className, ...props }: ComponentProps<typeof Link> & { variant?: keyof typeof BUTTONS; size?: "sm" | "md" }) {
  return <Link {...props} className={cx(buttonClass(variant, size), className)} />;
}

const fieldBase = "rounded-full border border-line-control bg-transparent px-4 text-base text-fg placeholder:text-fg-muted";
export const inputClass = `h-(--control-md) w-full ${fieldBase}`;
/** Sized by its content, for filter bars and sentences. */
export const inlineFieldClass = `h-(--control-md) ${fieldBase}`;
export const textareaClass = "w-full rounded-card border border-line-control bg-transparent p-3.5 text-base text-fg placeholder:text-fg-muted";

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="ps-1 text-fg-soft">{label}</span>
      {children}
      {hint && <span className="ps-1 text-xs text-fg-muted">{hint}</span>}
    </label>
  );
}

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("rounded-panel border border-line bg-panel p-5", className)}>{children}</section>;
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx("font-mono text-2xs tracking-label text-fg-muted uppercase", className)}>{children}</p>;
}

const TONES = {
  neutral: "border-line-strong text-fg-soft",
  good: "border-good text-good",
  warn: "border-warn text-warn",
  bad: "border-bad text-bad",
  accent: "border-accent-line bg-accent-soft text-accent",
  hot: "border-hot-line bg-hot-soft text-hot",
  warm: "border-warm-line bg-warm-soft text-warm",
  cold: "border-cold-line bg-cold-soft text-cold",
};

export function Pill({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={cx("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap", TONES[tone])}>{children}</span>;
}

export function Temperature({ temperature, score }: { temperature: string | null; score: number | null }) {
  if (!temperature) return <span className="text-xs text-fg-muted">Unscored</span>;
  const label = temperature[0].toUpperCase() + temperature.slice(1);
  return (
    <Pill tone={temperature as "hot" | "warm" | "cold"}>
      {label}
      {score !== null && <span className="font-mono tabular-nums">{score}</span>}
    </Pill>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid min-w-0 gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-balance text-fg">{title}</h1>
        {subtitle && <p className="max-w-[70ch] text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Empty({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 rounded-card border border-dashed border-line-strong px-5 py-10 text-center">
      <p className="text-md font-medium text-fg">{title}</p>
      {body && <p className="max-w-[46ch] text-sm text-fg-muted">{body}</p>}
      {children}
    </div>
  );
}

export function Banner({ tone = "warn", children, action }: { tone?: "warn" | "bad" | "accent" | "good"; children: ReactNode; action?: ReactNode }) {
  const styles = { warn: "border-warn bg-warn-soft", bad: "border-bad bg-bad-soft", accent: "border-accent-line bg-accent-soft", good: "border-good bg-good-soft" };
  return (
    <div className={cx("flex flex-wrap items-center justify-between gap-3 rounded-card border px-4 py-3 text-sm text-fg", styles[tone])}>
      <div className="min-w-0">{children}</div>
      {action}
    </div>
  );
}

export function Stat({ label, value, note, emphasis }: { label: string; value: ReactNode; note?: string; emphasis?: boolean }) {
  return (
    <div className={cx("grid content-start gap-1 rounded-tile border p-4", emphasis ? "border-accent-line bg-accent-soft" : "border-line bg-card")}>
      <span className="text-xs text-fg-muted">{label}</span>
      <span className={cx("text-2xl font-semibold tracking-tighter tabular-nums", emphasis ? "text-accent" : "text-fg")}>{value}</span>
      {note && <span className="text-xs text-fg-muted">{note}</span>}
    </div>
  );
}

/** A scrolling wrapper, so wide tables never push the page sideways. */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card border border-line">
      <table className="w-full border-collapse text-sm [&_td]:border-t [&_td]:border-line [&_td]:px-3.5 [&_td]:py-2.5 [&_td]:whitespace-nowrap [&_th]:px-3.5 [&_th]:py-2.5 [&_th]:text-start [&_th]:font-mono [&_th]:text-2xs [&_th]:font-medium [&_th]:tracking-label [&_th]:whitespace-nowrap [&_th]:text-fg-muted [&_th]:uppercase [&_th.num]:text-end [&_td.num]:text-end [&_td.num]:tabular-nums">
        {children}
      </table>
    </div>
  );
}

export function formatDateTime(date: Date | null | undefined, timezone: string) {
  if (!date) return "";
  return new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(date);
}

export function formatDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-AE", { dateStyle: "medium", timeZone: timezone }).format(date);
}

export function timeAgo(date: Date | null | undefined, now = new Date()) {
  if (!date) return "";
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });
  if (Math.abs(minutes) < 60) return format.format(-minutes, "minute");
  if (Math.abs(minutes) < 1440) return format.format(-Math.round(minutes / 60), "hour");
  return format.format(-Math.round(minutes / 1440), "day");
}

export function money(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-AE", { maximumFractionDigits: 0 }).format(value) + ` ${currency}`;
}

export function SOURCE_LABEL(source: string) {
  return { meta_form: "Meta form", landing_page: "Landing page", manual: "Typed in", csv: "CSV import" }[source] ?? source;
}
