"use client";

import * as React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { RatingTrendPoint } from "@/lib/pipeline/types";

export function RatingTrendChart({ data }: { data: RatingTrendPoint[] }) {
  if (data.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
        <XAxis
          dataKey="week"
          stroke="var(--muted-foreground)"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          tick={{ fontFamily: "var(--font-plex-mono)" }}
        />
        <YAxis
          domain={[1, 5]}
          ticks={[1, 2, 3, 4, 5]}
          stroke="var(--muted-foreground)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tick={{ fontFamily: "var(--font-plex-mono)" }}
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
            fontFamily: "var(--font-plex-mono)",
            color: "var(--foreground)",
          }}
          labelStyle={{ color: "var(--muted-foreground)" }}
        />
        <ReferenceLine y={3} stroke="var(--border)" strokeDasharray="3 3" />
        <Line
          type="monotone"
          dataKey="avg"
          stroke="var(--chart-1)"
          strokeWidth={2.5}
          dot={{ r: 4, fill: "var(--chart-1)", strokeWidth: 0 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
