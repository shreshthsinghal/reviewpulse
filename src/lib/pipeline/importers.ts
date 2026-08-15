// ReviewPulse — review importers.
// All four import paths resolve to the same internal Review schema (no PII
// fields by design). PII scrubbing happens in a separate pass downstream —
// these importers ONLY normalize raw text/rating/date out of the source.

import type { Review, ReviewSource } from "./types";
import { getLLM } from "./llm";
import {
  GROWW_APPSTORE_ID,
  GROWW_PLAYSTORE_ID,
  REVIEW_WINDOW_WEEKS_MAX,
} from "./constants";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

const REVIEW_WINDOW_DAYS = REVIEW_WINDOW_WEEKS_MAX * 7;

function withinWindow(dateStr: string): boolean {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - REVIEW_WINDOW_DAYS);
  return d >= cutoff;
}

function genId(prefix: string, idx: number): string {
  return `${prefix}-${idx}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampRating(n: unknown): 1 | 2 | 3 | 4 | 5 | null {
  if (typeof n !== "number" || Number.isNaN(n)) return null;
  const r = Math.round(n);
  if (r < 1 || r > 5) return null;
  return r as 1 | 2 | 3 | 4 | 5;
}

// ---------------------------------------------------------------------------
// 1. Play Store — public listing only. Uses web_search to find the app, then
//    page_reader to fetch the public reviews page. No auth, no Console API.
//    (Per spec §5.5: this is a public listing, not a private API.)
// ---------------------------------------------------------------------------

export async function searchPlayStoreApps(query: string): Promise<
  Array<{ appId: string; title: string; developer: string; score: number | null }>
> {
  if (!query.trim()) return [];
  const zai = await getLLM();
  const results = await zai.functions.invoke("web_search", {
    query: `site:play.google.com/store/apps/details "${query}"`,
    num: 6,
  });
  const out: Array<{ appId: string; title: string; developer: string; score: number | null }> = [];
  for (const r of results || []) {
    const m = /\/store\/apps\/details\?id=([\w.]+)/.exec(r.url);
    if (!m) continue;
    const appId = m[1];
    const title = (r.name || "").split(" - ")[0].split(" | ")[0].trim();
    if (!title) continue;
    out.push({
      appId,
      title,
      developer: r.host_name,
      score: null,
    });
  }
  // de-dupe by appId
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.appId) ? false : (seen.add(x.appId), true)));
}

export async function fetchPlayStoreReviews(
  appId: string,
  appName: string
): Promise<{ reviews: Review[]; usedFallback: boolean; fallbackReason?: string }> {
  try {
    const zai = await getLLM();
    const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(
      appId
    )}&showAllReviews=true`;
    const page = await zai.functions.invoke("page_reader", { url });

    // The HTML of the Play Store reviews page is large and JS-rendered in
    // production; we ask the LLM to extract reviews from whatever text the
    // reader returns. This is the "public listing" path the spec permits.
    const html = page?.data?.html ?? "";
    if (!html || html.length < 500) {
      return {
        reviews: [],
        usedFallback: true,
        fallbackReason: "Play Store page returned insufficient content (likely JS-rendered).",
      };
    }

    const extracted = await llmExtractReviewsFromHtml(html, appName, "play_store");
    const reviews = extracted
      .filter((r) => r.date && withinWindow(r.date))
      .map((r, idx) => ({
        id: genId("ps", idx),
        source: "play_store" as ReviewSource,
        rating: clampRating(r.rating) ?? 3,
        title: (r.title ?? null) as string | null,
        text: r.text ?? "",
        date: r.date,
        theme: null,
      }));
    return { reviews, usedFallback: false };
  } catch (err) {
    return {
      reviews: [],
      usedFallback: true,
      fallbackReason: `Play Store fetch failed: ${(err as Error).message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 2. App Store — Apple's public per-app Customer Reviews RSS feed (JSON).
//    Genuinely official, no auth. Example URL:
//    https://itunes.apple.com/rss/customerreviews/page=1/id=APPID/sortby=mostrecent/json
// ---------------------------------------------------------------------------

export async function fetchAppStoreReviews(
  appStoreId: string,
  _appName: string
): Promise<{ reviews: Review[]; usedFallback: boolean; fallbackReason?: string }> {
  try {
    const url = `https://itunes.apple.com/rss/customerreviews/page=1/id=${encodeURIComponent(
      appStoreId
    )}/sortby=mostrecent/json`;
    const res = await fetch(url, { headers: { "User-Agent": "ReviewPulse/1.0" } });
    if (!res.ok) {
      return {
        reviews: [],
        usedFallback: true,
        fallbackReason: `App Store RSS returned ${res.status}`,
      };
    }
    const json: any = await res.json();
    const entries = json?.feed?.entry ?? [];
    const reviews: Review[] = [];
    if (Array.isArray(entries)) {
      entries.forEach((e: any, idx: number) => {
        // first entry is the app itself — skip if it has no review content
        const rating = clampRating(parseInt(e?.["im:rating"]?.label ?? "", 10));
        const text = e?.content?.label;
        const title = e?.title?.label;
        const dateStr = e?.updated?.label;
        if (!text || !rating || !dateStr) return;
        const date = new Date(dateStr).toISOString().slice(0, 10);
        if (!withinWindow(date)) return;
        reviews.push({
          id: genId("as", idx),
          source: "app_store",
          rating,
          title: title ?? null,
          text,
          date,
          theme: null,
        });
      });
    }
    return { reviews, usedFallback: false };
  } catch (err) {
    return {
      reviews: [],
      usedFallback: true,
      fallbackReason: `App Store fetch failed: ${(err as Error).message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 3. PDF upload — server-side pdf-parse, then LLM extraction of review blocks.
// ---------------------------------------------------------------------------

export async function parsePdfReviews(
  pdfBuffer: ArrayBuffer,
  appName: string
): Promise<{ reviews: Review[]; usedFallback: boolean; fallbackReason?: string }> {
  try {
    // dynamic import — pdf-parse is CommonJS, we use dynamic import for safety
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(pdfBuffer, { max: 0 } as any);
    const text = data?.text ?? "";
    if (text.trim().length < 50) {
      return {
        reviews: [],
        usedFallback: true,
        fallbackReason: "PDF contained little or no extractable text.",
      };
    }
    const extracted = await llmExtractReviewsFromText(text, appName, "pdf_upload");
    const reviews = extracted
      .filter((r) => r.date && withinWindow(r.date))
      .map((r, idx) => ({
        id: genId("pdf", idx),
        source: "pdf_upload" as ReviewSource,
        rating: clampRating(r.rating) ?? 3,
        title: (r.title ?? null) as string | null,
        text: r.text ?? "",
        date: r.date,
        theme: null,
      }));
    return { reviews, usedFallback: false };
  } catch (err) {
    return {
      reviews: [],
      usedFallback: true,
      fallbackReason: `PDF parse failed: ${(err as Error).message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// 4. Image upload — GLM-4V (vision LLM) OCR + structured extraction in one
//    call. Better than a pure OCR library because it can also read star
//    ratings and dates as structured data, not just text glyphs.
// ---------------------------------------------------------------------------

export async function parseImageReviews(
  imageBase64: string,
  appName: string,
  mime = "image/png"
): Promise<{ reviews: Review[]; usedFallback: boolean; fallbackReason?: string }> {
  try {
    const zai = await getLLM();
    const dataUrl = imageBase64.startsWith("data:")
      ? imageBase64
      : `data:${mime};base64,${imageBase64}`;

    const sys =
      "You are an OCR-grade extraction pipeline. From the provided image of app store reviews, extract every review you can see. " +
      "Return STRICT JSON ONLY: an array of objects with fields: rating (1-5 int, null if unknown), title (string|null), text (string, the review body verbatim), date (ISO 8601 'YYYY-MM-DD' if visible, otherwise null). " +
      "Do NOT include usernames, emails, phone numbers, or any PII. If a field is unreadable, return null. If no reviews are visible, return [].";

    const resp = await zai.chat.completions.createVision({
      model: "glm-4v-plus",
      messages: [
        { role: "system", content: sys },
        {
          role: "user",
          content: [
            { type: "text", text: `App name context: ${appName}. Extract all reviews visible in this image.` },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    const content = resp?.choices?.[0]?.message?.content ?? "[]";
    const arr = safeJsonParseArr(content);
    const reviews: Review[] = arr
      .map((r: any, idx: number) => {
        const rating = clampRating(r.rating);
        if (!rating || !r.text || !r.date) return null;
        const date = typeof r.date === "string" ? r.date.slice(0, 10) : null;
        if (!date || !withinWindow(date)) return null;
        return {
          id: genId("img", idx),
          source: "image_upload" as ReviewSource,
          rating,
          title: (r.title ?? null) as string | null,
          text: r.text as string,
          date,
          theme: null,
        };
      })
      .filter((x): x is Review => x !== null);
    return { reviews, usedFallback: false };
  } catch (err) {
    return {
      reviews: [],
      usedFallback: true,
      fallbackReason: `Image OCR failed: ${(err as Error).message}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Shared LLM extraction helpers
// ---------------------------------------------------------------------------

interface ExtractedReview {
  rating: number | null;
  title: string | null;
  text: string;
  date: string | null;
}

async function llmExtractReviewsFromHtml(
  html: string,
  appName: string,
  source: string
): Promise<ExtractedReview[]> {
  return llmExtractReviewsFromText(html.slice(0, 30000), appName, source);
}

async function llmExtractReviewsFromText(
  text: string,
  appName: string,
  source: string
): Promise<ExtractedReview[]> {
  const zai = await getLLM();
  const sys =
    `You are an extraction pipeline. From the provided raw text dump (HTML or plain text), extract every app review you can identify for "${appName}". ` +
    "Return STRICT JSON ONLY: an array of objects with fields: rating (1-5 int, null if unknown), title (string|null), text (string, the review body), date (ISO 8601 'YYYY-MM-DD' if visible, otherwise null). " +
    "Do NOT include usernames, emails, phone numbers, or any PII. If a field is unreadable, return null. If no reviews are visible, return [].";
  const resp = await zai.chat.completions.create({
    model: "glm-4-plus",
    messages: [
      { role: "system", content: sys },
      {
        role: "user",
        content: `Source: ${source}. Text to extract from:\n\n${text.slice(0, 28000)}`,
      },
    ],
    temperature: 0.1,
  });
  const content = resp?.choices?.[0]?.message?.content ?? "[]";
  return safeJsonParseArr(content).map((r: any) => ({
    rating: typeof r.rating === "number" ? r.rating : null,
    title: typeof r.title === "string" ? r.title : null,
    text: typeof r.text === "string" ? r.text : "",
    date: typeof r.date === "string" ? r.date.slice(0, 10) : null,
  }));
}

function safeJsonParseArr(s: string): any[] {
  try {
    // LLMs sometimes wrap JSON in ```json fences — strip them.
    const cleaned = s
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // last-ditch: try to find the first [ ... ] block
    const match = s.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      return JSON.parse(match[0]);
    } catch {
      return [];
    }
  }
}

// ---------------------------------------------------------------------------
// Groww default flow — combines Play Store + App Store, falls back to sample
// ---------------------------------------------------------------------------

export async function importGrowwDefault(): Promise<{
  reviews: Review[];
  usedFallback: boolean;
  fallbackReason?: string;
}> {
  const [ps, as] = await Promise.all([
    fetchPlayStoreReviews(GROWW_PLAYSTORE_ID, "Groww"),
    fetchAppStoreReviews(GROWW_APPSTORE_ID, "Groww"),
  ]);
  const combined = [...ps.reviews, ...as.reviews];
  if (combined.length < 5) {
    const reason = [ps.fallbackReason, as.fallbackReason].filter(Boolean).join(" | ") ||
      "Live fetch returned too few reviews.";
    return { reviews: [], usedFallback: true, fallbackReason: reason };
  }
  return { reviews: combined, usedFallback: false };
}
