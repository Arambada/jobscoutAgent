/**
 * Employer ATS boards — keyless public JSON feeds from Greenhouse, Lever and Ashby.
 * Unlike the aggregators, every listing here links straight to the employer's own
 * application form.
 *
 * The board list defaults to UK data/AI employers; override with ATS_BOARDS, a
 * comma-separated list of kind:slug pairs (optionally kind:slug:Display Name), e.g.
 * ATS_BOARDS=greenhouse:monzo,lever:spotify,ashby:openai:OpenAI
 * Set ATS_BOARDS=off to disable the source.
 */
import type { Preferences, SearchResultJob } from "../types";
import { htmlToText } from "../description";
import { parseJobTitles, parseLocations, relativeDate, withinMaxAge } from "../source-util";

type AtsKind = "greenhouse" | "lever" | "ashby";

interface Board {
  kind: AtsKind;
  slug: string;
  name?: string;
}

const DEFAULT_BOARDS = [
  // Greenhouse
  "greenhouse:monzo",
  "greenhouse:deliveroo",
  "greenhouse:gocardless",
  "greenhouse:isomorphiclabs",
  "greenhouse:truelayer",
  "greenhouse:stabilityai",
  "greenhouse:polyai",
  "greenhouse:datadog",
  "greenhouse:cloudflare",
  "greenhouse:mongodb",
  "greenhouse:elastic",
  "greenhouse:databricks",
  "greenhouse:intercom",
  "greenhouse:graphcore",
  "greenhouse:tide",
  "greenhouse:gymshark",
  "greenhouse:anthropic",
  "greenhouse:scaleai",
  // Lever
  "lever:spotify",
  "lever:palantir",
  "lever:moonpig",
  "lever:matillion",
  // Ashby
  "ashby:wayve",
  "ashby:elevenlabs:ElevenLabs",
  "ashby:cohere",
  "ashby:synthesia",
  "ashby:faculty",
  "ashby:tractable",
  "ashby:marshmallow",
  "ashby:lendable",
  "ashby:signal-ai:Signal AI",
  "ashby:hyperexponential",
  "ashby:zego",
  "ashby:freetrade",
  "ashby:pleo",
  "ashby:openai:OpenAI",
  "ashby:snowflake",
].join(",");

export function atsEnabled(): boolean {
  return process.env.ATS_BOARDS !== "off";
}

function boards(): Board[] {
  return (process.env.ATS_BOARDS || DEFAULT_BOARDS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((pair) => {
      const [kind, slug, name] = pair.split(":").map((x) => x.trim());
      if (!slug || !["greenhouse", "lever", "ashby"].includes(kind)) return [];
      return [{ kind: kind as AtsKind, slug, name: name || undefined }];
    });
}

/** A posting before title/location filtering. */
interface Posting {
  key: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  description: string | null;
  postedAt: string | null;
  url: string;
  employmentType: string;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  location?: { name?: string };
  content?: string;
  first_published?: string;
  updated_at?: string;
}

async function fetchGreenhouse(slug: string): Promise<Posting[]> {
  const base = `https://boards-api.greenhouse.io/v1/boards/${slug}`;
  const [meta, data] = await Promise.all([
    getJson<{ name?: string }>(base).catch(() => ({ name: undefined })),
    getJson<{ jobs: GreenhouseJob[] }>(`${base}/jobs?content=true`),
  ]);
  const company = meta.name?.trim() || slug;
  return data.jobs.map((j) => {
    const location = j.location?.name ?? "";
    // content is HTML that Greenhouse has entity-escaped once more
    const html = (j.content ?? "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&");
    return {
      key: `greenhouse-${slug}-${j.id}`,
      title: j.title.trim(),
      company,
      location,
      remote: /remote/i.test(location),
      description: html ? htmlToText(html) : null,
      postedAt: j.first_published ?? j.updated_at ?? null,
      url: j.absolute_url,
      employmentType: "",
    };
  });
}

interface LeverJob {
  id: string;
  text: string;
  hostedUrl: string;
  createdAt?: number;
  categories?: { location?: string; commitment?: string; allLocations?: string[] };
  workplaceType?: string;
  descriptionPlain?: string;
  additionalPlain?: string;
  lists?: { text: string; content: string }[];
}

async function fetchLever(slug: string): Promise<Posting[]> {
  const data = await getJson<LeverJob[]>(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  const company = slug.charAt(0).toUpperCase() + slug.slice(1);
  return data.map((j) => {
    const location = Array.from(
      new Set([j.categories?.location, ...(j.categories?.allLocations ?? [])].filter(Boolean)),
    ).join(" / ");
    const lists = (j.lists ?? []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join("\n\n");
    const description = [j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join("\n\n");
    return {
      key: `lever-${slug}-${j.id}`,
      title: j.text.trim(),
      company,
      location,
      remote: j.workplaceType === "remote" || /remote/i.test(location),
      description: description || null,
      postedAt: j.createdAt ? new Date(j.createdAt).toISOString() : null,
      url: j.hostedUrl,
      employmentType: j.categories?.commitment ?? "",
    };
  });
}

interface AshbyJob {
  id: string;
  title: string;
  location?: string;
  secondaryLocations?: { location?: string }[];
  isRemote?: boolean;
  isListed?: boolean;
  employmentType?: string;
  publishedAt?: string;
  jobUrl: string;
  descriptionPlain?: string;
  address?: { postalAddress?: { addressCountry?: string } };
}

async function fetchAshby(slug: string): Promise<Posting[]> {
  const data = await getJson<{ jobs: AshbyJob[] }>(
    `https://api.ashbyhq.com/posting-api/job-board/${slug}`,
  );
  const company = slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return data.jobs
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const location = [
        j.location,
        ...(j.secondaryLocations ?? []).map((s) => s.location),
        j.address?.postalAddress?.addressCountry,
      ]
        .filter(Boolean)
        .join(" / ");
      return {
        key: `ashby-${slug}-${j.id}`,
        title: j.title.trim(),
        company,
        location,
        remote: !!j.isRemote,
        description: j.descriptionPlain ?? null,
        postedAt: j.publishedAt ?? null,
        url: j.jobUrl,
        employmentType: j.employmentType ?? "",
      };
    });
}

const FETCHERS: Record<AtsKind, (slug: string) => Promise<Posting[]>> = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
};

/** Fold common spellings together so "ML Engineer" matches "Machine Learning Engineer". */
function normTitle(s: string): string {
  return ` ${s.toLowerCase()} `
    .replace(/machine[\s-]+learning/g, "ml")
    .replace(/artificial[\s-]+intelligence/g, "ai")
    .replace(/[^a-z0-9]+/g, " ");
}

function titleMatches(title: string, wanted: string[]): boolean {
  const t = normTitle(title);
  return wanted.some((w) => t.includes(normTitle(w)));
}

const UK_RE = /\b(uk|united kingdom|great britain|england|gb)\b/i;

/**
 * Keep a posting when it's in one of the preferred cities, or anywhere in the
 * UK when it's remote. With no location preference, anything in the UK counts.
 */
function locationMatches(p: Posting, places: string[]): boolean {
  const loc = p.location.toLowerCase();
  const wanted = places.filter(Boolean).map((x) => x.toLowerCase());
  if (wanted.some((w) => loc.includes(w))) return true;
  const inUk = UK_RE.test(p.location) || /london|manchester|edinburgh|bristol|cambridge|oxford/i.test(p.location);
  return inUk && (wanted.length === 0 || p.remote);
}

export async function searchAts(prefs: Preferences): Promise<SearchResultJob[]> {
  const titles = parseJobTitles(prefs.job_title);
  const places = parseLocations(prefs.location);

  const list = boards();
  const settled = await Promise.allSettled(list.map((b) => FETCHERS[b.kind](b.slug)));
  const out: SearchResultJob[] = [];
  let failed = 0;
  settled.forEach((r, i) => {
    if (r.status === "rejected") {
      failed++;
      const b = list[i];
      console.warn(`[ATS] ${b.kind}:${b.slug} failed:`, r.reason instanceof Error ? r.reason.message : r.reason);
      return;
    }
    const name = list[i].name;
    for (const p of r.value) {
      if (titles.length > 0 && !titleMatches(p.title, titles)) continue;
      if (!locationMatches(p, places)) continue;
      if (prefs.remote_only && !p.remote) continue;
      if (!withinMaxAge(p.postedAt)) continue;
      if (prefs.permanent_only && /contract|intern|temporary|part[\s-]?time/i.test(`${p.employmentType} ${p.title}`)) continue;
      out.push({
        key: p.key,
        title: p.title,
        company: name ?? p.company,
        location: p.location || null,
        snippet: p.description ? p.description.replace(/\s+/g, " ").slice(0, 240) : null,
        description: p.description,
        salary: null,
        postedDate: relativeDate(p.postedAt),
        url: p.url,
        remote: p.remote,
      });
    }
  });
  if (failed === settled.length && failed > 0) throw new Error("every ATS board failed");
  return out;
}
