"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight, Search, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { Logo } from "../logo";
import { Button } from "@/components/ui/button";

interface Props {
  onGrowwDefault: () => void;
  introDone: boolean;
  busy: boolean;
  error: string | null;
}

export function LandingView({ onGrowwDefault, introDone, busy, error }: Props) {
  const reduceMotion = useReducedMotion();
  return (
    <div className="relative">
      {/* Masthead rule */}
      <div className="masthead-rule" />

      <section className="mx-auto max-w-6xl px-6 pt-16 pb-20 sm:pt-24">
        <motion.div
          className="grid gap-12 lg:grid-cols-[1.4fr_1fr] lg:gap-16 items-center"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={introDone ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
              Live weekly review pulse | for product, growth, support &amp; leadership
            </div>

            <h1 className="mt-5 text-5xl sm:text-6xl font-bold leading-[1.05] tracking-tight text-foreground">
              What users said about Groww{" "}
              <span className="relative whitespace-nowrap">
                <span className="text-[var(--primary)]">this week</span>
                <svg
                  className="absolute -bottom-2 left-0 w-full"
                  height="8"
                  viewBox="0 0 200 8"
                  preserveAspectRatio="none"
                >
                  <path
                    d="M2 5 Q 60 1, 100 4 T 198 5"
                    stroke="var(--primary)"
                    strokeWidth="2"
                    fill="none"
                    strokeLinecap="round"
                    opacity="0.5"
                  />
                </svg>
              </span>
              ,
              <br />
              in one scannable page.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              ReviewPulse fetches the last 8-12 weeks of public Play Store
              reviews for Groww, groups them into {"<=5"} themes, drafts a
              {"<=250"}-word weekly note with 3 real quotes &amp; 3 action
              ideas, and writes the email for you. No dashboards to dig
              through. No PII anywhere. Real-time -- runs fresh every time
              you open it.
            </p>

            {error && (
              <div className="mt-6 rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                onClick={onGrowwDefault}
                disabled={busy}
                className="h-12 px-6 bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90 rounded-full font-semibold"
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Running pipeline...
                  </>
                ) : (
                  <>
                    Analyze Groww&apos;s Weekly Pulse
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground/80">
              <span>4-stage pipeline | Import {"->"} Group {"->"} Note {"->"} Email</span>
              <span className="hidden sm:inline"> - </span>
              <span>Live Play Store data</span>
              <span className="hidden sm:inline"> - </span>
              <span>PII-scrubbed</span>
            </div>
          </div>

          {/* Right column: visual pipeline diagram */}
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 20 }}
            animate={introDone ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <div className="rounded-2xl border border-border bg-[var(--surface)] p-6 shadow-sm">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Logo size={22} />
                  <span className="text-sm font-semibold">Pipeline</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  Runs live every time
                </span>
              </div>
              <ol className="mt-4 space-y-3 text-sm">
                {[
                  { n: "01", label: "Import", desc: "Live Play Store reviews (last 8-12 weeks)", icon: <Search className="h-4 w-4" /> },
                  { n: "02", label: "Group", desc: "PII scrub + <=5 themes", icon: <FileText className="h-4 w-4" /> },
                  { n: "03", label: "Generate Note", desc: "<=250 words | 3 themes | 3 quotes", icon: <FileText className="h-4 w-4" /> },
                  { n: "04", label: "Draft Email", desc: "Subject + body, ready to send", icon: <ImageIcon className="h-4 w-4" /> },
                ].map((s) => (
                  <li
                    key={s.n}
                    className="flex items-start gap-3 rounded-lg border border-border/60 bg-background px-3 py-2.5"
                  >
                    <span className="text-xs font-semibold text-[var(--primary)] pt-0.5">
                      {s.n}
                    </span>
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{s.label}</div>
                      <div className="text-xs text-muted-foreground">{s.desc}</div>
                    </div>
                    <span className="text-muted-foreground/60">{s.icon}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Editorial accent */}
            <div className="absolute -bottom-3 -right-2 rotate-3 rounded-md border border-[var(--primary)]/30 bg-[var(--primary)]/5 px-3 py-1 text-xs text-[var(--primary)]">
              {"<= 250"} words | 3 themes | 3 quotes | 3 actions
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* Below-the-fold feature strip */}
      {introDone && (
        <motion.section
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="border-t border-border bg-[var(--surface)]"
        >
          <div className="mx-auto max-w-6xl px-6 py-12 grid gap-8 sm:grid-cols-3">
            <FeatureBlock
              kicker="For product / growth"
              title="Know what to fix next, fast"
              body="Top 3 themes by volume + sentiment, surfaced as 3 concrete action ideas a team could ship this week."
            />
            <FeatureBlock
              kicker="For support"
              title="Acknowledge what users are saying"
              body="3 real, PII-scrubbed user quotes per week -- verbatim wording, attributed only to theme + star rating."
            />
            <FeatureBlock
              kicker="For leadership"
              title="A 30-second pulse, every week"
              body="One scannable page, no dashboards to dig through. Trend line + sentiment split, optional email."
            />
          </div>
        </motion.section>
      )}
    </div>
  );
}

function FeatureBlock({
  kicker,
  title,
  body,
}: {
  kicker: string;
  title: string;
  body: string;
}) {
  return (
    <div>
      <div className="text-xs text-[var(--primary)]">
        {kicker}
      </div>
      <h3 className="mt-2 text-lg font-semibold text-foreground">
        {title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
