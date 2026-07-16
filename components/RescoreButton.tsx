"use client";

import { useState } from "react";

export default function RescoreButton({ onComplete }: { onComplete: () => void }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function rescore() {
    setBusy(true);
    setDone(null);
    try {
      const res = await fetch("/api/jobs/rescore", { method: "POST" });
      const data = await res.json();
      setDone(res.ok ? `Re-scored ${data.rescored}/${data.total}` : "Failed");
      onComplete();
    } catch {
      setDone("Failed");
    } finally {
      setBusy(false);
      setTimeout(() => setDone(null), 4000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {done && <span className="text-xs text-zinc-500">{done}</span>}
      <button
        onClick={rescore}
        disabled={busy}
        title="Re-run fit scoring for every job using the current profile and full descriptions"
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {busy ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
            Re-scoring…
          </>
        ) : (
          "Re-score"
        )}
      </button>
    </div>
  );
}
