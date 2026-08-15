// Bundled, redacted Groww sample reviews -- guaranteed-working fallback.
// Used when (a) the user clicks the default CTA, or (b) live fetching fails.
//
// All entries are synthetic but realistic, modelled on the kind of public
// review content Groww receives. NO PII anywhere -- no usernames, emails,
// phone numbers, account IDs, or order IDs.
//
// Dates are computed relative to "today" so the window is always fresh.

import type { Review } from "./types";
import { GROWW_THEME_LEGEND } from "./constants";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Note: themes are pre-assigned here ONLY so the sample dataset is fast to demo.
// In the live pipeline, themes are assigned in stage 2 by the LLM classifier --
// we still re-run classification on this sample so the result reflects the
// prompt, not the pre-tag. (See pipeline route.)
interface SampleReviewSeed {
  rating: 1 | 2 | 3 | 4 | 5;
  title: string | null;
  text: string;
  daysAgo: number;
  preTag: string; // suggested theme tag -- LLM will re-classify
}

const SEEDS: SampleReviewSeed[] = [
  // Onboarding
  { rating: 5, title: "Smooth start", text: "Opened my account in under 10 minutes. The PAN verification step was quick and the in-app guided tour actually explained what each section does. Best onboarding I have seen on a finance app.", daysAgo: 9, preTag: "Onboarding" },
  { rating: 4, title: "Good but", text: "Sign-up was easy, the only confusing bit was the mandate step -- I had to look it up. Once done, the rest was clean.", daysAgo: 11, preTag: "Onboarding" },
  { rating: 2, title: "Stuck on first screen", text: "Tried to open account, app kept showing a spinner after Aadhaar step. Had to restart. Eventually worked but felt broken.", daysAgo: 14, preTag: "Onboarding" },
  { rating: 5, title: "Easy onboarding", text: "The new onboarding flow is much better than last year. Step-by-step tooltips helped me finish in one go.", daysAgo: 18, preTag: "Onboarding" },
  { rating: 3, title: "Decent", text: "Onboarding is okay. Took 25 minutes total, which is fine but not great compared to other apps.", daysAgo: 22, preTag: "Onboarding" },
  { rating: 1, title: "Cannot complete signup", text: "After entering PAN the app crashes. Tried three times. Support told me to reinstall, did not help.", daysAgo: 27, preTag: "Onboarding" },
  { rating: 4, title: "Clean UI", text: "First impression is great. The home screen is not cluttered like other brokers. Onboarding took 8 mins.", daysAgo: 33, preTag: "Onboarding" },
  { rating: 5, title: "Loved the new flow", text: "The progress indicator during onboarding is genuinely helpful. Knew exactly what was left.", daysAgo: 38, preTag: "Onboarding" },

  // KYC / Verification
  { rating: 1, title: "KYC stuck for 5 days", text: "Uploaded my Aadhaar, the status is still pending after five days. No update, no rejection reason, no clear escalation. This is the worst part of the app.", daysAgo: 6, preTag: "KYC / Verification" },
  { rating: 2, title: "Document rejected twice", text: "Same PAN card I used last year got rejected twice for being unclear. The photo was sharp. Had to call support to fix it manually.", daysAgo: 13, preTag: "KYC / Verification" },
  { rating: 4, title: "KYC done in 2 hrs", text: "Re-KYC for the new SEBI rules was done within two hours. Impressed. The selfie step worked first try.", daysAgo: 17, preTag: "KYC / Verification" },
  { rating: 1, title: "Stuck verification", text: "Cannot trade because my KYC keeps reverting to pending even after approval. Missed a buy I wanted yesterday.", daysAgo: 19, preTag: "KYC / Verification" },
  { rating: 3, title: "Slow but works", text: "KYC took 4 days. Not terrible, but other apps do it same day. The tracking page does not say why it is slow.", daysAgo: 24, preTag: "KYC / Verification" },
  { rating: 2, title: "Re-verification loop", text: "Asked me to redo KYC even though I did it six months ago. Why? Lost an hour redoing the same form.", daysAgo: 29, preTag: "KYC / Verification" },
  { rating: 1, title: "No human support", text: "KYC issue, no phone number to call, only chatbot which loops. Two days lost. Frustrating.", daysAgo: 36, preTag: "KYC / Verification" },
  { rating: 5, title: "Surprised how fast", text: "Full KYC including video verification was done in 90 minutes on a Sunday. Big improvement from last year.", daysAgo: 41, preTag: "KYC / Verification" },

  // Payments
  { rating: 1, title: "Money debited, not credited", text: "Added 5000 via UPI, amount left my bank but did not show in the app balance for 4 hours. No way to know if it is stuck or processing.", daysAgo: 5, preTag: "Payments" },
  { rating: 2, title: "Payment failures", text: "Two out of five add-money attempts failed this week. Same UPI app works everywhere else. Refund for the failed one took 2 days.", daysAgo: 12, preTag: "Payments" },
  { rating: 4, title: "UPI is fast now", text: "Add money via UPI is instant lately. Earlier it used to take a minute, now it shows in 5 seconds. Good fix.", daysAgo: 16, preTag: "Payments" },
  { rating: 3, title: "Slow but works", text: "Payment takes about 30 seconds. Not instant, but okay. Would like to see a status indicator while it processes.", daysAgo: 21, preTag: "Payments" },
  { rating: 1, title: "Auto-pay failure", text: "Auto-pay mandate failed without warning, my SIP did not go through. Had to manually retry. No alert was sent.", daysAgo: 26, preTag: "Payments" },
  { rating: 5, title: "Easy payments", text: "Adding funds and paying for IPO applications is seamless. UPI integration is the smoothest I have used.", daysAgo: 31, preTag: "Payments" },
  { rating: 2, title: "Stuck payment", text: "Net banking payment got stuck for 6 hours. The status just says processing. No way to cancel and retry.", daysAgo: 37, preTag: "Payments" },
  { rating: 4, title: "Good", text: "Most payments work fine. Only issue is the auto-pay mandate occasionally fails on the first attempt.", daysAgo: 43, preTag: "Payments" },

  // Statements / Reports
  { rating: 2, title: "Cannot download P&L", text: "Tried to download this year's P&L statement for tax filing. The download button does nothing. Tried desktop and mobile, same result.", daysAgo: 8, preTag: "Statements / Reports" },
  { rating: 3, title: "Reports take time", text: "Statement generation takes 30-40 seconds and there is no progress bar. Fine if you wait, but feels frozen.", daysAgo: 15, preTag: "Statements / Reports" },
  { rating: 1, title: "Wrong numbers", text: "My realised P&L in the report does not match what the app shows on the dashboard. Off by about 200 rupees. Lost trust in the report.", daysAgo: 20, preTag: "Statements / Reports" },
  { rating: 4, title: "Clean tax reports", text: "The new tax report PDF is well formatted and easy to upload to my CA's portal. Took one minute.", daysAgo: 25, preTag: "Statements / Reports" },
  { rating: 2, title: "Missing data", text: "Half my mutual fund holdings are not showing in the consolidated statement. Have to download separately.", daysAgo: 30, preTag: "Statements / Reports" },
  { rating: 5, title: "Finally a good report", text: "The new yearly statement is excellent. Shows realised and unrealised gains separately with clear totals.", daysAgo: 39, preTag: "Statements / Reports" },
  { rating: 3, title: "OK", text: "Reports are okay but only go back 12 months. I needed 24 months for my CA, had to email support.", daysAgo: 44, preTag: "Statements / Reports" },

  // Withdrawals
  { rating: 1, title: "Withdrawal pending 3 days", text: "Withdrew to my bank on Monday, still pending on Thursday. The status page just says processing with no timeline. This is my money, not a coupon.", daysAgo: 4, preTag: "Withdrawals" },
  { rating: 2, title: "Withdrawal cancelled", text: "Withdrawal got cancelled without explanation. Had to redo it. Funds were in my bank the second time in 4 hours.", daysAgo: 10, preTag: "Withdrawals" },
  { rating: 5, title: "Instant withdrawal", text: "Withdrawal to bank now arrives in seconds via IMPS. Last year it used to take hours. Big improvement.", daysAgo: 14, preTag: "Withdrawals" },
  { rating: 1, title: "Money not arrived", text: "Withdrawal shows completed in app but my bank has nothing. Support says wait 24 hours but it has been 48.", daysAgo: 23, preTag: "Withdrawals" },
  { rating: 3, title: "Slow but ok", text: "Withdrawal took 6 hours on a weekday. Acceptable but not instant. Hoping they improve this.", daysAgo: 28, preTag: "Withdrawals" },
  { rating: 4, title: "Quick", text: "Most withdrawals arrive within 30 mins. Once it took 2 hours but support explained it was a bank delay.", daysAgo: 34, preTag: "Withdrawals" },
  { rating: 2, title: "Confusing limits", text: "Daily withdrawal limit is not shown anywhere obvious. Found out only when my withdrawal was rejected.", daysAgo: 42, preTag: "Withdrawals" },
];

export function getSampleGrowwReviews(appName = "Groww"): Review[] {
  return SEEDS.map((s, idx) => ({
    id: `sample-groww-${idx + 1}`,
    source: "sample",
    rating: s.rating,
    title: s.title,
    text: s.text,
    date: isoDaysAgo(s.daysAgo),
    theme: s.preTag, // suggested; re-classified downstream
  })).filter((r) => {
    // keep only last 8-12 weeks (~84 days)
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - 84);
    return new Date(r.date) >= cutoff;
  });
}

export const SAMPLE_THEME_LEGEND = GROWW_THEME_LEGEND;
