// POST /api/pipeline-import
// Stage 1 of 4: Import reviews from the configured source.
// Returns reviews + meta. This is a separate endpoint so each stage fits
// within Vercel Hobby tier's 10s function timeout.

import { NextRequest, NextResponse } from "next/server";
import type { AppInput, Review } from "@/lib/pipeline/types";
import {
  importGrowwDefault,
  fetchPlayStoreReviews,
  parsePdfReviews,
  parseImageReviews,
} from "@/lib/pipeline/importers";
import { getSampleGrowwReviews } from "@/lib/pipeline/sample-data";
import { hasLLMKey } from "@/lib/pipeline/llm";
import { GROWW_DEFAULT_APP } from "@/lib/pipeline/constants";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const input = body?.input as AppInput | undefined;
  if (!input || !input.kind) {
    return NextResponse.json({ error: "Missing input.kind" }, { status: 400 });
  }

  const canCallLLM = await hasLLMKey();
  if (!canCallLLM && input.kind !== "groww_default") {
    return NextResponse.json(
      {
        error:
          "GLM_API_KEY is not set on this deployment. The Groww default flow uses bundled sample data, but the alternate-app flow needs an LLM for classification and note generation. Add GLM_API_KEY as a Vercel env var, redeploy, then try again.",
      },
      { status: 503 }
    );
  }

  let reviews: Review[] = [];
  let usedFallback = false;
  let fallbackReason: string | undefined;
  let appName = GROWW_DEFAULT_APP;

  try {
    if (input.kind === "groww_default") {
      appName = GROWW_DEFAULT_APP;
      if (canCallLLM) {
        const r = await importGrowwDefault();
        reviews = r.reviews;
        usedFallback = r.usedFallback;
        fallbackReason = r.fallbackReason;
      } else {
        usedFallback = true;
        fallbackReason = "GLM_API_KEY not set in this environment.";
      }
      if (reviews.length < 5) {
        reviews = getSampleGrowwReviews();
        usedFallback = true;
        fallbackReason =
          fallbackReason ?? "Live fetch returned too few reviews; using bundled sample.";
      }
    } else if (input.kind === "playstore_search") {
      appName = input.appName?.trim() || "Selected app";
      if (!input.appId) {
        return NextResponse.json(
          { error: "playstore_search requires appId" },
          { status: 400 }
        );
      }
      const r = await fetchPlayStoreReviews(input.appId, appName, { maxPages: 2 });
      reviews = r.reviews;
      usedFallback = r.usedFallback;
      fallbackReason = r.fallbackReason;
    } else if (input.kind === "pdf") {
      appName = input.appName?.trim() || "Uploaded PDF";
      if (!input.fileDataUrl) {
        return NextResponse.json({ error: "pdf upload requires fileDataUrl" }, { status: 400 });
      }
      const buf = await fetch(input.fileDataUrl).then((r) => r.arrayBuffer());
      const r = await parsePdfReviews(buf, appName);
      reviews = r.reviews;
      usedFallback = r.usedFallback;
      fallbackReason = r.fallbackReason;
    } else if (input.kind === "image") {
      appName = input.appName?.trim() || "Uploaded image";
      if (!input.fileDataUrl) {
        return NextResponse.json({ error: "image upload requires fileDataUrl" }, { status: 400 });
      }
      const r = await parseImageReviews(input.fileDataUrl, appName);
      reviews = r.reviews;
      usedFallback = r.usedFallback;
      fallbackReason = r.fallbackReason;
    } else {
      return NextResponse.json({ error: `Unknown input.kind: ${input.kind}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: `Import stage error: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  if (reviews.length === 0) {
    return NextResponse.json(
      { error: usedFallback ? `Live fetch failed: ${fallbackReason}` : "No reviews found in the last 8-12 weeks for this source." },
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
