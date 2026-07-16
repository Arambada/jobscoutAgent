"use client";

import type { Run } from "@/lib/types";
import { parseUtc } from "@/lib/dates";

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - parseUtc(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function AgentRunBanner({
  lastRun,
  running,
}: {
  lastRun: Run | null;
  running: boolean;
}) {
  if (running) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
        <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
        Agent searching…
      </span>
    );
  }

  if (!lastRun) {
    return (
      <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500">
        No runs yet
      </span>
    );
  }

  if (lastRun.status === "error") {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700"
        title={lastRun.error ?? undefined}
      >
        <span className="h-2 w-2 rounded-full bg-red-500" />
        Last run failed {timeAgo(lastRun.started_at)}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
      <span className="h-2 w-2 rounded-full bg-green-500" />
      Last run {timeAgo(lastRun.started_at)} · {lastRun.new_jobs} new job
      {lastRun.new_jobs === 1 ? "" : "s"}
    </span>
  );
}
