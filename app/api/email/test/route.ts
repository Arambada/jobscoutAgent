import { NextResponse } from "next/server";
import { sendTestEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

// POST /api/email/test — send a test email to EMAIL_TO
export async function POST() {
  const result = await sendTestEmail();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
