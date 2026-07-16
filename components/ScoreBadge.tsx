export default function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 71
      ? "bg-green-100 text-green-800 border-green-200"
      : score >= 41
        ? "bg-amber-100 text-amber-800 border-amber-200"
        : "bg-red-100 text-red-700 border-red-200";

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold tabular-nums ${tone}`}
      title="Relevance score (0–100)"
    >
      {score}
    </span>
  );
}
