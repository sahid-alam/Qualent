import { redirect } from "next/navigation";
import { requireUserId } from "../lib/auth/session.ts";
import { listMyTenants } from "../lib/permissions.ts";
import { Empty } from "../components/ui";
import { signOutAction } from "./auth-actions";

/** Sends each person to the first place they can work. */
export default async function Home() {
  const userId = await requireUserId();
  const tenants = await listMyTenants(userId);
  const first = tenants[0];
  if (first?.role === "client_viewer") redirect(`/portal/${first.id}`);
  if (first) redirect(`/c/${first.id}/today`);
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <Empty title="You don't have access to a client yet" body="Ask your manager to add you. Use the same email address you signed in with.">
        <form action={signOutAction}>
          <button className="text-sm text-accent underline">Sign out</button>
        </form>
      </Empty>
    </main>
  );
}
