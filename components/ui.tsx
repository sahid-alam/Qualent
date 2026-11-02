import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import type { ComponentProps, CSSProperties, ReactNode } from "react";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

const BUTTONS = {
  primary: "bg-(image:--gradient-accent) text-on-accent font-semibold shadow-glow hover:brightness-110",
  secondary: "bg-control-hover text-fg-soft font-medium border border-line-strong hover:border-line-hover hover:text-fg",
  ghost: "text-fg-muted border border-line hover:bg-hover hover:text-fg",
  danger: "bg-bad-soft text-bad border border-bad hover:brightness-110",
};
const BUTTON_SIZES = {
  sm: "h-(--control-sm) px-3.5 text-xs",
  md: "h-(--control-md) px-4.5 text-sm",
  lg: "h-(--control-lg) px-5.5 text-base",
};

export function buttonClass(variant: keyof typeof BUTTONS = "secondary", size: keyof typeof BUTTON_SIZES = "md") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-full whitespace-nowrap transition duration-(--dur-fast) active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none",
    BUTTON_SIZES[size],
    BUTTONS[variant],
  );
}

export function Button({ variant, size, className, ...props }: ComponentProps<"button"> & { variant?: keyof typeof BUTTONS; size?: keyof typeof BUTTON_SIZES }) {
  return <button {...props} className={cx(buttonClass(variant, size), className)} />;
}

export function LinkButton({ variant, size, className, ...props }: ComponentProps<typeof Link> & { variant?: keyof typeof BUTTONS; size?: keyof typeof BUTTON_SIZES }) {
  return <Link {...props} className={cx(buttonClass(variant, size), className)} />;
}

const fieldBase = "rounded-full border border-line-control bg-control px-4 text-base text-fg placeholder:text-fg-muted";
export const inputClass = `h-(--control-md) w-full ${fieldBase}`;
/** Sized by its content, for filter bars and sentences. */
export const inlineFieldClass = `h-(--control-md) ${fieldBase}`;
export const textareaClass = "w-full rounded-card border border-line-control bg-control p-3.5 text-base text-fg placeholder:text-fg-muted";

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
  return <section className={cx("rounded-panel border border-line bg-card p-5.5", className)}>{children}</section>;
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

type Temp = "hot" | "warm" | "cold";

export function Temperature({ temperature, score }: { temperature: string | null; score: number | null }) {
  if (!temperature) return <span className="text-xs text-fg-muted">Unscored</span>;
  const label = temperature[0].toUpperCase() + temperature.slice(1);
  return (
    <Pill tone={temperature as Temp}>
      {label}
      {score !== null && <span className="font-mono tabular-nums">{score}</span>}
    </Pill>
  );
}

/** Just the number, for tight rows. */
export function ScorePill({ temperature, score }: { temperature: string | null; score: number | null }) {
  if (score === null) return null;
  return (
    <span aria-label={`Score ${score}${temperature ? `, ${temperature}` : ""}`} className={cx("shrink-0 rounded-full border px-1.75 font-mono text-2xs font-medium tabular-nums", TONES[(temperature ?? "neutral") as Temp])}>
      {score}
    </span>
  );
}

const SOLID: Record<Temp, string> = {
  hot: "bg-(image:--gradient-hot) shadow-glow",
  warm: "bg-(image:--gradient-warm)",
  cold: "bg-(image:--gradient-cold)",
};

/** The filled "HOT · 91" badge. */
export function TemperatureBadge({ temperature, score }: { temperature: string | null; score?: number | null }) {
  if (!temperature) return null;
  return (
    <span className={cx("inline-flex h-6 shrink-0 items-center rounded-full px-2.75 text-2xs font-semibold whitespace-nowrap text-on-temperature uppercase", SOLID[temperature as Temp])}>
      {temperature}
      {score !== null && score !== undefined && ` · ${score}`}
    </span>
  );
}

const RING: Record<Temp, { stroke: string; text: string }> = {
  hot: { stroke: "stroke-hot", text: "text-hot" },
  warm: { stroke: "stroke-warm", text: "text-warm" },
  cold: { stroke: "stroke-cold", text: "text-cold" },
};

export function ScoreRing({ temperature, score }: { temperature: string | null; score: number }) {
  const tone = RING[(temperature ?? "cold") as Temp];
  return (
    <span className="relative grid size-16 shrink-0 place-items-center">
      <svg viewBox="0 0 36 36" aria-hidden className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r="16.4" fill="none" strokeWidth="3.1" className="stroke-line" />
        <circle cx="18" cy="18" r="16.4" fill="none" strokeWidth="3.1" pathLength={100} strokeDasharray={`${score} 100`} className={tone.stroke} />
      </svg>
      <span className={cx("text-lg font-semibold tracking-tight tabular-nums", tone.text)}>
        <span className="sr-only">Score </span>
        {score}
      </span>
    </span>
  );
}

function hueOf(seed: string) {
  let hue = 0;
  for (const char of seed) hue = (hue * 31 + char.charCodeAt(0)) % 360;
  return hue;
}

export function initials(name: string) {
  const letters = name.split(/\s+/).filter((part) => /^\p{L}/u.test(part)).map((part) => part[0]);
  return (letters.slice(0, 2).join("") || "?").toUpperCase();
}

const AVATARS = { sm: "size-7.5 text-2xs", md: "size-9 text-2xs", lg: "size-11 text-sm" };

export function Avatar({ name, size = "md" }: { name: string; size?: keyof typeof AVATARS }) {
  return (
    <span aria-hidden style={{ "--hue": hueOf(name) } as CSSProperties} className={cx("grid shrink-0 place-items-center rounded-full bg-avatar font-semibold text-on-avatar", AVATARS[size])}>
      {initials(name)}
    </span>
  );
}

/** A lead in a table: avatar plus a link to their page. */
export function PersonLink({ name, href }: { name: string; href: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 font-medium hover:underline">
      <Avatar name={name} size="sm" />
      {name}
    </Link>
  );
}

/** Tabs that are links, so the choice lives in the URL and works without script. */
export function Segmented({ label, items }: { label: string; items: { href: string; label: ReactNode; active: boolean }[] }) {
  return (
    <nav aria-label={label} className="flex gap-1 rounded-full border border-line bg-control p-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "true" : undefined}
          className={cx("grid h-7.75 min-w-0 flex-1 place-items-center rounded-full px-2 text-xs font-medium whitespace-nowrap transition duration-(--dur-fast) pointer-coarse:h-11", item.active ? "bg-inverse text-on-inverse" : "text-fg-muted hover:text-fg")}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** The tabs inside Leads. Staff limited to their own leads don't assign new ones, so they skip New. */
export function LeadsTabs({ tenantId, active, showNew = true }: { tenantId: string; active: "new" | "all" | "board"; showNew?: boolean }) {
  const base = `/c/${tenantId}`;
  const tabs = [
    ...(showNew ? [{ key: "new", href: `${base}/inbox`, label: "New" }] : []),
    { key: "all", href: `${base}/leads`, label: "All" },
    { key: "board", href: `${base}/pipeline`, label: "Board" },
  ];
  return (
    <div className="max-w-xs">
      <Segmented label="Lead views" items={tabs.map((tab) => ({ href: tab.href, label: tab.label, active: tab.key === active }))} />
    </div>
  );
}

/** The tabs inside Settings. */
export function SettingsTabs({ tenantId, active, isAdmin }: { tenantId: string; active: "setup" | "meta" | "automations"; isAdmin: boolean }) {
  const base = `/c/${tenantId}`;
  const tabs = [
    { key: "setup", href: `${base}/setup`, label: "Setup" },
    { key: "meta", href: `${base}/meta`, label: "Meta" },
    { key: "automations", href: `${base}/automations`, label: "Automations" },
    ...(isAdmin ? [{ key: "system", href: "/ops", label: "System" }] : []),
  ];
  return (
    <div className="max-w-md">
      <Segmented label="Settings" items={tabs.map((tab) => ({ href: tab.href, label: tab.label, active: tab.key === active }))} />
    </div>
  );
}

export function Empty({ title, body, children, clear }: { title: string; body?: string; children?: ReactNode; clear?: boolean }) {
  return (
    <div className="grid justify-items-center gap-2 rounded-panel border border-line bg-card px-5 py-9 text-center">
      {clear && (
        <span className="mb-1 grid size-12 place-items-center rounded-full bg-good-soft text-good">
          <CheckCircle2 size={22} aria-hidden />
        </span>
      )}
      <p className="text-md font-semibold text-fg">{title}</p>
      {body && <p className="max-w-[46ch] text-sm text-fg-muted">{body}</p>}
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="grid min-w-0 gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance text-fg">{title}</h1>
        {subtitle && <p className="max-w-[70ch] text-sm text-fg-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
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
    <div className={cx("grid content-start gap-1.5 rounded-tile border px-4.75 py-4.25", emphasis ? "border-accent-line bg-(image:--gradient-highlight)" : "border-line bg-card")}>
      <span className="text-xs text-fg-muted">{label}</span>
      <span className="flex flex-wrap items-end gap-x-2 gap-y-1">
        <span className="text-3xl leading-none font-semibold tracking-tighter text-fg tabular-nums">{value}</span>
        {note && <span className={cx("text-xs", emphasis ? "text-accent" : "text-fg-muted")}>{note}</span>}
      </span>
    </div>
  );
}

/** A scrolling wrapper, so wide tables never push the page sideways. */
export function TableWrap({ children }: { children: ReactNode }) {
  return (
    <div className="relative overflow-x-auto rounded-panel border border-line bg-card">
      <table className="w-full border-collapse text-sm [&_td]:border-t [&_td]:border-line [&_td]:px-4.5 [&_td]:py-3 [&_td]:whitespace-nowrap [&_th]:px-4.5 [&_th]:py-3 [&_th]:text-start [&_th]:font-mono [&_th]:text-2xs [&_th]:font-medium [&_th]:tracking-label [&_th]:whitespace-nowrap [&_th]:text-fg-muted [&_th]:uppercase [&_th.num]:text-end [&_td.num]:text-end [&_td.num]:tabular-nums">
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

/** "42 min" or "1h 12m", for how long a reply took. */
export function formatMinutes(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return "—";
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} min`;
  return `${Math.floor(rounded / 60)}h ${rounded % 60}m`;
}

export function money(value: number | null | undefined, currency: string) {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-AE", { maximumFractionDigits: 0 }).format(value) + ` ${currency}`;
}

export function SOURCE_LABEL(source: string) {
  return { meta_form: "Meta form", landing_page: "Landing page", manual: "Typed in", csv: "CSV import" }[source] ?? source;
}
