import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { JOB_STATUSES, type Job } from "@/lib/types";

export const dynamic = "force-dynamic";

async function findJob(id: number): Promise<Job | undefined> {
  const sql = getSql();
  const [job] = await sql<Job[]>`SELECT * FROM jobs WHERE id = ${id}`;
  return job;
}

// GET /api/jobs/[id] — also marks the job as seen
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const sql = getSql();
  const id = parseInt(params.id, 10);
  const job = await findJob(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  if (!job.seen) {
    await sql`UPDATE jobs SET seen = true WHERE id = ${id}`;
    job.seen = true;
  }
  return NextResponse.json({ job });
}

// PATCH /api/jobs/[id] — update status, note, or seen flag
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const sql = getSql();
  const id = parseInt(params.id, 10);
  const job = await findJob(id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));

  if (typeof body.status === "string" && !JOB_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `Invalid status: ${body.status}` }, { status: 400 });
  }

  const updates: Record<string, string | boolean> = {};
  if (typeof body.status === "string") updates.status = body.status;
  if (typeof body.note === "string") updates.note = body.note;
  if (body.seen === true || body.seen === false) updates.seen = body.seen;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const keys = Object.keys(updates);
  const vals = Object.values(updates);
  const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  await sql.unsafe(
    `UPDATE jobs SET ${setClauses}, updated_at = NOW() WHERE id = $${vals.length + 1}`,
    [...vals, id],
  );

  return NextResponse.json({ job: await findJob(id) });
}
