import Link from "next/link";
import type { listQueue, queueCounts, QueueTab } from "../lib/queries.ts";
import { localDay } from "../lib/time.ts";
import { QueueKeys } from "./queue-keys";
import { Avatar, cx, Empty, Kbd, Label, ScorePill, Segmented, SOURCE_LABEL, timeAgo } from "./ui";

type Row = Awaited<ReturnType<typeof listQueue>>[number];

const TABS: [QueueTab, string][] = [["needs", "Needs you"], ["waiting", "Waiting"], ["done", "Done"]];
const CHIPS = [
  { value: "hot", label: "Hot", dot: "bg-hot", active: "border-hot-line bg-hot-soft text-hot" },
  { value: "warm", label: "Warm", dot: "bg-warm", active: "border-warm-line bg-warm-soft text-warm" },
  { value: "cold", label: "Cold", dot: "bg-cold", active: "border-cold-line bg-cold-soft text-cold" },
] as const;

function groupRows(rows: Row[], timezone: string, now: Date) {
  const today = localDay(now, timezone);
  const groupOf = ({ lead }: Row) => (now.getTime() - lead.createdAt.getTime() < 3_600_000 ? "Now" : localDay(lead.createdAt, timezone) === today ? "Earlier today" : "Older");
  return ["Now", "Earlier today", "Older"].map((name) => ({ name, rows: rows.filter((row) => groupOf(row) === name) })).filter((group) => group.rows.length);
}

export function LeadQueue({
  tenantId,
  currentId,
  rows,
  counts,
  tab,
  temperature,
  timezone,
}: {
  tenantId: string;
  currentId: string;
  rows: Row[];
  counts: Awaited<ReturnType<typeof queueCounts>>;
  tab: QueueTab;
  temperature?: string;
  timezone: string;
}) {
  const now = new Date();
  const groups = groupRows(rows, timezone, now);
  const ordered = groups.flatMap((group) => group.rows);
  const query = (next: { tab?: QueueTab; temperature?: string }) => {
    const params = new URLSearchParams();
    const nextTab = next.tab ?? tab;
    if (nextTab !== "needs") params.set("tab", nextTab);
    if (next.temperature) params.set("t", next.temperature);
    const text = params.toString();
    return text ? `?${text}` : "";
  };
  const here = query({ tab, temperature });
  const href = (id: string) => `/c/${tenantId}/leads/${id}${here}`;
  const index = ordered.findIndex((row) => row.lead.id === currentId);
  const nextRow = ordered[index + 1];
  const previousRow = index > 0 ? ordered[index - 1] : undefined;

  return (
    <section aria-label="Lead queue" className="hidden min-h-0 flex-col overflow-hidden rounded-panel border border-line bg-panel desk:flex">
      <QueueKeys keys={{ j: nextRow && href(nextRow.lead.id), k: previousRow && href(previousRow.lead.id) }} />
      <div className="px-4 pt-4.5">
        <div className="flex items-baseline gap-2.25 px-1">
          <h2 className="text-xl font-semibold tracking-tight">Queue</h2>
          <span className="text-xs text-fg-muted">{counts.needs} {counts.needs === 1 ? "needs" : "need"} you</span>
        </div>
        <div className="mt-3.5">
          <Segmented
            label="Queue"
            items={TABS.map(([value, label]) => ({ href: `/c/${tenantId}/leads/${currentId}${query({ tab: value, temperature })}`, label, active: tab === value }))}
          />
        </div>
        <div className="mt-2.5 flex gap-1.5 px-0.5">
          {CHIPS.map((chip) => {
            const active = temperature === chip.value;
            return (
              <Link
                key={chip.value}
                href={`/c/${tenantId}/leads/${currentId}${query({ tab, temperature: active ? undefined : chip.value })}`}
                aria-current={active ? "true" : undefined}
                className={cx("inline-flex h-7.75 items-center gap-1.5 rounded-full border px-3 text-xs font-medium pointer-coarse:h-11", active ? chip.active : "border-line bg-card text-fg-muted hover:text-fg")}
              >
                <span aria-hidden className={cx("size-1.25 rounded-full", chip.dot)} />
                {chip.label}
                {tab === "needs" && <span className="tabular-nums">{counts[chip.value]}</span>}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="relative mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!ordered.length && (
          <div className="px-2 pt-6">
            <Empty clear title={temperature ? `No ${temperature} leads here` : "Queue clear"} body={temperature ? "Nothing in this list matches that temperature." : "Nothing here right now."} />
          </div>
        )}
        {groups.map((group) => (
          <div key={group.name}>
            <Label className="px-2.5 pt-3 pb-1.75">{group.name}</Label>
            <ul>
              {group.rows.map(({ lead, contact, touch }) => {
                const active = lead.id === currentId;
                const name = contact.name ?? contact.phoneE164 ?? contact.email ?? "Unknown";
                return (
                  <li key={lead.id}>
                    <Link
                      href={href(lead.id)}
                      aria-current={active ? "true" : undefined}
                      className={cx("mb-0.75 flex gap-3 rounded-row border px-3.5 py-3.25 transition duration-(--dur-fast)", active ? "border-accent-line bg-(image:--gradient-row) shadow-nav" : "border-transparent hover:bg-hover")}
                    >
                      <Avatar name={name} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.75">
                          <span className="truncate text-base font-semibold">{name}</span>
                          <ScorePill score={lead.score} temperature={lead.temperature} />
                          <span className="ms-auto shrink-0 text-2xs text-fg-muted tabular-nums">{timeAgo(lead.createdAt, now)}</span>
                        </span>
                        <span className="mt-px block truncate text-xs text-fg-muted">{touch ? SOURCE_LABEL(touch.source) : "Lead"}{touch?.campaignId ? ` · ${touch.campaignId}` : ""}</span>
                        {lead.summary && <span className={cx("mt-1.25 line-clamp-2 text-sm leading-snug", active ? "text-fg-soft" : "text-fg-muted")}>{lead.summary}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1.75 border-t border-line px-4.5 py-2.75 text-xs text-fg-muted">
        <Kbd>J</Kbd>
        <Kbd>K</Kbd>
        move through the list
      </div>
    </section>
  );
}
