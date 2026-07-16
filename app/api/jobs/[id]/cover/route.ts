import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { generateCoverLetter } from "@/lib/claude";
import { getActiveCv } from "@/lib/cv";
import type { Job, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/jobs/[id]/cover — generate (and store) a cover letter
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const sql = getSql();
  const id = parseInt(params.id, 10);
  const [job] = await sql<Job[]>`SELECT * FROM jobs WHERE id = ${id}`;
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const [profile] = await sql<Profile[]>`SELECT * FROM profile WHERE id = 1`;
  const cv = await getActiveCv();

  try {
    const letter = await generateCoverLetter(job, profile, cv?.raw_text);
    await sql`UPDATE jobs SET cover_letter = ${letter}, updated_at = NOW() WHERE id = ${id}`;
    return NextResponse.json({ cover_letter: letter });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
