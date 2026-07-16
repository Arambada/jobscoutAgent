/**
 * Apply orchestrator — ties together CV tailoring, Q&A answering,
 * platform detection, and submission.
 */
import { getSql } from "./db";
import { getActiveCv } from "./cv";
import { tailorCv, generateCoverLetter, answerScreeningQuestions } from "./claude";
import { sendApplicationEmail } from "./email";
import type { Application, ApplicationAnswer, Job, ParsedCv, Platform, Profile } from "./types";

export interface ApplyContext {
  applyUrl: string;
  tailoredCv: string;
  coverLetter: string;
  answers: ApplicationAnswer[];
  cvParsed: ParsedCv | null;
}

export interface ApplyResult {
  success: boolean;
  url?: string;
  error?: string;
}

/** Detect the apply platform from the job URL. */
export function detectPlatform(url: string | null): Platform {
  if (!url) return "manual";
  if (url.includes("linkedin.com")) return "linkedin";
  if (url.includes("indeed.com")) return "indeed";
  if (url.includes("greenhouse.io")) return "greenhouse";
  if (url.includes("lever.co")) return "lever";
  return "manual";
}

// Adzuna's land pages 403 plain server requests, so look like a browser.
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
  "Upgrade-Insecure-Requests": "1",
};

/**
 * Follow tracking redirects (Adzuna hands out adzuna.xx/land/ad/... links)
 * to the real employer/ATS page so detectPlatform can work with it.
 * Adzuna redirects via <meta http-equiv="refresh"> hops through ad-tracking
 * domains rather than HTTP redirects, so both kinds are followed.
 * Best effort — returns the last URL reached on any failure.
 */
export async function resolveApplyUrl(url: string): Promise<string> {
  let current = url;
  try {
    for (let hop = 0; hop < 4; hop++) {
      const res = await fetch(current, {
        redirect: "follow",
        signal: AbortSignal.timeout(12_000),
        headers: BROWSER_HEADERS,
      });
      current = res.url || current;
      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("text/html")) break;
      const body = (await res.text()).slice(0, 100_000);
      const meta = body.match(/content=["']\s*\d+\s*;\s*url=([^"'>]+)["']/i);
      if (!meta) break;
      const nextUrl = new URL(meta[1].trim(), current).toString();
      if (nextUrl === current) break;
      current = nextUrl;
    }
  } catch {
    // best effort — keep whatever we reached
  }
  return current;
}

/** Full apply pipeline for a single job. */
export async function applyToJob(jobId: number): Promise<Application> {
  const sql = getSql();

  const [job] = await sql<Job[]>`SELECT * FROM jobs WHERE id = ${jobId}`;
  if (!job) throw new Error(`Job ${jobId} not found`);

  const [profile] = await sql<Profile[]>`SELECT * FROM profile WHERE id = 1`;
  const cv = await getActiveCv();

  if (!cv) throw new Error("No CV uploaded. Go to Settings → Upload CV first.");

  let applyUrl = job.url ?? "";
  let platform = detectPlatform(applyUrl);

  // Adzuna listings carry redirect URLs, so nearly everything looks "manual"
  // until we follow the redirect to the real employer/ATS page.
  if (platform === "manual" && applyUrl) {
    const resolved = await resolveApplyUrl(applyUrl);
    if (resolved !== applyUrl) {
      console.log(`[Apply] Resolved ${applyUrl} → ${resolved}`);
      applyUrl = resolved;
      platform = detectPlatform(resolved);
    }
  }

  // ── 1. Create a pending application record ──────────────────────────────
  const [app] = await sql<Application[]>`
    INSERT INTO applications (job_id, cv_id, platform, apply_url, status)
    VALUES (${jobId}, ${cv.id}, ${platform}, ${applyUrl}, 'pending')
    RETURNING *
  `;

  try {
    // ── 1.5 Upgrade the stubby Adzuna description with the real posting ─────
    // Adzuna's API truncates descriptions to ~500 chars; the resolved page
    // usually carries the full text (often as a JSON-LD JobPosting block).
    if (applyUrl && (job.description?.length ?? 0) < 600) {
      const { fetchJobDescription } = await import("./description");
      const full = await fetchJobDescription(applyUrl);
      if (full && full.length > (job.description?.length ?? 0)) {
        console.log(`[Apply] Fetched full description (${full.length} chars)`);
        job.description = full;
        await sql`UPDATE jobs SET description = ${full}, updated_at = NOW() WHERE id = ${jobId}`;
      }
    }

    // ── 2. Tailor CV ────────────────────────────────────────────────────────
    console.log(`[Apply] Tailoring CV for job #${jobId}…`);
    const tailored = await tailorCv(cv.raw_text, job, profile);

    // ── 3. Generate cover letter ─────────────────────────────────────────────
    console.log(`[Apply] Generating cover letter…`);
    const coverLetter =
      job.cover_letter || (await generateCoverLetter(job, profile, cv.raw_text));

    // ── 4. Answer screening questions ────────────────────────────────────────
    // We don't know questions in advance for most platforms; the scrapers
    // collect them at runtime. Pre-generate answers for common ones.
    const commonQuestions = [
      "Are you legally authorised to work in this country?",
      "Do you require sponsorship now or in the future?",
      "How many years of experience do you have?",
      "What is your expected salary?",
      "Are you willing to relocate?",
      "When can you start?",
    ];
    console.log(`[Apply] Pre-computing screening answers…`);
    const answers = await answerScreeningQuestions(
      commonQuestions,
      cv.raw_text,
      job,
      profile,
    );

    const ctx: ApplyContext = {
      applyUrl,
      tailoredCv: tailored,
      coverLetter,
      answers,
      cvParsed: cv.parsed_data,
    };

    // ── 5. Submit where a safe public API exists; otherwise prepare-only ────
    // Greenhouse and Lever accept applications via their public APIs.
    // Everything else (LinkedIn, Indeed, company sites) is prepared for
    // one-click manual submission — browser automation there is brittle and
    // against those platforms' terms of service.
    let status: Application["status"] = "prepared";
    let submitError: string | null = null;

    if (platform === "greenhouse" || platform === "lever") {
      const result: ApplyResult =
        platform === "greenhouse"
          ? await (await import("./scrapers/greenhouse")).applyGreenhouse(ctx)
          : await (await import("./scrapers/lever")).applyLever(ctx);
      status = result.success ? "submitted" : "failed";
      submitError = result.error ?? null;
    }

    // ── 6. Persist results ───────────────────────────────────────────────────
    const submitted = status === "submitted";

    const [updated] = await sql<Application[]>`
      UPDATE applications SET
        tailored_cv  = ${tailored},
        cover_letter = ${coverLetter},
        answers      = ${sql.json(answers)},
        apply_url    = ${applyUrl},
        status       = ${status},
        submitted_at = ${submitted ? sql`NOW()` : null},
        error        = ${submitError},
        updated_at   = NOW()
      WHERE id = ${app.id}
      RETURNING *
    `;

    // Store the assets on the job either way; only flip it to 'applied'
    // when something was actually submitted.
    await sql`
      UPDATE jobs SET
        status       = ${submitted ? "applied" : job.status},
        tailored_cv  = ${tailored},
        cover_letter = ${coverLetter},
        updated_at   = NOW()
      WHERE id = ${jobId}
    `;

    // ── 7. Send confirmation email (only for actual submissions — prepared
    // applications are reviewed right there in the UI) ───────────────────────
    if (submitted) {
      await sendApplicationEmail(job, updated, profile).catch((e) =>
        console.error("[Apply] Email failed:", e),
      );
    }

    return updated;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Apply] Job #${jobId} failed:`, message);

    const [failed] = await sql<Application[]>`
      UPDATE applications SET status = 'failed', error = ${message}, updated_at = NOW()
      WHERE id = ${app.id}
      RETURNING *
    `;
    return failed;
  }
}
