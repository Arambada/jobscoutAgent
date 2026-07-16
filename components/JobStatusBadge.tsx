import type { JobStatus } from "@/lib/types";

const TONES: Record<JobStatus, string> = {
  new: "bg-blue-100 text-blue-800",
  saved: "bg-violet-100 text-violet-800",
  applied: "bg-cyan-100 text-cyan-800",
  interviewing: "bg-amber-100 text-amber-800",
  rejected: "bg-zinc-100 text-zinc-600",
  offer: "bg-green-100 text-green-800",
  skipped: "bg-zinc-100 text-zinc-500 line-through",
};

export default function JobStatusBadge({ status }: { status: JobStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${TONES[status] ?? TONES.new}`}
    >
      {status}
    </span>
  );
}
