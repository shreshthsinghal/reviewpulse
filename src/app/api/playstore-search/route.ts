// GET /api/playstore-search?q=<query>
// Returns app name autocomplete results from Play Store's public listing.
// Uses the z-ai-web-dev-sdk web_search function (no auth, public search).

import { NextRequest, NextResponse } from "next/server";
import { searchPlayStoreApps } from "@/lib/pipeline/importers";
import { hasLLMKey } from "@/lib/pipeline/llm";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }
  const llmAvailable = await hasLLMKey();
  if (!llmAvailable) {
    return NextResponse.json({
      results: [],
      error: "GLM_API_KEY not set — Play Store search unavailable in this environment.",
    });
  }
  try {
    const results = await searchPlayStoreApps(q);
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { results: [], error: (err as Error).message },
      { status: 500 }
    );
  }
}
