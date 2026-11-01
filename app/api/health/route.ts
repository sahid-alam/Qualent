import { createDb } from "../../../lib/db/client.ts";
import { workerHeartbeat } from "../../../lib/db/schema.ts";
import { isWorkerHealthy } from "../../../lib/health.ts";

export const dynamic = "force-dynamic";

const db = createDb(process.env.DATABASE_URL, 2);

export async function GET() {
  try {
    const [row] = await db.select().from(workerHeartbeat).limit(1);
    const healthy = isWorkerHealthy(row?.beatAt);
    return Response.json(
      { worker: healthy ? "ok" : "stale" },
      { status: healthy ? 200 : 503 },
    );
  } catch {
    return Response.json({ database: "unreachable" }, { status: 503 });
  }
}
