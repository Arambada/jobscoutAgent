import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { JOB_STATUSES, type Job } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/jobs?status=&minScore=&remote=&unseen=
export async function GET(request: NextRequest) {
  const sql = getSql();
  const params = request.nextUrl.searchParams;

  const clauses: string[] = [];
  const args: (string | number)[] = [];

  const status = params.get("status");
  if (status && JOB_STATUSES.includes(status as (typeof JOB_STATUSES)[number])) {
    args.push(status);
    clauses.push(`status = $${args.length}`);
  } else {
    // Dismissed jobs stay out of every view except their own tab
    clauses.push(`status <> 'skipped'`);
  }

  const minScore = params.get("minScore");
  if (minScore && !Number.isNaN(parseInt(minScore, 10))) {
    args.push(parseInt(minScore, 10));
    clauses.push(`score >= $${args.length}`);
  }

  if (params.get("unseen") === "1") {
    clauses.push("seen = false");
  }

  if (params.get("remote") === "1") {
    clauses.push(
      "(location ILIKE '%remote%' OR title ILIKE '%remote%' OR snippet ILIKE '%remote%')",
    );
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const jobs = await sql.unsafe<Job[]>(
    `SELECT * FROM jobs ${where} ORDER BY discovered_at DESC, score DESC`,
    args,
  );

  const [stats] = await sql`
    SELECT
      COUNT(*)::int                                                AS total,
      COUNT(*) FILTER (WHERE discovered_at::date = CURRENT_DATE)::int AS new_today,
      COUNT(*) FILTER (WHERE seen = false)::int                    AS unseen,
      COUNT(*) FILTER (WHERE status = 'applied')::int              AS applied,
      COUNT(*) FILTER (WHERE status = 'interviewing')::int         AS interviewing
    FROM jobs
  `;

  return NextResponse.json({ jobs, stats });
}
