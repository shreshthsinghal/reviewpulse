// GET /api/playstore-search?q=<query>
// Returns app name autocomplete results from Play Store's public listing.
// Uses google-play-scraper (no auth, public listing) -- does NOT require an
// LLM key. The downstream /api/pipeline route is what needs the LLM (for
// classification, note generation, etc.); this route just searches the listing.

import { NextRequest, NextResponse } from "next/server";
import { searchPlayStoreApps } from "@/lib/pipeline/importers";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
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
