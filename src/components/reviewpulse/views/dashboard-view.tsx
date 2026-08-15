"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  RotateCw,
  FileText,
  Mail,
  Download,
  AlertTriangle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { PipelineStepper } from "../pipeline-stepper";
import { RatingTrendChart } from "../charts/rating-trend";
import { ThemeVolumeChart } from "../charts/theme-volume";
import { RatingDistributionChart } from "../charts/rating-distribution";
import { SentimentDonut } from "../charts/sentiment-donut";
import type {
  PipelineResult,
  RatingDistribution,
  RatingTrendPoint,
  SentimentSplit,
} from "@/lib/pipeline/types";
import { buildRatingTrend, buildRatingDistribution, buildSentimentSplit } from "@/lib/pipeline/client-utils";
import { MIN_REVIEWS_FOR_CHARTS } from "@/lib/pipeline/constants";

interface Props {
  result: PipelineResult;
  onBack: () => void;
  onRerun: () => void;
  onViewNote: () => void;
  onViewEmail: () => void;
}

export function DashboardView({
  result,
  onBack,
  onRerun,
  onViewNote,
  onViewEmail,
}: Props) {
  const reduceMotion = useReducedMotion();
  const { note, themes, reviews, meta } = result;

  // Build chart data
  const trend = React.useMemo<RatingTrendPoint[]>(
    () => buildRatingTrend(reviews),
    [reviews]
  );

  const distribution = React.useMemo<RatingDistribution[]>(
    () => buildRatingDistribution(reviews),
    [reviews]
  );

  const sentiment = React.useMemo<SentimentSplit>(
    () => buildSentimentSplit(reviews),
    [reviews]
  );

  const enoughForCharts = reviews.length >= MIN_REVIEWS_FOR_CHARTS;

  return (
    <div className="mx-auto max-w-6xl px-6 pt-8 pb-20">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          New analysis
        </button>
        <div className="flex items-center gap-2">
          <PipelineStepper stages={result.stages} variant="compact" />
          <Button
            variant="outline"
            size="sm"
            onClick={onRerun}
            className="h-8 rounded-full"
          >
            <RotateCw className="mr-1.5 h-3 w-3" />
            Re-run
          </Button>
        </div>
      </div>

      {/* Masthead */}
      <div className="masthead-rule mt-4" />
      <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-xs text-[var(--primary)]">
            Weekly Pulse · {meta.appName}
          </div>
          <h1 className="mt-2 text-4xl sm:text-5xl font-bold tracking-tight">
            {meta.appName} — this week, at a glance
          </h1>
          <div className="mt-2 text-xs text-muted-foreground">
            {meta.dateRange.start} → {meta.dateRange.end} · {meta.reviewCount} reviews
            {meta.usedFallback && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                sample fallback in use
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onViewNote} className="rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90">
            <FileText className="mr-1.5 h-4 w-4" />
            View one-pager
          </Button>
          <Button variant="outline" onClick={onViewEmail} className="rounded-full">
            <Mail className="mr-1.5 h-4 w-4" />
            Email draft
          </Button>
        </div>
      </div>

      {/* Pinned note (prominent — not buried) */}
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mt-8 rounded-2xl border border-[var(--primary)]/30 bg-[var(--surface)] p-6 sm:p-8 shadow-sm"
      >
        <div className="flex items-baseline justify-between border-b border-border pb-3">
          <div className="text-lg font-semibold">Weekly Note · ≤250 words</div>
          <div className="text-xs text-muted-foreground">
            {note.wordCount} words · {note.quotes.length} quotes · {note.actions.length} actions
          </div>
        </div>
        <div className="prose-pulse mt-4 text-sm leading-relaxed text-foreground">
          <ReactMarkdown>{note.markdown}</ReactMarkdown>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onViewNote} className="rounded-full">
            <Download className="mr-1.5 h-3 w-3" />
            PDF / Markdown
          </Button>
        </div>
      </motion.div>

      {/* Charts grid */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <ChartCard title="Rating trend" subtitle="Average rating per week (last 8–12 wks)">
          {enoughForCharts ? (
            <RatingTrendChart data={trend} />
          ) : (
            <FallbackMsg reviews={reviews.length} />
          )}
        </ChartCard>

        <ChartCard
          title="Theme volume"
          subtitle={`All ${themes.length} themes by review count`}
        >
          <ThemeVolumeChart data={themes} />
        </ChartCard>

        <ChartCard title="Rating distribution" subtitle="Spot polarization vs. consensus">
          {enoughForCharts ? (
            <RatingDistributionChart data={distribution} />
          ) : (
            <FallbackMsg reviews={reviews.length} />
          )}
        </ChartCard>

        <ChartCard title="Sentiment split" subtitle="Derived from rating + light LLM tag">
          {enoughForCharts ? (
            <SentimentDonut data={sentiment} />
          ) : (
            <FallbackMsg reviews={reviews.length} />
          )}
        </ChartCard>
      </div>

      {/* How this was built */}
      <div className="mt-10 rounded-xl border border-border bg-[var(--surface)] p-5">
        <div className="text-xs text-muted-foreground">
          How this note was built
        </div>
        <div className="mt-3">
          <PipelineStepper stages={result.stages} variant="compact" />
        </div>
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-[var(--surface)] p-5 shadow-sm">
      <div className="flex items-baseline justify-between border-b border-border pb-2">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">
          {subtitle}
        </span>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function FallbackMsg({ reviews }: { reviews: number }) {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      Not enough reviews yet ({reviews} found). Charts appear once we have{" "}
      {MIN_REVIEWS_FOR_CHARTS}+ reviews in the window.
    </div>
  );
}
