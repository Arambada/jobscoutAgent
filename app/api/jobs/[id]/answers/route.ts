import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { answerScreeningQuestions } from "@/lib/claude";
import { getActiveCv } from "@/lib/cv";
import { detectPlatform, resolveApplyUrl } from "@/lib/apply";
import { fetchJobDescription } from "@/lib/description";
import type { Application, ApplicationAnswer, Job, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Split pasted form text into individual questions. */
function parseQuestions(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.replace(/^\s*(?:\d+[.)]\s*|[-•*]\s*)/, "").trim())
    .filter((line) => line.length > 2)
    .slice(0, 15);
}

// POST /api/jobs/[id]/answers — answer the pasted application-form questions
// using the CV, profile, and this job's full description as context.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const questions = typeof body?.questions === "string" ? parseQuestions(body.questions) : [];
  if (questions.length === 0) {
    return NextResponse.json(
      { error: "Paste at least one question (one per line)" },
      { status: 400 },
    );
  }

  const sql = getSql();
  const [job] = await sql<Job[]>`SELECT * FROM jobs WHERE id = ${id}`;
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const cv = await getActiveCv();
  if (!cv) {
    return NextResponse.json(
      { error: "No CV uploaded. Go to Settings → Upload CV first." },
      { status: 400 },
    );
  }
  const [profile] = await sql<Profile[]>`SELECT * FROM profile WHERE id = 1`;

  try {
    // Make sure the full advert is in context before answering against it
    if (job.url && (job.description?.length ?? 0) < 600) {
      const full = await fetchJobDescription(await resolveApplyUrl(job.url));
      if (full && full.length > (job.description?.length ?? 0)) {
        job.description = full;
        await sql`UPDATE jobs SET description = ${full}, updated_at = NOW() WHERE id = ${id}`;
      }
    }

    const answers = await answerScreeningQuestions(questions, cv.raw_text, job, profile);

    // Persist onto the latest application for this job (create one if the
    // user hasn't hit "Prepare application" yet) so the Applications page
    // and Apply panel keep a record.
    const [existing] = await sql<Application[]>`
      SELECT * FROM applications WHERE job_id = ${id} ORDER BY id DESC LIMIT 1
    `;
    if (existing) {
      const merged: ApplicationAnswer[] = [
        ...(existing.answers ?? []).filter(
          (a) => !answers.some((n) => n.question === a.question),
        ),
        ...answers,
      ];
      await sql`
        UPDATE applications SET answers = ${sql.json(merged as never)}, updated_at = NOW()
        WHERE id = ${existing.id}
      `;
    } else {
      await sql`
        INSERT INTO applications (job_id, cv_id, platform, apply_url, status, answers)
        VALUES (${id}, ${cv.id}, ${detectPlatform(job.url)}, ${job.url}, 'prepared', ${sql.json(answers as never)})
      `;
    }

    return NextResponse.json({ answers });
  } catch (err) {
    console.error(`[Answers] Job #${id} failed:`, err);
    return NextResponse.json(
      { error: "Answer generation failed — check your Anthropic credits and try again" },
      { status: 500 },
    );
  }
}
