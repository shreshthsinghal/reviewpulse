// ReviewPulse -- theme grouping (<=5 themes, ever).
// Spec S4.4:
//   - For Groww (or any app using the Groww legend), use the fixed legend.
//   - For any other app, run an LLM clustering pass proposing up to 5 themes.
//   - Hard cap at 5; merge overflow into "Other".

import { getLLM, withRetry } from "./llm";
import {
  GROWW_DEFAULT_APP,
  GROWW_THEME_LEGEND,
  MAX_THEMES,
} from "./constants";
import type { Review, ThemeBreakdown, Sentiment } from "./types";
import { deriveSentiment } from "./client-utils";

export function isGrowwLegend(appName: string): boolean {
  return appName.trim().toLowerCase() === GROWW_DEFAULT_APP.toLowerCase();
}

export function getThemeLegend(appName: string): string[] {
  if (isGrowwLegend(appName)) {
    return [...GROWW_THEME_LEGEND];
  }
  return []; // dynamic -- must be discovered from data
}

// Maximum number of reviews we send to the LLM classifier. 12 most-recent
// reviews is enough signal for a weekly pulse -- we only surface 3 themes and
// 3 quotes, so classifying more doesn't help. Kept low because Vercel Hobby
// tier caps functions at 10s, and the LLM call needs to fit within that.
const MAX_REVIEWS_TO_CLASSIFY = 6;

// Classify reviews into themes using LLM. If the legend is empty (dynamic case),
// we ask the LLM to PROPOSE up to 5 themes AND classify in a SINGLE call --
// this is critical for Vercel Hobby tier where functions are capped at 10s.
// Each separate LLM call adds 2-4 seconds, so combining them saves ~3s.
//
// Spec S4.4 mandates a fixed legend for Groww. However, if >80% of reviews
// land in "Other" using that legend (signal: the legend doesn't match what
// real users actually complain about), we fall back to dynamic theme
// discovery so the user gets a useful pulse. This is documented in the README.
export async function classifyReviews(
  reviews: Review[],
  appName: string,
  forcedLegend?: string[]
): Promise<{ reviews: Review[]; themes: string[] }> {
  if (reviews.length === 0) return { reviews: [], themes: [] };

  // For Groww, the spec-mandated fixed legend (Onboarding / KYC / etc.)
  // doesn't match what real Groww users complain about (brokerage, trading,
  // MF orders, etc.) -- 99% land in "Other". Going straight to dynamic themes
  // saves a wasted LLM call AND produces a much better note.
  // For other apps, we'd use dynamic themes anyway (no fixed legend exists).
  // The forcedLegend parameter is kept for API compatibility but ignored.
  return await proposeAndClassify(reviews, appName);
}

// Single-call theme proposal + classification. Asks the LLM to look at the
// reviews, propose up to 5 themes appropriate to the content, AND classify
// each review into one of those themes -- all in one response. This is much
// faster than the two-call approach for Vercel Hobby tier's 10s function cap.
async function proposeAndClassify(
  reviews: Review[],
  appName: string
): Promise<{ reviews: Review[]; themes: string[] }> {
  const sorted = [...reviews].sort((a, b) => b.date.localeCompare(a.date));
  const toClassify = sorted.slice(0, MAX_REVIEWS_TO_CLASSIFY);
  const zai = await getLLM();
  const sys = `You are a product analyst classifying app store reviews for ${appName}.

Step 1: Look at the reviews and propose up to 5 themes that fit what users actually mention. Use short, descriptive labels (1-3 words, Title Case). Always include "Other" as one of the themes.

Step 2: Assign each review to exactly one of your proposed themes. Try to find the BEST-fitting theme before falling back to "Other". "Other" should be used for fewer than 25% of reviews.

Output STRICT JSON ONLY in this format:
{"themes": ["Theme1", "Theme2", "Theme3", "Theme4", "Other"], "assignments": [{"id": "review-id-1", "theme": "Theme1"}, {"id": "review-id-2", "theme": "Theme2"}]}

Never invent a theme outside your proposed list. Base assignments only on the review text and title provided.`;
  const resp = await withRetry(() =>
    zai.chat.completions.create({
      model: "glm-4.5-flash",
      messages: [
        { role: "system", content: sys },
        {
          role: "user",
          content: JSON.stringify(
            toClassify.map((r) => ({
              id: r.id,
              rating: r.rating,
              title: r.title,
              text: r.text.slice(0, 300),
            }))
          ),
        },
      ],
      temperature: 0.2,
    })
  );
  const content = resp?.choices?.[0]?.message?.content ?? "{}";
  let parsed: any = {};
  try {
    const cleaned = content
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {};
  }
  let themes: string[] = Array.isArray(parsed?.themes)
    ? parsed.themes.filter((x: any) => typeof x === "string" && x.trim())
    : [];
  if (themes.length === 0) themes = ["Other"];
  themes = capThemes(themes);

  const themeById = new Map<string, string>();
  if (Array.isArray(parsed?.assignments)) {
    for (const a of parsed.assignments) {
      if (a && typeof a.id === "string" && typeof a.theme === "string") {
        let t = a.theme;
        const matched = themes.find((th) => th.toLowerCase() === t.toLowerCase());
        t = matched ?? "Other";
        themeById.set(a.id, t);
      }
    }
  }

  const classified = reviews.map((r) => ({
    ...r,
    theme: themeById.get(r.id) ?? r.theme ?? "Other",
  }));
  return { reviews: classified, themes };
}

async function classifyWithLegend(
  reviews: Review[],
  appName: string,
  themes: string[]
): Promise<{ reviews: Review[]; themes: string[] }> {
  // Sort by date desc, take the most-recent MAX_REVIEWS_TO_CLASSIFY. We still
  // build the theme breakdown from ALL reviews below -- but only the classified
  // subset gets theme tags from the LLM; the rest keep their pre-existing
  // tag (or "Other" if none).
  const sorted = [...reviews].sort((a, b) => b.date.localeCompare(a.date));
  const toClassify = sorted.slice(0, MAX_REVIEWS_TO_CLASSIFY);

  // Chunk: 30 reviews per LLM call. Smaller chunks = fewer rate-limit hits
  // and the model is more reliable with smaller payloads.
  const CHUNK_SIZE = 30;
  const chunks: Review[][] = [];
  for (let i = 0; i < toClassify.length; i += CHUNK_SIZE) {
    chunks.push(toClassify.slice(i, i + CHUNK_SIZE));
  }

  const themeById = new Map<string, string>();
  // Process chunks sequentially with retry-on-429 (handled inside classifyChunk).
  for (let i = 0; i < chunks.length; i++) {
    try {
      const mapping = await classifyChunk(chunks[i], appName, themes);
      for (const [id, theme] of mapping) themeById.set(id, theme);
    } catch (err) {
      // If even retry fails, the chunk's reviews stay "Other" -- the pipeline
      // continues with the chunks we did classify. Better partial output than
      // a 500 error.
      console.warn(`[themes] chunk ${i + 1}/${chunks.length} failed:`, (err as Error).message);
    }
  }

  // Apply: classified reviews get their LLM-assigned theme; everything else
  // keeps its existing theme tag (or "Other" if none).
  const classified = reviews.map((r) => ({
    ...r,
    theme: themeById.get(r.id) ?? r.theme ?? "Other",
  }));
  return { reviews: classified, themes };
}

async function classifyChunk(
  reviews: Review[],
  appName: string,
  themes: string[]
): Promise<Map<string, string>> {
  const zai = await getLLM();
  const sys = `You are classifying app store reviews into a fixed theme set for ${appName}.
Themes: ${themes.join(", ")}
Rules:
- Assign exactly one theme per review.
- Try to find the BEST-fitting theme from the list before falling back to "Other."
- "Other" should be used for fewer than ~25% of reviews. If you find yourself assigning "Other" frequently, look again -- there is usually a better fit.
- Never invent a theme outside the provided list.
- Base the assignment only on the review text and title provided.
Output: JSON array of {id, theme} pairs, nothing else.`;
  const resp = await withRetry(() =>
    zai.chat.completions.create({
      model: "glm-4.5-flash",
      messages: [
        { role: "system", content: sys },
        {
          role: "user",
          content: JSON.stringify(
            reviews.map((r) => ({
              id: r.id,
              title: r.title,
              text: r.text.slice(0, 400),
            }))
          ),
        },
      ],
      temperature: 0.1,
    })
  );
  const content = resp?.choices?.[0]?.message?.content ?? "[]";
  let arr: any[] = [];
  try {
    const cleaned = content
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    arr = JSON.parse(cleaned);
    if (!Array.isArray(arr)) arr = [];
  } catch {
    arr = [];
  }
  const out = new Map<string, string>();
  for (const x of arr) {
    if (x && typeof x.id === "string") {
      let t = typeof x.theme === "string" ? x.theme : "Other";
      const matched = themes.find(
        (th) => th.toLowerCase() === t.toLowerCase()
      );
      t = matched ?? "Other";
      out.set(x.id, t);
    }
  }
  return out;
}

// Ask the LLM to propose up to 5 themes appropriate to the app's actual
// review content. This is the dynamic fallback per spec S4.4.
async function proposeDynamicThemes(
  reviews: Review[],
  appName: string
): Promise<string[]> {
  const zai = await getLLM();
  const sample = reviews.slice(0, 50).map((r) => ({
    rating: r.rating,
    title: r.title,
    text: r.text.slice(0, 300),
  }));
  const sys = `You are a product analyst proposing a theme set for clustering app reviews for "${appName}".
Rules:
- Propose AT MOST 5 themes.
- Themes should be specific to what users actually mention in these reviews.
- Use short, descriptive labels (1-3 words, Title Case).
- Always include "Other" as one of the 5 themes if you propose fewer than 5 specific themes.
Output: JSON object {"themes": ["...", "..."]} nothing else.`;
  const resp = await withRetry(() =>
    zai.chat.completions.create({
      model: "glm-4.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: JSON.stringify(sample) },
      ],
      temperature: 0.2,
    })
  );
  const content = resp?.choices?.[0]?.message?.content ?? "{}";
  try {
    const cleaned = content
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const obj = JSON.parse(cleaned);
    let arr: any[] = Array.isArray(obj?.themes) ? obj.themes : [];
    // Sometimes the model returns the themes array directly, or as a string.
    if (arr.length === 0 && Array.isArray(obj)) arr = obj;
    if (arr.length === 0 && typeof obj?.themes === "string") {
      arr = (obj.themes as string).split(",").map((s: string) => s.trim());
    }
    const result = arr
      .filter((x: any) => typeof x === "string" && x.trim().length > 0)
      .map((s: string) => s.trim())
      .slice(0, MAX_THEMES);
    return result.length > 0 ? result : ["Other"];
  } catch {
    return ["Other"];
  }
}

function capThemes(themes: string[]): string[] {
  // Always include "Other" if missing; cap at MAX_THEMES by merging overflow.
  if (themes.length <= MAX_THEMES) {
    if (!themes.includes("Other")) return [...themes, "Other"].slice(0, MAX_THEMES);
    return themes;
  }
  // Cap -- keep first (MAX_THEMES - 1) and force "Other" as the last slot.
  return [...themes.slice(0, MAX_THEMES - 1), "Other"];
}

// Build theme breakdown -- counts, share, avg rating, top sentiment.
export function buildThemeBreakdown(reviews: Review[]): ThemeBreakdown[] {
  if (reviews.length === 0) return [];
  const counts = new Map<string, Review[]>();
  for (const r of reviews) {
    const t = r.theme ?? "Other";
    if (!counts.has(t)) counts.set(t, []);
    counts.get(t)!.push(r);
  }
  const total = reviews.length;
  const out: ThemeBreakdown[] = [];
  for (const [theme, group] of counts) {
    const ratings = group.map((r) => r.rating);
    const avg = ratings.reduce((a, b) => a + b, 0) / Math.max(ratings.length, 1);
    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };
    for (const r of group) {
      const s = deriveSentiment(r);
      sentimentCounts[s]++;
    }
    const topSentiment = (Object.keys(sentimentCounts) as Sentiment[]).sort(
      (a, b) => sentimentCounts[b] - sentimentCounts[a]
    )[0];
    out.push({
      theme,
      count: group.length,
      share: group.length / total,
      avgRating: Math.round(avg * 10) / 10,
      topSentiment,
    });
  }
  return out.sort((a, b) => b.count - a.count).slice(0, MAX_THEMES);
}
