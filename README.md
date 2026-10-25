# Job Scout

A **personal job search agent** that works while you don't. On a schedule it searches six job sources, analyses every listing against your CV, and emails you when strong matches land. For any job you pick, it prepares a complete application kit — tailored CV, cover letter, screening answers and NHS-style supporting statement — as Word documents, and submits it directly where a safe public API exists.

> Not a chatbot: a background agent with a management UI.

![Next.js](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Postgres](https://img.shields.io/badge/Postgres-16-336791) ![Claude](https://img.shields.io/badge/Claude-Sonnet_%2B_Haiku-orange)

---

## Features

### Finding jobs

- **Six sources** — Adzuna, Reed.co.uk, NHS Jobs, Remotive, JSearch (Google for Jobs: LinkedIn / Indeed / Glassdoor postings) and employer ATS boards (Greenhouse, Lever, Ashby). Keyed sources switch on when their key is present; duplicates are merged by title + company, with direct employer listings winning
- **Multi-title, multi-location search** — "Data Scientist, ML Engineer" in "London, Manchester" searches every combination
- **Target companies** — optionally keep only listings from employers you name, or add a whole group in one click (bulge bracket banks, asset managers, hedge funds, Big 4, MBB and top consulting, top finance)
- **Full job descriptions** — search-API stubs are upgraded by following tracking redirects to the real posting and extracting the complete advert (JSON-LD `JobPosting` when available)
- **Scheduled runs** — every N hours from 08:00 London time by default (08:00 and 20:00 at the 12-hour default), with automatic retries if every source fails at once

### Judging fit

- **Gap analysis, not just a score** — each job is compared with your actual CV: strong matches, partial matches, gaps (dealbreaker or nice-to-have), selling points and keywords to hit. The 0–100 score is derived from that analysis, and the full breakdown is on the job page
- **CV upload & parsing** — upload a PDF; it's parsed into structured data and seeds your profile's skills

### Applying

- **Tailored CV per job** — mirrors the advert's language for ATS filters and reorders your real experience; never fabricates
- **Cover letters** — hook-first and mapped to your achievements; no "I am writing to apply for…"
- **Supporting statements** — ~1,500 words addressing every essential and desirable criterion in a person specification (NHS / public sector style), STAR-formatted, with a private note flagging weakly evidenced criteria
- **.docx downloads** — CV (right-aligned dates, section rules), cover letter and statement as named Word files
- **Use your Claude subscription instead** — any document can be exported as a ready-to-paste prompt (CV + full advert + the same instructions), so the Claude app does the writing without spending API credits
- **Direct submission where safe** — Greenhouse and Lever applications go through their public APIs; everything else gets a prepared kit and a direct link
- **Application tracking** — `/applications` shows every application with per-status counts

### Staying informed

- **Email digest** — sent via Resend when new jobs clear your score threshold, plus a confirmation on real submissions
- **Local-first** — data lives in your own Postgres; the only outbound calls are to the APIs you configure

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Database | PostgreSQL 16 (Docker) |
| AI | Anthropic SDK — `claude-sonnet-4-6` for writing, `claude-haiku-4-5` for fit analysis and CV parsing |
| Job data | Adzuna, Reed, NHS Jobs, Remotive, JSearch (RapidAPI), Greenhouse / Lever / Ashby boards |
| Documents | `docx` |
| Scheduler | node-cron |
| Email | Resend |

---

## Quick start

### Option A — Docker (recommended)

```bash
cp .env.example .env.local   # then fill in your keys
docker compose up -d         # starts Postgres + the app
```

Open [http://localhost:3000](http://localhost:3000). The app only listens on localhost — it has no login, so don't expose it to a network.

After changing code or pulling updates:

```bash
docker compose build app && docker compose up -d
```

### Option B — Local dev

Needs a running Postgres. The easiest is the one from Docker, which is published on port **5434**:

```bash
docker compose up -d postgres
npm install
cp .env.example .env.local
# in .env.local: DATABASE_URL=postgres://jobscout:jobscout@localhost:5434/jobscout
npm run dev
```

The schema is created automatically on first start.

---

## First use

1. **Settings → CV** — upload your PDF CV. Your profile's skills are filled in from it.
2. **Settings → Profile** — check your target roles (comma-separated) and skills.
3. **Settings → Search preferences** — job titles and locations (both accept comma-separated lists), keywords, optional target companies, interval and email threshold.
4. Click **Run now** on the dashboard.
5. Jobs arrive scored, sorted and analysed. Open one to read the fit analysis, then click **Prepare application**.
6. Updated your CV or profile? Click **Re-score** on the dashboard.

> Changing the job title, location or target companies clears unreviewed jobs from the previous search so the dashboard reflects the new one.

---

## Configuration

Set these in `.env.local`. Only the first two are required; each job source turns on when its key is present.

### Core

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string (set automatically under Docker) |
| `ANTHROPIC_API_KEY` | ✅ | Claude API — analysis, tailoring, letters, statements |
| `APP_URL` | | Base URL used in email links. Default `http://localhost:3000` |

### Job sources

| Variable | Purpose |
|---|---|
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | Free from [developer.adzuna.com](https://developer.adzuna.com) |
| `ADZUNA_COUNTRY` | `gb` (default), `us`, `ca`, `au`, `de`, `fr`… |
| `REED_API_KEY` | Free from [reed.co.uk/developers](https://www.reed.co.uk/developers) |
| `JSEARCH_API_KEY` | Free from [RapidAPI JSearch](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch). You must also **subscribe** to the free Basic plan on that page, or every request fails |
| `JSEARCH_COUNTRY` | Default `gb` |
| `JSEARCH_DATE_POSTED` | `today` (default), `3days`, `week`, `month` |
| `ATS_BOARDS` | Employer boards to query, as `kind:slug[:Display Name]` pairs — e.g. `greenhouse:monzo,lever:spotify,ashby:openai:OpenAI`. Defaults to a list of UK data/AI employers; `off` disables |
| `NHS_JOBS` | `off` disables NHS Jobs |
| `CANDIDATE_REGIONS` | Hiring-region words for filtering Remotive's remote roles. Defaults to UK/Europe |
| `JOB_MAX_DAYS_OLD` | Max listing age across all sources. Default `60` |
| `JOB_PURGE_DAYS` | Delete untouched "new" jobs older than N days on each run. Off unless set |

Remotive, NHS Jobs and the ATS boards need no keys.

### Schedule

| Variable | Purpose |
|---|---|
| `SEARCH_START_HOUR` | Local hour the interval is anchored to. Default `8` |
| `SEARCH_TZ` | Timezone for the schedule. Default `Europe/London` |
| `SEARCH_CRON` | Full cron expression; overrides the Settings interval entirely |

### Email

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | From [resend.com](https://resend.com) |
| `EMAIL_FROM` / `EMAIL_TO` | Sender and recipient. Without a verified domain, use `Job Scout <onboarding@resend.dev>`, which only delivers to your Resend account's address |

Use **Settings → Send test email** to check it works.

### Using outside the UK

Scoring, tailoring and documents are location-agnostic; only the sources need adjusting:

- **Adzuna** — set `ADZUNA_COUNTRY` (~20 countries supported)
- **JSearch** — set `JSEARCH_COUNTRY` (any Google for Jobs country)
- **Remotive** — set `CANDIDATE_REGIONS`, e.g. `usa,united states,northern america,americas,worldwide,anywhere,global`
- **ATS boards** — set `ATS_BOARDS` to employers that hire where you are
- **Reed** and **NHS Jobs** are UK-only — leave `REED_API_KEY` unset and set `NHS_JOBS=off`
- Set `SEARCH_TZ` to your timezone

---

## How it works

### Search loop — `lib/agent.ts`, `lib/search.ts`

1. Query every enabled source in parallel; one failing doesn't sink the run
2. Merge, de-duplicate across sources and against the database, and apply the target-company filter
3. Follow each new job's tracking redirect and fetch the full advert
4. Run the Claude gap analysis (CV vs advert) → score + stored breakdown
5. Save the jobs and email a digest if any clear your threshold

### Apply pipeline — `lib/apply.ts`

1. Resolve the real employer URL and detect the platform (Greenhouse, Lever, Ashby, LinkedIn, Indeed or manual)
2. Fetch the full description if it's still a stub
3. Tailor the CV, then write the cover letter and screening answers (Claude Sonnet)
4. **Greenhouse / Lever** — submit via their public APIs → status `submitted`
5. **Everything else** — status `prepared`; you review and submit via the link
6. Everything is saved with the application; real submissions trigger a confirmation email

There is deliberately **no LinkedIn or Indeed login automation** — it breaks their terms and risks your accounts. Their postings arrive via JSearch and go through the prepared-kit flow.

---

## API routes

| Route | Method | Purpose |
|---|---|---|
| `/api/search` | POST | Trigger a search run |
| `/api/runs` | GET | Run history |
| `/api/jobs` | GET | List jobs with filters and stats |
| `/api/jobs/[id]` | GET / PATCH | Fetch (marks as seen) / update status or note |
| `/api/jobs/[id]/tailor-cv` | POST | Tailor the CV for this job |
| `/api/jobs/[id]/cover` | POST | Write a cover letter |
| `/api/jobs/[id]/answers` | POST | Draft screening answers |
| `/api/jobs/[id]/statement` | POST | Write a supporting statement |
| `/api/jobs/[id]/prompt` | POST | Build a ready-to-paste prompt (CV + advert + instructions) for the Claude app, so your subscription does the writing instead of API credits |
| `/api/jobs/[id]/docx?type=cv\|cover\|statement` | GET | Download as a Word document |
| `/api/jobs/rescore` | POST | Re-run the fit analysis for every job |
| `/api/apply/[id]` | POST | Run the full apply pipeline |
| `/api/applications` | GET | List applications with stats |
| `/api/cv` | GET / POST / DELETE | Get / upload / remove your CV |
| `/api/preferences` | GET / PUT | Search preferences |
| `/api/profile` | GET / PUT | Candidate profile |
| `/api/email/test` | POST | Send a test email |

---

## Notes

- **Score bands** — 70+ worth applying to · 50–69 credible with real gaps · below 50 probably noise
- **Your data** — the CV is stored as text in Postgres; uploaded PDFs go to `uploads/` (gitignored)
- **API quotas** — the 12-hour default keeps JSearch's free tier (200 requests/month) comfortable with two locations. Adzuna's free tier is burst-limited, so its queries run one at a time with backoff
- **Prompts** — all AI prompts live in `lib/claude.ts` (CV parsing in `lib/cv.ts`); edit them there
- **Company groups** — defined in `lib/companies.ts`; add your own there

---

## Contributing

PRs welcome. Please open an issue first for anything beyond a small fix.
