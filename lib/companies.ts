/**
 * Target-company allowlist for the "specific companies only" search mode.
 * Preferences.target_companies is a free-text, comma/newline separated list
 * that may mix literal company names ("Goldman Sachs") with group shortcuts
 * ("top consulting"). Sources still search by job title as before; this list
 * is applied as a post-search filter so only listings from matching
 * employers survive.
 */

/** Named groups a user can type instead of listing every firm by hand. */
export const COMPANY_GROUPS: Record<string, string[]> = {
  "bulge bracket": [
    "Goldman Sachs",
    "Morgan Stanley",
    "JPMorgan",
    "Bank of America",
    "Citigroup",
    "Barclays",
    "HSBC",
    "Deutsche Bank",
    "UBS",
    "Credit Suisse",
    "BNP Paribas",
    "Wells Fargo",
    "Nomura",
    "RBC Capital Markets",
    "Standard Chartered",
    "Societe Generale",
  ],
  "asset managers": [
    "Invesco",
    "BlackRock",
    "Fidelity International",
    "Schroders",
    "abrdn",
    "State Street",
    "Vanguard",
    "Man Group",
    "M&G Investments",
    "Legal & General Investment Management",
    "Aviva Investors",
    "Baillie Gifford",
    "Janus Henderson",
    "PIMCO",
  ],
  "hedge funds": [
    "Citadel",
    "Point72",
    "Two Sigma",
    "Millennium Management",
    "Man Group",
    "Marshall Wace",
    "Brevan Howard",
    "DE Shaw",
    "AQR Capital Management",
  ],
  "big 4": ["EY", "PwC", "Deloitte", "KPMG"],
  "mbb consulting": ["McKinsey & Company", "Boston Consulting Group", "Bain & Company"],
  "top consulting": [
    "McKinsey & Company",
    "Boston Consulting Group",
    "Bain & Company",
    "EY",
    "PwC",
    "Deloitte",
    "KPMG",
    "Accenture",
    "Oliver Wyman",
    "Roland Berger",
    "Strategy&",
    "A.T. Kearney",
    "L.E.K. Consulting",
  ],
  "top banking": [
    "Goldman Sachs",
    "Morgan Stanley",
    "JPMorgan",
    "Bank of America",
    "Citigroup",
    "Barclays",
    "HSBC",
    "Deutsche Bank",
    "UBS",
    "Credit Suisse",
    "BNP Paribas",
    "Wells Fargo",
    "Nomura",
    "Jefferies",
    "Lazard",
    "Evercore",
    "Rothschild & Co",
    "RBC Capital Markets",
    "Standard Chartered",
  ],
  "top finance": [
    "Invesco",
    "BlackRock",
    "Fidelity International",
    "Schroders",
    "abrdn",
    "State Street",
    "Vanguard",
    "Man Group",
    "Citadel",
    "Point72",
    "Two Sigma",
    "Millennium Management",
  ],
};

/** Sensible starting point for a "banking, asset management & consulting" search. */
export const DEFAULT_TARGET_COMPANIES = [
  "Goldman Sachs",
  "Morgan Stanley",
  "Invesco",
  "EY",
  "PwC",
  "top consulting",
  "top banking",
  "top finance",
].join(", ");

/**
 * Abbreviations with no substring relationship to the full name (so the
 * normalized substring check below can't catch them on its own). Matched
 * against the exact raw string before any cleanup, then expanded to the
 * full name and run through the same pipeline as everything else.
 */
const ALIASES: Record<string, string> = {
  ey: "ernst and young",
  pwc: "pricewaterhousecoopers",
  jpm: "jpmorgan",
  "jp morgan": "jpmorgan",
  bofa: "bank of america",
  boa: "bank of america",
  bcg: "boston consulting group",
  lgim: "legal and general investment management",
};

/** Legal-suffix / punctuation noise stripped before comparing company names. */
const NOISE_RE =
  /\b(plc|ltd|llc|llp|inc|incorporated|corp|corporation|co|company|group|holdings|international|the)\b/gi;

const ALIAS_RES: Array<[RegExp, string]> = Object.entries(ALIASES).map(([k, v]) => [
  new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"),
  v,
]);

function normalize(name: string): string {
  let s = name.toLowerCase().replace(/&/g, " and ").replace(/[.,'’]/g, "");
  for (const [re, expansion] of ALIAS_RES) s = s.replace(re, expansion);
  return s
    .replace(NOISE_RE, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parse the target_companies preference into a flat list of literal company
 * names, expanding any recognized group shortcuts (case-insensitive).
 */
export function expandTargetCompanies(raw: string): string[] {
  const tokens = raw
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);

  const out: string[] = [];
  for (const token of tokens) {
    const group = COMPANY_GROUPS[token.toLowerCase()];
    if (group) {
      out.push(...group);
    } else {
      out.push(token);
    }
  }
  return Array.from(new Set(out));
}

/**
 * Does a listing's employer name match one of the target companies?
 * Matching is normalized (case/punctuation/legal-suffix insensitive) and
 * bidirectionally substring-based, so "Goldman Sachs International" matches
 * target "Goldman Sachs", and target "EY" matches employer "Ernst & Young".
 */
export function companyMatches(company: string, targets: string[]): boolean {
  const normalizedCompany = normalize(company);
  if (!normalizedCompany) return false;
  return targets.some((t) => {
    const normalizedTarget = normalize(t);
    if (!normalizedTarget) return false;
    return (
      normalizedCompany === normalizedTarget ||
      normalizedCompany.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedCompany)
    );
  });
}
