// ReviewPulse -- pipeline types
// Internal schema enforces PII-by-omission: there is NO field for username,
// email, phone, device ID, or reviewer handle anywhere in this file.

export type ReviewSource =
  | "play_store"
  | "app_store"
  | "pdf_upload"
  | "image_upload"
  | "sample";

export interface Review {
  /** Internal-only ID, generated -- never a source-platform user ID. */
  id: string;
  source: ReviewSource;
  rating: 1 | 2 | 3 | 4 | 5;
  title: string | null;
  text: string;
  date: string; // ISO 8601
  theme: string | null; // assigned in stage 2
}

export type Sentiment = "positive" | "neutral" | "negative";

export interface ThemeBreakdown {
  theme: string;
  count: number;
  share: number; // 0-1
  avgRating: number;
  topSentiment: Sentiment;
}

export interface Quote {
  text: string;
  theme: string;
  rating: 1 | 2 | 3 | 4 | 5;
}

export interface ActionIdea {
  text: string;
  theme: string;
}

export interface WeeklyNote {
  appName: string;
  dateRange: { start: string; end: string };
  markdown: string;
  wordCount: number;
  topThemes: string[]; // exactly 3
  quotes: Quote[]; // exactly 3
  actions: ActionIdea[]; // exactly 3
}

export interface EmailDraft {
  subject: string; // <=60 chars
  body: string;
}

export type PipelineStageId =
  | "import"
  | "group"
  | "note"
  | "email";

export type PipelineStageStatus = "pending" | "active" | "done" | "error";

export interface PipelineStageState {
  id: PipelineStageId;
  label: string;
  status: PipelineStageStatus;
  message: string;
  detail?: string;
}

export interface PipelineResult {
  reviews: Review[];
  themes: ThemeBreakdown[];
  note: WeeklyNote;
  email: EmailDraft;
  stages: PipelineStageState[];
  meta: {
    appName: string;
    source: ReviewSource | "mixed";
    dateRange: { start: string; end: string };
    reviewCount: number;
    usedFallback: boolean;
    fallbackReason?: string;
  };
}

export interface AppInput {
  kind: "groww_default";
  appName?: string;
}

export interface RatingTrendPoint {
  week: string;
  avg: number;
  count: number;
}

export interface RatingDistribution {
  rating: 1 | 2 | 3 | 4 | 5;
  count: number;
}

export interface SentimentSplit {
  positive: number;
  neutral: number;
  negative: number;
}
