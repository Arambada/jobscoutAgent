"use client";

import { useState } from "react";
import CopyPromptButton from "./CopyPromptButton";

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export default function SupportingStatementPanel({
  jobId,
  initialStatement,
}: {
  jobId: number;
  initialStatement: string;
}) {
  const [statement, setStatement] = useState(initialStatement);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/statement`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Generation failed");
      } else {
        setStatement(data.supporting_statement);
      }
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(statement);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">Supporting statement</h2>
          {statement && (
            <span className="text-xs text-zinc-400">{wordCount(statement)} words</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CopyPromptButton jobId={jobId} type="statement" />
          {statement && (
            <>
              <button
                onClick={copy}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
              <a
                href={`/api/jobs/${jobId}/docx?type=statement`}
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
                Writing…
              </>
            ) : statement ? (
              "Regenerate"
            ) : (
              "Write supporting statement"
            )}
          </button>
        </div>
      </div>

      {busy && (
        <p className="mt-3 text-xs text-zinc-500">
          Reading the person specification and evidencing each essential and
          desirable criterion from your CV — this takes a minute or two.
        </p>
      )}

      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

      {statement ? (
        <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-zinc-50 p-4 font-sans text-sm leading-relaxed text-zinc-800">
          {statement}
        </pre>
      ) : (
        !busy && (
          <p className="mt-3 text-xs text-zinc-500">
            NHS and public-sector applications are scored against the person
            specification. This writes a ~1,500-word statement addressing every
            essential (and desirable) criterion with evidence from your CV.
          </p>
        )
      )}
    </div>
  );
}
