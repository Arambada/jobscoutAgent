import Anthropic from "@anthropic-ai/sdk";
import type { Job, Profile } from "./types";

const MODEL = "claude-sonnet-4-6";
const HAIKU = "claude-haiku-4-5-20251001";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Shared style rule for everything a recruiter will read. Em-dash-heavy prose
// is a well-known AI tell, so ban it outright in favour of ordinary punctuation.
const HUMAN_STYLE = `WRITING STYLE (important):
- Write like a human, not like an AI. Real people almost never type em dashes (—), so do NOT use them in prose. Where you would reach for an em dash, restructure the sentence or use a comma, a full stop, parentheses, a colon, or a connecting word such as "and", "so", "which" or "because".
- En dashes in ranges are fine and correct (e.g. "May 2024 – Present", "£45,000–£55,000"). Only dashes in sentences are banned.
- Avoid other AI tells: no "moreover"/"furthermore"/"delve", no rule-of-three adjective lists, no sentence after sentence of the same length. Vary rhythm the way a person writing quickly but carefully would.`;

export interface FitAnalysis {
  score: number;
  strong_matches: string[];
  partial_matches: string[];
  gaps: string[];
  selling_points: string[];
  keywords: string[];
}

/**
 * Gap analysis between the candidate and the role ("scout before the game").
 * The 0-100 score shown in the UI is derived from this analysis, and the full
 * breakdown is stored so the job page can show why a job scored what it did.
 */
export async function analyzeJobFit(
  job: Pick<Job, "title" | "company"> & {
    description?: string | null;
    snippet?: string | null;
  },
  profile: Profile,
  cvRawText?: string | null,
): Promise<FitAnalysis> {
  const background = cvRawText?.trim()
    ? `CANDIDATE CV:\n${cvRawText.trim().slice(0, 15000)}`
    : `CANDIDATE SUMMARY: ${profile.target_role} · Skills: ${profile.skills} · ${profile.experience_years} yrs experience`;

  const response = await client.messages.create({
    model: HAIKU,
    max_tokens: 2500,
    messages: [
      {
        role: "user",
        content: [
          {
            // Static prefix (instructions + CV) is identical for every job in a
            // run, so cache it — cached reads cost ~10% of fresh input tokens,
            // which is most of the money in a 100+ job scoring pass.
            type: "text",
            text: `Before the candidate applies to a job, analyse the fit between their background and the role requirements. Be honest — they would rather know the gaps now than waste a recruiter's time.

${background}

Respond with valid JSON only — no markdown fences, no commentary:
{
  "score": <integer 0-100 overall fit derived from your analysis: 90+ obvious fit, 70-89 strong match with minor gaps, 50-69 credible but with real gaps, below 50 weak or wrong field>,
  "strong_matches": ["skills and experience the candidate has that directly match requirements"],
  "partial_matches": ["things they can credibly claim with slight reframing"],
  "gaps": ["requirements clearly not met — say whether each is likely a dealbreaker or a nice-to-have"],
  "selling_points": ["their strongest selling points for this role specifically"],
  "keywords": ["keywords to prioritise in the CV and cover letter"]
}
Keep each list to the 3-6 most important items, each item one short sentence.`,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: `JOB DESCRIPTION: ${job.title} at ${job.company}
${(job.description ?? job.snippet ?? "").slice(0, 6000)}

Respond now with the JSON object only, exactly as specified above — no preamble, no fences.`,
          },
        ],
      },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "{}";
  try {
    // Tolerate preamble/fences around the JSON: parse the outermost object
    const cleaned = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(cleaned) as Partial<FitAnalysis>;
    return {
      score: Math.min(100, Math.max(0, Math.round(Number(parsed.score) || 0))),
      strong_matches: parsed.strong_matches ?? [],
      partial_matches: parsed.partial_matches ?? [],
      gaps: parsed.gaps ?? [],
      selling_points: parsed.selling_points ?? [],
      keywords: parsed.keywords ?? [],
    };
  } catch {
    // Truncated/malformed JSON — salvage the score at least, never default a
    // potentially good job to 0
    const scoreMatch = text.match(/"score"\s*:\s*(\d{1,3})/);
    const salvaged = scoreMatch ? Math.min(100, parseInt(scoreMatch[1], 10)) : 0;
    return { score: salvaged, strong_matches: [], partial_matches: [], gaps: [], selling_points: [], keywords: [] };
  }
}

/**
 * Generate a tailored cover letter for a job.
 * When the candidate's CV text is provided, it grounds the letter in their
 * real experience instead of relying on the short profile alone.
 */
export function buildCoverLetterPrompt(
  job: Pick<Job, "title" | "company" | "description" | "snippet">,
  profile: Profile,
  cvRawText?: string | null,
): string {
  const cvSection = cvRawText?.trim()
    ? `\n\nThe candidate's full CV is below — draw specific, truthful details (projects, employers, achievements) from it and never invent anything not present:\nCANDIDATE CV:\n${cvRawText.trim().slice(0, 15000)}`
    : "";

  return `You are an expert cover letter writer. Write a compelling, personalised cover letter for the job below.

MY BACKGROUND: ${profile.full_name}. Skills: ${profile.skills}. Experience: ${profile.experience_years} years.${cvSection}

TARGET COMPANY: ${job.company}
TARGET ROLE: ${job.title}
JOB DESCRIPTION:
${(job.description ?? job.snippet ?? "").slice(0, 6000)}

INSTRUCTIONS:
- Opening: hook them in the first sentence — do NOT open with "I am writing to apply for...". Start with a compelling statement about the problem I solve or a result I've achieved
- Body (2-3 paragraphs): map 2-3 of my strongest achievements directly to the role's key requirements. Use concrete numbers. Show I understand their challenges, not just my own accomplishments
- Company fit: weave in a genuine, specific reason I want THIS company, grounded in what the job description reveals about them — not a generic "I admire your growth" line
- Closing: confident, not desperate. Express enthusiasm and propose a next step
- Tone: confident, warm, and direct. No filler phrases like "I believe I would be a great fit" — show, don't tell
- Length: 3-4 paragraphs, no longer than one page
- It should read like a human wrote it specifically for this role, not a template

${HUMAN_STYLE}

Output the cover letter text only — no preamble, no subject line.`;
}

export async function generateCoverLetter(
  job: Job,
  profile: Profile,
  cvRawText?: string | null,
): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: "user", content: buildCoverLetterPrompt(job, profile, cvRawText) }],
  });

  return response.content.find((b) => b.type === "text")?.text.trim() ?? "";
}

/**
 * Tailor the candidate's CV text for a specific job.
 * Returns an updated CV text highlighting relevant experience/skills.
 */
export function buildTailorCvPrompt(
  cvRawText: string,
  job: Pick<Job, "title" | "company" | "description" | "snippet">,
): string {
  return `You are an expert CV writer and career coach. Rewrite and tailor the CV below for a specific role.

TARGET JOB DESCRIPTION: ${job.title} at ${job.company}
${(job.description ?? job.snippet ?? "").slice(0, 6000)}

MY BACKGROUND (current CV):
${cvRawText.slice(0, 15000)}

INSTRUCTIONS:
- Mirror the language, keywords, and terminology used in the job description — this optimises for ATS (applicant tracking systems) and human readers alike
- Lead every bullet point with a strong action verb (delivered, architected, grew, reduced, led, etc.)
- Quantify every achievement where possible (%, £/$, headcount, time saved) — but ONLY with numbers that appear in my CV; never invent metrics
- Reorder and reframe my experience so the most relevant points surface first under each role
- Cut anything irrelevant to this role — ruthless prioritisation beats completeness
- Keep everything truthful — NEVER fabricate experience, employers, dates, or qualifications
- Keep the tone professional but human — not robotic or keyword-stuffed
- The professional summary (3-4 lines) should directly address what the employer is looking for, positioning me as the obvious fit
- Keep the same plain-text format as my CV: name on the first line, contact lines next, section headers on their own line, sections separated by blank lines, bullet lines starting with •
- Preserve every hyperlink from my CV exactly as written, including markdown-style links like [Portfolio](https://example.com) — never drop, shorten, or rewrite URLs

${HUMAN_STYLE}

Return ONLY the updated CV text — no preamble, no commentary, no gap notes.`;
}

export async function tailorCv(
  cvRawText: string,
  job: Pick<Job, "title" | "company" | "description" | "snippet">,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept so callers keep passing it; may inform tailoring later
  profile: Profile,
): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 5000,
    messages: [{ role: "user", content: buildTailorCvPrompt(cvRawText, job) }],
  });

  return response.content.find((b) => b.type === "text")?.text.trim() ?? cvRawText;
}

/**
 * Write an NHS-style supporting statement (~1,500 words) that addresses the
 * person specification (essential and desirable criteria) in the job advert,
 * evidencing each criterion from the candidate's real CV.
 */
export function buildStatementPrompt(
  job: Pick<Job, "title" | "company" | "description" | "snippet">,
  profile: Profile,
  cvRawText: string,
  targetWords = 1500,
): string {
  return `You are an expert at writing supporting statements for NHS and UK public-sector job applications.

Write a supporting statement of roughly ${targetWords} words for this application.

How to write it:
1. Read the job advert below and identify the person specification — every ESSENTIAL criterion and every DESIRABLE criterion (qualifications, experience, skills, knowledge, values). Shortlisters score applications against each one like a checklist — missing even one essential is an automatic fail.
2. Address EVERY essential criterion explicitly, each under a short heading (a line ending with a colon) so panel members can find and score it quickly. Use the exact language from the person specification where natural — shortlisters often ctrl+F for their own words.
3. For each criterion use the STAR method (Situation → Task → Action → Result), kept concise — 3-5 sentences per criterion — with evidence only from the candidate's CV (real projects, employers, outcomes, numbers where the CV has them). Do NOT just list skills: "I have strong communication skills" is weak; a concrete example with a result is strong.
4. Cover as many desirable criteria as the CV honestly supports — these differentiate candidates who all meet essentials. Where the CV doesn't fully meet a criterion, reframe genuinely transferable experience — don't fabricate, but don't undersell either.
5. Open with a short paragraph on motivation for this role and organisation; close with a brief paragraph on why THIS organisation specifically (reference NHS values where the advert mentions them).
6. First person, UK spelling. Tone: professional, confident, evidence-led — not self-congratulatory, not self-deprecating.
7. If no person specification is present in the advert, structure the statement around the main requirements stated in the advert instead.

${HUMAN_STYLE}

After the statement, add a line containing exactly "--- NOTES (delete before submitting) ---" followed by a short bullet list flagging any criteria addressed only weakly, so the candidate can strengthen them before submitting. This notes section is stripped from the downloadable document automatically.

Respond with the statement text (and the notes section) only — no preamble and no word count.

JOB ADVERT: ${job.title} at ${job.company}
${(job.description ?? job.snippet ?? "").slice(0, 12000)}

CANDIDATE PROFILE: ${profile.full_name}, ${profile.target_role}, ${profile.experience_years} years experience. Skills: ${profile.skills}

CANDIDATE CV:
${cvRawText.slice(0, 15000)}`;
}

export async function generateSupportingStatement(
  job: Pick<Job, "title" | "company" | "description" | "snippet">,
  profile: Profile,
  cvRawText: string,
  targetWords = 1500,
): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [
      { role: "user", content: buildStatementPrompt(job, profile, cvRawText, targetWords) },
    ],
  });

  return response.content.find((b) => b.type === "text")?.text.trim() ?? "";
}

/**
 * Answer a list of screening / application questions using the CV and profile.
 * Returns [{question, answer}] pairs.
 */
export function buildAnswersPrompt(
  questions: string[],
  cvRawText: string,
  job: Pick<Job, "title" | "company" | "description" | "snippet">,
  profile: Profile,
  format: "json" | "text" = "json",
): string {
  const numbered = questions.map((q, i) => `${i + 1}. ${q}`).join("\n");
  const outputRule =
    format === "json"
      ? `Return valid JSON only — an array of objects with "question" and "answer" keys.`
      : `Write each question back, followed by its answer on the next lines.`;

  return `Answer each application question below using the candidate profile and CV.
Be honest and professional, and match the depth to the question: for yes/no or factual questions answer in one or two sentences; for "why us" / "describe a time when" / motivation questions write 3-6 sentences with concrete evidence from the CV. Never invent facts the CV doesn't support; where an answer needs personal input the CV can't provide (salary expectations, notice period), give a sensible placeholder in [brackets] for the candidate to fill in.

Candidate: ${profile.full_name}, ${profile.target_role}, ${profile.experience_years} years experience
Skills: ${profile.skills}

Job: ${job.title} at ${job.company}
${(job.description ?? job.snippet ?? "").slice(0, 6000)}

CV summary:
${cvRawText.slice(0, 15000)}

Questions:
${numbered}

${HUMAN_STYLE}

${outputRule}`;
}

export async function answerScreeningQuestions(
  questions: string[],
  cvRawText: string,
  job: Pick<Job, "title" | "company" | "description" | "snippet">,
  profile: Profile,
): Promise<Array<{ question: string; answer: string }>> {
  if (questions.length === 0) return [];

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 3500,
    messages: [
      { role: "user", content: buildAnswersPrompt(questions, cvRawText, job, profile, "json") },
    ],
  });

  const text = response.content.find((b) => b.type === "text")?.text ?? "[]";
  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, "").trim();
    return JSON.parse(cleaned) as Array<{ question: string; answer: string }>;
  } catch {
    return questions.map((q) => ({ question: q, answer: "(Could not generate answer)" }));
  }
}
