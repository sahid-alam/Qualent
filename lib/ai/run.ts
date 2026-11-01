import { eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { withTenant } from "../db/client.ts";
import { aiModels, aiUsage, tenants } from "../db/schema.ts";
import { enqueue } from "../jobs/queues.ts";

export const LEAD_TASKS = ["lead_insights", "draft_reply"] as const;
export type AiTask = (typeof LEAD_TASKS)[number] | "ad_analysis";

export type AiResult<T> =
  | { status: "ok"; data: T; costUsd: number }
  // Not configured, over budget, or blocked: leads keep flowing, marked unscored.
  | { status: "not_configured" | "over_budget" | "blocked" | "invalid" };

const WARN_AT = 0.8;
const REQUEST_TIMEOUT_MS = 55_000;

/** The one way to call a model. Swapping a model is an `ai_models` row, not code. */
export async function aiRun<S extends z.ZodType>(input: {
  tenantId: string;
  task: AiTask;
  system: string;
  user: string;
  schema: S;
}): Promise<AiResult<z.infer<S>>> {
  const { tenantId, task, system, user, schema } = input;

  const gate = await withTenant(tenantId, async (db) => {
    const models = await db.select().from(aiModels).where(eq(aiModels.active, true));
    const model = models.find((row) => row.tasks.includes(task));
    if (!model) return { status: "not_configured" as const };
    if ((LEAD_TASKS as readonly string[]).includes(task) && !model.noTraining) return { status: "blocked" as const };

    const [{ budget }] = await db
      .select({ budget: tenants.aiMonthlyBudgetUsd })
      .from(tenants)
      .where(eq(tenants.id, tenantId));
    const [{ spent }] = await db
      .select({ spent: sql<string>`coalesce(sum(${aiUsage.costUsd}), 0)` })
      .from(aiUsage)
      .where(sql`${aiUsage.at} >= date_trunc('month', now())`);
    const limit = Number(budget);
    if (Number(spent) >= limit) return { status: "over_budget" as const };
    if (Number(spent) >= limit * WARN_AT) {
      const month = new Date().toISOString().slice(0, 7);
      await enqueue(
        db,
        "telegram",
        { type: "team_alert", tenantId, text: `AI budget is over ${WARN_AT * 100}% for ${month}.` },
        { singletonKey: `ai-budget:${tenantId}:${month}`, singletonSeconds: 2_592_000 },
      );
    }
    return { status: "go" as const, model };
  });
  if (gate.status !== "go") return { status: gate.status };

  const { model } = gate;
  const apiKey = model.apiKeyEnv ? process.env[model.apiKeyEnv] : undefined;
  if (model.apiKeyEnv && !apiKey) return { status: "not_configured" };

  const response = await fetch(`${model.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      model: model.model,
      response_format: { type: "json_object" },
      ...(model.reasoningEffort ? { reasoning_effort: model.reasoningEffort } : {}),
      messages: [
        { role: "system", content: `${system}\nReply with one JSON object only.` },
        { role: "user", content: user },
      ],
    }),
  });
  if (!response.ok) throw new Error(`AI provider returned ${response.status}`);

  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const inputTokens = body.usage?.prompt_tokens ?? 0;
  const outputTokens = body.usage?.completion_tokens ?? 0;
  const costUsd = (inputTokens * Number(model.priceIn) + outputTokens * Number(model.priceOut)) / 1_000_000;

  await withTenant(tenantId, (db) =>
    db.insert(aiUsage).values({ tenantId, task, model: model.model, inputTokens, outputTokens, costUsd: costUsd.toFixed(6) }),
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(body.choices?.[0]?.message?.content ?? ""));
  } catch {
    return { status: "invalid" };
  }
  const result = schema.safeParse(parsed);
  return result.success ? { status: "ok", data: result.data, costUsd } : { status: "invalid" };
}

function stripFence(text: string) {
  return text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

type Identity = { name?: string | null; phone?: string | null; email?: string | null };

/** Limit: a name inside free text can slip through, so the no-training rule still applies. */
export function redact(text: string, who: Identity) {
  let result = text.replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[EMAIL]").replace(/\+?\d[\d\s().-]{6,}\d/g, "[PHONE]");
  for (const part of (who.name ?? "").split(/\s+/).filter((word) => word.length > 1)) {
    result = result.replaceAll(new RegExp(part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"), "[NAME]");
  }
  return result;
}

export function restoreName(text: string, name: string | null | undefined) {
  return name ? text.replace(/\[NAME\](?:\s*\[NAME\])*/g, name) : text;
}
