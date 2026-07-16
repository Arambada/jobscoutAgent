/** Shared helpers for job-search sources. */

// Only surface listings posted within the last N days (~2 months by default).
export const MAX_DAYS_OLD = parseInt(
  process.env.JOB_MAX_DAYS_OLD ?? process.env.ADZUNA_MAX_DAYS_OLD ?? "60",
  10,
);

export function ageInDays(date: Date | string | undefined | null): number | null {
  if (!date) return null;
  const t = typeof date === "string" ? new Date(date).getTime() : date.getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

export function withinMaxAge(date: Date | string | undefined | null): boolean {
  const days = ageInDays(date);
  return days === null || days <= MAX_DAYS_OLD;
}

export function relativeDate(date: Date | string | undefined | null): string | null {
  if (!date) return null;
  const t = typeof date === "string" ? new Date(date).getTime() : date.getTime();
  if (Number.isNaN(t)) return null;
  const hours = Math.floor((Date.now() - t) / 3600000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

/** Split the job_title preference into individual titles (comma or newline separated). */
export function parseJobTitles(jobTitle: string): string[] {
  return Array.from(
    new Set(
      jobTitle
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  );
}

/**
 * Split the location preference into individual locations ("London, Manchester").
 * Most job APIs geocode a single place and silently return nothing for a
 * combined string, so each location is searched separately.
 * Returns [""] when no location is set, so callers can loop uniformly.
 */
export function parseLocations(location: string): string[] {
  const parsed = Array.from(
    new Set(
      location
        .split(/[,\n]/)
        .map((l) => l.trim())
        .filter(Boolean),
    ),
  );
  return parsed.length > 0 ? parsed : [""];
}
