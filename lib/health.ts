export const HEARTBEAT_INTERVAL_MS = 30_000;
const STALE_AFTER_MS = 120_000;

export function isWorkerHealthy(beatAt: Date | undefined, now = new Date()) {
  return !!beatAt && now.getTime() - beatAt.getTime() < STALE_AFTER_MS;
}
