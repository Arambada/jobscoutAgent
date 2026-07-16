import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import {
  buildAnswersPrompt,
  buildCoverLetterPrompt,
  buildStatementPrompt,
  buildTailorCvPrompt,
} from "@/lib/claude";
import { getActiveCv } from "@/lib/cv";
import { resolveApplyUrl } from "@/lib/apply";
import { fetchJobDescription } from "@/lib/description";
import type { Job, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/jobs/[id]/prompt — assemble a ready-to-paste prompt (CV + full
// advert + the same instructions the API uses) for the Claude app, so the
// user's subscription does the writing instead of API credits. No AI call.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const type = body?.type as string;
  if (!["cover", "cv", "statement", "answers"].includes(type)) {
    return NextResponse.json(
      { error: "type must be cover, cv, statement or answers" },
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

  // Make sure the full advert is included (network fetch only, no AI cost)
  if (job.url && (job.description?.length ?? 0) < 600) {
    const full = await fetchJobDescription(await resolveApplyUrl(job.url)).catch(() => null);
    if (full && full.length > (job.description?.length ?? 0)) {
      job.description = full;
      await sql`UPDATE jobs SET description = ${full}, updated_at = NOW() WHERE id = ${id}`;
    }
  }

  let prompt: string;
  if (type === "cover") {
    prompt = buildCoverLetterPrompt(job, profile, cv.raw_text);
  } else if (type === "cv") {
    prompt = buildTailorCvPrompt(cv.raw_text, job);
  } else if (type === "statement") {
    prompt = buildStatementPrompt(job, profile, cv.raw_text);
  } else {
    const questions = (typeof body?.questions === "string" ? body.questions : "")
      .split("\n")
      .map((l: string) => l.replace(/^\s*(?:\d+[.)]\s*|[-•*]\s*)/, "").trim())
      .filter((l: string) => l.length > 2)
      .slice(0, 15);
    if (questions.length === 0) {
      return NextResponse.json(
        { error: "Paste the questions first, then copy the prompt" },
        { status: 400 },
      );
    }
    prompt = buildAnswersPrompt(questions, cv.raw_text, job, profile, "text");
  }

  return NextResponse.json({ prompt });
}
