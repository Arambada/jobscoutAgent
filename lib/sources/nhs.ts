/**
 * NHS Jobs (www.jobs.nhs.uk) — the official NHS vacancy service.
 * No public API, but the search results page is stable server-rendered HTML
 * with data-test attributes. Advert pages carry the full advert including the
 * Person Specification (essential/desirable criteria), which the description
 * fetcher picks up for supporting statements.
 */
import type { Preferences, SearchResultJob } from "../types";
import { parseJobTitles, parseLocations, relativeDate, withinMaxAge } from "../source-util";

const BASE = "https://www.jobs.nhs.uk";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml",
  "Accept-Language": "en-GB,en;q=0.9",
};

function text(s: string | undefined): string {
  return (s ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function parseResultBlock(block: string, prefs: Preferences): SearchResultJob | null {
  const titleMatch = block.match(
    /<a\s+href="\/candidate\/jobadvert\/([^"?]+)[^"]*"[^>]*data-test="search-result-job-title"[^>]*>([\s\S]*?)<\/a>/,
  );
  if (!titleMatch) return null;
  const [, id, rawTitle] = titleMatch;

  const locMatch = block.match(
    /data-test="search-result-location"[\s\S]*?<h3[^>]*>([\s\S]*?)<div[^>]*>([\s\S]*?)<\/div>/,
  );
  const employer = text(locMatch?.[1]);
  const location = text(locMatch?.[2]);

  const salaryMatch = block.match(
    /data-test="search-result-salary"[\s\S]*?<strong[^>]*>([\s\S]*?)<\/strong>/,
  );
  const postedMatch = block.match(
    /data-test="search-result-publicationDate"[\s\S]*?<strong[^>]*>([\s\S]*?)<\/strong>/,
  );
  const posted = postedMatch ? new Date(text(postedMatch[1])) : null;
  if (posted && !withinMaxAge(posted)) return null;

  if (prefs.permanent_only) {
    // "Contract type: Permanent" vs "Fixed term", "Bank", "Locum", …
    const typeMatch = block.match(
      /data-test="search-result-jobType"[\s\S]*?<strong[^>]*>([\s\S]*?)<\/strong>/,
    );
    if (typeMatch && !/permanent/i.test(text(typeMatch[1]))) return null;
  }

  const title = text(rawTitle);
  if (!title || !employer) return null;

  const remote = !!prefs.remote_only || /remote|home[- ]based/i.test(`${title} ${location}`);

  return {
    key: `nhs-${id}`,
    title,
    company: employer,
    location: location || null,
    snippet: null,
    description: null, // full advert (incl. person spec) is fetched from the page
    salary: salaryMatch ? text(salaryMatch[1]) : null,
    postedDate: posted && !Number.isNaN(posted.getTime()) ? relativeDate(posted) : null,
    url: `${BASE}/candidate/jobadvert/${id}`,
    remote,
  };
}

async function searchOneTitle(
  title: string,
  location: string,
  prefs: Preferences,
): Promise<SearchResultJob[]> {
  const params = new URLSearchParams({ keyword: title, language: "en" });
  if (location) {
    params.set("location", location);
    params.set("distance", "50");
  }

  const res = await fetch(`${BASE}/candidate/search/results?${params}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(`NHS Jobs error ${res.status}`);
  }

  const html = await res.text();
  // Each result is delimited by the search-result marker; parse each chunk.
  const chunks = html.split(/data-test="search-result"/).slice(1);
  const jobs: SearchResultJob[] = [];
  for (const chunk of chunks.slice(0, 10)) {
    const job = parseResultBlock(chunk, prefs);
    if (job) jobs.push(job);
  }
  return jobs;
}

export async function searchNhs(prefs: Preferences): Promise<SearchResultJob[]> {
  const titles = parseJobTitles(prefs.job_title);
  const locations = parseLocations(prefs.location);
  const perTitle = await Promise.all(
    titles.flatMap((t) => locations.map((loc) => searchOneTitle(t, loc, prefs))),
  );
  const byKey = new Map<string, SearchResultJob>();
  for (const list of perTitle) {
    for (const job of list) if (!byKey.has(job.key)) byKey.set(job.key, job);
  }
  return Array.from(byKey.values());
}
