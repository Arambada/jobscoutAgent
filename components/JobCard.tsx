import Link from "next/link";
import type { Job } from "@/lib/types";
import { parseUtc } from "@/lib/dates";
import ScoreBadge from "./ScoreBadge";
import JobStatusBadge from "./JobStatusBadge";

const SOURCE_LABELS: Record<string, string> = {
  adzuna: "Adzuna",
  reed: "Reed",
  nhs: "NHS Jobs",
  remotive: "Remotive",
  jsearch: "Google Jobs",
};

export default function JobCard({
  job,
  onChanged,
}: {
  job: Job;
  onChanged?: () => void;
}) {
  const sourceKey = job.indeed_key.split("-")[0];
  const source = SOURCE_LABELS[sourceKey] ?? sourceKey;

  async function setStatus(e: React.MouseEvent, status: Job["status"]) {
    e.preventDefault();
    e.stopPropagation();
    await fetch(`/api/jobs/${job.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    onChanged?.();
  }
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {!job.seen && (
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-blue-500"
                title="New — not yet viewed"
              />
            )}
            <h3 className="truncate text-sm font-semibold text-zinc-900">
              {job.title}
            </h3>
          </div>
          <p className="mt-0.5 truncate text-sm text-zinc-600">
            {job.company}
            {job.location ? ` · ${job.location}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ScoreBadge score={job.score} />
          <JobStatusBadge status={job.status} />
          {job.status !== "skipped" ? (
            <button
              onClick={(e) => setStatus(e, "skipped")}
              title="Not applying — hide this job"
              className="rounded-full px-1.5 text-sm leading-none text-zinc-300 hover:bg-zinc-100 hover:text-zinc-600"
            >
              ✕
            </button>
          ) : (
            <button
              onClick={(e) => setStatus(e, "new")}
              title="Restore to New"
              className="rounded-full px-1.5 text-xs leading-none text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              ↩
            </button>
          )}
        </div>
      </div>

      {job.salary && (
        <p className="mt-2 text-xs font-medium text-zinc-700">{job.salary}</p>
      )}
      {job.snippet && (
        <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{job.snippet}</p>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 text-xs text-zinc-400">
        <span className="truncate">
          <span className="mr-1.5 inline-block rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-500">
            {source}
          </span>
          Found {parseUtc(job.discovered_at).toLocaleDateString()}
          {job.posted_date ? ` · Posted ${job.posted_date}` : ""}
        </span>
        <span className="shrink-0 font-medium text-blue-600">View →</span>
      </div>
    </Link>
  );
}
