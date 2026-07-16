"use client";

import type { FitAnalysis } from "@/lib/claude";

function parseFit(json: string): FitAnalysis | null {
  if (!json?.trim()) return null;
  try {
    const fit = JSON.parse(json) as FitAnalysis;
    return typeof fit?.score === "number" ? fit : null;
  } catch {
    return null;
  }
}

function Section({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: string;
}) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className={`text-xs font-semibold ${tone}`}>{title}</h3>
      <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-zinc-700">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-zinc-300">▪</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function FitAnalysisPanel({ fitJson }: { fitJson: string }) {
  const fit = parseFit(fitJson);
  if (!fit) return null;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Fit analysis</h2>
        <span className="text-xs text-zinc-400">
          how the {fit.score}/100 score was reached
        </span>
      </div>

      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <Section title="Strong matches" items={fit.strong_matches} tone="text-green-700" />
        <Section title="Partial matches (reframe these)" items={fit.partial_matches} tone="text-amber-700" />
        <Section title="Gaps" items={fit.gaps} tone="text-red-700" />
        <Section title="Your strongest selling points" items={fit.selling_points} tone="text-blue-700" />
      </div>

      {fit.keywords?.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold text-zinc-900">
            Keywords to hit in your CV &amp; cover letter
          </h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {fit.keywords.map((k, i) => (
              <span
                key={i}
                className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-700"
              >
                {k}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
