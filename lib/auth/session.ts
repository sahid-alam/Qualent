import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { can, ForbiddenError, requireMember, type Action } from "../permissions.ts";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const DEV_USER_COOKIE = "qualent_dev_user";

export const supabaseConfigured = () => !!(SUPABASE_URL && SUPABASE_KEY);

/** Signing in with no password: local development only, and never next to real auth. */
export function devAuthAllowed(env: Record<string, string | undefined> = process.env) {
  return env.NODE_ENV !== "production" && env.DEV_AUTH === "1" && !env.NEXT_PUBLIC_SUPABASE_URL;
}

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL!, SUPABASE_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Server Components cannot write cookies. The proxy refreshes the session.
        }
      },
    },
  });
}

export const currentUserId = cache(async (): Promise<string | null> => {
  if (supabaseConfigured()) {
    const { data } = await (await supabaseServer()).auth.getClaims();
    return data?.claims.sub ?? null;
  }
  if (devAuthAllowed()) return (await cookies()).get(DEV_USER_COOKIE)?.value ?? null;
  return null;
});

export async function requireUserId() {
  const userId = await currentUserId();
  if (!userId) redirect("/login");
  return userId;
}

/** For pages. Anyone without the permission goes back to where they can be. */
export const guardPage = cache(async (tenantId: string, action: Action) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) notFound();
  const userId = await requireUserId();
  try {
    const membership = await requireMember(userId, tenantId, action);
    return { userId, membership, can: (other: Action) => can(membership.role, other) };
  } catch (error) {
    if (error instanceof ForbiddenError) redirect("/");
    throw error;
  }
});
