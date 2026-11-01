import { redirect } from "next/navigation";
import { currentUserId, devAuthAllowed, supabaseConfigured } from "../../../../lib/auth/session.ts";
import { ActionForm, Submit } from "../../../../components/forms";
import { Field, inputClass, LinkButton } from "../../../../components/ui";
import { signInAction } from "../../../auth-actions";

export default async function PortalLoginPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  if (await currentUserId()) redirect(`/portal/${tenantId}`);
  return (
    <main className="grid place-items-center py-16">
      <section className="grid w-full max-w-md gap-5 rounded-modal border border-line bg-panel p-8 shadow-modal">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to see your results</h1>
        </div>
        {supabaseConfigured() ? (
          <ActionForm action={signInAction} hidden={{ next: `/portal/${tenantId}` }} className="grid gap-3.5">
            <Field label="Email"><input name="email" type="email" required autoComplete="email" className={inputClass} /></Field>
            <Field label="Password"><input name="password" type="password" required autoComplete="current-password" className={inputClass} /></Field>
            <Submit>Sign in</Submit>
          </ActionForm>
        ) : devAuthAllowed() ? (
          <LinkButton href="/login">Local development sign-in</LinkButton>
        ) : (
          <p className="text-sm text-bad">Sign-in isn&apos;t set up yet.</p>
        )}
      </section>
    </main>
  );
}
