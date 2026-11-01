import { PgBoss } from "pg-boss";

export const ECHO_QUEUE = "system.echo";

// The worker runs queue maintenance. Anything else only sends jobs.
export function createSender(connectionString: string | undefined) {
  return new PgBoss({
    connectionString,
    max: 2,
    supervise: false,
    schedule: false,
    migrate: false,
  });
}

export function createWorkerBoss(connectionString: string | undefined) {
  return new PgBoss({ connectionString, max: 5 });
}
