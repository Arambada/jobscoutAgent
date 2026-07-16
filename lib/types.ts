export type JobStatus =
  | "new"
  | "saved"
  | "applied"
  | "interviewing"
  | "rejected"
  | "offer"
  | "skipped"; // "not applying" — dismissed by the candidate, hidden from other views

export interface Job {
  id: number;
  indeed_key: string;
  title: string;
  company: string;
  location: string | null;
  salary: string | null;
  snippet: string | null;
  url: string | null;
  posted_date: string | null;
  description: string | null;
  requirements: string | null;
  benefits: string | null;
  score: number;
  status: JobStatus;
  note: string;
  cover_letter: string;
  tailored_cv: string;
  supporting_statement: string;
  fit_analysis: string;
  seen: boolean;
  discovered_at: string;
  updated_at: string;
}

/** Normalized job listing from the search provider */
export interface SearchResultJob {
  key: string;
  title: string;
  company: string;
  location: string | null;
  snippet: string | null;
  description: string | null;
  salary: string | null;
  postedDate: string | null;
  url: string | null;
  remote: boolean;
}

export interface Preferences {
  id: number;
  job_title: string;
  location: string;
  keywords: string;
  remote_only: boolean;
  permanent_only: boolean;
  search_interval_hours: number;
  min_score_to_email: number;
  updated_at: string;
}

export interface Profile {
  id: number;
  full_name: string;
  target_role: string;
  skills: string;
  experience_years: string;
  updated_at: string;
}

/** Structured data extracted from the CV PDF by Claude */
export interface ParsedCv {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  summary?: string;
  skills: string[];
  experience: Array<{
    title: string;
    company: string;
    dates: string;
    bullets: string[];
  }>;
  education: Array<{
    degree: string;
    institution: string;
    dates: string;
  }>;
  certifications?: string[];
}

export interface Cv {
  id: number;
  file_name: string;
  raw_text: string;
  parsed_data: ParsedCv | null;
  is_active: boolean;
  created_at: string;
}

export type ApplicationStatus =
  | "pending"
  | "prepared"
  | "submitted"
  | "failed"
  | "rejected"
  | "interview"
  | "offer";

export type Platform = "linkedin" | "indeed" | "greenhouse" | "lever" | "manual";

export interface ApplicationAnswer {
  question: string;
  answer: string;
}

export interface Application {
  id: number;
  job_id: number;
  cv_id: number | null;
  tailored_cv: string | null;
  cover_letter: string | null;
  answers: ApplicationAnswer[] | null;
  platform: Platform;
  apply_url: string | null;
  status: ApplicationStatus;
  submitted_at: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export type RunStatus = "running" | "success" | "error";

export interface Run {
  id: number;
  started_at: string;
  completed_at: string | null;
  jobs_found: number;
  new_jobs: number;
  emailed: number;
  error: string | null;
  status: RunStatus;
}

export const JOB_STATUSES: JobStatus[] = [
  "new",
  "saved",
  "applied",
  "interviewing",
  "rejected",
  "offer",
  "skipped",
];
