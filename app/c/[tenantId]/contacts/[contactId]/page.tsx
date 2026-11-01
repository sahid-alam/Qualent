import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { guardPage } from "../../../../../lib/auth/session.ts";
import { withTenant } from "../../../../../lib/db/client.ts";
import { contacts, leads } from "../../../../../lib/db/schema.ts";
import { ActionForm, Dialog, Submit } from "../../../../../components/forms";
import { buttonClass, Field, formatDateTime, inputClass, PageHeader, Panel } from "../../../../../components/ui";
import { eraseContactAction } from "../../actions";

export const metadata = { title: "Privacy · Qualent" };

export default async function ContactPrivacyPage({ params }: { params: Promise<{ tenantId: string; contactId: string }> }) {
  const { tenantId, contactId } = await params;
  await guardPage(tenantId, "contacts.erase");
  const [[contact], contactLeads] = await withTenant(tenantId, async (db) => [
    await db.select().from(contacts).where(eq(contacts.id, contactId)),
    await db.select({ id: leads.id }).from(leads).where(eq(leads.contactId, contactId)),
  ] as const);
  if (!contact) notFound();

  return (
    <>
      <PageHeader title={contact.name ?? contact.email ?? "Contact"} subtitle="What we hold on this person, and how to export or erase it." />
      <Panel className="grid max-w-2xl gap-4">
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-fg-muted">Consent</dt><dd className="text-end">{contact.consentAt ? `${contact.consentSource}, ${formatDateTime(contact.consentAt, "UTC")} UTC` : "None recorded"}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-fg-muted">Leads</dt><dd>{contactLeads.length}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <a className={buttonClass()} href={`/c/${tenantId}/contacts/${contactId}/export`}>Export everything</a>
          {!contact.erasedAt && (
            <Dialog trigger="Erase this person" title="Erase this person?" triggerVariant="danger">
              <p className="text-sm text-fg-soft">This removes their name, phone, email, notes and tracking data, and cancels queued Meta events. Reports keep anonymous counts. You can&apos;t undo this.</p>
              <ActionForm action={eraseContactAction} hidden={{ tenantId, contactId }} className="grid gap-3.5">
                <Field label="Type ERASE to confirm">
                  <input name="confirm" required autoComplete="off" className={inputClass} />
                </Field>
                <Submit variant="danger">Erase permanently</Submit>
              </ActionForm>
            </Dialog>
          )}
        </div>
      </Panel>
    </>
  );
}
