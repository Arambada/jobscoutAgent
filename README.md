# Job Scout

A **personal agentic job search tool**. It runs scheduled searches across five job boards, runs an AI gap analysis of every listing against your CV, prepares complete application kits (tailored CV, cover letter, screening answers, NHS-style supporting statements) as Word documents, auto-submits where a safe public API exists, and emails you when strong matches land — all while you're doing something else.

> This is not a chatbot. It is a background agent with a management UI.

![Next.js](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Postgres](https://img.shields.io/badge/Postgres-16-336791) ![Claude](https://img.shields.io/badge/Claude-Sonnet-orange)

---

## Features

- **Five job sources** — Adzuna, Reed.co.uk, NHS Jobs, Remotive (remote roles), and JSearch (Google for Jobs: LinkedIn / Indeed / Glassdoor postings). Sources activate automatically when their key is present; results are de-duplicated across boards by title + company
- **Multi-title, multi-location search** — "Data Scientist, ML Engineer" in "London, Manchester" searches every combination
- **Full job descriptions** — search-API stubs are upgraded by resolving tracking redirects to the real posting and extracting the complete advert (JSON-LD JobPosting when available)
- **AI fit analysis, not just a score** — every job gets a gap analysis against your actual CV: strong matches, partial matches, gaps (dealbreaker or nice-to-have), selling points, and keywords to hit. The 0–100 score is derived from that analysis and the full breakdown is shown on the job page
- **CV upload & parsing** — upload your PDF CV; structured data is extracted and seeds your profile's skills automatically
- **Tailored CV per job** — mirrors the advert's language for ATS, reorders your real experience, never fabricates
- **Cover letters** — hook-first, achievement-mapped, no "I am writing to apply for…"
- **Supporting statements** — ~1,500-word statements addressing every essential and desirable criterion in a person specification (NHS / public sector style), STAR-formatted, with a private note flagging weakly-evidenced criteria
- **.docx downloads** — tailored CV (with proper layout: right-aligned dates, section rules), cover letter, and supporting statement as named Word files
- **Auto-submit where safe** — Greenhouse and Lever applications go via their public APIs; everywhere else you get a prepared kit and the direct link (no ToS-violating browser automation)
- **Application tracking** — `/applications` page with per-status stats and full history
- **Email digest** — Resend-powered email when new high-score jobs are found; confirmation email on real submissions
- **Local-first** — your data stays in a local Postgres; the only external calls are the APIs you configure

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Database | PostgreSQL 16 (via Docker) |
| AI | Anthropic SDK — `claude-sonnet-4-6` for writing, `claude-haiku-4-5` for fit analysis |
| Job data | Adzuna, Reed, NHS Jobs, Remotive, JSearch (RapidAPI) |
| Documents | `docx` for Word file generation |
| Scheduler | node-cron (interval configurable in Settings) |
| Email | Resend |

---

## Quick start

### Option A — Docker (recommended)

```bash
# 1. Copy and fill in your credentials
cp .env.example .env.local

# 2. Start Postgres + the app
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000).

After changing code: `docker compose build app && docker compose up -d`.

### Option B — Local dev (Postgres must be running separately)

```bash
npm install
cp .env.example .env.local   # include DATABASE_URL
npm run dev
```

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string |
| `ANTHROPIC_API_KEY` | ✅ | Claude API — analysis, tailoring, letters, statements |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | for Adzuna | Free from [developer.adzuna.com](https://developer.adzuna.com) |
| `ADZUNA_COUNTRY` | optional | Country code (gb, us, ca…). Default `gb` |
| `REED_API_KEY` | for Reed | Free from [reed.co.uk/developers](https://www.reed.co.uk/developers) |
| `JSEARCH_API_KEY` | for LinkedIn/Indeed | Free key from [RapidAPI JSearch](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch) — you must also **subscribe** to the (free) Basic plan on that page |
| `JSEARCH_COUNTRY` | optional | JSearch country. Default `gb` |
| `JSEARCH_DATE_POSTED` | optional | Freshness window: `today` (default), `3days`, `week`, `month` |
| `NHS_JOBS` | optional | Set `off` to disable the NHS Jobs source |
| `JOB_MAX_DAYS_OLD` | optional | Max listing age in days across all sources. Default 60 |
| `JOB_PURGE_DAYS` | optional | Auto-delete untouched "new" jobs whose posting is older than N days, on each run. Off unless set |
| `RESEND_API_KEY` | for email | [resend.com](https://resend.com) API key |
| `EMAIL_FROM` / `EMAIL_TO` | for email | Sender / recipient. Unverified domains can't send — use `Name <onboarding@resend.dev>` (delivers only to your Resend account email) |
| `SEARCH_CRON` | optional | Full cron expression — overrides the Settings interval |
| `APP_URL` | optional | Base URL used in email links. Default `http://localhost:3000` |

Remotive and NHS Jobs need no keys.

### Using outside the UK

The defaults are tuned for a UK candidate, but three of the five sources work worldwide:

- **Adzuna** — set `ADZUNA_COUNTRY` (us, ca, au, de, fr, nl, in, za, br, and ~15 more)
- **JSearch** — set `JSEARCH_COUNTRY` (any Google for Jobs country)
- **Remotive** — set `CANDIDATE_REGIONS` to the hiring-region words that cover where you live, e.g. `CANDIDATE_REGIONS=usa,united states,northern america,americas,worldwide,anywhere,global`
- **Reed** and **NHS Jobs** are UK-only — leave `REED_API_KEY` unset and set `NHS_JOBS=off`

Everything else (scoring, tailoring, statements, documents) is location-agnostic.

---

## First use

1. **Settings → CV**: upload your PDF resume. It's parsed and your profile's skills box is seeded from it.
2. Check your **profile** (target roles — comma-separate multiple — and skills).
3. Set **search preferences** (job titles, locations — both accept comma-separated lists — keywords, interval).
4. Hit **Search now** on the dashboard.
5. Jobs arrive scored, sorted, and analysed. Open one to see the fit analysis, then **Prepare application**.
6. Changed your CV or profile later? Hit **Re-score** on the dashboard.

---

## How it works

### Search loop (`lib/agent.ts` + `lib/search.ts`)

1. Run every enabled source in parallel (one failing doesn't sink the run)
2. Merge and de-duplicate across boards and against the database
3. Resolve each new job's tracking redirect and fetch the full advert text
4. Run the Claude gap analysis (CV vs advert) → score + stored breakdown
5. Insert jobs; email a digest if any score ≥ your threshold

### Apply pipeline (`lib/apply.ts`)

1. Resolve the real ATS/employer URL and detect the platform
2. Fetch the full description if still a stub
3. Tailor CV → cover letter → screening answers (Claude Sonnet)
4. Greenhouse / Lever: submit via their public APIs → status `submitted`
5. Everything else: status `prepared` — you review and submit via the link
6. Everything is saved per application; genuine submissions trigger a confirmation email

There is intentionally **no LinkedIn/Indeed login automation** — it violates their terms and risks your accounts. LinkedIn and Indeed postings arrive via JSearch and go through the prepared-kit flow.

---

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/search` | POST | Trigger a manual agent run |
| `/api/jobs` | GET | List jobs with filters + stats |
| `/api/jobs/[id]` | GET / PATCH | Fetch (marks seen) / update status, note |
| `/api/jobs/[id]/cover` | POST | Generate a cover letter |
| `/api/jobs/[id]/tailor-cv` | POST | Tailor the CV for this job |
| `/api/jobs/[id]/statement` | POST | Generate a supporting statement |
| `/api/jobs/[id]/docx?type=cv\|cover\|statement` | GET | Download as Word document |
| `/api/jobs/rescore` | POST | Re-run the fit analysis for every job |
| `/api/apply/[id]` | POST | Run the full apply pipeline for a job |
| `/api/applications` | GET | List all applications with stats |
| `/api/cv` | GET / POST / DELETE | Get / upload / remove your CV |
| `/api/preferences` | GET / PUT | Search preferences |
| `/api/profile` | GET / PUT | Candidate profile |
| `/api/runs` | GET | Agent run history |
| `/api/email/test` | POST | Send a test email |

---

## Notes

- Score bands: 70+ strong match worth applying to · 50–69 credible with real gaps · below 50 probably noise
- The CV is stored as text in Postgres; uploaded PDFs are saved to `uploads/` (gitignored)
- The default 12-hour schedule keeps the JSearch free tier (200 req/month) comfortable with two locations; shorten the interval in Settings if you have quota to spare
- Adzuna's free tier is burst-limited — its queries run sequentially with backoff
- All AI prompts live in `lib/claude.ts` (and CV parsing in `lib/cv.ts`) — edit them there

---

## Contributing

PRs welcome. Open an issue first for anything beyond a small fix.
