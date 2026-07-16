import { NextResponse } from "next/server";
import { runSearch, isRunning } from "@/lib/agent";

export const dynamic = "force-dynamic";

// POST /api/search — trigger a manual agent run
export async function POST() {
  if (isRunning()) {
    return NextResponse.json(
      { error: "A search is already running" },
      { status: 409 },
    );
  }
  const run = await runSearch();
  const status = run.status === "error" ? 500 : 200;
  return NextResponse.json({ run }, { status });
}
