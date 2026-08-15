// POST /api/pipeline-note
// Stage 3 of 4: Generate the weekly one-page note.
// Takes classified reviews + theme breakdown from stage 2, returns the note.

import { NextRequest, NextResponse } from "next/server";
import type { Review, ThemeBreakdown } from "@/lib/pipeline/types";
import { generateWeeklyNote, defaultDateRange } from "@/lib/pipeline/note";
import { hasLLMKey, isSandboxCredentials } from "@/lib/pipeline/llm";

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
  const appName: string = body?.appName ?? "Selected app";
  const dateRange = body?.dateRange ?? defaultDateRange();

  if (!Array.isArray(reviews) || reviews.length === 0) {
    return NextResponse.json({ error: "Missing reviews" }, { status: 400 });
  }

  const canCallLLM = await hasLLMKey();
  const useRealLLM = canCallLLM && !isSandboxCredentials();

  // Build a structured fallback note from the raw data -- used when LLM is
  // unavailable OR when the LLM call fails (rate limit, timeout, etc.).
  const buildFallbackNote = (warning: string) => ({
    note: {
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
    },
    warning,
  });

  if (!useRealLLM) {
    const warning = isSandboxCredentials()
      ? "Using structured fallback note (sandbox LLM credentials can't be used from Vercel). Set your own GLM_API_KEY to enable LLM-generated notes."
      : "Using structured fallback note (GLM_API_KEY not set). Set GLM_API_KEY to enable LLM-generated notes.";
    return NextResponse.json(buildFallbackNote(warning));
  }

  try {
    const note = await generateWeeklyNote(reviews, themes, appName, dateRange);
    return NextResponse.json({ note });
  } catch (err) {
    const msg = (err as Error).message ?? "note generation failed";
    return NextResponse.json(
      buildFallbackNote(`LLM note generation failed (${msg}). Showing structured fallback.`)
    );
  }
}
