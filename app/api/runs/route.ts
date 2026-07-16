import { NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { isRunning } from "@/lib/agent";
import type { Run } from "@/lib/types";

export const dynamic = "force-dynamic";

// GET /api/runs — agent run history, newest first
export async function GET() {
  const sql = getSql();
  const runs = await sql<Run[]>`SELECT * FROM runs ORDER BY id DESC LIMIT 50`;
  return NextResponse.json({ runs, running: isRunning() });
}
