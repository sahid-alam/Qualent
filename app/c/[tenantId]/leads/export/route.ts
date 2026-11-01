import { requireUserId } from "../../../../../lib/auth/session.ts";
import { exportCsv, filtersFromQuery } from "../../../../../lib/leads/work.ts";
import { ForbiddenError, requireMember } from "../../../../../lib/permissions.ts";
import { listCustomFields } from "../../../../../lib/settings.ts";

export async function GET(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  try {
    const userId = await requireUserId();
    const membership = await requireMember(userId, tenantId, "leads.export");
    const search = Object.fromEntries(new URL(request.url).searchParams);
    const csv = await exportCsv(tenantId, filtersFromQuery(search, await listCustomFields(tenantId)), membership, `user:${userId}`);
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="leads.csv"' } });
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response(null, { status: 403 });
    throw error;
  }
}
