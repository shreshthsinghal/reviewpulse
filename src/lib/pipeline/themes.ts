// ReviewPulse — theme grouping (≤5 themes, ever).
// Spec §4.4:
//   - For Groww (or any app using the Groww legend), use the fixed legend.
//   - For any other app, run an LLM clustering pass proposing up to 5 themes.
//   - Hard cap at 5; merge overflow into "Other".

import { getLLM } from "./llm";
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
  return []; // dynamic — must be discovered from data
}

// Classify reviews into themes using LLM. If the legend is empty (dynamic case),
// we first ask the LLM to PROPOSE up to 5 themes from the data, then classify.
export async function classifyReviews(
  reviews: Review[],
  appName: string,
  forcedLegend?: string[]
): Promise<{ reviews: Review[]; themes: string[] }> {
  if (reviews.length === 0) return { reviews: [], themes: [] };

  let themes = forcedLegend ?? getThemeLegend(appName);
  if (themes.length === 0) {
    themes = await proposeDynamicThemes(reviews, appName);
  }
  themes = capThemes(themes);
  const zai = await getLLM();
  const sys = `You are classifying app store reviews into a fixed theme set for ${appName}.
Themes: ${themes.join(", ")}
Rules:
- Assign exactly one theme per review.
- If nothing fits well, use "Other."
- Never invent a theme outside the provided list.
- Base the assignment only on the review text and title provided.
Output: JSON array of {id, theme} pairs, nothing else.`;
  const resp = await zai.chat.completions.create({
    model: "glm-4-plus",
    messages: [
      { role: "system", content: sys },
      {
        role: "user",
        content: JSON.stringify(
          reviews.map((r) => ({
            id: r.id,
            title: r.title,
            text: r.text.slice(0, 500),
          }))
        ),
      },
    ],
    temperature: 0.1,
  });
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
  const themeById = new Map<string, string>();
  for (const x of arr) {
    if (x && typeof x.id === "string") {
      let t = typeof x.theme === "string" ? x.theme : "Other";
      // snap to legend (case-insensitive match) or "Other"
      const matched = themes.find(
        (th) => th.toLowerCase() === t.toLowerCase()
      );
      t = matched ?? "Other";
      themeById.set(x.id, t);
    }
  }
  const classified = reviews.map((r) => ({
    ...r,
    theme: themeById.get(r.id) ?? "Other",
  }));
  return { reviews: classified, themes };
}

// Ask the LLM to propose up to 5 themes appropriate to the app's actual
// review content. This is the dynamic fallback per spec §4.4.
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
  const resp = await zai.chat.completions.create({
    model: "glm-4-plus",
    messages: [
      { role: "system", content: sys },
      { role: "user", content: JSON.stringify(sample) },
    ],
    temperature: 0.2,
  });
  const content = resp?.choices?.[0]?.message?.content ?? "{}";
  try {
    const cleaned = content
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const obj = JSON.parse(cleaned);
    const arr = Array.isArray(obj?.themes) ? obj.themes : [];
    return arr.filter((x: any) => typeof x === "string").slice(0, MAX_THEMES);
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
  // Cap — keep first (MAX_THEMES - 1) and force "Other" as the last slot.
  return [...themes.slice(0, MAX_THEMES - 1), "Other"];
}

// Build theme breakdown — counts, share, avg rating, top sentiment.
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
