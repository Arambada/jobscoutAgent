import fs from "fs/promises";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import type { Cv, ParsedCv } from "./types";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** Extract raw text from a PDF buffer using pdf-parse. */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  // pdf-parse v2 exposes a PDFParse class (the v1 callable API is gone)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require("pdf-parse") as {
    PDFParse: new (opts: { data: Buffer }) => {
      getText(params?: { parseHyperlinks?: boolean }): Promise<{ text: string }>;
      getInfo(params?: { parsePageInfo?: boolean }): Promise<{
        pages?: Array<{ links?: Array<{ url?: string; text?: string }> }>;
      }>;
      destroy(): Promise<void>;
    };
  };
  const parser = new PDFParse({ data: buffer });
  try {
    // Sequential on purpose — concurrent calls on one parser crash pdf.js.
    // getText's own parseHyperlinks misses annotations on some PDFs, but the
    // page metadata reliably carries them with their anchor text.
    const textResult = await parser.getText();
    const info = await parser.getInfo({ parsePageInfo: true }).catch(() => ({ pages: [] }));
    let text = textResult.text.trim();

    // Splice each hyperlink into the text as markdown at its anchor position,
    // so "[Portfolio](https://…)" survives into tailoring and the .docx.
    const links = (info.pages ?? []).flatMap((p) => p.links ?? []);
    let searchFrom = 0;
    for (const { url, text: anchor } of links) {
      // strip icon-font junk the PDF extractor leaves in front of anchors
      const label = anchor?.replace(/^[\s#§-]+/, "").trim();
      if (!url || !label || text.includes(`](${url})`)) continue;
      const idx = text.indexOf(label, searchFrom);
      if (idx === -1) continue;
      const markdown = `[${label}](${url})`;
      text = text.slice(0, idx) + markdown + text.slice(idx + label.length);
      searchFrom = idx + markdown.length;
    }
    return text;
  } finally {
    await parser.destroy();
  }
}

/** Use Claude to convert raw CV text into structured JSON. */
export async function parseCvWithClaude(rawText: string): Promise<ParsedCv> {
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `Extract structured data from this CV/resume and return valid JSON only.
No preamble, no markdown, just the JSON object.

Schema:
{
  "name": string,
  "email": string,
  "phone": string,
  "location": string,
  "summary": string,
  "skills": string[],
  "experience": [{ "title": string, "company": string, "dates": string, "bullets": string[] }],
  "education": [{ "degree": string, "institution": string, "dates": string }],
  "certifications": string[]
}

CV text:
${rawText.slice(0, 15000)}`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  try {
    // Strip any accidental markdown fences
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned) as ParsedCv;
  } catch {
    // Return best-effort fallback with the skills at least
    const skills = rawText.match(/\b(JavaScript|TypeScript|Python|React|Node|SQL|AWS|Docker|Go|Rust|Java|C\+\+|Ruby|Kotlin|Swift)\b/gi) ?? [];
    return { skills: Array.from(new Set(skills)), experience: [], education: [] };
  }
}

/** Save a CV PDF file to disk and return the file path. */
export async function saveCvFile(buffer: Buffer, originalName: string): Promise<string> {
  const uploadDir = path.join(process.cwd(), "uploads");
  await fs.mkdir(uploadDir, { recursive: true });
  const safeName = `${Date.now()}-${originalName.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const filePath = path.join(uploadDir, safeName);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

/** Get the currently active CV record. */
export async function getActiveCv(): Promise<Cv | null> {
  const { getSql } = await import("./db");
  const sql = getSql();
  const [cv] = await sql<Cv[]>`SELECT * FROM cv WHERE is_active = true ORDER BY created_at DESC LIMIT 1`;
  if (!cv) return null;
  // Older rows stored parsed_data double-encoded (JSON string inside jsonb)
  if (typeof cv.parsed_data === "string") {
    try {
      cv.parsed_data = JSON.parse(cv.parsed_data);
    } catch {
      cv.parsed_data = null;
    }
  }
  return cv;
}
