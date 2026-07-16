"use client";

import { useState } from "react";

/**
 * Copies a ready-to-paste prompt (CV + advert + instructions) so the writing
 * can happen in the Claude app on a flat-rate subscription instead of
 * burning API credits. Assembling the prompt itself costs nothing.
 */
export default function CopyPromptButton({
  jobId,
  type,
  questions,
}: {
  jobId: number;
  type: "cover" | "cv" | "statement" | "answers";
  questions?: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  async function copyPrompt() {
    setState("busy");
    try {
      const res = await fetch(`/api/jobs/${jobId}/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, questions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await navigator.clipboard.writeText(data.prompt);
      setState("done");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <button
      onClick={copyPrompt}
      disabled={state === "busy"}
      title="Copy the full prompt (CV + advert + instructions) to paste into the Claude app — uses your subscription, not API credits"
      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
    >
      {state === "done"
        ? "Copied — paste into Claude ✓"
        : state === "error"
          ? "Failed"
          : state === "busy"
            ? "Copying…"
            : "Copy prompt"}
    </button>
  );
}
