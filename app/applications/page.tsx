"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Application } from "@/lib/types";

type ApplicationRow = Application & {
  job_title: string;
  job_company: string;
  job_location: string | null;
  job_score: number;
  job_url: string | null;
};

interface Stats {
  total: number;
  submitted: number;
  prepared: number;
  failed: number;
  interview: number;
  offer: number;
}

const STATUS_TONE: Record<string, string> = {
  submitted: "bg-green-100 text-green-800",
  prepared: "bg-blue-100 text-blue-800",
  pending: "bg-zinc-100 text-zinc-600",
  failed: "bg-red-100 text-red-700",
  rejected: "bg-red-100 text-red-700",
  interview: "bg-amber-100 text-amber-800",
  offer: "bg-purple-100 text-purple-800",
};

function fmt(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await fetch("/api/applications");
    const data = await res.json();
    setApplications(data.applications ?? []);
    setStats(data.stats ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const statCards: Array<[string, number]> = stats
    ? [
        ["Total", stats.total],
        ["Submitted", stats.submitted],
        ["Prepared", stats.prepared],
        ["Interviews", stats.interview],
        ["Offers", stats.offer],
        ["Failed", stats.failed],
      ]
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-zinc-900">Applications</h1>

      {stats && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {statCards.map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-zinc-200 bg-white p-3 text-center shadow-sm"
            >
              <p className="text-lg font-bold tabular-nums text-zinc-900">{value}</p>
              <p className="text-xs text-zinc-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="py-12 text-center text-sm text-zinc-400">Loading…</p>
      ) : applications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <p className="text-sm font-medium text-zinc-600">No applications yet</p>
          <p className="mt-1 text-xs text-zinc-400">
            Open a job and hit &ldquo;Prepare application&rdquo; to get started.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-3">Job</th>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {applications.map((app) => (
                <tr key={app.id} className="text-zinc-700">
                  <td className="px-4 py-3">
                    <Link
                      href={`/jobs/${app.job_id}`}
                      className="font-medium text-zinc-900 hover:text-blue-600"
                    >
                      {app.job_title}
                    </Link>
                    <p className="text-xs text-zinc-500">
                      {app.job_company}
                      {app.job_location ? ` · ${app.job_location}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 capitalize">{app.platform}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_TONE[app.status] ?? "bg-zinc-100 text-zinc-600"}`}
                      title={app.error ?? undefined}
                    >
                      {app.status}
                    </span>
                    {app.error && (
                      <p className="mt-1 max-w-xs truncate text-xs text-red-500" title={app.error}>
                        {app.error}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {fmt(app.submitted_at ?? app.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {app.apply_url && (
                      <a
                        href={app.apply_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        Posting ↗
                      </a>
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
