import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { restartScheduler } from "@/lib/scheduler";
import type { Preferences } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const sql = getSql();
  const [prefs] = await sql<Preferences[]>`SELECT * FROM preferences WHERE id = 1`;
  return NextResponse.json({ preferences: prefs });
}

export async function PUT(request: NextRequest) {
  const sql = getSql();
  const body = await request.json().catch(() => null);
  // A malformed or partial body must never overwrite settings (or trigger the
  // job-clearing below) — require the fields the settings form always sends.
  if (!body || typeof body.job_title !== "string" || typeof body.location !== "string") {
    return NextResponse.json({ error: "Invalid preferences payload" }, { status: 400 });
  }
  const [current] = await sql<Preferences[]>`SELECT * FROM preferences WHERE id = 1`;

  const intervalHours = Math.min(24, Math.max(1, parseInt(body.search_interval_hours, 10) || 12));
  const minScore = Math.min(100, Math.max(0, parseInt(body.min_score_to_email, 10) || 0));

  await sql`
    UPDATE preferences SET
      job_title             = ${typeof body.job_title === "string" ? body.job_title.trim() : ""},
      location              = ${typeof body.location === "string" ? body.location.trim() : ""},
      keywords              = ${typeof body.keywords === "string" ? body.keywords.trim() : ""},
      remote_only           = ${!!body.remote_only},
      permanent_only        = ${!!body.permanent_only},
      search_interval_hours = ${intervalHours},
      min_score_to_email    = ${minScore},
      updated_at            = NOW()
    WHERE id = 1
  `;

  if (intervalHours !== current.search_interval_hours && !process.env.SEARCH_CRON) {
    await restartScheduler();
  }

  // Keep the dashboard aligned with the settings: when the fields that define
  // which jobs are relevant change (titles or locations), clear untouched
  // 'new' jobs so the next run repopulates against the new preferences.
  // Saved / applied / interviewing jobs are never removed.
  let cleared = 0;
  const newTitle = body.job_title.trim();
  const newLocation = body.location.trim();
  const targetChanged =
    (newTitle !== current.job_title && newTitle !== "") ||
    (newLocation !== current.location && newLocation !== "");
  if (targetChanged) {
    const result = await sql`DELETE FROM jobs WHERE status = 'new'`;
    cleared = result.count;
    if (cleared > 0) {
      console.log(`[Preferences] Search target changed — cleared ${cleared} unmatched 'new' jobs`);
    }
  }

  const [prefs] = await sql<Preferences[]>`SELECT * FROM preferences WHERE id = 1`;
  return NextResponse.json({ preferences: prefs, cleared });
}
