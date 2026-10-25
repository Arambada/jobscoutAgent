import postgres from "postgres";
import { DEFAULT_TARGET_COMPANIES } from "./companies";

// Singleton across Next.js dev-server HMR reloads
const globalForDb = globalThis as unknown as { __jobScoutSql?: postgres.Sql };

export function getSql(): postgres.Sql {
  if (!globalForDb.__jobScoutSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForDb.__jobScoutSql = postgres(url, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 30,
    });
  }
  return globalForDb.__jobScoutSql;
}

/** Run once on server start — idempotent (uses IF NOT EXISTS). */
export async function initDb(): Promise<void> {
  const sql = getSql();

  await sql`
    CREATE TABLE IF NOT EXISTS preferences (
      id                    INTEGER PRIMARY KEY DEFAULT 1,
      job_title             TEXT NOT NULL DEFAULT '',
      location              TEXT NOT NULL DEFAULT '',
      keywords              TEXT NOT NULL DEFAULT '',
      remote_only           BOOLEAN NOT NULL DEFAULT false,
      search_interval_hours INTEGER NOT NULL DEFAULT 12,
      min_score_to_email    INTEGER NOT NULL DEFAULT 70,
      updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS profile (
      id               INTEGER PRIMARY KEY DEFAULT 1,
      full_name        TEXT NOT NULL DEFAULT '',
      target_role      TEXT NOT NULL DEFAULT '',
      skills           TEXT NOT NULL DEFAULT '',
      experience_years TEXT NOT NULL DEFAULT '2-5',
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS cv (
      id          SERIAL PRIMARY KEY,
      file_name   TEXT NOT NULL,
      raw_text    TEXT NOT NULL,
      parsed_data JSONB,
      is_active   BOOLEAN NOT NULL DEFAULT true,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS jobs (
      id            SERIAL PRIMARY KEY,
      indeed_key    TEXT UNIQUE NOT NULL,
      title         TEXT NOT NULL,
      company       TEXT NOT NULL,
      location      TEXT,
      salary        TEXT,
      snippet       TEXT,
      url           TEXT,
      posted_date   TEXT,
      description   TEXT,
      requirements  TEXT,
      benefits      TEXT,
      score         INTEGER NOT NULL DEFAULT 0,
      status        TEXT NOT NULL DEFAULT 'new',
      note          TEXT NOT NULL DEFAULT '',
      cover_letter  TEXT NOT NULL DEFAULT '',
      tailored_cv   TEXT NOT NULL DEFAULT '',
      seen          BOOLEAN NOT NULL DEFAULT false,
      discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS applications (
      id           SERIAL PRIMARY KEY,
      job_id       INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
      cv_id        INTEGER REFERENCES cv(id),
      tailored_cv  TEXT,
      cover_letter TEXT,
      answers      JSONB,
      platform     TEXT NOT NULL,
      apply_url    TEXT,
      status       TEXT NOT NULL DEFAULT 'pending',
      submitted_at TIMESTAMPTZ,
      error        TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS runs (
      id           SERIAL PRIMARY KEY,
      started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      jobs_found   INTEGER NOT NULL DEFAULT 0,
      new_jobs     INTEGER NOT NULL DEFAULT 0,
      emailed      INTEGER NOT NULL DEFAULT 0,
      error        TEXT,
      status       TEXT NOT NULL DEFAULT 'running'
    )
  `;

  // Columns added after the initial schema (CREATE TABLE IF NOT EXISTS won't add them)
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS supporting_statement TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE preferences ADD COLUMN IF NOT EXISTS permanent_only BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS fit_analysis TEXT NOT NULL DEFAULT ''`;
  await sql`ALTER TABLE preferences ADD COLUMN IF NOT EXISTS target_companies TEXT NOT NULL DEFAULT ''`;


  // Seed singleton rows — defaults point the search at Data/AI/ML roles inside
  // banking, asset management and consulting employers, per the intended use case.
  await sql`
    INSERT INTO preferences (id, job_title, target_companies)
    VALUES (1, 'Data Scientist, Data Engineer, Data Analyst, Machine Learning Engineer, AI Engineer', ${DEFAULT_TARGET_COMPANIES})
    ON CONFLICT (id) DO NOTHING
  `;
  await sql`INSERT INTO profile    (id) VALUES (1) ON CONFLICT (id) DO NOTHING`;
}
