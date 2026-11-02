import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { guardPage } from "../../../../lib/auth/session.ts";
import { filtersFromQuery, listLeads, listViews } from "../../../../lib/leads/work.ts";
import { listCampaigns, listRoutableMembers } from "../../../../lib/queries.ts";
import { listCustomFields, listPipelines } from "../../../../lib/settings.ts";
import { AddLead } from "../../../../components/add-lead";
import { ActionForm, Dialog, FilterForm, SelectAll, Submit } from "../../../../components/forms";
import { buttonClass, Empty, Field, inlineFieldClass, inputClass, LeadsTabs, LinkButton, PageHeader, PersonLink, Pill, TableWrap, Temperature, timeAgo } from "../../../../components/ui";
import { bulkEditAction, importCsvAction, saveViewAction } from "../actions";

export const metadata = { title: "Leads · Qualent" };

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
  const moreOpen = !!search.owner || (!!search.sort && search.sort !== "created") || fields.some((field) => !!search[`f_${field.key}`]);

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={`${total} ${total === 1 ? "lead" : "leads"}${query ? " match" : ""}`}
        actions={<AddLead tenantId={tenantId} campaigns={campaigns} />}
      />
      <LeadsTabs tenantId={tenantId} active="all" showNew={membership.recordScope !== "assigned"} />

      {!!views.length && (
        <nav aria-label="Saved views" className="flex flex-wrap gap-2">
          <Link href={base} className={buttonClass(query ? "ghost" : "secondary", "sm")}>Everything</Link>
          {views.map((view) => {
            const viewQuery = (view.config as { query?: string }).query ?? "";
            return <Link key={view.id} href={`${base}?${viewQuery}`} className={buttonClass(viewQuery === query ? "secondary" : "ghost", "sm")}>{view.name}</Link>;
          })}
        </nav>
      )}

      <div className="grid gap-2">
        <FilterForm className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="q">Search</label>
          <input id="q" name="q" type="search" defaultValue={search.q} placeholder="Name, phone or email" className={`${inlineFieldClass} w-full max-w-64`} />
          <label className="sr-only" htmlFor="stage">Stage</label>
          <select id="stage" name="stage" defaultValue={search.stage ?? ""} className={selectClass}>
            <option value="" className="bg-panel">Any stage</option>
            {stages.map((stage) => <option key={stage.id} value={stage.id} className="bg-panel">{stage.name}</option>)}
          </select>
          <label className="sr-only" htmlFor="temperature">Temperature</label>
          <select id="temperature" name="temperature" defaultValue={search.temperature ?? ""} className={selectClass}>
            <option value="" className="bg-panel">Hot, warm or cold</option>
            <option value="hot" className="bg-panel">Hot</option>
            <option value="warm" className="bg-panel">Warm</option>
            <option value="cold" className="bg-panel">Cold</option>
          </select>
          <button className={buttonClass("secondary")}>Search</button>
          {query && <LinkButton variant="ghost" href={base}>Clear</LinkButton>}
          <details open={moreOpen} className="group/more w-full">
            <summary className="flex min-h-7 w-fit cursor-pointer list-none items-center gap-1 ps-1 text-sm text-fg-muted hover:text-fg pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
              More filters
              <ChevronDown size={14} aria-hidden className="transition group-open/more:rotate-180" />
            </summary>
            <div className="mt-2 flex flex-wrap items-center gap-2">
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
            </div>
          </details>
        </FilterForm>
        {query && membership.memberId && (
          <div>
            <Dialog trigger="Save this search" title="Save this search" triggerVariant="ghost" triggerSize="sm">
              <ActionForm action={saveViewAction} hidden={{ tenantId, query }} className="grid gap-3.5">
                <Field label="Name"><input name="name" required placeholder="My hot leads" className={inputClass} /></Field>
                <Submit>Save</Submit>
              </ActionForm>
            </Dialog>
          </div>
        )}
      </div>

      {!rows.length ? (
        <Empty title={query ? "No leads match" : "No leads yet"} body={query ? "Try removing a filter." : "Add one by hand, or connect a lead source in Settings."} />
      ) : (
        <ActionForm action={bulkEditAction} hidden={{ tenantId }} className="group grid gap-3" resetOnOk>
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
          {/* Only there once something is ticked. */}
          <div className="hidden flex-wrap items-center gap-2 group-has-[input[type=checkbox]:checked]:flex">
            <label className="sr-only" htmlFor="bulk-owner">Assign to</label>
            <select id="bulk-owner" name="ownerMemberId" defaultValue="" className={`${inlineFieldClass} max-w-60`}>
              <option value="" className="bg-panel">Assign to…</option>
              {people.map((person) => <option key={person.id} value={person.id} className="bg-panel">{person.name}</option>)}
            </select>
            <label className="sr-only" htmlFor="bulk-stage">Move to</label>
            <select id="bulk-stage" name="stageId" defaultValue="" className={`${inlineFieldClass} max-w-60`}>
              <option value="" className="bg-panel">Move to…</option>
              {stages.map((stage) => <option key={stage.id} value={stage.id} className="bg-panel">{stage.name}</option>)}
            </select>
            <Submit variant="secondary">Apply to ticked</Submit>
          </div>
        </ActionForm>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-fg-muted">
        <div className="flex flex-wrap items-center gap-2">
          <Dialog trigger="Import CSV" title="Import leads from a CSV" triggerVariant="ghost" triggerSize="sm">
            <ActionForm action={importCsvAction} hidden={{ tenantId }} className="grid gap-3.5">
              <p className="text-sm text-fg-muted">Columns: name, phone, email, campaign_id, note. A duplicate adds to the existing lead.</p>
              <Field label="File"><input name="file" type="file" accept=".csv,text/csv" required className="w-full text-sm" /></Field>
              <Submit>Import</Submit>
            </ActionForm>
          </Dialog>
          {can("leads.export") && <a className={buttonClass("ghost", "sm")} href={`${base}/export?${query}`}>Export CSV</a>}
        </div>
        {total > pageSize && (
          <div className="flex items-center gap-2">
            {page > 1 && <LinkButton size="sm" href={`${base}?${query}&page=${page - 1}`}>Previous</LinkButton>}
            <span>Page {page} of {Math.ceil(total / pageSize)}</span>
            {page * pageSize < total && <LinkButton size="sm" href={`${base}?${query}&page=${page + 1}`}>Next</LinkButton>}
          </div>
        )}
      </div>
    </>
  );
}
