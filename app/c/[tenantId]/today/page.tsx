import { eq } from "drizzle-orm";
import { ChevronRight, Phone } from "lucide-react";
import Link from "next/link";
import { guardPage } from "../../../../lib/auth/session.ts";
import { withTenant } from "../../../../lib/db/client.ts";
import { tenants } from "../../../../lib/db/schema.ts";
import { todayTasks } from "../../../../lib/leads/work.ts";
import { listQueue, queueCounts } from "../../../../lib/queries.ts";
import { setupStatus } from "../../../../lib/settings.ts";
import { localDay } from "../../../../lib/time.ts";
import { ActionForm, Submit } from "../../../../components/forms";
import { Avatar, Banner, buttonClass, cx, Empty, formatDateTime, Label, LinkButton, ScorePill, ScoreRing, SOURCE_LABEL, TemperatureBadge, timeAgo } from "../../../../components/ui";
import { completeTaskAction } from "../actions";

export const metadata = { title: "Today · Qualent" };

const plural = (count: number, singular: string) => `${count} ${singular}${count === 1 ? "" : "s"}`;
const leadName = (contact: { name: string | null; phoneE164: string | null; email: string | null }) => contact.name ?? contact.phoneE164 ?? contact.email ?? "Unknown";

/** One job: who to call next. Numbers live in Reports, connections in Settings. */
export default async function TodayPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { membership, can } = await guardPage(tenantId, "leads.read");
  const [tenant] = await withTenant(tenantId, (db) => db.select().from(tenants).where(eq(tenants.id, tenantId)));

  const now = new Date();
  const [counts, queue, tasks, setup] = await Promise.all([
    queueCounts(tenantId, membership),
    listQueue(tenantId, membership, { tab: "needs", limit: 6 }),
    todayTasks(tenantId, tenant.timezone, membership.memberId, now, membership.recordScope === "assigned"),
    can("settings.manage") ? setupStatus(tenantId) : null,
  ]);

  const base = `/c/${tenantId}`;
  const leadHref = (id: string) => `${base}/leads/${id}`;
  const [next, ...then] = queue;
  const today = localDay(now, tenant.timezone);
  const missing = setup
    ? [
        setup.page.state !== "done" && "Meta leads",
        setup.dataset.state !== "done" && "Meta results",
        setup.adAccount.state !== "done" && "ad spend",
        setup.teamGroup !== "done" && "Telegram",
      ].filter(Boolean)
    : [];

  return (
    <>
      <header>
        <h1 className="text-3xl font-semibold tracking-tighter">
          {counts.needs ? `${plural(counts.needs, "lead")} to call` : "You're clear"}
        </h1>
        <p className="mt-1.5 text-base text-fg-muted">
          {counts.needs ? "Start at the top and work down." : "New leads land here as soon as they arrive."}
        </p>
      </header>

      {counts.unowned > 0 && membership.recordScope !== "assigned" && (
        <Banner tone="accent" action={<LinkButton size="sm" href={`${base}/inbox`}>Assign</LinkButton>}>
          {plural(counts.unowned, "new lead")} {counts.unowned === 1 ? "has" : "have"} no owner yet.
        </Banner>
      )}
      {!!missing.length && (
        <Banner action={<LinkButton size="sm" href={`${base}/setup`}>Finish setup</LinkButton>}>
          Not connected yet: {missing.join(", ")}.
        </Banner>
      )}

      {next ? (
        <article className="relative rounded-panel border border-accent-line bg-(image:--gradient-highlight) p-5.5">
          <div className="flex items-center gap-3.5">
            {next.lead.score !== null ? <ScoreRing score={next.lead.score} temperature={next.lead.temperature} /> : <Avatar name={leadName(next.contact)} size="lg" />}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2.25 gap-y-1">
                <h2 className="truncate text-lg font-semibold tracking-tight">
                  <Link href={leadHref(next.lead.id)} className="after:absolute after:inset-0 after:rounded-panel">{leadName(next.contact)}</Link>
                </h2>
                <TemperatureBadge temperature={next.lead.temperature} />
              </div>
              <p className="mt-0.75 truncate text-sm text-fg-muted">
                {next.touch ? SOURCE_LABEL(next.touch.source) : "Lead"} · {timeAgo(next.lead.createdAt)}
              </p>
            </div>
            {next.contact.phoneE164 && (
              <a href={`tel:${next.contact.phoneE164}`} className={cx(buttonClass("primary"), "relative z-10")}>
                <Phone size={14} aria-hidden />
                Call
              </a>
            )}
          </div>
          {next.lead.summary && <p className="mt-4 line-clamp-3 text-base leading-relaxed text-fg-soft">{next.lead.summary}</p>}
        </article>
      ) : (
        <Empty clear title="Nothing waiting" body="Nothing needs you right now." />
      )}

      {!!then.length && (
        <ul className="rounded-panel border border-line bg-card p-2">
          {then.map(({ lead, contact }) => (
            <li key={lead.id}>
              <Link href={leadHref(lead.id)} className="flex items-center gap-3 rounded-row px-3.5 py-3 transition duration-(--dur-fast) hover:bg-hover">
                <Avatar name={leadName(contact)} />
                <span className="max-w-[45%] shrink-0 truncate text-base font-semibold">{leadName(contact)}</span>
                <ScorePill score={lead.score} temperature={lead.temperature} />
                <span className="hidden min-w-0 flex-1 truncate text-xs text-fg-muted sm:block">{lead.summary ?? ""}</span>
                <span className="ms-auto shrink-0 text-2xs text-fg-muted tabular-nums sm:ms-0">{timeAgo(lead.createdAt)}</span>
                <ChevronRight size={14} aria-hidden className="shrink-0 text-fg-muted rtl:rotate-180" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!!tasks.length && (
        <section>
          <Label className="mb-2.5 ps-1.5">Follow-ups due</Label>
          <ul className="rounded-panel border border-line bg-card p-2">
            {tasks.map(({ task, leadName: name }) => {
              const late = localDay(task.dueAt, tenant.timezone) < today;
              return (
                <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-row px-3.5 py-2.5 hover:bg-hover">
                  <div className="min-w-0">
                    <Link href={leadHref(task.leadId)} className="font-medium text-fg hover:underline">{task.title}</Link>
                    <p className={cx("text-xs", late ? "text-bad" : "text-fg-muted")}>{name ?? "Unknown"}, {late ? `due ${timeAgo(task.dueAt)}` : formatDateTime(task.dueAt, tenant.timezone)}</p>
                  </div>
                  <ActionForm action={completeTaskAction} hidden={{ tenantId, taskId: task.id }}>
                    <Submit variant="secondary" size="sm">Done</Submit>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
