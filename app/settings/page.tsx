"use client";

import { useEffect, useRef, useState } from "react";
import type { Cv, Preferences, Profile } from "@/lib/types";
import { COMPANY_GROUPS } from "@/lib/companies";

const COMPANY_GROUP_LABELS: Record<string, string> = {
  "bulge bracket": "Bulge bracket banks",
  "asset managers": "Asset managers",
  "hedge funds": "Hedge funds",
  "big 4": "Big 4",
  "mbb consulting": "MBB consulting",
  "top consulting": "Top consulting",
  "top banking": "Top banking",
  "top finance": "Top finance",
};

const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none";

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cv, setCv] = useState<Cv | null>(null);
  const [cvMsg, setCvMsg] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cvBusy, setCvBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const [p, pr, c] = await Promise.all([
        fetch("/api/preferences").then((r) => r.json()),
        fetch("/api/profile").then((r) => r.json()),
        fetch("/api/cv").then((r) => r.json()),
      ]);
      setPrefs(p.preferences);
      setProfile(pr.profile);
      setCv(c.cv);
    })();
  }, []);

  async function save() {
    if (!prefs || !profile) return;
    setBusy(true);
    const [prefRes] = await Promise.all([
      fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      }),
      fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      }),
    ]);
    const prefData = await prefRes.json().catch(() => ({}));
    setBusy(false);
    setSavedMsg(
      prefData.cleared > 0
        ? `Settings saved ✓ — cleared ${prefData.cleared} jobs from the old search; click "Run now" on the dashboard to repopulate`
        : "Settings saved ✓",
    );
    setTimeout(() => setSavedMsg(null), 6000);
  }

  async function testEmail() {
    setEmailMsg("Sending…");
    const res = await fetch("/api/email/test", { method: "POST" });
    const data = await res.json();
    setEmailMsg(data.ok ? "Test email sent ✓" : `Failed: ${data.error}`);
  }

  async function uploadCv(file: File) {
    setCvBusy(true);
    setCvMsg("Uploading & parsing…");
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/cv", { method: "POST", body: form });
    const data = await res.json();
    if (res.ok) {
      setCv(data.cv);
      setCvMsg(`CV uploaded: ${file.name} ✓`);
      // The upload seeds empty profile fields (skills) from the parsed CV
      const pr = await fetch("/api/profile").then((r) => r.json());
      setProfile(pr.profile);
    } else {
      setCvMsg(`Error: ${data.error}`);
    }
    setCvBusy(false);
  }

  async function removeCv() {
    await fetch("/api/cv", { method: "DELETE" });
    setCv(null);
    setCvMsg("CV removed");
  }

  if (!prefs || !profile) {
    return <p className="py-12 text-center text-sm text-zinc-400">Loading…</p>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-zinc-900">Settings</h1>

      {/* CV Upload */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Your CV / Resume</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Upload your PDF CV. It will be parsed, tailored per job, and used when applying.
        </p>

        {cv ? (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <span className="text-sm text-green-800">📄 {cv.file_name}</span>
            <span className="ml-auto text-xs text-green-600">Active</span>
            <button
              onClick={removeCv}
              className="ml-2 rounded text-xs text-red-500 hover:text-red-700"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="mt-4">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={cvBusy}
              className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-6 py-4 text-sm text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 w-full"
            >
              {cvBusy ? "Uploading…" : "Click to upload PDF"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadCv(f);
              }}
            />
          </div>
        )}
        {cvMsg && (
          <p className={`mt-2 text-xs ${cvMsg.startsWith("Error") ? "text-red-600" : "text-green-600"}`}>
            {cvMsg}
          </p>
        )}
      </section>

      {/* Search preferences */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Search preferences</h2>
        <p className="mt-1 text-xs text-zinc-500">
          What the agent looks for on every scheduled run.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-zinc-600">
            Job titles *
            <input
              className={inputClass}
              value={prefs.job_title}
              onChange={(e) => setPrefs({ ...prefs, job_title: e.target.value })}
              placeholder="e.g. Data Scientist, ML Engineer, AI Engineer"
            />
            <span className="mt-1 block font-normal text-zinc-400">
              Separate multiple titles with commas — each is searched and any match counts.
            </span>
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Location
            <input
              className={inputClass}
              value={prefs.location}
              onChange={(e) => setPrefs({ ...prefs, location: e.target.value })}
              placeholder="e.g. London"
            />
          </label>
          <label className="text-xs font-medium text-zinc-600 sm:col-span-2">
            Keywords
            <input
              className={inputClass}
              value={prefs.keywords}
              onChange={(e) => setPrefs({ ...prefs, keywords: e.target.value })}
              placeholder="e.g. TypeScript, Next.js, fintech"
            />
          </label>
          <label className="text-xs font-medium text-zinc-600 sm:col-span-2">
            Target companies
            <input
              className={inputClass}
              value={prefs.target_companies}
              onChange={(e) => setPrefs({ ...prefs, target_companies: e.target.value })}
              placeholder="e.g. Goldman Sachs, Morgan Stanley, Invesco, EY, PwC, top consulting"
            />
            <span className="mt-1 block font-normal text-zinc-400">
              Only listings from a matching employer are kept. Leave blank to search all companies.
              Click a group below to add it, or type company names directly.
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.keys(COMPANY_GROUPS).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    const existing = prefs.target_companies
                      .split(/[,\n]/)
                      .map((t) => t.trim())
                      .filter(Boolean);
                    if (existing.some((t) => t.toLowerCase() === key)) return;
                    const next = [...existing, key].join(", ");
                    setPrefs({ ...prefs, target_companies: next });
                  }}
                  className="rounded-full border border-zinc-300 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                >
                  + {COMPANY_GROUP_LABELS[key] ?? key}
                </button>
              ))}
            </div>
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Search every (hours, from 08:00)
            <input
              type="number"
              min={1}
              max={24}
              className={inputClass}
              value={prefs.search_interval_hours}
              onChange={(e) =>
                setPrefs({ ...prefs, search_interval_hours: parseInt(e.target.value, 10) || 6 })
              }
            />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Min score to email ({prefs.min_score_to_email})
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              className="mt-3 w-full accent-zinc-900"
              value={prefs.min_score_to_email}
              onChange={(e) =>
                setPrefs({ ...prefs, min_score_to_email: parseInt(e.target.value, 10) })
              }
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={!!prefs.remote_only}
              onChange={(e) => setPrefs({ ...prefs, remote_only: e.target.checked })}
              className="accent-zinc-900"
            />
            Remote roles only
          </label>
          <label className="mt-2 flex items-center gap-2 text-sm text-zinc-700">
            <input
              type="checkbox"
              checked={!!prefs.permanent_only}
              onChange={(e) => setPrefs({ ...prefs, permanent_only: e.target.checked })}
              className="accent-zinc-900"
            />
            Permanent roles only (no fixed-term / contract)
          </label>
        </div>
      </section>

      {/* Profile */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-900">Your profile</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Used to score jobs for relevance and personalise cover letters.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-medium text-zinc-600">
            Full name
            <input
              className={inputClass}
              value={profile.full_name}
              onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
            />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Target role
            <input
              className={inputClass}
              value={profile.target_role}
              onChange={(e) => setProfile({ ...profile, target_role: e.target.value })}
              placeholder="e.g. Data Scientist, ML Engineer (commas for multiple)"
            />
          </label>
          <label className="text-xs font-medium text-zinc-600 sm:col-span-2">
            Skills
            <textarea
              rows={3}
              className={inputClass}
              value={profile.skills}
              onChange={(e) => setProfile({ ...profile, skills: e.target.value })}
              placeholder="e.g. React, TypeScript, Node.js, SQL, AWS…"
            />
          </label>
          <label className="text-xs font-medium text-zinc-600">
            Years of experience
            <select
              className={inputClass}
              value={profile.experience_years}
              onChange={(e) => setProfile({ ...profile, experience_years: e.target.value })}
            >
              {["0-1", "2-5", "5-10", "10+"].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={busy}
          className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save settings"}
        </button>
        <button
          onClick={testEmail}
          className="rounded-lg border border-zinc-300 bg-white px-5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Send test email
        </button>
        {savedMsg && <span className="text-sm text-green-600">{savedMsg}</span>}
        {emailMsg && <span className="text-sm text-zinc-600">{emailMsg}</span>}
      </div>
    </div>
  );
}
