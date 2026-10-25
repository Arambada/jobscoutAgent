import cron from "node-cron";
import { runSearch } from "./agent";

// Survive HMR: never register the cron job twice
const globalForScheduler = globalThis as unknown as {
  __jobScoutCron?: ReturnType<typeof cron.schedule>;
};

const DEFAULT_INTERVAL_HOURS = 12;
// Runs are anchored to this local hour (8 → 08:00, 20:00 for a 12h interval),
// so they land while the laptop is usually open rather than at midnight.
const START_HOUR = Math.min(23, Math.max(0, parseInt(process.env.SEARCH_START_HOUR ?? "8", 10) || 0));
const TIMEZONE = process.env.SEARCH_TZ || "Europe/London";
// When every source fails (usually a network blip), try again after these delays
const RETRY_DELAYS_MIN = [5, 30];

/**
 * Schedule comes from, in priority order:
 * 1. SEARCH_CRON env (full cron expression)
 * 2. the search_interval_hours preference from Settings, starting at START_HOUR
 * 3. every 12 hours from START_HOUR
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
  const runHours: number[] = [];
  for (let h = START_HOUR; h < START_HOUR + 24; h += hours) runHours.push(h % 24);
  return `0 ${runHours.sort((a, b) => a - b).join(",")} * * *`;
}

/** Run a search; if every source failed, retry a couple of times before giving up. */
async function searchWithRetry(attempt = 0): Promise<void> {
  try {
    const run = await runSearch();
    if (run.status !== "error" || !run.error?.startsWith("All sources failed")) return;
  } catch (err) {
    console.error("[Scheduler] Search failed:", err);
    return;
  }
  const delay = RETRY_DELAYS_MIN[attempt];
  if (delay === undefined) {
    console.log("[Scheduler] Every source still failing — giving up until the next scheduled run");
    return;
  }
  console.log(`[Scheduler] Every source failed — retrying in ${delay} min`);
  setTimeout(() => void searchWithRetry(attempt + 1), delay * 60_000);
}

export async function startScheduler(): Promise<void> {
  if (globalForScheduler.__jobScoutCron) {
    console.log("[Scheduler] Already started — skipping");
    return;
  }

  const schedule = await resolveSchedule();
  console.log(`[Scheduler] Starting — cron: ${schedule} (${TIMEZONE})`);

  globalForScheduler.__jobScoutCron = cron.schedule(schedule, async () => {
    console.log("[Scheduler] Running scheduled search…");
    await searchWithRetry();
  }, { timezone: TIMEZONE });
}

/** Restart the cron job (used when the interval changes in Settings). */
export async function restartScheduler(): Promise<void> {
  if (globalForScheduler.__jobScoutCron) {
    globalForScheduler.__jobScoutCron.stop();
    globalForScheduler.__jobScoutCron = undefined;
  }
  await startScheduler();
}
