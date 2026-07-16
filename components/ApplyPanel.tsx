"use client";

import { useCallback, useEffect, useState } from "react";
import type { Application } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  submitted: "bg-green-100 text-green-700",
  prepared: "bg-blue-100 text-blue-700",
  failed: "bg-red-100 text-red-700",
  pending: "bg-zinc-100 text-zinc-600",
};

export default function ApplyPanel({
  jobId,
  onDone,
}: {
  jobId: number;
  onDone: () => void;
}) {
  const [application, setApplication] = useState<Application | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadExisting = useCallback(async () => {
    try {
      const res = await fetch("/api/applications");
      if (!res.ok) return;
      const data = await res.json();
      const latest = (data.applications as Application[]).find(
        (a) => a.job_id === jobId,
      );
      if (latest) setApplication(latest);
    } catch {
      // non-fatal — panel just starts empty
    }
  }, [jobId]);

  useEffect(() => {
    loadExisting();
  }, [loadExisting]);

  async function prepare() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/apply/${jobId}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok && !data.application) {
        setError(data.error ?? "Something went wrong");
      } else {
        setApplication(data.application);
        if (data.application?.error) setError(data.application.error);
        onDone();
      }
    } catch {
      setError("Network error — is the server still running?");
    } finally {
      setBusy(false);
    }
  }

  const answers = application?.answers ?? [];

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">Apply</h2>
          {application && (
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_STYLES[application.status] ?? "bg-zinc-100 text-zinc-600"}`}
            >
              {application.status}
            </span>
          )}
        </div>
        <button
          onClick={prepare}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Preparing…
            </>
          ) : application ? (
            "Prepare again"
          ) : (
            "Prepare application"
          )}
        </button>
      </div>

      {busy && (
        <p className="mt-3 text-xs text-zinc-500">
          Tailoring your CV, writing a cover letter, and answering screening
          questions — this can take a minute.
        </p>
      )}

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {!application && !busy && !error && (
        <p className="mt-3 text-xs text-zinc-500">
          One click tailors your CV to this job, writes a cover letter, and
          pre-answers common screening questions. Greenhouse/Lever jobs are
          submitted automatically; everywhere else you review and submit via
          the link.
        </p>
      )}

      {application && !busy && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-600">
            <span>
              Platform: <span className="font-medium capitalize">{application.platform}</span>
            </span>
            {application.submitted_at && (
              <span>
                Submitted {new Date(application.submitted_at).toLocaleString()}
              </span>
            )}
            {application.apply_url && (
              <a
                href={application.apply_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-600 hover:underline"
              >
                Open application page ↗
              </a>
            )}
          </div>

          {application.status === "prepared" && (
            <p className="text-xs text-zinc-500">
              Your tailored CV and cover letter are in the panels below — copy
              them into the application page and use the answers here for any
              screening questions.
            </p>
          )}

          {answers.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-zinc-900">
                Screening answers
              </h3>
              <dl className="mt-2 divide-y divide-zinc-100 rounded-lg bg-zinc-50 px-3">
                {answers.map((a, i) => (
                  <div key={i} className="py-2">
                    <dt className="text-xs font-medium text-zinc-700">
                      {a.question}
                    </dt>
                    <dd className="mt-0.5 text-xs text-zinc-600">{a.answer}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
