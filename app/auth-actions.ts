"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "../lib/auth/action.ts";
import { currentUserId, DEV_USER_COOKIE, devAuthAllowed, supabaseConfigured, supabaseServer } from "../lib/auth/session.ts";
import { claimInvites } from "../lib/settings.ts";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

const Login = z.object({ email: z.email("Enter a valid email address."), password: z.string().min(1, "Enter your password.") });

function safePath(value: FormDataEntryValue | null) {
  // Local paths only, so a crafted link can't send someone to another site.
  const path = String(value ?? "/");
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

export async function signInAction(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const parsed = Login.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!supabaseConfigured()) return { error: "Sign-in isn't set up yet." };

  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "That email and password don't match." };
  if (data.user.email && data.user.email_confirmed_at) await claimInvites(data.user.id, data.user.email);
  redirect(safePath(form.get("next")));
}

export async function devSignInAction(form: FormData) {
  if (!devAuthAllowed()) throw new Error("Not available");
  const id = z.uuid().parse(form.get("userId"));
  (await cookies()).set(DEV_USER_COOKIE, id, { httpOnly: true, sameSite: "lax", maxAge: THIRTY_DAYS });
  redirect("/");
}

export async function signOutAction() {
  if (supabaseConfigured()) await (await supabaseServer()).auth.signOut();
  (await cookies()).delete(DEV_USER_COOKIE);
  redirect("/login");
}

export async function toggleThemeAction() {
  const store = await cookies();
  const next = store.get("qualent_theme")?.value === "light" ? "dark" : "light";
  store.set("qualent_theme", next, { sameSite: "lax", maxAge: THIRTY_DAYS * 12 });
}

export async function requireSignedIn() {
  return currentUserId();
}
