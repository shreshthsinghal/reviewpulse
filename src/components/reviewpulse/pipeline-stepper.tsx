"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import type { PipelineStageState } from "@/lib/pipeline/types";

interface Props {
  stages: PipelineStageState[];
  /** Compact = horizontal, inline; default = vertical, large. */
  variant?: "default" | "compact";
}

const ORDER: PipelineStageState["id"][] = ["import", "group", "note", "email"];

export function PipelineStepper({ stages, variant = "default" }: Props) {
  const reduceMotion = useReducedMotion();
  const ordered = ORDER.map((id) => stages.find((s) => s.id === id)!).filter(
    Boolean
  );

  if (variant === "compact") {
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {ordered.map((s, i) => (
          <React.Fragment key={s.id}>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
                s.status === "done"
                  ? "bg-[var(--primary)]/10 text-[var(--primary)]"
                  : s.status === "active"
                  ? "bg-muted text-foreground stage-active"
                  : s.status === "error"
                  ? "bg-red-500/10 text-red-500"
                  : "bg-muted/50 text-muted-foreground"
              }`}
            >
              <StageIcon status={s.status} size={12} reduceMotion={reduceMotion} />
              <span>{s.label}</span>
            </span>
            {i < ordered.length - 1 && (
              <span className="text-muted-foreground/50">{" -> "}</span>
            )}
          </React.Fragment>
        ))}
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {ordered.map((s, i) => {
        const isLast = i === ordered.length - 1;
        return (
          <li key={s.id} className="relative flex gap-3">
            {/* Connector */}
            {!isLast && (
              <div
                className={`absolute left-[14px] top-7 h-[calc(100%-12px)] w-px ${
                  s.status === "done" ? "bg-[var(--primary)]" : "bg-border"
                }`}
              />
            )}
            <div
              className={`relative z-10 flex h-7 w-7 flex-none items-center justify-center rounded-full border ${
                s.status === "done"
                  ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : s.status === "active"
                  ? "border-[var(--primary)] bg-background text-[var(--primary)] stage-active"
                  : s.status === "error"
                  ? "border-red-500 bg-red-500/10 text-red-500"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              <StageIcon status={s.status} size={14} reduceMotion={reduceMotion} />
            </div>
            <div className="flex-1 pb-1 pt-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <div className="text-sm font-semibold text-foreground">
                  {s.label}
                </div>
                <div className="text-xs text-muted-foreground">
                  Stage {i + 1} / {ordered.length}
                </div>
              </div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                {s.message || (s.status === "pending" ? "Pending..." : "")}
              </div>
              {s.detail && (
                <div className="mt-1 text-xs text-muted-foreground/80 italic">
                  {s.detail}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function StageIcon({
  status,
  size,
  reduceMotion,
}: {
  status: PipelineStageState["status"];
  size: number;
  reduceMotion: boolean | null;
}) {
  if (status === "done")
    return <Check style={{ width: size, height: size }} />;
  if (status === "active")
    return (
      <Loader2
        style={{ width: size, height: size }}
        className={reduceMotion ? "" : "animate-spin"}
      />
    );
  if (status === "error")
    return <AlertTriangle style={{ width: size, height: size }} />;
  return (
    <span
      style={{ width: size / 2, height: size / 2 }}
      className="block rounded-full bg-current opacity-40"
    />
  );
}
