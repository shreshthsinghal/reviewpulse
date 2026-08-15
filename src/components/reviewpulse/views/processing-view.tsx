"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PipelineStepper } from "../pipeline-stepper";
import type { PipelineStageState } from "@/lib/pipeline/types";

interface Props {
  stages: PipelineStageState[];
  appName: string;
}

const STAGE_FACTS: Record<string, string> = {
  import:
    "Fetching public reviews from Play Store + App Store listings. We never touch authenticated endpoints.",
  group:
    "Stripping PII deterministically (emails, phones, IDs, handles), then classifying each review into one of ≤5 themes via LLM.",
  note:
    "Drafting the weekly one-pager: top 3 themes, 3 real PII-scrubbed quotes, 3 concrete action ideas — under 250 words.",
  email:
    "Writing a subject + body, then running a second LLM pass to verify no residual PII in the 3 selected quotes.",
};

export function ProcessingView({ stages, appName }: Props) {
  const reduceMotion = useReducedMotion();
  const activeStage = stages.find((s) => s.status === "active");
  const activeId = activeStage?.id ?? "import";

  return (
    <div className="mx-auto max-w-3xl px-6 pt-16 pb-24">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center"
      >
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--primary)]">
          Pipeline running · {appName}
        </div>
        <h1 className="mt-3 font-display text-3xl sm:text-4xl font-bold tracking-tight">
          Building your weekly pulse
        </h1>
        <p className="mt-3 text-muted-foreground">
          Four stages, each shown as it happens. This isn&apos;t a spinner —
          it&apos;s the product explaining itself.
        </p>
      </motion.div>

      <div className="mt-10 rounded-2xl border border-border bg-[var(--surface)] p-6 sm:p-8 shadow-sm">
        <PipelineStepper stages={stages} />

        <div className="mt-6 rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            What this stage is doing
          </div>
          <div className="mt-1.5 text-sm leading-relaxed text-foreground">
            {STAGE_FACTS[activeId] ?? ""}
          </div>
        </div>
      </div>

      {/* Editorial pulse animation — the "signal"*/}
      <div className="mt-8 flex items-center justify-center gap-1.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="h-1.5 w-8 rounded-full bg-[var(--primary)]"
            initial={reduceMotion ? false : { opacity: 0.3 }}
            animate={reduceMotion ? { opacity: 0.8 } : { opacity: [0.3, 0.9, 0.3] }}
            transition={{
              duration: 1.4,
              repeat: reduceMotion ? 0 : Infinity,
              delay: i * 0.12,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}
