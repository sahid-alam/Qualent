import { requireUserId } from "../../../../../lib/auth/session.ts";
import { exportCsv } from "../../../../../lib/leads/work.ts";
import { ForbiddenError, requireMember } from "../../../../../lib/permissions.ts";

export async function GET(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  try {
    const membership = await requireMember(await requireUserId(), tenantId, "leads.export");
    const search = new URL(request.url).searchParams;
    const csv = await exportCsv(
      tenantId,
      {
        search: search.get("q") ?? undefined,
        stageIds: search.get("stage") ? [search.get("stage")!] : undefined,
        ownerMemberId: search.get("owner") ?? undefined,
      },
      membership,
    );
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="leads.csv"' } });
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response(null, { status: 403 });
    throw error;
  }
}
