/**
 * Fetch the full job description from a (resolved) job posting page.
 * Adzuna's search API truncates descriptions to ~500 chars, so the real
 * posting page is the only source of the complete text.
 *
 * Strategy: most ATS pages (Greenhouse, Lever, Workday, careers sites)
 * embed a JSON-LD JobPosting block with the full description — that's
 * clean and preferred. Otherwise fall back to whole-page text extraction.
 */

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
};

const MAX_DESCRIPTION_CHARS = 20_000;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;|&apos;|&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/gi, "&");
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|iframe|nav|header|footer|form)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<\/(p|div|li|ul|ol|h[1-6]|tr|section|article|table)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

type JsonLdNode = { [key: string]: unknown };

function isJobPosting(node: JsonLdNode): boolean {
  const type = node["@type"];
  return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
}

function fromJsonLd(html: string): string | null {
  const blocks =
    html.match(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) ?? [];
  for (const block of blocks) {
    const body = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    try {
      const data = JSON.parse(body.trim()) as JsonLdNode | JsonLdNode[];
      const nodes: JsonLdNode[] = Array.isArray(data)
        ? data
        : Array.isArray(data["@graph"])
          ? (data["@graph"] as JsonLdNode[])
          : [data];
      for (const node of nodes) {
        if (node && isJobPosting(node) && typeof node.description === "string") {
          const text = htmlToText(node.description);
          if (text.length > 200) return text;
        }
      }
    } catch {
      // malformed JSON-LD — try the next block
    }
  }
  return null;
}

/** Best effort — returns null when the page can't be fetched or has no usable text. */
export async function fetchJobDescription(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
      headers: HEADERS,
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.includes("text/html")) return null;

    const html = (await res.text()).slice(0, 800_000);

    const structured = fromJsonLd(html);
    if (structured) return structured.slice(0, MAX_DESCRIPTION_CHARS);

    // Whole-page fallback picks up some nav/footer noise, but the full posting
    // beats a 500-char stub. Only use it when there's substantial text.
    const text = htmlToText(html);
    return text.length > 600 ? text.slice(0, MAX_DESCRIPTION_CHARS) : null;
  } catch {
    return null;
  }
}
