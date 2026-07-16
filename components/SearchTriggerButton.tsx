"use client";

import { useState } from "react";

export default function SearchTriggerButton({
  onComplete,
}: {
  onComplete?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function trigger() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/search", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.run?.error ?? data.error ?? "Search failed");
      }
      onComplete?.();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {error && (
        <span className="max-w-xs truncate text-xs text-red-600" title={error}>
          {error}
        </span>
      )}
      <button
        onClick={trigger}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            Searching…
          </>
        ) : (
          "Run now"
        )}
      </button>
    </div>
  );
}
