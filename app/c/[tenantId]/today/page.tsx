import { and, count, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { guardPage } from "../../../../lib/auth/session.ts";
import { withTenant } from "../../../../lib/db/client.ts";
import { contacts, leads, tenants } from "../../../../lib/db/schema.ts";
import { todayTasks } from "../../../../lib/leads/work.ts";
import { ActionForm, Submit } from "../../../../components/forms";
import { Empty, formatDateTime, Label, LinkButton, PageHeader, Temperature, timeAgo } from "../../../../components/ui";
import { completeTaskAction } from "../actions";

export const metadata = { title: "Today · Qualent" };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export default async function TodayPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const { membership } = await guardPage(tenantId, "leads.read");

  const [tenant] = await withTenant(tenantId, (db) => db.select().from(tenants).where(eq(tenants.id, tenantId)));
  const tasks = await todayTasks(tenantId, tenant.timezone, membership.memberId);
  const startOfToday = new Date(new Date().toLocaleString("en-US", { timeZone: tenant.timezone })).setHours(0, 0, 0, 0);
  const overdue = tasks.filter(({ task }) => new Date(task.dueAt.toLocaleString("en-US", { timeZone: tenant.timezone })).getTime() < startOfToday);
  const dueToday = tasks.length - overdue.length;

  const [hot, [{ waiting }]] = await withTenant(tenantId, async (db) => [
    await db
      .select({ lead: leads, contact: contacts })
      .from(leads)
      .innerJoin(contacts, eq(contacts.id, leads.contactId))
      .where(and(eq(leads.temperature, "hot"), eq(leads.status, "open"), membership.recordScope === "assigned" ? eq(leads.ownerMemberId, membership.memberId ?? "") : undefined))
      .orderBy(desc(leads.score))
      .limit(5),
    await db.select({ waiting: count() }).from(leads).where(and(isNull(leads.ownerMemberId), eq(leads.status, "open"))),
  ] as const);

  const headline = [
    overdue.length ? `${plural(overdue.length, "overdue task")}` : null,
    dueToday ? `${plural(dueToday, "task")} due today` : null,
    waiting ? `${plural(waiting, "new lead")} waiting` : null,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        title={<span className="text-3xl">{headline.length ? `${headline.join(", ")}.` : "You're clear for today."}</span>}
        subtitle={`${tenant.name}, in ${tenant.timezone.replace("_", " ")} time.`}
        actions={waiting ? <LinkButton href={`/c/${tenantId}/inbox`} variant="primary">Clear new leads</LinkButton> : undefined}
      />

      <div className="grid gap-5 desk:grid-cols-[1.45fr_1fr]">
        <section className="grid content-start gap-2.5">
          <Label>Your tasks</Label>
          {!tasks.length && <Empty title="No tasks due" body="Tasks you add on a lead show up here on the day they're due." />}
          <ul className="grid gap-2">
            {tasks.map(({ task, leadName }) => {
              const late = overdue.some((item) => item.task.id === task.id);
              return (
                <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-row border border-line bg-card px-4 py-3">
                  <div className="min-w-0">
                    <Link href={`/c/${tenantId}/leads/${task.leadId}`} className="font-medium text-fg hover:underline">{task.title}</Link>
                    <p className={late ? "text-xs text-bad" : "text-xs text-fg-muted"}>
                      {leadName ?? "Unknown"}, {late ? `due ${timeAgo(task.dueAt)}` : formatDateTime(task.dueAt, tenant.timezone)}
                    </p>
                  </div>
                  <ActionForm action={completeTaskAction} hidden={{ tenantId, taskId: task.id }}>
                    <Submit variant="secondary" size="sm">Done</Submit>
                  </ActionForm>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="grid content-start gap-2.5">
          <Label>Hot leads</Label>
          {!hot.length && <Empty title="No hot leads right now" />}
          <ul className="grid gap-2">
            {hot.map(({ lead, contact }) => (
              <li key={lead.id}>
                <Link href={`/c/${tenantId}/leads/${lead.id}`} className="flex items-center justify-between gap-3 rounded-row border border-line bg-card px-4 py-3 transition duration-(--dur-fast) hover:border-line-hover">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{contact.name ?? contact.phoneE164}</span>
                    <span className="block truncate text-xs text-fg-muted">{lead.nextStep ?? lead.summary ?? "Open the lead to see more."}</span>
                  </span>
                  <Temperature temperature={lead.temperature} score={lead.score} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
