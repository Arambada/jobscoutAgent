/**
 * Reed.co.uk jobseeker API — official, free key from https://www.reed.co.uk/developers
 * Enabled when REED_API_KEY is set in .env.local.
 */
import type { Preferences, SearchResultJob } from "../types";
import { parseJobTitles, parseLocations, relativeDate, withinMaxAge } from "../source-util";

const BASE = "https://www.reed.co.uk/api/1.0/search";

interface ReedResult {
  jobId?: number;
  employerName?: string;
  jobTitle?: string;
  locationName?: string;
  minimumSalary?: number | null;
  maximumSalary?: number | null;
  currency?: string | null;
  date?: string; // posted date, DD/MM/YYYY
  jobDescription?: string;
  jobUrl?: string;
}

export function reedEnabled(): boolean {
  return !!process.env.REED_API_KEY;
}

function parseReedDate(d?: string): Date | null {
  const m = d?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`) : null;
}

function formatSalary(r: ReedResult): string | null {
  if (!r.minimumSalary && !r.maximumSalary) return null;
  const fmt = (n: number) => Math.round(n).toLocaleString();
  const range =
    r.minimumSalary && r.maximumSalary && r.minimumSalary !== r.maximumSalary
      ? `${fmt(r.minimumSalary)}–${fmt(r.maximumSalary)}`
      : fmt((r.minimumSalary || r.maximumSalary) as number);
  return `${r.currency === "GBP" || !r.currency ? "£" : `${r.currency} `}${range}`;
}

async function searchOneTitle(
  title: string,
  location: string,
  prefs: Preferences,
  apiKey: string,
): Promise<SearchResultJob[]> {
  const params = new URLSearchParams({ keywords: title, resultsToTake: "10" });
  if (location) params.set("locationName", location);
  if (prefs.permanent_only) params.set("permanent", "true");

  const res = await fetch(`${BASE}?${params}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`Reed API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const data = (await res.json()) as { results?: ReedResult[] };
  return (data.results ?? [])
    .filter((r) => r.jobId && r.jobTitle && r.employerName)
    .filter((r) => withinMaxAge(parseReedDate(r.date)))
    .map((r) => {
      const description = r.jobDescription
        ? r.jobDescription.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        : null;
      const remote =
        !!prefs.remote_only ||
        /remote/i.test(`${r.jobTitle} ${r.locationName} ${description}`);
      return {
        key: `reed-${r.jobId}`,
        title: r.jobTitle!.trim(),
        company: r.employerName!.trim(),
        location: r.locationName ?? null,
        snippet: description ? description.slice(0, 240) : null,
        description,
        salary: formatSalary(r),
        postedDate: relativeDate(parseReedDate(r.date)),
        url: r.jobUrl ?? null,
        remote,
      };
    })
    .filter((j) => (prefs.remote_only ? j.remote : true));
}

export async function searchReed(prefs: Preferences): Promise<SearchResultJob[]> {
  const apiKey = process.env.REED_API_KEY;
  if (!apiKey) return [];
  const titles = parseJobTitles(prefs.job_title);
  const locations = parseLocations(prefs.location);
  const perTitle = await Promise.all(
    titles.flatMap((t) => locations.map((loc) => searchOneTitle(t, loc, prefs, apiKey))),
  );
  const byKey = new Map<string, SearchResultJob>();
  for (const list of perTitle) {
    for (const job of list) if (!byKey.has(job.key)) byKey.set(job.key, job);
  }
  return Array.from(byKey.values());
}
