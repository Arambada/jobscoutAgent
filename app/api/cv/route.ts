import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";
import { extractPdfText, parseCvWithClaude, saveCvFile } from "@/lib/cv";
import type { Cv } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/cv — return the active CV
export async function GET() {
  const sql = getSql();
  const [cv] = await sql<Cv[]>`
    SELECT * FROM cv WHERE is_active = true ORDER BY created_at DESC LIMIT 1
  `;
  return NextResponse.json({ cv: cv ?? null });
}

// POST /api/cv — upload a new PDF CV
export async function POST(request: NextRequest) {
  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file field found" }, { status: 400 });
  }
  if (!file.name.endsWith(".pdf") && file.type !== "application/pdf") {
    return NextResponse.json({ error: "Only PDF files are accepted" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let rawText: string;
  try {
    rawText = await extractPdfText(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `PDF parse failed: ${message}` }, { status: 422 });
  }

  if (!rawText.trim()) {
    return NextResponse.json(
      { error: "Could not extract text — is this a scanned/image PDF?" },
      { status: 422 },
    );
  }

  // Save file to disk
  await saveCvFile(buffer, file.name).catch(() => null); // non-fatal

  // Parse with Claude
  const parsedData = await parseCvWithClaude(rawText).catch(() => null);

  const sql = getSql();

  // Deactivate any previous CVs
  await sql`UPDATE cv SET is_active = false`;

  // Insert new CV record
  const [cv] = await sql<Cv[]>`
    INSERT INTO cv (file_name, raw_text, parsed_data, is_active)
    VALUES (${file.name}, ${rawText}, ${sql.json((parsedData ?? {}) as unknown as Parameters<typeof sql.json>[0])}, true)
    RETURNING *
  `;

  // Seed empty profile fields from the parsed CV so scoring/generation have
  // something to work with without manual setup. Never overwrites user edits.
  if (parsedData?.skills?.length) {
    await sql`
      UPDATE profile SET skills = ${parsedData.skills.join(", ")}, updated_at = NOW()
      WHERE id = 1 AND skills = ''
    `;
  }

  return NextResponse.json({ cv, parsed: parsedData });
}

// DELETE /api/cv — remove the active CV
export async function DELETE() {
  const sql = getSql();
  await sql`UPDATE cv SET is_active = false`;
  return NextResponse.json({ ok: true });
}
