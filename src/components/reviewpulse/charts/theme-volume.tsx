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
import type { ThemeBreakdown } from "@/lib/pipeline/types";
import { THEME_PALETTE } from "@/lib/pipeline/constants";

export function ThemeVolumeChart({ data }: { data: ThemeBreakdown[] }) {
  if (data.length === 0) return null;
  const chartData = data.map((d) => ({
    name: d.theme,
    count: d.count,
    avg: d.avgRating,
  }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 44)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 0, right: 24, left: 8, bottom: 0 }}
      >
        <XAxis
          type="number"
          stroke="var(--muted-foreground)"
          fontSize={11}
          tickLine={false}
          axisLine={{ stroke: "var(--border)" }}
          tick={{ fontFamily: "var(--font-plex-mono)" }}
          allowDecimals={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          stroke="var(--muted-foreground)"
          fontSize={11}
          width={120}
          tickLine={false}
          axisLine={false}
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
          cursor={{ fill: "var(--muted)", opacity: 0.4 }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={18}>
          {chartData.map((_, i) => (
            <Cell key={i} fill={THEME_PALETTE[i % THEME_PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
