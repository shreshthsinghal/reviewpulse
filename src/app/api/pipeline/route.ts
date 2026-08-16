// ReviewPulse -- single pipeline endpoint.
// POST /api/pipeline
// No body needed (Groww-only mode).
// Runs the full 4-stage pipeline against LIVE Play Store reviews for Groww,
// fetched fresh each time (real-time, not cached sample data).

import { NextResponse } from "next/server";
import type {
  PipelineResult,
  PipelineStageState,
  Review,
} from "@/lib/pipeline/types";
import { importGrowwDefault } from "@/lib/pipeline/importers";
import { scrubReviews } from "@/lib/pipeline/pii-scrub";
import {
  buildThemeBreakdown,
  classifyReviews,
  getThemeLegend,
  isGrowwLegend,
} from "@/lib/pipeline/themes";
import { generateWeeklyNote, defaultDateRange } from "@/lib/pipeline/note";
import { draftEmail } from "@/lib/pipeline/email";
import { hasLLMKey, isSandboxCredentials } from "@/lib/pipeline/llm";
import { GROWW_DEFAULT_APP } from "@/lib/pipeline/constants";

export const runtime = "nodejs";
export const maxDuration = 300;

function stage(id: string, label: string): PipelineStageState {
  return { id: id as PipelineStageState["id"], label, status: "pending", message: "" };
}

export async function POST() {
  const canCallLLM = await hasLLMKey();
  const useRealLLM = canCallLLM && !isSandboxCredentials();
  if (!useRealLLM) {
    return NextResponse.json(
      {
        error:
          "GLM_API_KEY is not set on this deployment (or the set credentials are sandbox-only). Get your own GLM API key from https://z.ai/, set it as the GLM_API_KEY env var, then redeploy.",
      },
      { status: 503 }
    );
  }

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

  // 1. Import -- always live Play Store fetching (real-time)
  setStage("import", { status: "active", message: "Fetching live Groww reviews from Play Store..." });
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
  setStage("import", {
    status: "done",
    message: `Imported ${reviews.length} live reviews from Play Store.`,
    detail: usedFallback ? fallbackReason : undefined,
  });

  // 2. Group -- PII scrub + theme classification (Groww fixed legend)
  setStage("group", { status: "active", message: "Scrubbing PII + classifying themes..." });
  const scrubbed = scrubReviews(reviews);
  let themeList: string[] = [];
  let classified: Review[] = scrubbed;
  let groupWarning: string | undefined;
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
    groupWarning = `Themes unavailable -- using rating-based fallback. Classifier error: ${msg}`;
  }
  const themes = buildThemeBreakdown(classified);
  setStage("group", {
    status: "done",
    message: `${themes.length} themes identified.`,
    detail: groupWarning,
  });

  // 3. Note generation
  setStage("note", { status: "active", message: "Generating weekly note..." });
  const dateRange = defaultDateRange();
  let note;
  let noteWarning: string | undefined;
  try {
    note = await generateWeeklyNote(classified, themes, appName, dateRange);
  } catch (err) {
    const msg = (err as Error).message ?? "note generation failed";
    note = {
      appName,
      dateRange,
      markdown: `## Top Themes\n${themes.slice(0, 3).map((t) => `- ${t.theme} (${Math.round(t.share * 100)}%, ${t.count} reviews, avg ${t.avgRating} stars)`).join("\n")}\n\n## What Users Are Saying\n${classified.slice(0, 3).map((r) => `- (${r.rating} stars): "${r.text.slice(0, 140)}"`).join("\n")}\n\n## Action Ideas\n- Review the top theme above with the product team\n- Investigate the lowest-rated reviews for specific issues\n- Confirm the date range covers the most recent week`,
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
    noteWarning = `LLM note generation failed (${msg}). Showing structured fallback.`;
  }
  setStage("note", {
    status: "done",
    message: `Note generated -- ${note.wordCount} words.`,
    detail: noteWarning,
  });

  // 4. Email draft
  setStage("email", { status: "active", message: "Drafting email..." });
  let email;
  let emailWarning: string | undefined;
  try {
    email = await draftEmail(note);
  } catch (err) {
    email = {
      subject: `${appName} weekly review pulse`.slice(0, 60),
      body: note.markdown,
    };
    emailWarning = `LLM email drafting failed (${(err as Error).message}). Using note markdown as fallback.`;
  }
  setStage("email", {
    status: "done",
    message: "Email draft ready.",
    detail: emailWarning,
  });

  const result: PipelineResult = {
    reviews: classified,
    themes,
    note,
    email,
    stages,
    meta: {
      appName,
      source: "play_store",
      dateRange,
      reviewCount: classified.length,
      usedFallback,
      fallbackReason,
    },
  };

  return NextResponse.json(result);
}
