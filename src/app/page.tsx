"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Settings as SettingsIcon } from "lucide-react";
import { Logo } from "@/components/reviewpulse/logo";
import { ThemeToggle } from "@/components/reviewpulse/theme-toggle";
import { LandingView } from "@/components/reviewpulse/views/landing-view";
import { ProcessingView } from "@/components/reviewpulse/views/processing-view";
import { DashboardView } from "@/components/reviewpulse/views/dashboard-view";
import { NoteView } from "@/components/reviewpulse/views/note-view";
import { EmailView } from "@/components/reviewpulse/views/email-view";
import { SettingsView } from "@/components/reviewpulse/views/settings-view";
import type { PipelineResult, PipelineStageState } from "@/lib/pipeline/types";
import { useTheme } from "next-themes";

type ViewId = "intro" | "processing" | "dashboard" | "note" | "email" | "settings";

const INITIAL_STAGES: PipelineStageState[] = [
  { id: "import", label: "Import", status: "pending", message: "" },
  { id: "group", label: "Group", status: "pending", message: "" },
  { id: "note", label: "Generate Note", status: "pending", message: "" },
  { id: "email", label: "Draft Email", status: "pending", message: "" },
];

export default function Home() {
  const reduceMotion = useReducedMotion();
  const { resolvedTheme } = useTheme();
  const [view, setView] = React.useState<ViewId>("intro");
  const [introDone, setIntroDone] = React.useState(false);
  const [introFading, setIntroFading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [stages, setStages] = React.useState<PipelineStageState[]>(INITIAL_STAGES);
  const [result, setResult] = React.useState<PipelineResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (reduceMotion) setIntroDone(true);
  }, [reduceMotion]);

  function handleIntroComplete() {
    setIntroFading(true);
    setTimeout(() => {
      setIntroDone(true);
      setIntroFading(false);
    }, 500);
  }

  // Helper: safe fetch + JSON parse with automatic retry on 504/timeout.
  // Vercel Hobby tier caps functions at 10s; the LLM call sometimes takes
  // 8-12s and gets killed. Retrying usually succeeds because the LLM is
  // faster on the second attempt (warm connection, less load).
  async function safeFetchJson(url: string, body: any, retries = 2): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e: any) {
      // Network error -- retry if we have retries left
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 1500));
        return safeFetchJson(url, body, retries - 1);
      }
      return { ok: false, status: 0, data: null, error: `Network error: ${e?.message ?? e}` };
    }
    const rawText = await res.text();
    let data: any = null;
    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        // Non-JSON response (usually the 504 timeout HTML page)
        if (retries > 0 && (res.status === 504 || res.status === 502)) {
          await new Promise((r) => setTimeout(r, 1500));
          return safeFetchJson(url, body, retries - 1);
        }
        return {
          ok: false,
          status: res.status,
          data: null,
          error: `Server returned a non-JSON response (status ${res.status}). This usually means the function timed out.`,
        };
      }
    }
    if (!res.ok) {
      // Retry on 504/502 (gateway timeouts from Vercel)
      if (retries > 0 && (res.status === 504 || res.status === 502)) {
        await new Promise((r) => setTimeout(r, 1500));
        return safeFetchJson(url, body, retries - 1);
      }
      return { ok: false, status: res.status, data, error: data?.error || `Pipeline failed (${res.status})` };
    }
    return { ok: true, status: res.status, data };
  }

  async function runPipeline() {
    setBusy(true);
    setError(null);
    setStages(INITIAL_STAGES);
    setView("processing");

    const setStage = (id: PipelineStageState["id"], patch: Partial<PipelineStageState>) => {
      setStages((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    };

    try {
      // Stage 1: Import -- fetch live Groww reviews from Play Store
      setStage("import", { status: "active", message: "Fetching live Groww reviews from Play Store..." });
      const importRes = await safeFetchJson("/api/pipeline-import", {});
      if (!importRes.ok) throw new Error(importRes.error);
      const { reviews, appName, usedFallback, fallbackReason, reviewCount } = importRes.data;
      setStage("import", {
        status: "done",
        message: `Imported ${reviewCount} live reviews from Play Store.`,
        detail: usedFallback ? fallbackReason : undefined,
      });

      // Stage 2: Group -- PII scrub + theme classification
      setStage("group", { status: "active", message: "Scrubbing PII + classifying themes..." });
      const groupRes = await safeFetchJson("/api/pipeline-group", { reviews, appName });
      if (!groupRes.ok) throw new Error(groupRes.error);
      const { reviews: classified, themeBreakdown, warning: groupWarning } = groupRes.data;
      setStage("group", {
        status: "done",
        message: `${themeBreakdown.length} themes identified.`,
        detail: groupWarning,
      });

      // Stage 3: Note -- generate weekly one-pager
      setStage("note", { status: "active", message: "Generating weekly note..." });
      const today = new Date().toISOString().slice(0, 10);
      const twelveWeeksAgo = new Date();
      twelveWeeksAgo.setDate(twelveWeeksAgo.getDate() - 84);
      const dateRange = { start: twelveWeeksAgo.toISOString().slice(0, 10), end: today };
      const noteRes = await safeFetchJson("/api/pipeline-note", {
        reviews: classified,
        themes: themeBreakdown,
        appName,
        dateRange,
      });
      if (!noteRes.ok) throw new Error(noteRes.error);
      const { note, warning: noteWarning } = noteRes.data;
      setStage("note", {
        status: "done",
        message: `Note generated -- ${note.wordCount} words.`,
        detail: noteWarning,
      });

      // Stage 4: Email -- draft subject + body
      setStage("email", { status: "active", message: "Drafting email..." });
      const emailRes = await safeFetchJson("/api/pipeline-email", { note });
      if (!emailRes.ok) throw new Error(emailRes.error);
      const { email, warning: emailWarning } = emailRes.data;
      setStage("email", {
        status: "done",
        message: "Email draft ready.",
        detail: emailWarning,
      });

      // Assemble final result for the dashboard
      const finalResult: PipelineResult = {
        reviews: classified,
        themes: themeBreakdown,
        note,
        email,
        stages: [
          { id: "import", label: "Import", status: "done", message: `Imported ${reviewCount} live reviews from Play Store.`, detail: usedFallback ? fallbackReason : undefined },
          { id: "group", label: "Group", status: "done", message: `${themeBreakdown.length} themes identified.`, detail: groupWarning },
          { id: "note", label: "Generate Note", status: "done", message: `Note generated -- ${note.wordCount} words.`, detail: noteWarning },
          { id: "email", label: "Draft Email", status: "done", message: "Email draft ready.", detail: emailWarning },
        ],
        meta: {
          appName,
          source: "play_store",
          dateRange,
          reviewCount,
          usedFallback,
          fallbackReason,
        },
      };
      setResult(finalResult);
      setStages(finalResult.stages);
      setView("dashboard");
    } catch (e: any) {
      let msg = e?.message || String(e) || "Pipeline failed";
      if (/429|too many requests/i.test(msg)) {
        msg = "The LLM API is rate-limiting us. Please wait ~30 seconds and try again.";
      } else if (/timeout|timed out|aborted/i.test(msg)) {
        msg = "The pipeline timed out. Wait a minute and try again.";
      }
      setError(msg);
      setView("intro");
    } finally {
      setBusy(false);
    }
  }

  function handleRerun() {
    runPipeline();
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header
        className={`sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 ${
          introFading || introDone || view !== "intro" ? "opacity-100" : "opacity-0 pointer-events-none"
        } transition-opacity duration-300`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <button
            onClick={() => setView("intro")}
            className="flex items-center"
            aria-label="ReviewPulse home"
          >
            <Logo size={28} withWordmark />
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setView("settings")}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Settings"
            >
              <SettingsIcon className="h-4 w-4" />
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {view === "intro" && (
          <>
            {!introDone && (
              <motion.div
                initial={{ opacity: 1 }}
                animate={{ opacity: introFading ? 0 : 1 }}
                transition={{ duration: 0.5, ease: "easeInOut" }}
                className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
                style={{ pointerEvents: introFading ? "none" : "auto" }}
              >
                <Logo
                  size={120}
                  intro
                  onIntroComplete={handleIntroComplete}
                />
              </motion.div>
            )}
            <div
              className={
                introFading || introDone
                  ? "opacity-100 transition-opacity duration-500"
                  : "opacity-0 pointer-events-none"
              }
            >
              <LandingView
                introDone={introFading || introDone}
                busy={busy}
                error={error}
                onGrowwDefault={runPipeline}
              />
            </div>
          </>
        )}

        {view === "processing" && (
          <ProcessingView stages={stages} appName="Groww" />
        )}

        {view === "dashboard" && result && (
          <DashboardView
            result={result}
            onBack={() => setView("intro")}
            onRerun={handleRerun}
            onViewNote={() => setView("note")}
            onViewEmail={() => setView("email")}
          />
        )}

        {view === "note" && result && (
          <NoteView result={result} onBack={() => setView("dashboard")} />
        )}

        {view === "email" && result && (
          <EmailView result={result} onBack={() => setView("dashboard")} />
        )}

        {view === "settings" && (
          <SettingsView
            onBack={() => setView(result ? "dashboard" : "intro")}
            onRerun={handleRerun}
          />
        )}
      </main>

      <footer className="mt-auto border-t border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-6 py-4 sm:flex-row sm:items-center">
          <div className="text-xs text-muted-foreground">
            ReviewPulse | weekly Groww review pulse | live data | PII-scrubbed
          </div>
          <div className="text-xs text-muted-foreground/70">
            Import {"->"} Group {"->"} Note {"->"} Email
          </div>
        </div>
      </footer>
    </div>
  );
}
