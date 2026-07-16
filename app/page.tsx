"use client";

import { useCallback, useEffect, useState } from "react";
import type { Job, Run } from "@/lib/types";
import JobCard from "@/components/JobCard";
import AgentRunBanner from "@/components/AgentRunBanner";
import RescoreButton from "@/components/RescoreButton";
import SearchTriggerButton from "@/components/SearchTriggerButton";

type Tab = "all" | "new" | "saved" | "applied" | "interviewing" | "skipped";

interface Stats {
  total: number;
  new_today: number | null;
  unseen: number | null;
  applied: number | null;
  interviewing: number | null;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "saved", label: "Saved" },
  { key: "applied", label: "Applied" },
  { key: "interviewing", label: "Interviewing" },
  { key: "skipped", label: "Not applying" },
];

export default function Dashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [lastRun, setLastRun] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [minScore, setMinScore] = useState(0);
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [sortBy, setSortBy] = useState<"score" | "newest">("score");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (tab === "new") params.set("unseen", "1");
    else if (tab !== "all") params.set("status", tab);
    if (minScore > 0) params.set("minScore", String(minScore));
    if (remoteOnly) params.set("remote", "1");

    const [jobsRes, runsRes] = await Promise.all([
      fetch(`/api/jobs?${params}`),
      fetch("/api/runs"),
    ]);
    const jobsData = await jobsRes.json();
    const runsData = await runsRes.json();
    setJobs(jobsData.jobs ?? []);
    setStats(jobsData.stats ?? null);
    setLastRun(runsData.runs?.[0] ?? null);
    setRunning(!!runsData.running);
    setLoading(false);
  }, [tab, minScore, remoteOnly]);

  useEffect(() => {
    load();
  }, [load]);

  // Light polling so scheduled runs show up without a refresh
  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-zinc-900">Dashboard</h1>
          <AgentRunBanner lastRun={lastRun} running={running} />
        </div>
        <div className="flex items-center gap-2">
          <RescoreButton onComplete={load} />
          <SearchTriggerButton onComplete={load} />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total jobs", value: stats?.total ?? 0 },
          { label: "New today", value: stats?.new_today ?? 0 },
          { label: "Applied", value: stats?.applied ?? 0 },
          { label: "Interviews", value: stats?.interviewing ?? 0 },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-2xl font-bold tabular-nums text-zinc-900">{s.value}</p>
            <p className="text-xs text-zinc-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs + filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex rounded-lg border border-zinc-200 bg-white p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                tab === t.key
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {t.label}
              {t.key === "new" && (stats?.unseen ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-blue-500 px-1.5 text-[10px] text-white">
                  {stats?.unseen}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-4 text-xs text-zinc-600">
          <label className="flex items-center gap-2">
            Sort
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "score" | "newest")}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1 text-xs"
            >
              <option value="score">Highest score</option>
              <option value="newest">Newest first</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            Min score
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={minScore}
              onChange={(e) => setMinScore(parseInt(e.target.value, 10))}
              className="accent-zinc-900"
            />
            <span className="w-6 font-semibold tabular-nums">{minScore}</span>
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={remoteOnly}
              onChange={(e) => setRemoteOnly(e.target.checked)}
              className="accent-zinc-900"
            />
            Remote
          </label>
        </div>
      </div>

      {/* Score explainer */}
      <p className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-2.5 text-xs leading-relaxed text-blue-900">
        <strong>What the scores mean:</strong> each job gets an AI gap analysis
        against your uploaded CV (strong matches, partial matches, gaps), and
        the 0–100 score comes from that — open any job to see the full
        breakdown. Roughly: 70+ strong match worth applying to, 50–69 credible
        but with real gaps, below 50 probably noise. Scores also decide which
        jobs get emailed to you. Changed your CV or profile? Hit “Re-score”
        above.
      </p>

      {/* Job list */}
      {loading ? (
        <p className="py-12 text-center text-sm text-zinc-400">Loading…</p>
      ) : jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <p className="text-sm font-medium text-zinc-600">No jobs here yet</p>
          <p className="mt-1 text-xs text-zinc-400">
            Set your preferences in Settings, then hit “Run now” to search for jobs.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {[...jobs]
            .sort((a, b) =>
              sortBy === "score"
                ? b.score - a.score
                : new Date(b.discovered_at).getTime() - new Date(a.discovered_at).getTime(),
            )
            .map((job) => (
              <JobCard key={job.id} job={job} onChanged={load} />
            ))}
        </div>
      )}
    </div>
  );
}
