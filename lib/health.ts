// The scheduler ticks at least every 15 minutes even with nothing to do.
const STALE_AFTER_MS = 20 * 60_000;

export function isWorkerHealthy(beatAt: Date | undefined, now = new Date()) {
  return !!beatAt && now.getTime() - beatAt.getTime() < STALE_AFTER_MS;
}
