// ReviewPulse -- app-wide constants

// The Groww default theme legend, per spec S4.4. Documented in README.
export const GROWW_DEFAULT_APP = "Groww";

export const GROWW_THEME_LEGEND = [
  "Onboarding",
  "KYC / Verification",
  "Payments",
  "Statements / Reports",
  "Withdrawals",
] as const;

// Hard cap -- never exceed this anywhere (charts, note, exports).
export const MAX_THEMES = 5;

// Note constraints (spec S4.5)
export const NOTE_WORD_LIMIT = 250;
export const NOTE_TOP_THEMES = 3;
export const NOTE_QUOTES = 3;
export const NOTE_ACTIONS = 3;

// Email constraints (spec S4.7)
export const EMAIL_SUBJECT_LIMIT = 60;

// Review window (spec S1) -- 8 to 12 weeks back from today.
export const REVIEW_WINDOW_WEEKS_MIN = 8;
export const REVIEW_WINDOW_WEEKS_MAX = 12;

// Below this many reviews, charts become misleading -- show a sentence instead.
export const MIN_REVIEWS_FOR_CHARTS = 15;

// Groww public listing IDs (no auth, public pages only)
export const GROWW_PLAYSTORE_ID = "com.nextbillion.groww";
export const GROWW_APPSTORE_ID = "1224809609"; // public RSS numeric id

// Theme legend labels for charts (used by Recharts color tokens)
export const THEME_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];
