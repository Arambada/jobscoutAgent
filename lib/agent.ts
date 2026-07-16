import { getSql } from "./db";
import { searchAllSources } from "./search";
import { analyzeJobFit } from "./claude";
import { getActiveCv } from "./cv";
import { sendDigest } from "./email";
import type { Job, Preferences, Profile, Run } from "./types";

// Prevent overlapping runs
const globalForAgent = globalThis as unknown as { __jobScoutRunning?: boolean };

export function isRunning(): boolean {
  return !!globalForAgent.__jobScoutRunning;
}

/**
 * Core agent loop: search → dedupe → score → store → email.
 * Returns the completed run record.
 */
export async function runSearch(): Promise<Run> {
  const sql = getSql();

  if (globalForAgent.__jobScoutRunning) {
    throw new Error("A search is already running");
  }
  globalForAgent.__jobScoutRunning = true;

  const [prefs] = await sql<Preferences[]>`SELECT * FROM preferences WHERE id = 1`;
  const [profile] = await sql<Profile[]>`SELECT * FROM profile WHERE id = 1`;

  const [run] = await sql<Run[]>`
    INSERT INTO runs (started_at, status) VALUES (NOW(), 'running') RETURNING *
  `;
  const runId = run.id;

  try {
    // Auto-purge stale listings (opt-in via JOB_PURGE_DAYS). Only untouched
    // 'new' jobs are removed; saved/applied/interviewing jobs are never touched.
    const purgeDays = parseInt(process.env.JOB_PURGE_DAYS ?? "", 10);
    if (purgeDays > 0) {
      const purged = await sql`
        DELETE FROM jobs
        WHERE status IN ('new', 'skipped')
          AND CASE WHEN posted_date ~ '^[0-9]+ day'
                   THEN (substring(posted_date from '^[0-9]+'))::int
                        + EXTRACT(EPOCH FROM (NOW() - discovered_at)) / 86400
                   ELSE EXTRACT(EPOCH FROM (NOW() - discovered_at)) / 86400
              END > ${purgeDays}
      `;
      if (purged.count > 0) {
        console.log(`[Agent] Purged ${purged.count} stale jobs (posted > ${purgeDays} days ago)`);
      }
    }

    console.log(
      `[Agent] Run #${runId}: searching "${prefs.job_title}"` +
        `${prefs.location ? ` in ${prefs.location}` : ""}`,
    );
    const { results, perSource, errors } = await searchAllSources(prefs);
    console.log(
      `[Agent] Run #${runId}: found ${results.length} listings ` +
        `(${Object.entries(perSource).map(([s, n]) => `${s}: ${n}`).join(", ")})`,
    );
    if (Object.keys(errors).length > 0 && results.length === 0) {
      throw new Error(
        `All sources failed — ${Object.entries(errors).map(([s, e]) => `${s}: ${e}`).join("; ")}`,
      );
    }

    const newJobIds: number[] = [];
    const cv = await getActiveCv().catch(() => null);

    for (const result of results) {
      // Dedupe by source key, and by title+company so the same vacancy
      // arriving via a different board doesn't duplicate.
      const existing = await sql`
        SELECT id FROM jobs
        WHERE indeed_key = ${result.key}
           OR (lower(title) = lower(${result.title}) AND lower(company) = lower(${result.company}))
        LIMIT 1`;
      if (existing.length > 0) continue;

      // Adzuna descriptions are ~500-char stubs — fetch the full posting text
      // from the real page so the job view and scoring see the whole ad.
      if (result.url) {
        try {
          const { resolveApplyUrl } = await import("./apply");
          const { fetchJobDescription } = await import("./description");
          const resolved = await resolveApplyUrl(result.url);
          const full = await fetchJobDescription(resolved);
          if (full && full.length > (result.description?.length ?? 0)) {
            result.description = full;
          }
        } catch (err) {
          console.error(`[Agent] Description fetch failed for ${result.key}:`, err);
        }
      }

      let score = 0;
      let fitAnalysis = "";
      try {
        const fit = await analyzeJobFit(
          {
            title: result.title,
            company: result.company,
            description: result.description,
            snippet: result.snippet,
          },
          profile,
          cv?.raw_text,
        );
        score = fit.score;
        fitAnalysis = JSON.stringify(fit);
      } catch (err) {
        console.error(`[Agent] Scoring failed for ${result.key}:`, err);
      }

      const [inserted] = await sql<{ id: number }[]>`
        INSERT INTO jobs
          (indeed_key, title, company, location, salary, snippet, description, url, posted_date, score, fit_analysis)
        VALUES
          (${result.key}, ${result.title}, ${result.company}, ${result.location},
           ${result.salary}, ${result.snippet}, ${result.description}, ${result.url},
           ${result.postedDate}, ${score}, ${fitAnalysis})
        RETURNING id
      `;
      newJobIds.push(inserted.id);
    }

    // Email digest for new high-score jobs
    let emailed = 0;
    if (newJobIds.length > 0) {
      const newJobs = await sql<Job[]>`SELECT * FROM jobs WHERE id = ANY(${newJobIds})`;
      const highScorers = newJobs.filter((j) => j.score >= prefs.min_score_to_email);
      if (highScorers.length > 0) {
        const [{ c: total }] = await sql<{ c: string }[]>`SELECT COUNT(*) AS c FROM jobs`;
        const sent = await sendDigest(highScorers, prefs, profile, parseInt(total, 10));
        if (sent) emailed = highScorers.length;
      }
    }

    await sql`
      UPDATE runs
      SET completed_at = NOW(),
          jobs_found   = ${results.length},
          new_jobs     = ${newJobIds.length},
          emailed      = ${emailed},
          status       = 'success'
      WHERE id = ${runId}
    `;

    console.log(`[Agent] Run #${runId}: ${newJobIds.length} new jobs, ${emailed} emailed`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Agent] Run #${runId} failed:`, message);
    await sql`
      UPDATE runs
      SET completed_at = NOW(), error = ${message}, status = 'error'
      WHERE id = ${runId}
    `;
  } finally {
    globalForAgent.__jobScoutRunning = false;
  }

  const [completed] = await sql<Run[]>`SELECT * FROM runs WHERE id = ${runId}`;
  return completed;
}
