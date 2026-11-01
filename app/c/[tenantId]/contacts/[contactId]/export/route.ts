import { requireUserId } from "../../../../../../lib/auth/session.ts";
import { ForbiddenError, requireMember } from "../../../../../../lib/permissions.ts";
import { exportContact } from "../../../../../../lib/privacy.ts";

export async function GET(_request: Request, { params }: { params: Promise<{ tenantId: string; contactId: string }> }) {
  const { tenantId, contactId } = await params;
  try {
    const userId = await requireUserId();
    await requireMember(userId, tenantId, "contacts.erase");
    const data = await exportContact(tenantId, contactId, `user:${userId}`);
    if (!data) return new Response(null, { status: 404 });
    return new Response(JSON.stringify(data, null, 2), {
      headers: { "content-type": "application/json", "content-disposition": `attachment; filename="contact-${contactId}.json"` },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response(null, { status: 403 });
    throw error;
  }
}
