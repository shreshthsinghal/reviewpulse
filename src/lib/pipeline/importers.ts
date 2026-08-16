// ReviewPulse -- review importers.
// All paths resolve to the same internal Review schema (no PII fields by design).
// PII scrubbing happens in a separate pass downstream -- these importers ONLY
// normalize raw text/rating/date out of the source.

import type { Review, ReviewSource } from "./types";
import { getLLM, withRetry } from "./llm";
import { GROWW_PLAYSTORE_ID, REVIEW_WINDOW_WEEKS_MAX } from "./constants";

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
// Play Store -- public listing only. Uses google-play-scraper (no auth, no
// Play Console / Developer API). Same data any browser user sees on the
// public listing page. See README for ToS implications.
// ---------------------------------------------------------------------------

async function getScraper() {
  return (await import("google-play-scraper")).default;
}

export async function fetchPlayStoreReviews(
  appId: string,
  appName: string,
  opts: { maxPages?: number } = {}
): Promise<{ reviews: Review[]; usedFallback: boolean; fallbackReason?: string }> {
  try {
    const scraper = await getScraper();
    // Fetch newest reviews -- paginate up to maxPages (default 3 = ~150 reviews).
    // The 8-12 week window is enforced by withinWindow() below.
    const maxPages = opts.maxPages ?? 3;
    const collected: any[] = [];
    let pageNum = 0;
    while (pageNum < maxPages) {
      const r: any = await scraper.reviews({
        appId,
        sort: scraper.sort.NEWEST,
        num: 50,
        page: pageNum,
        lang: "en",
        country: "us",
        paginate: false,
      });
      const data = Array.isArray(r?.data) ? r.data : [];
      if (data.length === 0) break;
      collected.push(...data);
      // Stop early if reviews are older than our window
      const oldest = data[data.length - 1];
      if (oldest?.date && !withinWindow(oldest.date)) break;
      if (r?.nextPaginationToken == null) break;
      pageNum++;
    }

    const reviews: Review[] = collected
      .filter((x: any) => x?.text && typeof x.score === "number" && x.date)
      .filter((x: any) => withinWindow(x.date))
      .map((x: any, idx: number) => ({
        id: genId("ps", idx),
        source: "play_store" as ReviewSource,
        rating: clampRating(x.score) ?? 3,
        // Drop the userName -- PII -- at ingestion. The schema has no field
        // for it, so we just don't carry it forward.
        title: typeof x.title === "string" && x.title.trim() ? x.title : null,
        text: x.text ?? "",
        date: new Date(x.date).toISOString().slice(0, 10),
        theme: null,
      }));

    if (reviews.length === 0) {
      return {
        reviews: [],
        usedFallback: true,
        fallbackReason: `No reviews in last ${REVIEW_WINDOW_WEEKS_MAX} weeks for ${appName} (${appId}).`,
      };
    }
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
// Groww flow -- live Play Store fetch (real-time). No sample fallback.
// ---------------------------------------------------------------------------

export async function importGrowwDefault(): Promise<{
  reviews: Review[];
  usedFallback: boolean;
  fallbackReason?: string;
}> {
  // Fetch up to 3 pages (~150 reviews) of newest Play Store reviews for Groww.
  // The 8-12 week window is enforced downstream by withinWindow().
  const ps = await fetchPlayStoreReviews(GROWW_PLAYSTORE_ID, "Groww", { maxPages: 3 });
  return ps;
}
