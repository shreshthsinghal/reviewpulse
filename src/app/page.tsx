"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Settings as SettingsIcon } from "lucide-react";
import { Logo } from "@/components/reviewpulse/logo";
import { ThemeToggle } from "@/components/reviewpulse/theme-toggle";
import { LandingView } from "@/components/reviewpulse/views/landing-view";
import { InputView } from "@/components/reviewpulse/views/input-view";
import { ProcessingView } from "@/components/reviewpulse/views/processing-view";
import { DashboardView } from "@/components/reviewpulse/views/dashboard-view";
import { NoteView } from "@/components/reviewpulse/views/note-view";
import { EmailView } from "@/components/reviewpulse/views/email-view";
import { SettingsView } from "@/components/reviewpulse/views/settings-view";
import type {
  AppInput,
  PipelineResult,
  PipelineStageState,
} from "@/lib/pipeline/types";
import { useTheme } from "next-themes";

type ViewId =
  | "intro"
  | "input"
  | "processing"
  | "dashboard"
  | "note"
  | "email"
  | "settings";

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
  // SSR + first client render must agree. We always init introDone=false so
  // SSR matches the first client render; if reduced motion is preferred on
  // the client, we flip introDone=true in an effect after mount.
  const [introDone, setIntroDone] = React.useState(false);
  // introFading tracks the brief fade-out window after the animation has
  // finished but before the overlay unmounts. Lets the overlay fade out
  // gracefully instead of being yanked.
  const [introFading, setIntroFading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [input, setInput] = React.useState<AppInput | null>(null);
  const [stages, setStages] = React.useState<PipelineStageState[]>(INITIAL_STAGES);
  const [result, setResult] = React.useState<PipelineResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (reduceMotion) setIntroDone(true);
  }, [reduceMotion]);

  function handleIntroComplete() {
    setIntroFading(true);
    // Unmount the overlay after the fade-out animation completes.
    setTimeout(() => {
      setIntroDone(true);
      setIntroFading(false);
    }, 500);
  }

  // Stages update in real time as each API call completes (see runPipeline below).

  // Helper: safe fetch + JSON parse. Returns { ok, status, data, error }.
  async function safeFetchJson(url: string, body: any): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      return { ok: false, status: 0, data: null, error: `Network error: ${e?.message ?? e}` };
    }
    const rawText = await res.text();
    let data: any = null;
    if (rawText) {
      try {
        data = JSON.parse(rawText);
      } catch {
        return {
          ok: false,
          status: res.status,
          data: null,
          error: `Server returned a non-JSON response (status ${res.status}). This usually means the function timed out -- the pipeline takes 5-10s per stage which fits within Vercel's 10s Hobby tier limit, but a slow LLM response can push it over. Try again.`,
        };
      }
    }
    if (!res.ok) {
      return { ok: false, status: res.status, data, error: data?.error || `Stage failed (${res.status})` };
    }
    return { ok: true, status: res.status, data };
  }

  async function runPipeline(appInput: AppInput) {
    setBusy(true);
    setError(null);
    setInput(appInput);
    setStages(INITIAL_STAGES);
    setView("processing");

    // Helper to update one stage's status
    const setStage = (id: PipelineStageState["id"], patch: Partial<PipelineStageState>) => {
      setStages((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    };

    try {
      // ------------------------------------------------------------- Stage 1: Import
      setStage("import", { status: "active", message: "Fetching reviews..." });
      const importRes = await safeFetchJson("/api/pipeline-import", { input: appInput });
      if (!importRes.ok) throw new Error(importRes.error);
      const { reviews, appName, usedFallback, fallbackReason, reviewCount } = importRes.data;
      setStage("import", {
        status: "done",
        message: usedFallback
          ? `Imported ${reviewCount} reviews (sample fallback).`
          : `Imported ${reviewCount} reviews from source.`,
        detail: fallbackReason,
      });

      // ------------------------------------------------------------- Stage 2: Group
      setStage("group", { status: "active", message: "Scrubbing PII + classifying themes..." });
      const groupRes = await safeFetchJson("/api/pipeline-group", { reviews, appName });
      if (!groupRes.ok) throw new Error(groupRes.error);
      const { reviews: classified, themes: themeList, themeBreakdown, warning: groupWarning } = groupRes.data;
      setStage("group", {
        status: "done",
        message: `${themeBreakdown.length} themes identified.`,
        detail: groupWarning,
      });

      // ------------------------------------------------------------- Stage 3: Note
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

      // ------------------------------------------------------------- Stage 4: Email
      setStage("email", { status: "active", message: "Drafting email..." });
      const emailRes = await safeFetchJson("/api/pipeline-email", { note });
      if (!emailRes.ok) throw new Error(emailRes.error);
      const { email, warning: emailWarning } = emailRes.data;
      setStage("email", {
        status: "done",
        message: "Email draft ready.",
        detail: emailWarning,
      });

      // Assemble the final result object for the dashboard
      const finalResult: PipelineResult = {
        reviews: classified,
        themes: themeBreakdown,
        note,
        email,
        stages: [
          { id: "import", label: "Import", status: "done", message: usedFallback ? `Imported ${reviewCount} reviews (sample fallback).` : `Imported ${reviewCount} reviews from source.`, detail: fallbackReason },
          { id: "group", label: "Group", status: "done", message: `${themeBreakdown.length} themes identified.`, detail: groupWarning },
          { id: "note", label: "Generate Note", status: "done", message: `Note generated -- ${note.wordCount} words.`, detail: noteWarning },
          { id: "email", label: "Draft Email", status: "done", message: "Email draft ready.", detail: emailWarning },
        ],
        meta: {
          appName,
          source: appInput.kind === "groww_default" ? "sample" : appInput.kind === "playstore_search" ? "play_store" : appInput.kind === "pdf" ? "pdf_upload" : "image_upload",
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
      setView((prev) => (prev === "processing" ? "input" : prev));
    } finally {
      setBusy(false);
    }
  }

  function handleRerun() {
    if (input) runPipeline(input);
    else setView("intro");
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Sticky nav -- hidden during the intro animation so it doesn't peek
          out from behind the overlay. Appears as soon as intro starts fading
          out or when the user navigates to any other view. */}
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
            {/* Intro overlay -- fully covers the page and blocks interaction
                until the logo animation completes (~2s, or instant for
                reduced-motion). The landing content underneath only fades
                in once the overlay starts fading out, so users never see a
                half-rendered page. */}
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
            {/* Landing content fades in only after intro animation finishes
                (introFading=true) -- keeps the page from being interactive
                mid-animation. */}
            <div
              className={
                introFading || introDone
                  ? "opacity-100 transition-opacity duration-500"
                  : "opacity-0 pointer-events-none"
              }
            >
              <LandingView
                introDone={introFading || introDone}
                onGrowwDefault={() =>
                  runPipeline({ kind: "groww_default", appName: "Groww" })
                }
                onChooseDifferent={() => setView("input")}
              />
            </div>
          </>
        )}

        {view === "input" && (
          <>
            {error && (
              <div className="mx-auto max-w-4xl px-6 pt-6">
                <div className="rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              </div>
            )}
            <InputView
              busy={busy}
              onSubmit={runPipeline}
              onBack={() => {
                setError(null);
                setView("intro");
              }}
            />
          </>
        )}

        {view === "processing" && (
          <ProcessingView
            stages={stages}
            appName={input?.appName ?? "Groww"}
          />
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

      {/* Footer -- sticks to bottom */}
      <footer className="mt-auto border-t border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-6 py-4 sm:flex-row sm:items-center">
          <div className="text-xs text-muted-foreground">
            ReviewPulse | weekly app review pulse | public data only | PII-scrubbed
          </div>
          <div className="text-xs text-muted-foreground/70">
            Import {"->"} Group {"->"} Note {"->"} Email
          </div>
        </div>
      </footer>
    </div>
  );
}
