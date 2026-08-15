"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";

interface LogoProps {
  size?: number;
  withWordmark?: boolean;
  /** When true, runs the full intro animation sequence (used on landing). */
  intro?: boolean;
  onIntroComplete?: () => void;
  className?: string;
}

/**
 * ReviewPulse logo — built on Gestalt principles.
 *
 * The mark fuses two ideas through closure + figure-ground:
 *  - a speech bubble (review)
 *  - an upward checkmark / trend line (signal going up)
 * The shape only "resolves" once the stroke draws in and the negative space
 * completes the bubble outline. A small three-dot cluster at the lower-left
 * uses proximity/similarity to suggest a "lens" — the analyst's eye on the
 * signal.
 *
 * Animation sequence (spec §7.4, ≤2s, skippable, reduced-motion fallback):
 *  0.0 – 0.6s : stroke draws in (outline only)
 *  0.6 – 0.9s : fill fades in
 *  0.9 – 1.1s : closure settle/bounce
 *  1.1 – 1.6s : mark scales down + slides into nav position
 *  1.6 – 2.0s : wordmark fades in
 */
export function Logo({
  size = 40,
  withWordmark = false,
  intro = false,
  onIntroComplete,
  className,
}: LogoProps) {
  const reduceMotion = useReducedMotion();
  const [introDone, setIntroDone] = React.useState(!intro || reduceMotion);

  React.useEffect(() => {
    if (!intro || reduceMotion) {
      onIntroComplete?.();
      return;
    }
    const t = setTimeout(() => {
      setIntroDone(true);
      onIntroComplete?.();
    }, 2000);
    return () => clearTimeout(t);
  }, [intro, reduceMotion, onIntroComplete]);

  // The path itself: a rounded speech-bubble outline whose tail doubles as
  // an upward trend stroke ending in a small checkmark kink. SVG pathLength
  // is normalized to 1 so the stroke draw animation is consistent.
  const mark = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="ReviewPulse logo"
    >
      <motion.path
        d="M8 9.5C8 7.567 9.567 6 11.5 6h25C38.433 6 40 7.567 40 9.5v17c0 1.933-1.567 3.5-3.5 3.5H22l-7.5 7.2c-1.2 1.16-3.21.32-3.21-1.32V30H11.5C9.567 30 8 28.433 8 26.5v-17z"
        fill="var(--primary)"
        stroke="var(--primary)"
        strokeWidth={2.5}
        strokeLinejoin="round"
        pathLength={1}
        initial={intro && !reduceMotion ? { pathLength: 0, opacity: 0 } : false}
        animate={
          intro && !reduceMotion
            ? {
                pathLength: [0, 1, 1],
                opacity: [0, 1, 1],
                fillOpacity: [0, 0, 1],
              }
            : {}
        }
        transition={{
          duration: 1.1,
          times: [0, 0.55, 1],
          ease: "easeOut",
        }}
      />
      {/* The trend line + checkmark kink — the "pulse" inside the bubble */}
      <motion.path
        d="M14 24L21 18L26 22L34 13"
        stroke="var(--background)"
        strokeWidth={2.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        pathLength={1}
        initial={intro && !reduceMotion ? { pathLength: 0 } : false}
        animate={intro && !reduceMotion ? { pathLength: 1 } : {}}
        transition={{
          delay: 0.55,
          duration: 0.55,
          ease: "easeOut",
        }}
      />
      {/* Three-dot "lens" cluster — proximity/similarity supporting motif */}
      <motion.g
        initial={intro && !reduceMotion ? { opacity: 0, scale: 0 } : false}
        animate={
          intro && !reduceMotion ? { opacity: 1, scale: 1 } : {}
        }
        transition={{ delay: 0.95, duration: 0.3, ease: "easeOut" }}
      >
        <circle cx="14" cy="40" r="1.6" fill="var(--primary)" />
        <circle cx="18" cy="40" r="1.6" fill="var(--primary)" />
        <circle cx="22" cy="40" r="1.6" fill="var(--primary)" />
      </motion.g>
    </svg>
  );

  return (
    <motion.div
      className={`flex items-center gap-2 ${className ?? ""}`}
      initial={
        intro && !reduceMotion ? { scale: 1.4, opacity: 0 } : false
      }
      animate={
        intro && !reduceMotion
          ? {
              scale: introDone ? 1 : 1.4,
              opacity: introDone ? 1 : 0,
            }
          : {}
      }
      transition={{
        delay: 1.1,
        duration: 0.5,
        ease: "easeInOut",
      }}
    >
      {mark}
      {withWordmark && (
        <motion.span
          className="font-display text-lg font-bold tracking-tight text-foreground"
          initial={
            intro && !reduceMotion ? { opacity: 0, x: -8 } : false
          }
          animate={
            intro && !reduceMotion
              ? { opacity: introDone ? 1 : 0, x: introDone ? 0 : -8 }
              : {}
          }
          transition={{ delay: 1.5, duration: 0.4, ease: "easeOut" }}
        >
          Review<span style={{ color: "var(--primary)" }}>Pulse</span>
        </motion.span>
      )}
    </motion.div>
  );
}
