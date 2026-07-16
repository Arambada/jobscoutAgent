/**
 * Greenhouse Apply via their public Jobs API.
 * Greenhouse job URLs look like: https://boards.greenhouse.io/COMPANY/jobs/JOB_ID
 * Apply endpoint: POST https://boards-api.greenhouse.io/v1/boards/COMPANY/jobs/JOB_ID
 */
import type { ApplyContext, ApplyResult } from "../apply";

interface GreenhouseQuestion {
  required: boolean;
  label: string;
  field_type: string;
  name: string;
  values?: Array<{ label: string; value: string | number }>;
}

interface GreenhouseJob {
  questions?: GreenhouseQuestion[];
}

function parseGreenhouseUrl(url: string): { company: string; jobId: string } | null {
  const match = url.match(/boards\.greenhouse\.io\/([^/]+)\/jobs\/(\d+)/);
  if (!match) return null;
  return { company: match[1], jobId: match[2] };
}

export async function applyGreenhouse(ctx: ApplyContext): Promise<ApplyResult> {
  const parsed = parseGreenhouseUrl(ctx.applyUrl);
  if (!parsed) {
    return { success: false, error: "Could not parse Greenhouse URL" };
  }
  const { company, jobId } = parsed;

  try {
    // Fetch job questions
    const jobRes = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${company}/jobs/${jobId}?questions=true`,
    );
    if (!jobRes.ok) {
      return { success: false, error: `Greenhouse API error ${jobRes.status}` };
    }
    const jobData = (await jobRes.json()) as GreenhouseJob;

    // Build form data
    const formData = new FormData();

    // Core required fields
    if (ctx.cvParsed?.name) {
      const [first, ...rest] = ctx.cvParsed.name.split(" ");
      formData.append("first_name", first ?? "");
      formData.append("last_name", rest.join(" ") || "");
    }
    if (ctx.cvParsed?.email) formData.append("email", ctx.cvParsed.email);
    if (ctx.cvParsed?.phone) formData.append("phone", ctx.cvParsed.phone);

    // Cover letter as resume text (Greenhouse accepts text)
    formData.append("cover_letter_text", ctx.coverLetter);

    // Map Q&A answers to Greenhouse question names
    for (const q of jobData.questions ?? []) {
      const match = ctx.answers.find((a) =>
        q.label.toLowerCase().includes(a.question.toLowerCase().slice(0, 30)) ||
        a.question.toLowerCase().includes(q.label.toLowerCase().slice(0, 30)),
      );
      if (match) {
        if (q.values?.length) {
          // Select field — find closest matching option value
          const option = q.values.find((v) =>
            v.label.toLowerCase().includes(match.answer.toLowerCase().slice(0, 20)),
          );
          if (option) formData.append(`question[${q.name}]`, String(option.value));
        } else {
          formData.append(`question[${q.name}]`, match.answer);
        }
      }
    }

    const applyRes = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${company}/jobs/${jobId}`,
      { method: "POST", body: formData },
    );

    if (!applyRes.ok) {
      const body = await applyRes.text().catch(() => "");
      return { success: false, error: `Greenhouse submit failed ${applyRes.status}: ${body.slice(0, 200)}` };
    }

    return { success: true, url: ctx.applyUrl };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
