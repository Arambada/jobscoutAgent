/**
 * JSearch (RapidAPI) — aggregates Google for Jobs, which indexes postings
 * from Indeed, LinkedIn, Glassdoor, ZipRecruiter and employer career sites.
 * This is the legitimate route to Indeed/LinkedIn listings (their own APIs
 * are closed). Free key: https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
 * Enabled when JSEARCH_API_KEY is set in .env.local.
 */
import type { Preferences, SearchResultJob } from "../types";
import { htmlToText } from "../description";
import { parseJobTitles, parseLocations, relativeDate, withinMaxAge } from "../source-util";

// The original /search endpoint was retired in favour of /search-v2
// (results moved from data[] to data.jobs[], and country= is required —
// it silently defaults to US otherwise).
const BASE = "https://jsearch.p.rapidapi.com/search-v2";
const COUNTRY = (process.env.JSEARCH_COUNTRY ?? "gb").toLowerCase();

interface JSearchResult {
  job_id?: string;
  employer_name?: string;
  job_publisher?: string; // "LinkedIn", "Indeed", "Glassdoor", …
  job_employment_type?: string; // FULLTIME, CONTRACTOR, PARTTIME, INTERN
  job_title?: string;
  job_city?: string | null;
  job_country?: string | null;
  job_is_remote?: boolean;
  job_description?: string;
  job_apply_link?: string;
  job_posted_at_datetime_utc?: string | null;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_salary_currency?: string | null;
}

export function jsearchEnabled(): boolean {
  return !!process.env.JSEARCH_API_KEY;
}

function formatSalary(r: JSearchResult): string | null {
  if (!r.job_min_salary && !r.job_max_salary) return null;
  const fmt = (n: number) => Math.round(n).toLocaleString();
  const range =
    r.job_min_salary && r.job_max_salary && r.job_min_salary !== r.job_max_salary
      ? `${fmt(r.job_min_salary)}–${fmt(r.job_max_salary)}`
      : fmt((r.job_min_salary || r.job_max_salary) as number);
  return `${r.job_salary_currency ?? ""} ${range}`.trim();
}

// "today" surfaces the freshest postings (LinkedIn/Indeed jobs from the last
// 24h — apply-early advantage); override with JSEARCH_DATE_POSTED=week|month.
const DATE_POSTED = process.env.JSEARCH_DATE_POSTED ?? "today";

async function runQuery(
  query: string,
  prefs: Preferences,
  apiKey: string,
): Promise<SearchResultJob[]> {
  const params = new URLSearchParams({
    query,
    num_pages: "1",
    date_posted: DATE_POSTED,
    country: COUNTRY,
  });
  if (prefs.remote_only) params.set("work_from_home", "true");
  if (prefs.permanent_only) params.set("employment_types", "FULLTIME");

  const res = await fetch(`${BASE}?${params}`, {
    headers: {
      Accept: "application/json",
      "X-RapidAPI-Key": apiKey,
      "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    throw new Error(`JSearch API error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const body = (await res.json()) as {
    data?: JSearchResult[] | { jobs?: JSearchResult[] };
  };
  const results = Array.isArray(body.data) ? body.data : (body.data?.jobs ?? []);
  return results
    .filter((r) => r.job_id && r.job_title && r.employer_name)
    .filter((r) => withinMaxAge(r.job_posted_at_datetime_utc))
    .filter(
      (r) => !prefs.permanent_only || !/CONTRACTOR|INTERN/i.test(r.job_employment_type ?? ""),
    )
    .map((r) => {
      const description = r.job_description ? htmlToText(r.job_description) : null;
      const remote =
        !!r.job_is_remote || /remote/i.test(`${r.job_title} ${description ?? ""}`);
      return {
        key: `jsearch-${r.job_id}`,
        title: r.job_title!.trim(),
        company: r.employer_name!.trim(),
        location:
          [r.job_city, r.job_country].filter(Boolean).join(", ") ||
          (r.job_is_remote ? "Remote" : null),
        snippet: description ? description.replace(/\s+/g, " ").slice(0, 240) : null,
        description,
        salary: formatSalary(r),
        postedDate: [relativeDate(r.job_posted_at_datetime_utc), r.job_publisher ? `on ${r.job_publisher}` : null]
          .filter(Boolean)
          .join(" ") || null,
        url: r.job_apply_link ?? null,
        remote,
      };
    })
    .filter((j) => (prefs.remote_only ? j.remote : true));
}

export async function searchJSearch(prefs: Preferences): Promise<SearchResultJob[]> {
  const apiKey = process.env.JSEARCH_API_KEY;
  if (!apiKey) return [];
  // Quota care (free tier = 200 requests/month): titles are OR'd into one
  // query, but locations must be separate requests — the API returns nothing
  // for multi-city queries like "in London or Manchester".
  const titles = parseJobTitles(prefs.job_title);
  const locations = parseLocations(prefs.location);
  const orTitles = titles.join(" OR ");

  const perLocation = await Promise.all(
    locations.map((loc) =>
      runQuery(loc ? `${orTitles} in ${loc}` : orTitles, prefs, apiKey),
    ),
  );
  const byKey = new Map<string, SearchResultJob>();
  for (const list of perLocation) {
    for (const job of list) if (!byKey.has(job.key)) byKey.set(job.key, job);
  }
  return Array.from(byKey.values());
}
