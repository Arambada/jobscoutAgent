/**
 * Lever Apply via their public API.
 * Lever job URLs look like: https://jobs.lever.co/COMPANY/JOB_UUID
 * Apply endpoint: POST https://api.lever.co/v0/postings/COMPANY/JOB_UUID/apply
 */
import type { ApplyContext, ApplyResult } from "../apply";

interface LeverQuestion {
  required: boolean;
  text: string;
  id: string;
  type: string;
  options?: Array<{ text: string; optionId: string }>;
}

interface LeverPosting {
  applicationForm?: {
    customQuestions?: LeverQuestion[];
  };
}

function parseLeverUrl(url: string): { company: string; postingId: string } | null {
  const match = url.match(/jobs\.lever\.co\/([^/]+)\/([a-f0-9-]+)/i);
  if (!match) return null;
  return { company: match[1], postingId: match[2] };
}

export async function applyLever(ctx: ApplyContext): Promise<ApplyResult> {
  const parsed = parseLeverUrl(ctx.applyUrl);
  if (!parsed) {
    return { success: false, error: "Could not parse Lever URL" };
  }
  const { company, postingId } = parsed;

  try {
    // Fetch posting to get custom questions
    const postingRes = await fetch(
      `https://api.lever.co/v0/postings/${company}/${postingId}`,
    );
    if (!postingRes.ok) {
      return { success: false, error: `Lever API error ${postingRes.status}` };
    }
    const posting = (await postingRes.json()) as LeverPosting;

    const customQuestions: Record<string, string> = {};
    for (const q of posting.applicationForm?.customQuestions ?? []) {
      const match = ctx.answers.find((a) =>
        q.text.toLowerCase().includes(a.question.toLowerCase().slice(0, 30)) ||
        a.question.toLowerCase().includes(q.text.toLowerCase().slice(0, 30)),
      );
      if (match) {
        if (q.options?.length) {
          const opt = q.options.find((o) =>
            o.text.toLowerCase().includes(match.answer.toLowerCase().slice(0, 20)),
          );
          if (opt) customQuestions[q.id] = opt.optionId;
        } else {
          customQuestions[q.id] = match.answer;
        }
      }
    }

    const payload = {
      name: ctx.cvParsed?.name ?? "",
      email: ctx.cvParsed?.email ?? "",
      phone: ctx.cvParsed?.phone ?? "",
      resume: ctx.tailoredCv, // Lever accepts resume text
      comments: ctx.coverLetter,
      customQuestions,
      // Lever requires candidate origin info
      urls: { linkedin: "" },
    };

    const applyRes = await fetch(
      `https://api.lever.co/v0/postings/${company}/${postingId}/apply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );

    if (!applyRes.ok) {
      const body = await applyRes.text().catch(() => "");
      return {
        success: false,
        error: `Lever submit failed ${applyRes.status}: ${body.slice(0, 200)}`,
      };
    }

    return { success: true, url: ctx.applyUrl };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
