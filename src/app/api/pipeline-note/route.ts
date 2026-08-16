// POST /api/pipeline-note
// Stage 3 of 4: Generate the weekly one-page note.
// Fits within Vercel Hobby tier's 10s function timeout.

import { NextRequest, NextResponse } from "next/server";
import type { Review, ThemeBreakdown } from "@/lib/pipeline/types";
import { generateWeeklyNote, defaultDateRange } from "@/lib/pipeline/note";

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
  const themes: ThemeBreakdown[] = body?.themes ?? [];
  const appName: string = body?.appName ?? "Groww";
  const dateRange = body?.dateRange ?? defaultDateRange();

  if (!Array.isArray(reviews) || reviews.length === 0) {
    return NextResponse.json({ error: "Missing reviews" }, { status: 400 });
  }

  try {
    const note = await generateWeeklyNote(reviews, themes, appName, dateRange);
    return NextResponse.json({ note });
  } catch (err) {
    const msg = (err as Error).message ?? "note generation failed";
    const fallbackNote = {
      appName,
      dateRange,
      markdown: `## Top Themes\n${themes.slice(0, 3).map((t) => `- ${t.theme} (${Math.round(t.share * 100)}%, ${t.count} reviews, avg ${t.avgRating} stars)`).join("\n")}\n\n## What Users Are Saying\n${reviews.slice(0, 3).map((r) => `- (${r.rating} stars): "${r.text.slice(0, 140)}"`).join("\n")}\n\n## Action Ideas\n- Review the top theme above with the product team\n- Investigate the lowest-rated reviews for specific issues\n- Confirm the date range covers the most recent week`,
      wordCount: 0,
      topThemes: themes.slice(0, 3).map((t) => t.theme),
      quotes: reviews.slice(0, 3).map((r) => ({
        text: r.text.slice(0, 200),
        theme: r.theme ?? "Other",
        rating: r.rating,
      })),
      actions: [
        { text: "Review the top theme above with the product team", theme: "Mixed" },
        { text: "Investigate the lowest-rated reviews for specific issues", theme: "Mixed" },
        { text: "Confirm the date range covers the most recent week", theme: "Mixed" },
      ],
    };
    return NextResponse.json({ note: fallbackNote, warning: `LLM note generation failed (${msg}). Showing structured fallback.` });
  }
}
