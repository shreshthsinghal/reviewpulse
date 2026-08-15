// ReviewPulse — pipeline API.
// POST /api/pipeline
// Body: { input: AppInput }
// Returns: PipelineResult (with all 4 stage outputs).
//
// This is the single orchestration endpoint for the 4-stage pipeline:
//   1. Import — fetch reviews (Play Store / App Store / PDF / image / sample)
//   2. Group  — PII scrub + theme classification
//   3. Note   — generate weekly note (≤250w, 3+3+3)
//   4. Email  — draft subject + body
//
// All four stages run server-side. The LLM is invoked via the z-ai-web-dev-sdk.
// If the LLM key is not set OR live fetching fails, we fall back to the bundled
// sample dataset (per spec §5.3) and say so in the response meta.

import { NextRequest, NextResponse } from "next/server";
import type {
  AppInput,
  PipelineResult,
  PipelineStageState,
  Review,
} from "@/lib/pipeline/types";
import {
  importGrowwDefault,
  fetchPlayStoreReviews,
  parsePdfReviews,
  parseImageReviews,
} from "@/lib/pipeline/importers";
import { getSampleGrowwReviews } from "@/lib/pipeline/sample-data";
import { scrubReviews } from "@/lib/pipeline/pii-scrub";
import {
  buildThemeBreakdown,
  classifyReviews,
  getThemeLegend,
  isGrowwLegend,
} from "@/lib/pipeline/themes";
import { generateWeeklyNote, defaultDateRange } from "@/lib/pipeline/note";
import { draftEmail } from "@/lib/pipeline/email";
import { hasLLMKey } from "@/lib/pipeline/llm";
import { GROWW_DEFAULT_APP } from "@/lib/pipeline/constants";

export const runtime = "nodejs";
export const maxDuration = 300;

function stage(id: string, label: string): PipelineStageState {
  return { id: id as PipelineStageState["id"], label, status: "pending", message: "" };
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const input = body?.input as AppInput | undefined;
  if (!input || !input.kind) {
    return NextResponse.json(
      { error: "Missing input.kind" },
      { status: 400 }
    );
  }

  // If no LLM key, we can still ship a sample-based demo so the UI is
  // explorable in a preview environment without secrets. hasLLMKey() also
  // checks /etc/.z-ai-config so sandboxed envs with auto-configured SDK
  // credentials are treated as "LLM available".
  const canCallLLM = await hasLLMKey();

  const stages: PipelineStageState[] = [
    stage("import", "Import"),
    stage("group", "Group"),
    stage("note", "Generate Note"),
    stage("email", "Draft Email"),
  ];
  const setStage = (id: string, patch: Partial<PipelineStageState>) => {
    const idx = stages.findIndex((s) => s.id === id);
    if (idx >= 0) stages[idx] = { ...stages[idx], ...patch };
  };

  // ---------------------------------------------------------------- 1. Import
  setStage("import", { status: "active", message: "Fetching reviews…" });
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
        // fall back to sample
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
      const r = await fetchPlayStoreReviews(input.appId, appName);
      reviews = r.reviews;
      usedFallback = r.usedFallback;
      fallbackReason = r.fallbackReason;
    } else if (input.kind === "pdf") {
      appName = input.appName?.trim() || "Uploaded PDF";
      if (!input.fileDataUrl) {
        return NextResponse.json(
          { error: "pdf upload requires fileDataUrl" },
          { status: 400 }
        );
      }
      const buf = await fetch(input.fileDataUrl).then((r) => r.arrayBuffer());
      const r = await parsePdfReviews(buf, appName);
      reviews = r.reviews;
      usedFallback = r.usedFallback;
      fallbackReason = r.fallbackReason;
    } else if (input.kind === "image") {
      appName = input.appName?.trim() || "Uploaded image";
      if (!input.fileDataUrl) {
        return NextResponse.json(
          { error: "image upload requires fileDataUrl" },
          { status: 400 }
        );
      }
      const r = await parseImageReviews(input.fileDataUrl, appName);
      reviews = r.reviews;
      usedFallback = r.usedFallback;
      fallbackReason = r.fallbackReason;
    } else {
      return NextResponse.json(
        { error: `Unknown input.kind: ${input.kind}` },
        { status: 400 }
      );
    }
  } catch (err) {
    usedFallback = true;
    fallbackReason = `Import stage error: ${(err as Error).message}`;
    if (input.kind === "groww_default") {
      reviews = getSampleGrowwReviews();
    } else {
      // for non-default apps, no fallback — surface the error
      setStage("import", {
        status: "error",
        message: fallbackReason,
      });
      return NextResponse.json(
        { error: fallbackReason },
        { status: 500 }
      );
    }
  }

  if (reviews.length === 0) {
    setStage("import", {
      status: "error",
      message:
        usedFallback
          ? `Live fetch failed and no fallback available: ${fallbackReason}`
          : "No reviews found in the last 8–12 weeks for this source.",
    });
    return NextResponse.json(
      {
        error: usedFallback
          ? `Live fetch failed and no fallback available. Reason: ${fallbackReason}`
          : "No reviews found in the last 8–12 weeks.",
      },
      { status: 422 }
    );
  }

  setStage("import", {
    status: "done",
    message: usedFallback
      ? `Imported ${reviews.length} reviews (sample fallback).`
      : `Imported ${reviews.length} reviews from source.`,
    detail: fallbackReason,
  });

  // ---------------------------------------------------------------- 2. Group
  setStage("group", { status: "active", message: "Scrubbing PII + classifying themes…" });
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
      // If classification fails entirely (rate limit, network), fall back to
      // a simple rating-based pseudo-theming so the pipeline still produces a
      // note. We surface the issue in the group stage detail.
      const msg = (err as Error).message ?? "classification failed";
      setStage("group", {
        status: "done",
        message: `Themes unavailable — using rating-based fallback.`,
        detail: `Classifier error: ${msg}`,
      });
      // Simple fallback: tag by rating bucket. Better than "Other" for all.
      classified = scrubbed.map((r) => ({
        ...r,
        theme:
          r.rating >= 4 ? "Positive feedback" :
          r.rating <= 2 ? "Critical feedback" :
          "Mixed feedback",
      }));
      themeList = ["Positive feedback", "Critical feedback", "Mixed feedback", "Other"];
    }
  } else {
    // sample fallback already has theme tags from seeds
    themeList = Array.from(
      new Set(scrubbed.map((r) => r.theme ?? "Other"))
    ).slice(0, 5);
  }
  const themes = buildThemeBreakdown(classified);
  setStage("group", {
    status: "done",
    message: `${themes.length} themes identified.`,
  });

  // ---------------------------------------------------------------- 3. Note
  setStage("note", { status: "active", message: "Generating weekly note…" });
  const dateRange = defaultDateRange();
  let note;
  try {
    note = await generateWeeklyNote(classified, themes, appName, dateRange);
  } catch (err) {
    // If note generation fails (rate limit, network), produce a minimal
    // note from the raw data so the user still gets *something* useful.
    const msg = (err as Error).message ?? "note generation failed";
    note = {
      appName,
      dateRange,
      markdown: `## Top Themes\n${themes.slice(0, 3).map((t) => `- ${t.theme} (${Math.round(t.share * 100)}%, ${t.count} reviews, avg ${t.avgRating}★)`).join("\n")}\n\n## What Users Are Saying\n${classified.slice(0, 3).map((r) => `- (${r.rating}★): "${r.text.slice(0, 140)}"`).join("\n")}\n\n## Action Ideas\n- Review the top theme above with the product team\n- Investigate the lowest-rated reviews for specific issues\n- Confirm the date range covers the most recent week\n\n<!-- Note: LLM note generation failed (${msg}). Showing structured fallback. -->`,
      wordCount: 0,
      topThemes: themes.slice(0, 3).map((t) => t.theme),
      quotes: classified.slice(0, 3).map((r) => ({
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
  }
  setStage("note", {
    status: "done",
    message: `Note generated — ${note.wordCount} words.`,
  });

  // ---------------------------------------------------------------- 4. Email
  setStage("email", { status: "active", message: "Drafting email…" });
  let email;
  try {
    email = await draftEmail(note);
  } catch {
    email = {
      subject: `${appName} weekly review pulse`.slice(0, 60),
      body: note.markdown,
    };
  }
  setStage("email", {
    status: "done",
    message: "Email draft ready.",
  });

  const result: PipelineResult = {
    reviews: classified,
    themes,
    note,
    email,
    stages,
    meta: {
      appName,
      source:
        input.kind === "groww_default"
          ? "sample"
          : input.kind === "playstore_search"
          ? "play_store"
          : input.kind === "pdf"
          ? "pdf_upload"
          : "image_upload",
      dateRange,
      reviewCount: classified.length,
      usedFallback,
      fallbackReason,
    },
  };

  return NextResponse.json(result);
}
