import { redirect } from "next/navigation";
import { requireUserId } from "../../../lib/auth/session.ts";
import { isPlatformAdmin } from "../../../lib/permissions.ts";
import { PIPELINE_TEMPLATES } from "../../../lib/tenants.ts";
import { ActionForm, Submit } from "../../../components/forms";
import { Field, inputClass, PageHeader } from "../../../components/ui";
import { createClientAction } from "../actions";

export const metadata = { title: "New client · Qualent" };

export default async function NewClientPage() {
  if (!(await isPlatformAdmin(await requireUserId()))) redirect("/");
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <section className="grid w-full max-w-lg gap-5 rounded-modal border border-line bg-panel p-8">
        <PageHeader title="New client" subtitle="Each client gets its own separate space. You can change the rest in setup." />
        <ActionForm action={createClientAction} className="grid gap-3.5">
          <Field label="Client name"><input name="name" required className={inputClass} /></Field>
          <Field label="Pipeline">
            <select name="template" className={inputClass} defaultValue="uae_real_estate">
              {Object.entries(PIPELINE_TEMPLATES).map(([key, template]) => (
                <option key={key} value={key} className="bg-panel">{template.name} ({template.stages.length} stages)</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Country"><input name="country" defaultValue="AE" maxLength={2} className={inputClass} /></Field>
            <Field label="Currency"><input name="currency" defaultValue="AED" maxLength={3} className={inputClass} /></Field>
            <Field label="Time zone"><input name="timezone" defaultValue="Asia/Dubai" className={inputClass} /></Field>
          </div>
          <Submit>Create client</Submit>
        </ActionForm>
      </section>
    </main>
  );
}
