import { randomBytes } from "node:crypto";
import { afterAll, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { closePool, withTenant } from "../lib/db/client.ts";
import { members, stages } from "../lib/db/schema.ts";
import { stopBoss } from "../lib/jobs/queues.ts";
import { drain } from "../lib/jobs/runner.ts";
import { createTenant } from "../lib/tenants.ts";

process.env.SECRET_KEY = randomBytes(32).toString("base64");

afterAll(async () => {
  vi.unstubAllGlobals();
  await stopBoss();
  await closePool();
});

let counter = 0;
export const uniquePhone = () => `+97150${String(1000000 + ++counter + Math.floor(Math.random() * 8000000)).slice(0, 7)}`;

export const newTenant = (template = "uae_real_estate") => createTenant({ name: `Tenant ${++counter}`, template });

export function addMember(tenantId: string, values: Partial<typeof members.$inferInsert> = {}) {
  return withTenant(tenantId, (db) =>
    db
      .insert(members)
      .values({ tenantId, name: `Member ${++counter}`, role: "agent", ...values })
      .returning()
      .then(([row]) => row),
  );
}

export function stageByName(tenantId: string, name: string) {
  return withTenant(tenantId, (db) => db.select().from(stages).where(eq(stages.name, name)).orderBy(asc(stages.position))).then(([row]) => row);
}

export const runJobs = () => drain({ budgetMs: 20_000 });

type Reply = { status?: number; body?: unknown };
export type Call = { url: string; init?: RequestInit; json?: Record<string, unknown> };

/** Stands in for Meta, Telegram and AI providers. */
export function stubFetch(handler: (call: Call) => Reply | undefined = () => undefined) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const call: Call = {
        url: String(input),
        init,
        json: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      };
      calls.push(call);
      const reply = handler(call) ?? {};
      return new Response(JSON.stringify(reply.body ?? { result: true }), { status: reply.status ?? 200 });
    }),
  );
  return calls;
}
