import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUserId } from "../../lib/auth/session.ts";
import { isPlatformAdmin } from "../../lib/permissions.ts";
import { AI_TASKS, listAiModels, listDeadLetters, serviceChecklist, systemStatus } from "../../lib/system.ts";
import { ActionForm, Submit } from "../../components/forms";
import { Banner, Empty, Field, inputClass, Label, PageHeader, Panel, Pill, Stat, TableWrap, timeAgo } from "../../components/ui";
import { addModelAction, dismissJobAction, retryJobAction, setModelActiveAction } from "./actions";

export const metadata = { title: "System · Qualent" };

const TASK_LABEL: Record<string, string> = { lead_insights: "Lead scoring and summaries", draft_reply: "Reply drafts", ad_analysis: "Weekly ad analysis" };

export default async function SystemPage() {
  if (!(await isPlatformAdmin(await requireUserId()))) redirect("/");
  const [status, failed, models] = await Promise.all([systemStatus(), listDeadLetters(), listAiModels()]);
  const services = serviceChecklist();
  const clientName = (id?: string) => status.clients.find((client) => client.id === id)?.name ?? "All clients";

  return (
    <main id="main" className="mx-auto grid w-full max-w-(--w-content) grid-cols-[minmax(0,1fr)] gap-5 p-4 pb-16 sm:p-7.5">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ChevronLeft size={14} aria-hidden className="rtl:rotate-180" />
        Back to clients
      </Link>
      <PageHeader title="System" subtitle="Whether Qualent is healthy across every client. Only 7Gence admins see this." />

      {!status.healthy && <Banner tone="bad">The scheduler hasn&apos;t run in over 20 minutes, so reply timers and Meta events are waiting. Check supabase/cron.sql is installed and APP_URL is right.</Banner>}

      <div className="grid grid-cols-2 gap-2.5 desk:grid-cols-4">
        <Stat label="Scheduler" value={status.healthy ? "Running" : "Stopped"} note={status.beatAt ? `Last ran ${timeAgo(status.beatAt)}` : "Never ran"} />
        <Stat label="Jobs waiting" value={(status.queued.created ?? 0) + (status.queued.retry ?? 0)} note={`${status.queued.active ?? 0} running now`} />
        <Stat label="Failed for good" value={failed.length} note={failed.length ? "Listed below" : "None"} />
        <Stat label="Webhooks stuck" value={status.inboxErrors} note="Received, not processed" />
      </div>

      <section className="grid gap-2.5">
        <Label className="ps-1.5">Clients</Label>
        <TableWrap>
          <thead>
            <tr><th>Client</th><th className="num">Leads, 7 days</th><th className="num">Meta failed or late</th><th className="num">Not delivered</th><th className="num">Broken connections</th><th className="num">AI this month</th></tr>
          </thead>
          <tbody>
            {status.clients.map((client) => (
              <tr key={client.id} className="hover:bg-hover">
                <td className="font-medium"><Link href={`/c/${client.id}/meta`} className="hover:underline">{client.name}</Link></td>
                <td className="num">{client.leads}</td>
                <td className={client.metaFailed ? "num text-bad" : "num"}>{client.metaFailed}</td>
                <td className={client.undelivered ? "num text-bad" : "num"}>{client.undelivered}</td>
                <td className={client.brokenConnections ? "num text-bad" : "num"}>{client.brokenConnections}</td>
                <td className="num">${client.aiSpent.toFixed(2)} of ${client.aiBudget.toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </section>

      <section className="grid gap-2.5">
        <Label className="ps-1.5">Failed for good</Label>
        {!failed.length && <Empty title="No failed jobs" body="Jobs retry by themselves first. Any that still fail stop here and alert the ops group." />}
        <ul className="grid gap-2">
          {failed.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-row border border-line bg-card px-4 py-3">
              <div className="grid min-w-0 gap-0.5">
                <p className="font-medium">{job.data.type ?? "Job"} <span className="font-normal text-fg-muted">for {clientName(job.data.tenantId)}, {timeAgo(job.created_on)}</span></p>
                {job.output?.message && <p className="text-sm break-words text-bad">{job.output.message}</p>}
              </div>
              <div className="flex items-center gap-2">
                <ActionForm action={retryJobAction} hidden={{ jobId: job.id }}><Submit variant="secondary" size="sm">Retry now</Submit></ActionForm>
                <ActionForm action={dismissJobAction} hidden={{ jobId: job.id }}><Submit variant="ghost" size="sm">Dismiss</Submit></ActionForm>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 desk:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Panel className="grid content-start gap-3">
          <Label>AI models</Label>
          <p className="text-sm text-fg-muted">Each task runs on the first active model below that covers it. With none, leads stay unscored. The API key stays in the hosting settings, never here.</p>
          <ul className="grid gap-2">
            {models.map((model) => (
              <li key={model.id} className="flex flex-wrap items-center justify-between gap-2 rounded-dense bg-inner px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{model.model}</span> <span className="text-fg-muted">on {model.provider}: {model.tasks.map((task) => TASK_LABEL[task] ?? task).join(", ")}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Pill tone={model.noTraining ? "good" : "warn"}>{model.noTraining ? "No training" : "May train on data"}</Pill>
                  <ActionForm action={setModelActiveAction} hidden={{ modelId: model.id, active: String(!model.active) }}><Submit variant="ghost" size="sm">{model.active ? "Turn off" : "Turn on"}</Submit></ActionForm>
                </span>
              </li>
            ))}
            {!models.length && <li className="text-sm text-fg-muted">No model yet.</li>}
          </ul>
          <ActionForm action={addModelAction} className="grid max-w-lg gap-3" resetOnOk>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Provider"><input name="provider" required placeholder="Ollama" className={inputClass} /></Field>
              <Field label="Model"><input name="model" required dir="ltr" placeholder="gemma4:cloud" className={inputClass} /></Field>
            </div>
            <Field label="Address" hint="An OpenAI-format address, ending in /v1"><input name="baseUrl" required dir="ltr" placeholder="https://ollama.com/v1" className={inputClass} /></Field>
            <Field label="Key's variable name" hint="Leave empty if it needs no key."><input name="apiKeyEnv" dir="ltr" placeholder="AI_OLLAMA_KEY" className={inputClass} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Input, USD per 1M tokens"><input name="priceIn" type="number" min={0} step="0.0001" defaultValue="0" className={inputClass} /></Field>
              <Field label="Output, USD per 1M tokens"><input name="priceOut" type="number" min={0} step="0.0001" defaultValue="0" className={inputClass} /></Field>
            </div>
            <fieldset className="grid gap-1.5 text-sm">
              <legend className="ps-1 pb-1 text-fg-soft">Use it for</legend>
              {AI_TASKS.map((task) => (
                <label key={task} className="flex items-center gap-2"><input type="checkbox" name="tasks[]" value={task} className="size-4 accent-(--accent)" />{TASK_LABEL[task]}</label>
              ))}
            </fieldset>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="noTraining" className="size-4 accent-(--accent)" />I&apos;ve read its terms: it doesn&apos;t train on what we send</label>
            <div><Submit variant="secondary" size="sm">Add model</Submit></div>
          </ActionForm>
        </Panel>

        <Panel className="grid content-start gap-3">
          <Label>Services</Label>
          <ul className="grid gap-2.5">
            {services.map((service) => (
              <li key={service.label} className="flex items-center justify-between gap-2 text-sm">
                <span>{service.label}</span>
                <Pill tone={service.ready ? "good" : "warn"}>{service.ready ? "Ready" : "Not set"}</Pill>
              </li>
            ))}
          </ul>
          <p className="text-xs text-fg-muted">This only checks the settings exist. docs/DEPLOY.md has the steps.</p>
        </Panel>
      </div>
    </main>
  );
}
