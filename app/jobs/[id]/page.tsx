"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Job, JobStatus } from "@/lib/types";
import { parseUtc } from "@/lib/dates";
import { JOB_STATUSES } from "@/lib/types";
import ScoreBadge from "@/components/ScoreBadge";
import JobStatusBadge from "@/components/JobStatusBadge";
import ApplyPanel from "@/components/ApplyPanel";
import CoverLetterPanel from "@/components/CoverLetterPanel";
import FitAnalysisPanel from "@/components/FitAnalysisPanel";
import QuestionsPanel from "@/components/QuestionsPanel";
import SupportingStatementPanel from "@/components/SupportingStatementPanel";
import TailoredCvPanel from "@/components/TailoredCvPanel";

function parseList(json: string | null): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const [job, setJob] = useState<Job | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [note, setNote] = useState("");
  const [noteSaved, setNoteSaved] = useState(false);
  const noteRef = useRef("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/jobs/${params.id}`);
    if (!res.ok) {
      setNotFound(true);
      return;
    }
    const data = await res.json();
    setJob(data.job);
    setNote(data.job.note ?? "");
    noteRef.current = data.job.note ?? "";
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function updateStatus(status: JobStatus) {
    if (!job) return;
    setJob({ ...job, status });
    await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function saveNote() {
    if (!job || note === noteRef.current) return;
    noteRef.current = note;
    await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    setNoteSaved(true);
    setTimeout(() => setNoteSaved(false), 1500);
  }

  if (notFound) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-zinc-600">Job not found.</p>
        <Link href="/" className="mt-2 inline-block text-sm text-blue-600">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  if (!job) {
    return <p className="py-12 text-center text-sm text-zinc-400">Loading…</p>;
  }

  const requirements = parseList(job.requirements);
  const benefits = parseList(job.benefits);

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
        ← Back to dashboard
      </Link>

      {/* Header */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-zinc-900">{job.title}</h1>
            <p className="mt-1 text-sm text-zinc-600">
              {job.company}
              {job.location ? ` · ${job.location}` : ""}
            </p>
            {job.salary && (
              <p className="mt-1 text-sm font-medium text-zinc-800">{job.salary}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ScoreBadge score={job.score} />
            <JobStatusBadge status={job.status} />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-zinc-600">
            Status
            <select
              value={job.status}
              onChange={(e) => updateStatus(e.target.value as JobStatus)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm capitalize"
            >
              {JOB_STATUSES.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s}
                </option>
              ))}
            </select>
          </label>

          {job.url && (
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-500"
            >
              View &amp; apply ↗
            </a>
          )}
        </div>

        <p className="mt-4 text-xs text-zinc-400">
          Found {parseUtc(job.discovered_at).toLocaleString()}
          {job.posted_date ? ` · Posted ${job.posted_date}` : ""}
          {` · Source: ${job.indeed_key.split("-")[0]}`}
        </p>
      </div>

      <FitAnalysisPanel fitJson={job.fit_analysis ?? ""} />

      {/* Description */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">About this role</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
          {job.description ?? job.snippet ?? "No description available yet — generating a cover letter will fetch the full description."}
        </p>

        {requirements.length > 0 && (
          <>
            <h3 className="mt-5 text-sm font-semibold text-zinc-900">Requirements</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
              {requirements.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </>
        )}

        {benefits.length > 0 && (
          <>
            <h3 className="mt-5 text-sm font-semibold text-zinc-900">Benefits</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
              {benefits.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* Notes */}
      <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900">Notes</h2>
          {noteSaved && <span className="text-xs text-green-600">Saved ✓</span>}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          rows={4}
          placeholder="Next steps, contact names, interview dates… (auto-saves)"
          className="mt-3 w-full rounded-lg border border-zinc-300 p-3 text-sm focus:border-zinc-500 focus:outline-none"
        />
      </div>

      <ApplyPanel jobId={job.id} onDone={load} />

      <QuestionsPanel jobId={job.id} />

      {/* Keyed on content length so a fresh prepare re-seeds the panels */}
      <CoverLetterPanel key={`cl-${job.cover_letter.length}`} jobId={job.id} initialLetter={job.cover_letter} />

      <TailoredCvPanel key={`cv-${(job.tailored_cv ?? "").length}`} jobId={job.id} initialCv={job.tailored_cv ?? ""} />

      <SupportingStatementPanel
        key={`ss-${(job.supporting_statement ?? "").length}`}
        jobId={job.id}
        initialStatement={job.supporting_statement ?? ""}
      />
    </div>
  );
}
