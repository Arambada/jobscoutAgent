"use client";

import { useState } from "react";
import CopyPromptButton from "./CopyPromptButton";

export default function TailoredCvPanel({
  jobId,
  initialCv,
}: {
  jobId: number;
  initialCv: string;
}) {
  const [cv, setCv] = useState(initialCv);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/tailor-cv`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Generation failed");
      } else {
        setCv(data.tailored_cv);
      }
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(cv);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Tailored CV</h2>
        <div className="flex items-center gap-2">
          <CopyPromptButton jobId={jobId} type="cv" />
          {cv && (
            <>
              <button
                onClick={copy}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
              <a
                href={`/api/jobs/${jobId}/docx?type=cv`}
                download
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Download .docx
              </a>
            </>
          )}
          <button
            onClick={generate}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {busy ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Tailoring…
              </>
            ) : cv ? (
              "Regenerate"
            ) : (
              "Tailor my CV"
            )}
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {cv ? (
        <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-zinc-50 p-4 font-sans text-sm leading-relaxed text-zinc-800">
          {cv}
        </pre>
      ) : (
        !busy && (
          <p className="mt-3 text-xs text-zinc-500">
            Rewrite your uploaded CV to surface the experience and skills this role
            asks for. Upload your CV in Settings first.
          </p>
        )
      )}
    </div>
  );
}
