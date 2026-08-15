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

  // Live stepper animation — we simulate stage activation while the real
  // /api/pipeline call is in flight. The server returns the final stages;
  // this is just UX sugar to make the pipeline visibly progress. Timers
  // are generous because real classification with chunking can take 20-30s
  // for apps with many reviews (e.g. Spotify returns 300+).
  React.useEffect(() => {
    if (view !== "processing") return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setStages((s) =>
          s.map((x) =>
            x.id === "import" ? { ...x, status: "active", message: "Fetching reviews…" } : x
          )
        );
      }, 100)
    );
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setStages((s) =>
          s.map((x) =>
            x.id === "group"
              ? { ...x, status: "active", message: "Scrubbing PII + classifying themes…" }
              : x.id === "import"
              ? { ...x, status: "done", message: "Reviews imported." }
              : x
          )
        );
      }, 2500)
    );
    timers.push(
      setTimeout(() => {
        if (cancelled) return;
        setStages((s) =>
          s.map((x) =>
            x.id === "note"
              ? { ...x, status: "active", message: "Generating weekly note…" }
              : x.id === "group"
              ? { ...x, status: "done", message: "Themes identified." }
              : x
          )
        );
      }, 8000)
    );
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [view]);

  async function runPipeline(appInput: AppInput) {
    setBusy(true);
    setError(null);
    setInput(appInput);
    setStages(INITIAL_STAGES);
    setView("processing");
    try {
      const res = await fetch("/api/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: appInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Pipeline failed (${res.status})`);
      }
      setResult(data as PipelineResult);
      setStages((data as PipelineResult).stages);
      setView("dashboard");
    } catch (e: any) {
      setError(e.message || "Pipeline failed");
      setView("input");
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
      {/* Sticky nav — hidden during the intro animation so it doesn't peek
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
            {/* Intro overlay — fully covers the page and blocks interaction
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
                (introFading=true) — keeps the page from being interactive
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

      {/* Footer — sticks to bottom */}
      <footer className="mt-auto border-t border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-6 py-4 sm:flex-row sm:items-center">
          <div className="text-xs text-muted-foreground">
            ReviewPulse · weekly app review pulse · public data only · PII-scrubbed
          </div>
          <div className="text-xs text-muted-foreground/70">
            Import → Group → Note → Email
          </div>
        </div>
      </footer>
    </div>
  );
}
