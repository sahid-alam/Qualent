import Link from "next/link";
import { guardPage } from "../../../../lib/auth/session.ts";
import { filtersFromQuery, listLeads, listViews } from "../../../../lib/leads/work.ts";
import { listCampaigns, listRoutableMembers } from "../../../../lib/queries.ts";
import { listCustomFields, listPipelines } from "../../../../lib/settings.ts";
import { AddLead } from "../../../../components/add-lead";
import { ActionForm, Dialog, SelectAll, Submit } from "../../../../components/forms";
import { buttonClass, Empty, Field, inlineFieldClass, inputClass, LinkButton, PageHeader, PersonLink, Pill, TableWrap, Temperature, timeAgo } from "../../../../components/ui";
import { bulkEditAction, importCsvAction, saveViewAction } from "../actions";

export const metadata = { title: "All leads · Qualent" };

type Search = Record<string, string | undefined>;

const selectClass = `${inlineFieldClass} min-w-32`;

export default async function LeadsPage({ params, searchParams }: { params: Promise<{ tenantId: string }>; searchParams: Promise<Search> }) {
  const { tenantId } = await params;
  const search = await searchParams;
  const { membership, can } = await guardPage(tenantId, "leads.read");
  const fields = await listCustomFields(tenantId);
  const filters = filtersFromQuery(search, fields);
  const [{ rows, total, pageSize }, pipelines, people, campaigns, views] = await Promise.all([
    listLeads(tenantId, filters, membership),
    listPipelines(tenantId),
    listRoutableMembers(tenantId),
    listCampaigns(tenantId),
    membership.memberId ? listViews(tenantId, membership.memberId) : Promise.resolve([]),
  ]);
  const owners = new Map(people.map((person) => [person.id, person.name]));
  const stages = pipelines[0]?.stages ?? [];
  const query = new URLSearchParams(Object.entries(search).filter((entry): entry is [string, string] => !!entry[1] && entry[0] !== "page")).toString();
  const page = filters.page ?? 1;
  const base = `/c/${tenantId}/leads`;

  return (
    <>
      <PageHeader
        title="All leads"
        subtitle={`${total} ${total === 1 ? "lead" : "leads"}${query ? " match these filters" : ""}`}
        actions={
          <>
            <Dialog trigger="Import CSV" title="Import leads from a CSV">
              <ActionForm action={importCsvAction} hidden={{ tenantId }} className="grid gap-3.5">
                <p className="text-sm text-fg-muted">Columns: name, phone, email, campaign_id, note. A duplicate adds to the existing lead.</p>
                <Field label="File"><input name="file" type="file" accept=".csv,text/csv" required className="w-full text-sm" /></Field>
                <Submit>Import</Submit>
              </ActionForm>
            </Dialog>
            {can("leads.export") && <a className={buttonClass()} href={`${base}/export?${query}`}>Export</a>}
            <AddLead tenantId={tenantId} campaigns={campaigns} />
          </>
        }
      />

      {!!views.length && (
        <nav aria-label="Saved views" className="flex flex-wrap gap-2">
          <Link href={base} className={buttonClass(query ? "ghost" : "secondary", "sm")}>Everything</Link>
          {views.map((view) => {
            const viewQuery = (view.config as { query?: string }).query ?? "";
            return <Link key={view.id} href={`${base}?${viewQuery}`} className={buttonClass(viewQuery === query ? "secondary" : "ghost", "sm")}>{view.name}</Link>;
          })}
        </nav>
      )}

      <div className="flex flex-wrap items-center gap-2">
      <form method="get" className="contents" role="search">
        <label className="sr-only" htmlFor="q">Search</label>
        <input id="q" name="q" type="search" defaultValue={search.q} placeholder="Name, phone or email" className={`${inlineFieldClass} w-full max-w-64`} />
        <label className="sr-only" htmlFor="stage">Stage</label>
        <select id="stage" name="stage" defaultValue={search.stage ?? ""} className={selectClass}>
          <option value="" className="bg-panel">Any stage</option>
          {stages.map((stage) => <option key={stage.id} value={stage.id} className="bg-panel">{stage.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="temperature">Temperature</label>
        <select id="temperature" name="temperature" defaultValue={search.temperature ?? ""} className={selectClass}>
          <option value="" className="bg-panel">Any temperature</option>
          <option value="hot" className="bg-panel">Hot</option>
          <option value="warm" className="bg-panel">Warm</option>
          <option value="cold" className="bg-panel">Cold</option>
        </select>
        <label className="sr-only" htmlFor="owner">Owner</label>
        <select id="owner" name="owner" defaultValue={search.owner ?? ""} className={selectClass}>
          <option value="" className="bg-panel">Anyone</option>
          {people.map((person) => <option key={person.id} value={person.id} className="bg-panel">{person.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="sort">Sort by</label>
        <select id="sort" name="sort" defaultValue={search.sort ?? "created"} className={selectClass}>
          <option value="created" className="bg-panel">Newest first</option>
          <option value="score" className="bg-panel">Highest score</option>
          <option value="updated" className="bg-panel">Recently updated</option>
        </select>
        {fields.map((field) => {
          const id = `f_${field.key}`;
          return (
            <span key={field.id} className="contents">
              <label className="sr-only" htmlFor={id}>{field.label}</label>
              {field.type === "select" || field.type === "boolean" ? (
                <select id={id} name={id} defaultValue={search[id] ?? ""} className={selectClass}>
                  <option value="" className="bg-panel">{field.label}: any</option>
                  {field.type === "boolean"
                    ? [["true", "Yes"], ["false", "No"]].map(([value, label]) => <option key={value} value={value} className="bg-panel">{field.label}: {label}</option>)
                    : field.options?.map((option) => <option key={option} value={option} className="bg-panel">{option}</option>)}
                </select>
              ) : (
                <input id={id} name={id} type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} defaultValue={search[id]} placeholder={field.label} className={selectClass} />
              )}
            </span>
          );
        })}
        <button className={buttonClass("secondary")}>Apply</button>
        {query && <LinkButton variant="ghost" href={base}>Clear</LinkButton>}
      </form>
      {query && membership.memberId && (
          <Dialog trigger="Save view" title="Save this view" triggerVariant="ghost">
            <ActionForm action={saveViewAction} hidden={{ tenantId, query }} className="grid gap-3.5">
              <Field label="Name"><input name="name" required placeholder="My hot leads" className={inputClass} /></Field>
              <Submit>Save view</Submit>
            </ActionForm>
          </Dialog>
        )}
      </div>

      {!rows.length ? (
        <Empty title={query ? "No leads match these filters" : "No leads yet"} body={query ? "Try removing a filter." : "Add one by hand, import a CSV, or connect a lead source in Client setup."} />
      ) : (
        <ActionForm action={bulkEditAction} hidden={{ tenantId }} className="grid gap-3" resetOnOk>
          <TableWrap>
            <thead>
              <tr>
                <th className="w-8"><SelectAll name="leadIds[]" /></th>
                <th>Name</th>
                <th>Phone</th>
                <th>Stage</th>
                <th>Score</th>
                <th>Owner</th>
                <th className="num">Added</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ lead, contact, stage }) => (
                <tr key={lead.id} className="hover:bg-hover">
                  <td><input type="checkbox" name="leadIds[]" value={lead.id} aria-label={`Select ${contact.name ?? "lead"}`} className="size-4 accent-(--accent)" /></td>
                  <td>
                    <PersonLink href={`${base}/${lead.id}`} name={contact.name ?? contact.email ?? "Unknown"} />
                    {lead.needsReview && <span className="ms-2"><Pill tone="warn">Check duplicate</Pill></span>}
                  </td>
                  <td dir="ltr" className="text-fg-soft tabular-nums">{contact.phoneE164 ?? contact.phoneRaw ?? "—"}</td>
                  <td className="text-fg-soft">{stage.name}</td>
                  <td><Temperature temperature={lead.temperature} score={lead.score} /></td>
                  <td className="text-fg-soft">{lead.ownerMemberId ? owners.get(lead.ownerMemberId) : "—"}</td>
                  <td className="num text-fg-soft">{timeAgo(lead.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="bulk-owner">Assign to</label>
              <select id="bulk-owner" name="ownerMemberId" defaultValue="" className={`${inlineFieldClass} max-w-60`}>
                <option value="" className="bg-panel">Assign ticked leads to…</option>
                {people.map((person) => <option key={person.id} value={person.id} className="bg-panel">{person.name}</option>)}
              </select>
              <label className="sr-only" htmlFor="bulk-stage">Move to</label>
              <select id="bulk-stage" name="stageId" defaultValue="" className={`${inlineFieldClass} max-w-60`}>
                <option value="" className="bg-panel">Move ticked leads to…</option>
                {stages.map((stage) => <option key={stage.id} value={stage.id} className="bg-panel">{stage.name}</option>)}
              </select>
              <Submit variant="secondary">Apply to ticked</Submit>
            </div>
            <div className="flex items-center gap-2 text-sm text-fg-muted">
              {page > 1 && <LinkButton size="sm" href={`${base}?${query}&page=${page - 1}`}>Previous</LinkButton>}
              <span>Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</span>
              {page * pageSize < total && <LinkButton size="sm" href={`${base}?${query}&page=${page + 1}`}>Next</LinkButton>}
            </div>
          </div>
        </ActionForm>
      )}
    </>
  );
}
