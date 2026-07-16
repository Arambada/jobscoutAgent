import cron from "node-cron";
import { runSearch } from "./agent";

// Survive HMR: never register the cron job twice
const globalForScheduler = globalThis as unknown as {
  __jobScoutCron?: ReturnType<typeof cron.schedule>;
};

const DEFAULT_INTERVAL_HOURS = 12;

/**
 * Schedule comes from, in priority order:
 * 1. SEARCH_CRON env (full cron expression)
 * 2. the search_interval_hours preference from Settings
 * 3. every 12 hours
 */
async function resolveSchedule(): Promise<string> {
  if (process.env.SEARCH_CRON) return process.env.SEARCH_CRON;

  let hours = DEFAULT_INTERVAL_HOURS;
  try {
    const { getSql } = await import("./db");
    const [prefs] = await getSql()<{ search_interval_hours: number }[]>`
      SELECT search_interval_hours FROM preferences WHERE id = 1
    `;
    if (prefs?.search_interval_hours) {
      hours = Math.min(24, Math.max(1, prefs.search_interval_hours));
    }
  } catch {
    // DB not ready yet — fall back to the default
  }
  return `0 */${hours} * * *`;
}

export async function startScheduler(): Promise<void> {
  if (globalForScheduler.__jobScoutCron) {
    console.log("[Scheduler] Already started — skipping");
    return;
  }

  const schedule = await resolveSchedule();
  console.log(`[Scheduler] Starting — cron: ${schedule}`);

  globalForScheduler.__jobScoutCron = cron.schedule(schedule, async () => {
    console.log("[Scheduler] Running scheduled search…");
    try {
      await runSearch();
    } catch (err) {
      console.error("[Scheduler] Search failed:", err);
    }
  });
}

/** Restart the cron job (used when the interval changes in Settings). */
export async function restartScheduler(): Promise<void> {
  if (globalForScheduler.__jobScoutCron) {
    globalForScheduler.__jobScoutCron.stop();
    globalForScheduler.__jobScoutCron = undefined;
  }
  await startScheduler();
}
