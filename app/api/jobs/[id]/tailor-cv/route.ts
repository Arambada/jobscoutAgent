import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { tailorCv } from "@/lib/claude";
import { getActiveCv } from "@/lib/cv";
import type { Job, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/jobs/[id]/tailor-cv — tailor the active CV to this job (and store it)
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const sql = getSql();
  const id = parseInt(params.id, 10);
  const [job] = await sql<Job[]>`SELECT * FROM jobs WHERE id = ${id}`;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const cv = await getActiveCv();
  if (!cv?.raw_text?.trim()) {
    return NextResponse.json(
      { error: "No CV uploaded — add your PDF CV in Settings first." },
      { status: 400 },
    );
  }

  const [profile] = await sql<Profile[]>`SELECT * FROM profile WHERE id = 1`;

  try {
    const tailored = await tailorCv(cv.raw_text, job, profile);
    await sql`UPDATE jobs SET tailored_cv = ${tailored}, updated_at = NOW() WHERE id = ${id}`;
    return NextResponse.json({ tailored_cv: tailored });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
