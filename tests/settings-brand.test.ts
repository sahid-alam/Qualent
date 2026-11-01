import { wcagContrast } from "culori";
import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import { devAuthAllowed } from "../lib/auth/session.ts";
import { brandStyle, logoDataUrl, resolveBrand } from "../lib/brand.ts";
import { withPlatform, withTenant } from "../lib/db/client.ts";
import { members, profiles } from "../lib/db/schema.ts";
import { saveConnection } from "../lib/intake/meta.ts";
import { ingestLead } from "../lib/leads/ingest.ts";
import { getLead } from "../lib/leads/work.ts";
import { ForbiddenError, isPlatformAdmin, listMyTenants, requireMember } from "../lib/permissions.ts";
import { addPerson, approveAnalysis, claimInvites, listAnalyses, saveRoutingRule, sendTestEvent, sendTestLead, setBrand, setupStatus } from "../lib/settings.ts";
import { adAnalyses } from "../lib/db/schema.ts";
import { addMember, newTenant, stubFetch } from "./helpers.ts";

const PANEL_DARK = "#0a0908";
const PANEL_LIGHT = "#fdfcfb";

describe("brand colors", () => {
  test("every label keeps at least 4.5:1, across hues, strength and lightness", () => {
    const failures: string[] = [];
    for (let hue = 0; hue < 360; hue += 15) {
      for (const chroma of [0.05, 0.12, 0.2, 0.3]) {
        for (const lightness of [0.3, 0.45, 0.6, 0.75, 0.9]) {
          const input = `oklch(${lightness} ${chroma} ${hue})`;
          const brand = resolveBrand(input);
          const pairs = [
            wcagContrast(brand.onSolid!, brand.solidFrom!),
            wcagContrast(brand.onSolid!, brand.solidTo!),
            wcagContrast(brand.textDark!, PANEL_DARK),
            wcagContrast(brand.textLight!, PANEL_LIGHT),
          ];
          if (pairs.some((ratio) => ratio < 4.5)) failures.push(`${input}: ${pairs.map((p) => p.toFixed(2))}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  test("a bad color is refused, and an adjustment is reported", () => {
    expect(() => resolveBrand("not a color")).toThrow();
    expect(resolveBrand("#ffff00").onSolid).toBe("#1a0f0a");
    expect(brandStyle({})).toEqual({});
    expect(brandStyle(resolveBrand("#0f6e8c"))["--brand"]).toBe("#0f6e8c");
  });

  test("logos are checked by their content, not their name", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const webp = new TextEncoder().encode("RIFFxxxxWEBPdata");
    expect(logoDataUrl(png)).toMatch(/^data:image\/png;base64,/);
    expect(logoDataUrl(webp)).toMatch(/^data:image\/webp;base64,/);
    expect(() => logoDataUrl(new TextEncoder().encode("<svg onload=alert(1)>"))).toThrow(/PNG or WebP/);
    expect(() => logoDataUrl(new Uint8Array(200_001))).toThrow(/200 KB/);
  });

  test("saving a brand keeps earlier fields", async () => {
    const { id } = await newTenant();
    await setBrand(id, { name: "Marina", color: "#0f6e8c" }, "t");
    const brand = await setBrand(id, { logo: "data:image/png;base64,AA" }, "t");
    expect(brand).toMatchObject({ name: "Marina", brand: "#0f6e8c", logo: "data:image/png;base64,AA" });
  });
});

describe("signing in", () => {
  test("password-free sign-in only exists in local development", () => {
    expect(devAuthAllowed({ NODE_ENV: "development", DEV_AUTH: "1" })).toBe(true);
    expect(devAuthAllowed({ NODE_ENV: "production", DEV_AUTH: "1" })).toBe(false);
    expect(devAuthAllowed({ NODE_ENV: "development" })).toBe(false);
    expect(devAuthAllowed({ NODE_ENV: "development", DEV_AUTH: "1", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co" })).toBe(false);
  });

  test("an invite links on first sign-in, once, and only for the same email", async () => {
    const { id } = await newTenant();
    const person = await addPerson(id, { name: "Dana", role: "agent", email: " Dana@Example.com " }, "t");
    expect(person.inviteEmail).toBe("dana@example.com");

    const stranger = crypto.randomUUID();
    const userId = crypto.randomUUID();
    expect(await claimInvites(stranger, "someone@example.com")).toEqual([]);
    await expect(requireMember(stranger, id, "leads.read")).rejects.toThrow(ForbiddenError);

    expect(await claimInvites(userId, "DANA@example.com")).toHaveLength(1);
    expect((await requireMember(userId, id, "leads.read")).memberId).toBe(person.id);
    expect(await claimInvites(crypto.randomUUID(), "dana@example.com")).toEqual([]);
  });

  test("an invite cannot be claimed with an unset email", async () => {
    const { id } = await newTenant();
    await addPerson(id, { name: "No email", role: "agent" }, "t");
    expect(await claimInvites(crypto.randomUUID(), "")).toEqual([]);
  });

  test("client agents never get an email invite", async () => {
    const { id } = await newTenant();
    expect((await addPerson(id, { name: "Hassan", role: "field_agent", email: "h@example.com" }, "t")).inviteEmail).toBeNull();
  });

  test("people see only the clients they belong to; admins see all", async () => {
    const a = await newTenant();
    const b = await newTenant();
    const userId = crypto.randomUUID();
    await addMember(a.id, { userId });
    const mine = await listMyTenants(userId);
    expect(mine.map((row) => row.id)).toEqual([a.id]);
    expect(mine[0].role).toBe("agent");

    const adminId = crypto.randomUUID();
    await withPlatform((db) => db.insert(profiles).values({ id: adminId, name: "Admin", isPlatformAdmin: true }));
    expect(await isPlatformAdmin(adminId)).toBe(true);
    expect((await listMyTenants(adminId)).map((row) => row.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    expect((await requireMember(adminId, a.id, "connections.manage")).role).toBe("platform_admin");
  });
});

describe("client setup", () => {
  test("the checklist reflects what exists, including a broken connection", async () => {
    const { id } = await newTenant();
    expect(await setupStatus(id)).toMatchObject({ page: { state: "todo" }, dataset: { state: "todo" }, teamGroup: "todo", rules: 0, agents: 0 });

    await saveConnection(id, { kind: "page", externalId: `page-${id}`, name: "Marina page", secret: "t" }, "t");
    await addPerson(id, { name: "Hassan", role: "field_agent" }, "t");
    expect(await setupStatus(id)).toMatchObject({ page: { state: "done", detail: "Marina page" }, agents: 1, agentsLinked: 0 });
  });

  test("the test lead reports each step honestly", async () => {
    const { id } = await newTenant();
    const noRule = await sendTestLead(id, "t");
    expect(noRule).toMatchObject({ arrived: true, assigned: false, alert: false, dataset: false });

    const staff = await addMember(id);
    await saveRoutingRule(id, { memberIds: [staff.id], slaMinutes: 15, maxReassigns: 1 }, "t");
    const routed = await sendTestLead(id, "t");
    expect(routed.assigned).toBe(true);
    const lead = await getLead(id, routed.leadId, { memberId: null, recordScope: "all" });
    expect(lead?.contact.name).toBe("Test Lead");
  });

  test("the test event needs a dataset and always carries the test code", async () => {
    const { id } = await newTenant();
    const calls = stubFetch();
    expect(await sendTestEvent(id, "TEST1")).toMatchObject({ ok: false, message: "Connect a Meta dataset first." });
    expect(calls).toHaveLength(0);

    await saveConnection(id, { kind: "dataset", externalId: `ds-${id}`, secret: "tok" }, "t");
    expect((await sendTestEvent(id, "TEST1")).ok).toBe(true);
    expect(calls[0].json?.test_event_code).toBe("TEST1");

    stubFetch(() => ({ status: 400 }));
    expect((await sendTestEvent(id, "TEST1")).ok).toBe(false);
  });

  test("only approved analyses count as approved", async () => {
    const { id } = await newTenant();
    const [row] = await withTenant(id, (db) => db.insert(adAnalyses).values({ tenantId: id, periodStart: "2026-10-01", body: "Draft" }).returning());
    expect(await listAnalyses(id, "approved")).toEqual([]);
    await approveAnalysis(id, row.id, "t");
    expect((await listAnalyses(id, "approved")).map((item) => item.body)).toEqual(["Draft"]);
  });

  test("an assigned-only agent cannot open someone else's lead", async () => {
    const { id } = await newTenant();
    const owner = await addMember(id);
    const other = await addMember(id, { recordScope: "assigned" });
    const { leadId } = await ingestLead(id, { source: "manual", email: "x@example.com" });
    await withTenant(id, (db) => db.update(members).set({ weight: 1 }).where(eq(members.id, owner.id)));
    expect(await getLead(id, leadId, { memberId: other.id, recordScope: "assigned" })).toBeNull();
  });
});
