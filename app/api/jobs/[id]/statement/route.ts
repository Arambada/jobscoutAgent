import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { generateSupportingStatement } from "@/lib/claude";
import { getActiveCv } from "@/lib/cv";
import { resolveApplyUrl } from "@/lib/apply";
import { fetchJobDescription } from "@/lib/description";
import type { Job, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

// POST /api/jobs/[id]/statement — generate (and store) a supporting statement
// addressing the advert's person specification.
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
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
    // Make sure the full advert (with the person specification) is available.
    if (job.url && (job.description?.length ?? 0) < 600) {
      const full = await fetchJobDescription(await resolveApplyUrl(job.url));
      if (full && full.length > (job.description?.length ?? 0)) {
        job.description = full;
        await sql`UPDATE jobs SET description = ${full}, updated_at = NOW() WHERE id = ${id}`;
      }
    }

    const statement = await generateSupportingStatement(job, profile, cv.raw_text);
    await sql`UPDATE jobs SET supporting_statement = ${statement}, updated_at = NOW() WHERE id = ${id}`;

    return NextResponse.json({
      supporting_statement: statement,
      words: statement.split(/\s+/).filter(Boolean).length,
    });
  } catch (err) {
    console.error(`[Statement] Job #${id} failed:`, err);
    return NextResponse.json(
      { error: "Statement generation failed — try again" },
      { status: 500 },
    );
  }
}
