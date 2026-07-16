import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET /api/applications — list all applications with job details, newest first
export async function GET() {
  const sql = getSql();

  const applications = await sql`
    SELECT
      a.*,
      j.title      AS job_title,
      j.company    AS job_company,
      j.location   AS job_location,
      j.score      AS job_score,
      j.url        AS job_url
    FROM applications a
    JOIN jobs j ON j.id = a.job_id
    ORDER BY a.created_at DESC
    LIMIT 200
  `;

  const [stats] = await sql`
    SELECT
      COUNT(*)::int                                           AS total,
      COUNT(*) FILTER (WHERE status = 'submitted')::int      AS submitted,
      COUNT(*) FILTER (WHERE status = 'prepared')::int       AS prepared,
      COUNT(*) FILTER (WHERE status = 'failed')::int         AS failed,
      COUNT(*) FILTER (WHERE status = 'interview')::int      AS interview,
      COUNT(*) FILTER (WHERE status = 'offer')::int          AS offer
    FROM applications
  `;

  return NextResponse.json({ applications, stats });
}
