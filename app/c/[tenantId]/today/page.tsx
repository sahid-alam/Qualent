import { eq } from "drizzle-orm";
import { ArrowRight, ChevronRight, Phone } from "lucide-react";
import Link from "next/link";
import { guardPage, requireUserId } from "../../../../lib/auth/session.ts";
import { withTenant, withUser } from "../../../../lib/db/client.ts";
import { profiles, tenants } from "../../../../lib/db/schema.ts";
import { todayTasks } from "../../../../lib/leads/work.ts";
import { listQueue, queueCounts } from "../../../../lib/queries.ts";
import { campaignReport, leadSummary } from "../../../../lib/reports.ts";
import { hasAiModel, setupStatus } from "../../../../lib/settings.ts";
import { lastDays, localDay } from "../../../../lib/time.ts";
import { ActionForm, Submit } from "../../../../components/forms";
import { QueueKeys } from "../../../../components/queue-keys";
import { DayBars } from "../../../../components/report-view";
import { Avatar, buttonClass, cx, Empty, formatDateTime, formatMinutes, Kbd, Label, LinkButton, money, ScorePill, ScoreRing, SOURCE_LABEL, TemperatureBadge, timeAgo } from "../../../../components/ui";
import { completeTaskAction } from "../actions";

export const metadata = { title: "Today · Qualent" };

const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
const word = (count: number) => WORDS[count] ?? String(count);
const plural = (count: number, singular: string) => `${count} ${singular}${count === 1 ? "" : "s"}`;

function secondLine(needs: number, hot: number, unscored: number) {
  if (hot) return needs === 1 ? "It's hot." : `${word(hot)} of them ${hot === 1 ? "is" : "are"} hot.`;
  if (unscored === needs) return needs === 1 ? "It isn't scored yet." : "None are scored yet.";
  return needs === 1 ? "It isn't hot." : "None of them are hot.";
}

function greeting(now: Date, timezone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

const leadName = (contact: { name: string | null; phoneE164: string | null; email: string | null }) => contact.name ?? contact.phoneE164 ?? contact.email ?? "Unknown";

const SETUP_DOT = { done: "bg-good shadow-live", problem: "bg-warn", todo: "bg-fg-muted" };
const SETUP_WORD = { done: "live", problem: "needs a look", todo: "not set up" };

export default async function TodayPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { membership, can } = await guardPage(tenantId, "leads.read");
  const userId = await requireUserId();
  const [tenant] = await withTenant(tenantId, (db) => db.select().from(tenants).where(eq(tenants.id, tenantId)));

  const now = new Date();
  const week = lastDays(7, tenant.timezone, now);
  const lastWeek = lastDays(7, tenant.timezone, new Date(now.getTime() - 7 * 86_400_000));
  const canSetUp = can("settings.manage");
  const [counts, queue, tasks, thisWeek, previous, [profile], setup, aiOn, report] = await Promise.all([
    queueCounts(tenantId, membership),
    listQueue(tenantId, membership, { tab: "needs", limit: 5 }),
    todayTasks(tenantId, tenant.timezone, membership.memberId, now, membership.recordScope === "assigned"),
    leadSummary(tenantId, week.from, week.to, membership),
    leadSummary(tenantId, lastWeek.from, lastWeek.to, membership),
    withUser(userId, (db) => db.select().from(profiles).where(eq(profiles.id, userId))),
    canSetUp ? setupStatus(tenantId) : null,
    canSetUp ? hasAiModel(tenantId, "lead_insights") : false,
    can("reports.client") && membership.recordScope !== "assigned" ? campaignReport(tenantId, week.from, week.to) : null,
  ]);
  const campaigns = (report?.campaigns ?? []).filter((campaign) => !campaign.manual && campaign.leads).sort((a, b) => b.leads - a.leads).slice(0, 4);

  const base = `/c/${tenantId}`;
  const leadHref = (id: string) => `${base}/leads/${id}`;
  const [next, ...then] = queue;
  const today = localDay(now, tenant.timezone);
  const overdue = tasks.filter(({ task }) => localDay(task.dueAt, tenant.timezone) < today).length;
  const dueToday = tasks.length - overdue;
  const firstName = profile?.name?.split(" ")[0];
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tenant.timezone }).format(now);
  const delta = previous.total ? Math.round(((thisWeek.total - previous.total) / previous.total) * 100) : null;
  const taskLine = [overdue ? plural(overdue, "overdue task") : null, dueToday ? `${plural(dueToday, "task")} due today` : null].filter(Boolean).join(", ");

  const glance = [
    { label: "Hot", value: counts.hot, tone: "text-hot", query: "temperature=hot&status=open" },
    { label: "Warm", value: counts.warm, tone: "text-warm", query: "temperature=warm&status=open" },
    { label: "Cold", value: counts.cold, tone: "text-cold", query: "temperature=cold&status=open" },
    { label: "Not scored", value: counts.unscored, tone: "text-fg-soft", query: "status=open" },
  ];
  const system = setup && [
    { label: "Meta leads", state: setup.page.state },
    { label: "Meta results", state: setup.dataset.state },
    { label: "Ad spend", state: setup.adAccount.state },
    { label: "Telegram team group", state: setup.teamGroup },
  ];

  return (
    <>
      <QueueKeys keys={{ Enter: next && leadHref(next.lead.id) }} />

      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-sm text-fg-muted">{date} · {greeting(now, tenant.timezone)}{firstName ? `, ${firstName}` : ""}</p>
          <h1 className="mt-2.5 text-3xl font-semibold tracking-tighter sm:text-4xl">
            {counts.needs ? (
              <>
                {word(counts.needs)} {counts.needs === 1 ? "lead needs" : "leads need"} you.
                <br />
                <span className="text-accent">{secondLine(counts.needs, counts.hot, counts.unscored)}</span>
              </>
            ) : (
              <>
                You&apos;re clear.
                <br />
                <span className="text-good">Nothing needs you right now.</span>
              </>
            )}
          </h1>
          <p className="mt-3 max-w-[46ch] text-base text-fg-muted">{taskLine ? `You also have ${taskLine}.` : counts.needs ? "Start at the top and work down the list." : "New leads land here as soon as they arrive."}</p>
          <div className="mt-5 flex flex-wrap items-center gap-2.25">
            {next ? (
              <LinkButton variant="primary" size="lg" href={leadHref(next.lead.id)}>
                Start with the top lead
                <ArrowRight size={15} aria-hidden />
              </LinkButton>
            ) : (
              <LinkButton variant="primary" size="lg" href={`${base}/leads`}>See all leads</LinkButton>
            )}
            {counts.unowned > 0 && <LinkButton size="lg" href={`${base}/inbox`}>Assign {plural(counts.unowned, "new lead")}</LinkButton>}
            <LinkButton size="lg" href={`${base}/pipeline`}>Open pipeline</LinkButton>
          </div>
        </div>

        <div>
          <Label className="mb-2 desk:text-end">Waiting on you</Label>
          <div className="grid grid-cols-4 gap-2.5 sm:flex">
            {glance.map((item) => (
              <Link key={item.label} href={`${base}/leads?${item.query}`} className="grid min-w-0 justify-items-center rounded-tile border border-line bg-inner px-1 py-3.5 transition duration-(--dur-fast) hover:-translate-y-0.5 hover:border-line-hover sm:w-22">
                <span className={cx("text-2xl font-semibold tracking-tighter tabular-nums", item.tone)}>{item.value}</span>
                <span className="mt-0.75 text-2xs whitespace-nowrap text-fg-muted">{item.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)] items-start gap-3.5 desk:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5.5">
          <section>
            <Label className="mb-2.5 ps-1.5">Next up</Label>
            {next ? (
              <article className="relative rounded-panel border border-accent-line bg-(image:--gradient-highlight) p-5.5 transition duration-(--dur-fast) hover:-translate-y-0.5 hover:border-line-hover">
                <div className="flex items-center gap-3.5">
                  {next.lead.score !== null ? <ScoreRing score={next.lead.score} temperature={next.lead.temperature} /> : <Avatar name={leadName(next.contact)} size="lg" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2.25 gap-y-1">
                      <h2 className="truncate text-lg font-semibold tracking-tight">
                        <Link href={leadHref(next.lead.id)} className="after:absolute after:inset-0 after:rounded-panel">{leadName(next.contact)}</Link>
                      </h2>
                      <TemperatureBadge temperature={next.lead.temperature} />
                      <span className="ms-auto text-xs whitespace-nowrap text-fg-muted tabular-nums">{timeAgo(next.lead.createdAt)}</span>
                    </div>
                    <p className="mt-0.75 truncate text-sm text-fg-muted">
                      {next.touch ? SOURCE_LABEL(next.touch.source) : "Lead"}{next.touch?.campaignId ? ` · ${next.touch.campaignId}` : ""}
                    </p>
                  </div>
                </div>
                {next.lead.summary && <p className="mt-4 line-clamp-3 text-base leading-relaxed text-fg-soft">{next.lead.summary}</p>}
                {next.lead.nextStep && (
                  <p className="mt-3.25">
                    <span className="inline-block rounded-full border border-accent-line bg-accent-soft px-2.75 py-1 text-2xs text-accent">{next.lead.nextStep}</span>
                  </p>
                )}
                <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-line pt-4">
                  <span className={buttonClass("primary")}>
                    Open lead
                    <Kbd onAccent>↵</Kbd>
                  </span>
                  {next.contact.phoneE164 && (
                    <a href={`tel:${next.contact.phoneE164}`} className={cx(buttonClass("secondary"), "relative z-10")}>
                      <Phone size={13} aria-hidden />
                      Call
                    </a>
                  )}
                </div>
              </article>
            ) : (
              <Empty clear title="Queue clear" body="Nothing is waiting on you. New leads land here as soon as they arrive." />
            )}
          </section>

          {!!then.length && (
            <section>
              <Label className="mb-2.5 ps-1.5">Then these</Label>
              <ul className="rounded-panel border border-line bg-card p-2">
                {then.map(({ lead, contact }) => (
                  <li key={lead.id}>
                    <Link href={leadHref(lead.id)} className="flex items-center gap-3 rounded-row px-3.5 py-3 transition duration-(--dur-fast) hover:bg-hover">
                      <Avatar name={leadName(contact)} />
                      <span className="max-w-[45%] shrink-0 truncate text-base font-semibold">{leadName(contact)}</span>
                      <ScorePill score={lead.score} temperature={lead.temperature} />
                      <span className="hidden min-w-0 flex-1 truncate text-xs text-fg-muted sm:block">{lead.summary ?? lead.nextStep ?? ""}</span>
                      <span className="ms-auto shrink-0 text-2xs text-fg-muted tabular-nums sm:ms-0">{timeAgo(lead.createdAt)}</span>
                      <ChevronRight size={14} aria-hidden className="shrink-0 text-fg-muted rtl:rotate-180" />
                    </Link>
                  </li>
                ))}
                <li>
                  <Link href={`${base}/leads?status=open`} className="block rounded-row px-3.5 py-3 text-center text-sm text-fg-muted hover:bg-hover">See all open leads</Link>
                </li>
              </ul>
            </section>
          )}

          <section>
            <Label className="mb-2.5 ps-1.5">Your tasks</Label>
            {tasks.length ? (
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
            ) : (
              <Empty title="No tasks due" body="Tasks you add on a lead show up here on the day they're due." />
            )}
          </section>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5.5">
          <section>
            <Label className="mb-2.5 ps-1.5">This week</Label>
            <div className="rounded-panel border border-line bg-card px-5.5 py-5">
              <div className="flex items-start gap-2.5">
                <div className="flex-1">
                  <p className="text-xs text-fg-muted">Leads received</p>
                  <p className="flex items-baseline gap-2">
                    <span className="text-3xl font-semibold tracking-tighter tabular-nums">{thisWeek.total}</span>
                    {delta !== null && <span className={cx("text-xs font-medium", delta >= 0 ? "text-good" : "text-fg-muted")}>{delta >= 0 ? "+" : ""}{delta}%</span>}
                  </p>
                </div>
                {can("reports.client") && <LinkButton size="sm" href={`${base}/reports`}>Details</LinkButton>}
              </div>
              <div className="mt-4"><DayBars days={thisWeek.days} height="h-23" /></div>
              <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3.5">
                {[
                  ["Median first reply", formatMinutes(thisWeek.medianReplyMinutes)],
                  ["Qualified", thisWeek.qualified],
                  ["Deals", thisWeek.won],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-2xs text-fg-muted">{label}</dt>
                    <dd className="mt-0.5 text-md font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          {!!campaigns.length && (
            <section>
              <Label className="mb-2.5 ps-1.5">Campaigns, last 7 days</Label>
              <ul className="grid gap-3 rounded-panel border border-line bg-card px-5 py-4.5">
                {campaigns.map((campaign) => (
                  <li key={campaign.campaignId} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate" title={campaign.name}>{campaign.name}</span>
                    <span className="shrink-0 text-xs text-fg-muted tabular-nums">
                      {campaign.qualified} of {campaign.leads} qualified{campaign.costPerQualified !== null ? `, ${money(campaign.costPerQualified, campaign.currency ?? tenant.currency)} each` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {system && (
            <section>
              <Label className="mb-2.5 ps-1.5">System</Label>
              <ul className="grid gap-3.25 rounded-panel border border-line bg-card px-5 py-4.5">
                {system.map((item) => (
                  <li key={item.label} className="flex items-center gap-2.5 text-sm">
                    <span aria-hidden className={cx("size-1.75 shrink-0 rounded-full", SETUP_DOT[item.state])} />
                    <span className="flex-1">{item.label}</span>
                    {item.state === "done" ? <span className="text-xs text-fg-muted">{SETUP_WORD.done}</span> : <LinkButton size="sm" href={`${base}/setup`} className="h-7!">{item.state === "problem" ? "Check" : "Set up"}</LinkButton>}
                  </li>
                ))}
                <li className="flex items-center gap-2.5 text-sm">
                  <span aria-hidden className={cx("size-1.75 shrink-0 rounded-full", aiOn ? SETUP_DOT.done : SETUP_DOT.todo)} />
                  <span className="flex-1">AI scoring</span>
                  <span className="text-xs text-fg-muted">{aiOn ? SETUP_WORD.done : "no model yet"}</span>
                </li>
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
