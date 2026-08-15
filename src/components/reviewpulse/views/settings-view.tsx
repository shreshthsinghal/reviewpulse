"use client";

import * as React from "react";
import { ArrowLeft, RotateCw, Info, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GROWW_THEME_LEGEND } from "@/lib/pipeline/constants";

interface Props {
  onBack: () => void;
  onRerun: () => void;
}

export function SettingsView({ onBack, onRerun }: Props) {
  return (
    <div className="mx-auto max-w-3xl px-6 pt-8 pb-20">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
      </button>

      <h1 className="mt-6 text-3xl sm:text-4xl font-bold tracking-tight">
        Settings &amp; About
      </h1>

      <div className="mt-6 space-y-5">
        <section className="rounded-xl border border-border bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold">This week</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Re-run the pipeline for the current week. Pulls the latest reviews
            from the configured source and regenerates the note + email draft.
          </p>
          <Button onClick={onRerun} className="mt-3 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90">
            <RotateCw className="mr-2 h-4 w-4" />
            Re-run for this week
          </Button>
        </section>

        <section className="rounded-xl border border-border bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Info className="h-4 w-4 text-[var(--primary)]" />
            How this works
          </h2>
          <div className="mt-3 space-y-3 text-sm text-muted-foreground leading-relaxed">
            <p>
              ReviewPulse runs a 4-stage pipeline:{" "}
              <span className="text-foreground">Import {"->"} Group {"->"} Generate Note {"->"} Draft Email</span>.
              All four stages run server-side via Next.js API routes, with an
              LLM doing classification, summarization and drafting.
            </p>
            <ol className="ml-4 list-decimal space-y-2">
              <li>
                <strong>Import:</strong> fetches public reviews (Play Store listing,
                App Store RSS, uploaded PDF, or uploaded screenshot). All sources
                resolve to the same internal schema -- and that schema has{" "}
                <em>no</em> PII field by design.
              </li>
              <li>
                <strong>Group:</strong> runs a deterministic PII scrub (emails,
                phones, IDs, handles, name patterns) and then LLM classifies each
                review into one of {"<=5"} themes. For Groww specifically, the fixed
                theme legend below is used; for other apps, themes are proposed
                dynamically by the LLM from the actual review content.
              </li>
              <li>
                <strong>Generate Note:</strong> drafts a weekly one-pager -- top 3
                themes, 3 real PII-scrubbed quotes, 3 action ideas, {"<=250"} words.
                A second LLM pass verifies no residual PII in the 3 selected
                quotes.
              </li>
              <li>
                <strong>Draft Email:</strong> writes a subject + body in email-
                appropriate plain text, signed off as ReviewPulse.
              </li>
            </ol>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold">Theme legend (Groww default)</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            These 5 themes are used when analyzing Groww. For any other app,
            themes are discovered dynamically -- but always capped at 5.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {GROWW_THEME_LEGEND.map((t, i) => (
              <li
                key={t}
                className="flex items-center gap-3 rounded-lg border border-border/60 bg-background px-3 py-2"
              >
                <span className="text-xs font-semibold text-[var(--primary)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-sm font-medium">{t}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[var(--primary)]" />
            Data sources &amp; PII
          </h2>
          <div className="mt-3 space-y-2 text-sm text-muted-foreground leading-relaxed">
            <p>
              <strong className="text-foreground">Public data only.</strong>{" "}
              Play Store public listing pages and Apple&apos;s public per-app RSS
              feed. No login walls, no Console/Developer APIs (those require app
              ownership), no CAPTCHA bypass.
            </p>
            <p>
              <strong className="text-foreground">No PII anywhere.</strong> The
              internal schema has no field for username, email, phone, or device
              ID by design -- enforced by omission, not by a filter. A two-pass
              scrub (deterministic + LLM verification on the 3 selected quotes)
              runs on every export path.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
