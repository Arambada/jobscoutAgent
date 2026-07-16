"use client";

import { useState } from "react";
import type { ApplicationAnswer } from "@/lib/types";
import CopyPromptButton from "./CopyPromptButton";

export default function QuestionsPanel({ jobId }: { jobId: number }) {
  const [questions, setQuestions] = useState("");
  const [answers, setAnswers] = useState<ApplicationAnswer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Generation failed");
      } else {
        setAnswers(data.answers ?? []);
      }
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, i: number) {
    await navigator.clipboard.writeText(text);
    setCopiedIdx(i);
    setTimeout(() => setCopiedIdx(null), 1500);
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">Application form questions</h2>
      <p className="mt-1 text-xs text-zinc-500">
        Paste the questions from the employer&rsquo;s application form (one per
        line). Answers are written from your CV and this job&rsquo;s advert —
        review before submitting, especially anything factual like notice
        period or salary expectations.
      </p>

      <textarea
        value={questions}
        onChange={(e) => setQuestions(e.target.value)}
        rows={4}
        placeholder={"Why do you want to work for us?\nDescribe a project where you used Python in production.\nWhat is your notice period?"}
        className="mt-3 w-full rounded-lg border border-zinc-300 p-3 text-sm focus:border-zinc-500 focus:outline-none"
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        {error ? <p className="text-xs text-red-600">{error}</p> : <span />}
        <div className="flex items-center gap-2">
          <CopyPromptButton jobId={jobId} type="answers" questions={questions} />
          <button
            onClick={generate}
            disabled={busy || !questions.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Answering…
            </>
          ) : (
            "Generate answers"
          )}
          </button>
        </div>
      </div>

      {answers.length > 0 && (
        <dl className="mt-4 divide-y divide-zinc-100 rounded-lg bg-zinc-50 px-4">
          {answers.map((a, i) => (
            <div key={i} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-xs font-semibold text-zinc-800">{a.question}</dt>
                <button
                  onClick={() => copy(a.answer, i)}
                  className="shrink-0 rounded border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100"
                >
                  {copiedIdx === i ? "Copied ✓" : "Copy"}
                </button>
              </div>
              <dd className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-zinc-600">
                {a.answer}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
