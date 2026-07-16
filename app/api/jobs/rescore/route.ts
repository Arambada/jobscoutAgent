import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { analyzeJobFit } from "@/lib/claude";
import { getActiveCv } from "@/lib/cv";
import type { Job, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// POST /api/jobs/rescore — re-score every job against the current profile
// and whatever description is stored now (useful after descriptions improve).
export async function POST() {
  const sql = getSql();

  const [profile] = await sql<Profile[]>`SELECT * FROM profile WHERE id = 1`;
  const cv = await getActiveCv().catch(() => null);
  const jobs = await sql<
    Pick<Job, "id" | "title" | "company" | "description" | "snippet" | "score">[]
  >`SELECT id, title, company, description, snippet, score FROM jobs ORDER BY id`;

  let rescored = 0;
  const failures: number[] = [];

  // Analyse in parallel batches — sequential would blow past sensible timeouts
  const BATCH = 8;
  for (let i = 0; i < jobs.length; i += BATCH) {
    await Promise.all(
      jobs.slice(i, i + BATCH).map(async (job) => {
        try {
          const fit = await analyzeJobFit(job, profile, cv?.raw_text);
          await sql`
            UPDATE jobs SET score = ${fit.score}, fit_analysis = ${JSON.stringify(fit)}, updated_at = NOW()
            WHERE id = ${job.id}`;
          rescored++;
        } catch (err) {
          console.error(`[Rescore] Job #${job.id} failed:`, err);
          failures.push(job.id);
        }
      }),
    );
  }

  return NextResponse.json({ rescored, total: jobs.length, failed: failures });
}
