// POST /api/pipeline-group
// Stage 2 of 4: PII scrub + theme classification.
// Takes reviews + appName from stage 1, returns classified reviews + themes.

import { NextRequest, NextResponse } from "next/server";
import type { Review } from "@/lib/pipeline/types";
import { scrubReviews } from "@/lib/pipeline/pii-scrub";
import {
  buildThemeBreakdown,
  classifyReviews,
  getThemeLegend,
  isGrowwLegend,
} from "@/lib/pipeline/themes";
import { hasLLMKey } from "@/lib/pipeline/llm";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const reviews: Review[] = body?.reviews ?? [];
  const appName: string = body?.appName ?? "Selected app";
  if (!Array.isArray(reviews) || reviews.length === 0) {
    return NextResponse.json({ error: "Missing or empty reviews array" }, { status: 400 });
  }

  const canCallLLM = await hasLLMKey();
  const scrubbed = scrubReviews(reviews);
  let themeList: string[] = [];
  let classified: Review[] = scrubbed;

  if (canCallLLM) {
    try {
      const forced = isGrowwLegend(appName) ? getThemeLegend(appName) : undefined;
      const cls = await classifyReviews(scrubbed, appName, forced);
      classified = cls.reviews;
      themeList = cls.themes;
    } catch (err) {
      const msg = (err as Error).message ?? "classification failed";
      classified = scrubbed.map((r) => ({
        ...r,
        theme: r.rating >= 4 ? "Positive feedback" : r.rating <= 2 ? "Critical feedback" : "Mixed feedback",
      }));
      themeList = ["Positive feedback", "Critical feedback", "Mixed feedback", "Other"];
      return NextResponse.json({
        reviews: classified,
        themes: themeList,
        themeBreakdown: buildThemeBreakdown(classified),
        warning: `Themes unavailable -- using rating-based fallback. Classifier error: ${msg}`,
      });
    }
  } else {
    themeList = Array.from(new Set(scrubbed.map((r) => r.theme ?? "Other"))).slice(0, 5);
  }

  return NextResponse.json({
    reviews: classified,
    themes: themeList,
    themeBreakdown: buildThemeBreakdown(classified),
  });
}
