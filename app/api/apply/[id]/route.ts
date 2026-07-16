import { NextRequest, NextResponse } from "next/server";
import { applyToJob } from "@/lib/apply";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // browser automation can take time

// POST /api/apply/[id] — trigger the full apply pipeline for a job
export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const jobId = parseInt(params.id, 10);
  if (Number.isNaN(jobId)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  try {
    const application = await applyToJob(jobId);
    const status = application.status === "failed" ? 500 : 200;
    return NextResponse.json({ application }, { status });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
