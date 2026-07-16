import { Resend } from "resend";
import type { Application, Job, Preferences, Profile } from "./types";

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

function resendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  return new Resend(apiKey);
}

function sender() {
  return (
    process.env.EMAIL_FROM ??
    process.env.RESEND_FROM_EMAIL ??
    "Job Scout <onboarding@resend.dev>"
  );
}

function recipient() {
  const to = process.env.EMAIL_TO;
  if (!to) throw new Error("EMAIL_TO is not set");
  return to;
}

function jobRow(job: Job): string {
  return `
    <tr>
      <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;">
        <div style="font-size:15px;font-weight:600;color:#111827;">
          <span style="display:inline-block;background:${job.score >= 71 ? "#dcfce7" : job.score >= 41 ? "#fef3c7" : "#fee2e2"};color:${job.score >= 71 ? "#166534" : job.score >= 41 ? "#92400e" : "#991b1b"};border-radius:6px;padding:1px 8px;font-size:12px;margin-right:8px;">Score: ${job.score}</span>
          ${job.title} — ${job.company}${job.location ? `, ${job.location}` : ""}
        </div>
        ${job.salary ? `<div style="font-size:13px;color:#374151;margin-top:2px;">${job.salary}${job.posted_date ? ` · ${job.posted_date}` : ""}</div>` : ""}
        ${job.snippet ? `<div style="font-size:13px;color:#6b7280;margin-top:4px;">"${job.snippet.slice(0, 180)}"</div>` : ""}
        <div style="margin-top:6px;">
          <a href="${appUrl()}/jobs/${job.id}" style="font-size:13px;color:#2563eb;">View &amp; apply →</a>
        </div>
      </td>
    </tr>`;
}

/** Send the new-matches digest. Returns true if an email was sent. */
export async function sendDigest(
  jobs: Job[],
  prefs: Preferences,
  profile: Profile,
  totalJobs: number,
): Promise<boolean> {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_TO || jobs.length === 0) return false;

  const resend = resendClient();
  const sorted = [...jobs].sort((a, b) => b.score - a.score);

  const html = `
  <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
    <h2 style="font-size:18px;color:#111827;">Job Scout found ${jobs.length} new ${jobs.length === 1 ? "match" : "matches"}</h2>
    <p style="font-size:14px;color:#374151;">
      Hey ${profile.full_name || "there"},<br/>
      New roles matching your search for "<strong>${prefs.job_title}</strong>"${prefs.location ? ` in ${prefs.location}` : ""}.
    </p>
    <table style="width:100%;border-collapse:collapse;">${sorted.map(jobRow).join("")}</table>
    <p style="font-size:13px;color:#6b7280;margin-top:20px;">
      <a href="${appUrl()}" style="color:#2563eb;">View all ${totalJobs} jobs</a> ·
      <a href="${appUrl()}/settings" style="color:#2563eb;">Manage preferences</a>
    </p>
  </div>`;

  const { error } = await resend.emails.send({
    from: sender(),
    to: recipient(),
    subject: `Job Scout — ${jobs.length} new ${jobs.length === 1 ? "match" : "matches"} for ${prefs.job_title}`,
    html,
  });

  if (error) {
    console.error("[Email] Failed to send digest:", error);
    return false;
  }
  return true;
}

/** Send a per-application confirmation email with the tailored assets. */
export async function sendApplicationEmail(
  job: Job,
  application: Application,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept so callers keep passing it
  profile: Profile,
): Promise<void> {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_TO) return;

  const resend = resendClient();
  const statusLabel =
    application.status === "submitted"
      ? "✅ Application Submitted"
      : application.status === "prepared"
        ? "📝 Application Prepared"
        : "❌ Application Failed";

  const answers = application.answers ?? [];

  const html = `
  <div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
    <h2 style="font-size:18px;color:#111827;">${statusLabel}</h2>
    <p style="font-size:14px;color:#374151;">
      <strong>${job.title}</strong> at <strong>${job.company}</strong>${job.location ? ` · ${job.location}` : ""}
    </p>
    <p style="font-size:13px;color:#6b7280;">
      Platform: ${application.platform}${application.submitted_at ? ` · Submitted: ${new Date(application.submitted_at).toLocaleString()}` : ""}
    </p>
    ${application.error ? `<p style="font-size:13px;color:#dc2626;">Note: ${application.error}</p>` : ""}

    ${answers.length > 0 ? `
    <h3 style="font-size:14px;font-weight:600;margin-top:20px;">Screening Q&amp;A</h3>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      ${answers.map((a) => `
        <tr>
          <td style="padding:6px 0;border-bottom:1px solid #f3f4f6;color:#374151;font-weight:500;width:55%;">${a.question}</td>
          <td style="padding:6px 0 6px 12px;border-bottom:1px solid #f3f4f6;color:#6b7280;">${a.answer}</td>
        </tr>`).join("")}
    </table>` : ""}

    ${application.cover_letter ? `
    <h3 style="font-size:14px;font-weight:600;margin-top:20px;">Cover Letter Used</h3>
    <div style="font-size:13px;color:#374151;white-space:pre-wrap;background:#f9fafb;padding:12px;border-radius:6px;">${application.cover_letter.slice(0, 1200)}</div>` : ""}

    <p style="margin-top:20px;">
      <a href="${appUrl()}/applications" style="font-size:13px;color:#2563eb;">View all applications →</a>
    </p>
  </div>`;

  const { error } = await resend.emails.send({
    from: sender(),
    to: recipient(),
    subject: `Job Scout — ${application.status === "submitted" ? "Applied to" : "Failed:"} ${job.title} at ${job.company}`,
    html,
  });

  if (error) console.error("[Email] Application email failed:", error);
}

/** Send a simple test email to verify Resend configuration. */
export async function sendTestEmail(): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) return { ok: false, error: "RESEND_API_KEY is not set" };
  if (!process.env.EMAIL_TO) return { ok: false, error: "EMAIL_TO is not set" };

  const resend = resendClient();
  const { error } = await resend.emails.send({
    from: sender(),
    to: recipient(),
    subject: "Job Scout — test email",
    html: `<p>Your Job Scout email configuration works. 🎉</p>`,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
