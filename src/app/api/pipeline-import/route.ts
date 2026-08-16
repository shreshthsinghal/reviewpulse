// POST /api/pipeline-import
// Stage 1 of 4: Fetch live Groww reviews from Play Store.
// Fits within Vercel Hobby tier's 10s function timeout (~1-3s typically).

import { NextResponse } from "next/server";
import type { Review } from "@/lib/pipeline/types";
import { importGrowwDefault } from "@/lib/pipeline/importers";
import { hasLLMKey, isSandboxCredentials } from "@/lib/pipeline/llm";
import { GROWW_DEFAULT_APP } from "@/lib/pipeline/constants";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST() {
  const canCallLLM = await hasLLMKey();
  const useRealLLM = canCallLLM && !isSandboxCredentials();
  if (!useRealLLM) {
    return NextResponse.json(
      {
        error:
          "GLM_API_KEY is not set or is invalid. Get your own GLM API key from https://z.ai/, set it as the GLM_API_KEY env var, then redeploy.",
      },
      { status: 503 }
    );
  }

  const appName = GROWW_DEFAULT_APP;
  let reviews: Review[] = [];
  let usedFallback = false;
  let fallbackReason: string | undefined;

  try {
    const r = await importGrowwDefault();
    reviews = r.reviews;
    usedFallback = r.usedFallback;
    fallbackReason = r.fallbackReason;
  } catch (err) {
    return NextResponse.json(
      { error: `Import failed: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  if (reviews.length === 0) {
    return NextResponse.json(
      { error: `No Groww reviews found in the last 8-12 weeks.${fallbackReason ? " Reason: " + fallbackReason : ""}` },
      { status: 422 }
    );
  }

  return NextResponse.json({
    reviews,
    appName,
    usedFallback,
    fallbackReason,
    reviewCount: reviews.length,
  });
}
