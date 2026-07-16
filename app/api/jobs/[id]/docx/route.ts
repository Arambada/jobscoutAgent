import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { coverLetterToDocx, cvToDocx, docxBuffer, safeFilename, statementToDocx } from "@/lib/docx";
import type { Job, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/jobs/[id]/docx?type=cv|cover — download the tailored CV or cover
// letter as a Word document, named for the candidate and company.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const jobId = parseInt(params.id, 10);
  if (Number.isNaN(jobId)) {
    return NextResponse.json({ error: "Invalid job ID" }, { status: 400 });
  }

  const type = request.nextUrl.searchParams.get("type");
  if (type !== "cv" && type !== "cover" && type !== "statement") {
    return NextResponse.json(
      { error: "type must be 'cv', 'cover' or 'statement'" },
      { status: 400 },
    );
  }

  const sql = getSql();
  const [job] = await sql<Job[]>`SELECT * FROM jobs WHERE id = ${jobId}`;
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const text =
    type === "cv"
      ? job.tailored_cv
      : type === "cover"
        ? job.cover_letter
        : // the statement carries advisory notes after a marker — never ship those
          job.supporting_statement?.split(/^-{2,}\s*NOTES[^\n]*$/im)[0].trim();
  if (!text?.trim()) {
    return NextResponse.json(
      { error: "Nothing to download yet — generate it first" },
      { status: 404 },
    );
  }

  const [profile] = await sql<Profile[]>`SELECT * FROM profile WHERE id = 1`;
  const doc =
    type === "cv"
      ? cvToDocx(text)
      : type === "cover"
        ? coverLetterToDocx(text)
        : statementToDocx(text);
  const buffer = await docxBuffer(doc);

  const filename = `${safeFilename(
    profile?.full_name || "Candidate",
    type === "cv" ? "CV" : type === "cover" ? "Cover-Letter" : "Supporting-Statement",
    job.company,
  )}.docx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
