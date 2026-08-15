// ReviewPulse -- client-safe sentiment + chart data helpers.
// Pure functions only. No server-only imports. Safe to use in client components.

import type {
  RatingDistribution,
  RatingTrendPoint,
  Review,
  Sentiment,
  SentimentSplit,
} from "./types";

export function deriveSentiment(r: Review): Sentiment {
  if (r.rating >= 4) return "positive";
  if (r.rating <= 2) return "negative";
  return "neutral";
}

export function buildSentimentSplit(reviews: Review[]): SentimentSplit {
  const s: SentimentSplit = { positive: 0, neutral: 0, negative: 0 };
  for (const r of reviews) s[deriveSentiment(r)]++;
  return s;
}

export function buildRatingDistribution(
  reviews: Review[]
): RatingDistribution[] {
  const counts = [0, 0, 0, 0, 0];
  for (const r of reviews) counts[r.rating - 1]++;
  return [1, 2, 3, 4, 5].map((rating) => ({
    rating: rating as 1 | 2 | 3 | 4 | 5,
    count: counts[rating - 1],
  }));
}

export function buildRatingTrend(reviews: Review[]): RatingTrendPoint[] {
  const byWeek = new Map<string, number[]>();
  for (const r of reviews) {
    const d = new Date(r.date);
    if (Number.isNaN(d.getTime())) continue;
    const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayNum = (tmp.getUTCDay() + 6) % 7;
    const monday = new Date(tmp);
    monday.setUTCDate(tmp.getUTCDate() - dayNum);
    const key = monday.toISOString().slice(0, 10);
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key)!.push(r.rating);
  }
  return Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, ratings]) => ({
      week: week.slice(5),
      avg: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10,
      count: ratings.length,
    }));
}
