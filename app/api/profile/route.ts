import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const sql = getSql();
  const [profile] = await sql<Profile[]>`SELECT * FROM profile WHERE id = 1`;
  return NextResponse.json({ profile });
}

export async function PUT(request: NextRequest) {
  const sql = getSql();
  const body = await request.json().catch(() => ({}));

  await sql`
    UPDATE profile SET
      full_name        = ${typeof body.full_name === "string" ? body.full_name.trim() : ""},
      target_role      = ${typeof body.target_role === "string" ? body.target_role.trim() : ""},
      skills           = ${typeof body.skills === "string" ? body.skills.trim() : ""},
      experience_years = ${typeof body.experience_years === "string" ? body.experience_years.trim() : "2-5"},
      updated_at       = NOW()
    WHERE id = 1
  `;

  const [profile] = await sql<Profile[]>`SELECT * FROM profile WHERE id = 1`;
  return NextResponse.json({ profile });
}
