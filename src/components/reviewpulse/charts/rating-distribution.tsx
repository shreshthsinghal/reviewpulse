"use client";

import * as React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { RatingDistribution } from "@/lib/pipeline/types";

const COLORS: Record<number, string> = {
  1: "var(--chart-5)",
  2: "var(--chart-2)",
  3: "var(--chart-3)",
  4: "var(--chart-4)",
  5: "var(--chart-1)",
};

export function RatingDistributionChart({ data }: { data: RatingDistribution[] }) {
  if (data.length === 0) return null;
  const chartData = data.map((d) => ({
    rating: `${d.rating}*`,
    count: d.count,
    raw: d.rating,
  }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
        <XAxis
          dataKey="rating"
          stroke="var(--muted-foreground)"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          tick={{ fontFamily: "var(--font-plex-mono)" }}
        />
        <YAxis
          stroke="var(--muted-foreground)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
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
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
        />
        <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={32}>
          {chartData.map((d, i) => (
            <Cell key={i} fill={COLORS[d.raw] ?? "var(--chart-1)"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
