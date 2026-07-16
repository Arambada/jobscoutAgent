/**
 * Remotive remote-jobs API — keyless and free (https://remotive.com/api/remote-jobs).
 * Remote-only roles, full descriptions included. Always enabled.
 */
import type { Preferences, SearchResultJob } from "../types";
import { htmlToText } from "../description";
import { parseJobTitles, relativeDate, withinMaxAge } from "../source-util";

const BASE = "https://remotive.com/api/remote-jobs";

interface RemotiveResult {
  id?: number;
  url?: string;
  title?: string;
  company_name?: string;
  candidate_required_location?: string;
  salary?: string;
  job_type?: string; // full_time, contract, part_time, freelance, internship
  publication_date?: string;
  description?: string;
}

/**
 * Remotive's candidate_required_location is a hiring restriction — where the
 * candidate must legally reside. Keep a listing only when that restriction
 * explicitly covers where the candidate lives (or is absent). "Remote (Brazil)"
 * means remote within Brazil, not remote for everyone.
 *
 * Defaults to a UK-based candidate; set CANDIDATE_REGIONS to a comma-separated
 * list of region words to match instead, e.g. for someone in Canada:
 * CANDIDATE_REGIONS=canada,northern america,americas,worldwide,anywhere,global
 */
const DEFAULT_REGIONS =
  "uk,united kingdom,great britain,england,europe,emea,worldwide,anywhere,global,international";

const REGION_RE = new RegExp(
  `\\b(${(process.env.CANDIDATE_REGIONS ?? DEFAULT_REGIONS)
    .split(",")
    .map((r) => r.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean)
    .join("|")})\\b`,
  "i",
);

function hirableFromRegion(requiredLocation?: string): boolean {
  if (!requiredLocation?.trim()) return true;
  return REGION_RE.test(requiredLocation);
}

async function searchOneTitle(
  title: string,
  prefs: Preferences,
): Promise<SearchResultJob[]> {
  const params = new URLSearchParams({ search: title, limit: "10" });
  const res = await fetch(`${BASE}?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`Remotive API error ${res.status}`);
  }

  const data = (await res.json()) as { jobs?: RemotiveResult[] };
  return (data.jobs ?? [])
    .filter((r) => r.id && r.title && r.company_name)
    .filter((r) => withinMaxAge(r.publication_date))
    .filter((r) => hirableFromRegion(r.candidate_required_location))
    .filter(
      (r) =>
        !prefs.permanent_only ||
        !/contract|freelance|internship|temporary/i.test(r.job_type ?? ""),
    )
    .map((r) => {
      const description = r.description ? htmlToText(r.description) : null;
      return {
        key: `remotive-${r.id}`,
        title: r.title!.trim(),
        company: r.company_name!.trim(),
        location: r.candidate_required_location
          ? `Remote (${r.candidate_required_location})`
          : "Remote",
        snippet: description ? description.replace(/\s+/g, " ").slice(0, 240) : null,
        description,
        salary: r.salary?.trim() || null,
        postedDate: relativeDate(r.publication_date),
        url: r.url ?? null,
        remote: true,
      };
    });
}

export async function searchRemotive(prefs: Preferences): Promise<SearchResultJob[]> {
  const titles = parseJobTitles(prefs.job_title);
  const perTitle = await Promise.all(titles.map((t) => searchOneTitle(t, prefs)));
  const byKey = new Map<string, SearchResultJob>();
  for (const list of perTitle) {
    for (const job of list) if (!byKey.has(job.key)) byKey.set(job.key, job);
  }
  return Array.from(byKey.values());
}
