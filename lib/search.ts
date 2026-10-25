/**
 * Multi-source job search orchestrator.
 * Runs every enabled source in parallel; one source failing doesn't sink the
 * run. Results are de-duplicated across sources by normalized title+company
 * (the same vacancy is often listed on several boards).
 */
import type { Preferences, SearchResultJob } from "./types";
import { searchAdzuna } from "./adzuna";
import { searchReed, reedEnabled } from "./sources/reed";
import { searchRemotive } from "./sources/remotive";
import { searchJSearch, jsearchEnabled } from "./sources/jsearch";
import { searchNhs } from "./sources/nhs";
import { searchAts, atsEnabled } from "./sources/ats";
import { companyMatches, expandTargetCompanies } from "./companies";

interface SourceDef {
  name: string;
  enabled: boolean;
  search: (prefs: Preferences) => Promise<SearchResultJob[]>;
}

export function normalizedJobIdentity(title: string, company: string): string {
  return `${title}|${company}`.toLowerCase().replace(/\s+/g, " ").trim();
}

export interface MultiSearchResult {
  results: SearchResultJob[];
  perSource: Record<string, number>;
  errors: Record<string, string>;
}

export async function searchAllSources(prefs: Preferences): Promise<MultiSearchResult> {
  // Employer ATS boards go first so their direct-apply listings win the
  // title+company de-dupe against the same vacancy on an aggregator.
  const sources: SourceDef[] = [
    { name: "ats", enabled: atsEnabled(), search: searchAts },
    { name: "adzuna", enabled: !!(process.env.ADZUNA_APP_ID && process.env.ADZUNA_APP_KEY), search: searchAdzuna },
    { name: "reed", enabled: reedEnabled(), search: searchReed },
    { name: "remotive", enabled: true, search: searchRemotive },
    { name: "jsearch", enabled: jsearchEnabled(), search: searchJSearch },
    { name: "nhs", enabled: process.env.NHS_JOBS !== "off", search: searchNhs },
  ];

  const active = sources.filter((s) => s.enabled);
  const perSource: Record<string, number> = {};
  const errors: Record<string, string> = {};

  const settled = await Promise.allSettled(active.map((s) => s.search(prefs)));

  const merged: SearchResultJob[] = [];
  const seen = new Set<string>();

  settled.forEach((outcome, i) => {
    const name = active[i].name;
    if (outcome.status === "rejected") {
      const msg =
        outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      errors[name] = msg;
      console.error(`[Search] ${name} failed:`, msg);
      perSource[name] = 0;
      return;
    }
    let kept = 0;
    for (const job of outcome.value) {
      const identity = normalizedJobIdentity(job.title, job.company);
      if (seen.has(identity)) continue;
      seen.add(identity);
      merged.push(job);
      kept++;
    }
    perSource[name] = kept;
  });

  // Employer allowlist: when target_companies is set, only listings from a
  // matching employer survive. Applied post-search (rather than per-source
  // query) since most job APIs can't filter by company name server-side.
  const targets = expandTargetCompanies(prefs.target_companies ?? "");
  const filtered =
    targets.length > 0 ? merged.filter((job) => companyMatches(job.company, targets)) : merged;

  return { results: filtered, perSource, errors };
}
