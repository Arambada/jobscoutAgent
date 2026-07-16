import type { Preferences, SearchResultJob } from "./types";
import { MAX_DAYS_OLD, parseJobTitles, parseLocations, relativeDate, withinMaxAge } from "./source-util";

const BASE = "https://api.adzuna.com/v1/api/jobs";

interface AdzunaResult {
  id?: string;
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  salary_min?: number;
  salary_max?: number;
  salary_is_predicted?: string;
  description?: string;
  redirect_url?: string;
  created?: string;
}

function formatSalary(r: AdzunaResult): string | null {
  if (!r.salary_min && !r.salary_max) return null;
  const fmt = (n: number) => Math.round(n).toLocaleString();
  const range =
    r.salary_min && r.salary_max && r.salary_min !== r.salary_max
      ? `${fmt(r.salary_min)}–${fmt(r.salary_max)}`
      : fmt((r.salary_min || r.salary_max) as number);
  return `${range}${r.salary_is_predicted === "1" ? " (est.)" : ""}`;
}

/** Run a single Adzuna search for one job title and return the normalized listings. */
async function searchOneTitle(
  title: string,
  location: string,
  prefs: Preferences,
  appId: string,
  appKey: string,
  country: string,
): Promise<SearchResultJob[]> {
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: "10",
    what: title,
    max_days_old: String(MAX_DAYS_OLD),
  });
  if (location) params.set("where", location);
  if (prefs.permanent_only) params.set("permanent", "1");
  // Adzuna treats "what_or" as OR'd keywords to broaden/prioritize results
  if (prefs.keywords.trim()) {
    params.set("what_or", prefs.keywords.replace(/,/g, " ").trim());
  }

  let res = await fetch(`${BASE}/${country}/search/1?${params}`, {
    headers: { Accept: "application/json" },
  });

  // Free tier is burst-limited — back off once on 429 before giving up
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 3000));
    res = await fetch(`${BASE}/${country}/search/1?${params}`, {
      headers: { Accept: "application/json" },
    });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Adzuna API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { results?: AdzunaResult[] };
  const results = data.results ?? [];

  return results
    .filter((r) => r.id && r.title && r.company?.display_name)
    .filter((r) => withinMaxAge(r.created))
    .map((r) => {
      const remote =
        !!prefs.remote_only ||
        /remote/i.test(`${r.title} ${r.location?.display_name} ${r.description}`);
      return {
        key: `adzuna-${r.id}`,
        title: (r.title as string).replace(/<\/?[^>]+>/g, "").trim(),
        company: r.company!.display_name!.trim(),
        location: r.location?.display_name ?? null,
        snippet: r.description ? r.description.replace(/\s+/g, " ").slice(0, 240) : null,
        description: r.description ? r.description.replace(/\s+/g, " ").trim() : null,
        salary: formatSalary(r),
        postedDate: relativeDate(r.created),
        url: r.redirect_url ?? null,
        remote,
      };
    })
    .filter((j) => (prefs.remote_only ? j.remote : true));
}

/**
 * Search Adzuna for jobs matching the user's preferences.
 * The job_title preference may contain several comma/newline-separated titles
 * (e.g. "Data Scientist, ML Engineer, AI Engineer") — each is searched
 * independently and the results are merged and de-duplicated.
 */
export async function searchAdzuna(prefs: Preferences): Promise<SearchResultJob[]> {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) {
    throw new Error(
      "ADZUNA_APP_ID / ADZUNA_APP_KEY are not set — add them to .env.local (free key from developer.adzuna.com)",
    );
  }

  const titles = parseJobTitles(prefs.job_title);
  if (titles.length === 0) {
    throw new Error("No job title configured — set your preferences in Settings first");
  }

  const country = (process.env.ADZUNA_COUNTRY ?? "gb").toLowerCase();
  const locations = parseLocations(prefs.location);

  // Sequential with a small gap — a parallel burst of title×location queries
  // trips Adzuna's per-minute rate limit
  const perTitle: SearchResultJob[][] = [];
  for (const title of titles) {
    for (const loc of locations) {
      perTitle.push(await searchOneTitle(title, loc, prefs, appId, appKey, country));
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  // Merge results from every title, keeping the first occurrence of each job.
  const byKey = new Map<string, SearchResultJob>();
  for (const list of perTitle) {
    for (const job of list) {
      if (!byKey.has(job.key)) byKey.set(job.key, job);
    }
  }
  return Array.from(byKey.values());
}
