"use client";

import { useEffect, useState } from "react";
import type { Run } from "@/lib/types";
import { parseUtc } from "@/lib/dates";
import SearchTriggerButton from "@/components/SearchTriggerButton";

function fmt(iso: string | null): string {
  return iso ? parseUtc(iso).toLocaleString() : "—";
}

function duration(run: Run): string {
  if (!run.completed_at) return "…";
  const ms =
    parseUtc(run.completed_at).getTime() -
    parseUtc(run.started_at).getTime();
  return `${Math.max(0, Math.round(ms / 1000))}s`;
}

const STATUS_TONE: Record<string, string> = {
  success: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-700",
  running: "bg-blue-100 text-blue-800",
};

export default function RunsPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/runs");
    const data = await res.json();
    setRuns(data.runs ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-900">Run history</h1>
        <SearchTriggerButton onComplete={load} />
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-zinc-400">Loading…</p>
      ) : runs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <p className="text-sm font-medium text-zinc-600">No runs yet</p>
          <p className="mt-1 text-xs text-zinc-400">
            The agent will run on its schedule, or trigger one now.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Found</th>
                <th className="px-4 py-3">New</th>
                <th className="px-4 py-3">Emailed</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {runs.map((run) => (
                <tr key={run.id} className="text-zinc-700">
                  <td className="px-4 py-3 tabular-nums text-zinc-400">{run.id}</td>
                  <td className="px-4 py-3">{fmt(run.started_at)}</td>
                  <td className="px-4 py-3 tabular-nums">{duration(run)}</td>
                  <td className="px-4 py-3 tabular-nums">{run.jobs_found}</td>
                  <td className="px-4 py-3 tabular-nums font-medium">{run.new_jobs}</td>
                  <td className="px-4 py-3 tabular-nums">{run.emailed}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[run.status]}`}
                      title={run.error ?? undefined}
                    >
                      {run.status}
                    </span>
                    {run.error && (
                      <p className="mt-1 max-w-md text-xs text-red-500">{run.error}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
