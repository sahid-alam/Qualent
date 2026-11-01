import { redirect } from "next/navigation";
import { currentUserId, devAuthAllowed, supabaseConfigured } from "../../lib/auth/session.ts";
import { withPlatform } from "../../lib/db/client.ts";
import { profiles } from "../../lib/db/schema.ts";
import { ActionForm, Submit } from "../../components/forms";
import { Button, Field, inputClass } from "../../components/ui";
import { devSignInAction, signInAction } from "../auth-actions";

export default async function LoginPage() {
  if (await currentUserId()) redirect("/");
  const dev = devAuthAllowed();
  const people = dev ? await withPlatform((db) => db.select().from(profiles)) : [];

  return (
    <main className="grid min-h-dvh place-items-center bg-(image:--wash-hero) bg-size-[100%_32rem] bg-no-repeat p-4">
      <section className="grid w-full max-w-md gap-5 rounded-modal border border-line bg-panel p-8 shadow-modal">
        <div className="grid gap-1">
          <span aria-hidden className="mb-3 grid size-10 place-items-center rounded-full bg-(image:--gradient-accent) font-bold text-on-accent shadow-glow">Q</span>
          <h1 className="text-3xl font-semibold tracking-tight">Qualent</h1>
          <p className="text-sm text-fg-muted">Sign in to work your leads.</p>
        </div>
        {supabaseConfigured() && (
          <ActionForm action={signInAction} className="grid gap-3.5">
            <Field label="Email">
              <input name="email" type="email" required autoComplete="email" className={inputClass} />
            </Field>
            <Field label="Password">
              <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
            </Field>
            <Submit>Sign in</Submit>
          </ActionForm>
        )}
        {dev && (
          <div className="grid gap-2">
            <p className="text-sm text-fg-soft">Local development: sign in as</p>
            {people.map((person) => (
              <form key={person.id} action={devSignInAction}>
                <input type="hidden" name="userId" value={person.id} />
                <Button className="w-full">{person.name}</Button>
              </form>
            ))}
            {!people.length && <p className="text-sm text-fg-muted">No people yet. Run npm run db:seed.</p>}
          </div>
        )}
        {!dev && !supabaseConfigured() && <p className="text-sm text-bad">Sign-in isn&apos;t set up yet. Add the Supabase keys.</p>}
      </section>
    </main>
  );
}
