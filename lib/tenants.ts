import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { withPlatform, withTenant, type Db } from "./db/client.ts";
import { pipelines, stages, tenantDirectory, tenants } from "./db/schema.ts";

type StageTemplate = { name: string; kind?: "open" | "qualified" | "won" | "lost"; button?: boolean };

export const PIPELINE_TEMPLATES: Record<string, { name: string; stages: StageTemplate[] }> = {
  uae_real_estate: {
    name: "UAE Real Estate",
    stages: [
      { name: "New" },
      { name: "Contacted", button: true },
      { name: "Qualified", kind: "qualified" },
      { name: "Viewing", kind: "qualified", button: true },
      { name: "Offer", kind: "qualified" },
      { name: "Won", kind: "won", button: true },
      { name: "Lost", kind: "lost", button: true },
    ],
  },
  general_lead_gen: {
    name: "General Lead Gen",
    stages: [
      { name: "New" },
      { name: "Contacted", button: true },
      { name: "Qualified", kind: "qualified", button: true },
      { name: "Proposal", kind: "qualified" },
      { name: "Won", kind: "won", button: true },
      { name: "Lost", kind: "lost", button: true },
    ],
  },
};

/** Copies a template, so later template changes never overwrite a client's edits. */
export async function applyPipelineTemplate(db: Db, tenantId: string, key: string, isDefault = false) {
  const template = PIPELINE_TEMPLATES[key];
  if (!template) throw new Error(`Unknown template: ${key}`);
  const [pipeline] = await db.insert(pipelines).values({ tenantId, name: template.name, isDefault }).returning();
  await db.insert(stages).values(
    template.stages.map((stage, position) => ({
      tenantId,
      pipelineId: pipeline.id,
      position,
      name: stage.name,
      kind: stage.kind ?? "open",
      agentButton: stage.button ?? false,
      capiEventName: stage.name,
    })),
  );
  return pipeline;
}

export async function createTenant(input: {
  name: string;
  template?: string;
  country?: string;
  timezone?: string;
  currency?: string;
}) {
  const { template = "general_lead_gen", ...values } = input;
  const [tenant] = await withPlatform((db) => db.insert(tenants).values(values).returning());
  const intakeKey = randomBytes(16).toString("base64url");
  await withTenant(tenant.id, async (db) => {
    await applyPipelineTemplate(db, tenant.id, template, true);
    await db.insert(tenantDirectory).values({ key: `intake:${intakeKey}`, kind: "intake_key", tenantId: tenant.id });
  });
  return { ...tenant, intakeKey };
}

export function listTenantIds() {
  return withPlatform(async (db) => (await db.select({ id: tenants.id }).from(tenants)).map((row) => row.id));
}

export function getTenant(db: Db, tenantId: string) {
  return db.select().from(tenants).where(eq(tenants.id, tenantId)).then(([row]) => row);
}
