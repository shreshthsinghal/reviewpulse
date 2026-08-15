"use client";

import * as React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { SentimentSplit } from "@/lib/pipeline/types";

const COLORS = {
  positive: "var(--chart-4)",
  neutral: "var(--chart-3)",
  negative: "var(--chart-5)",
};

export function SentimentDonut({ data }: { data: SentimentSplit }) {
  const total = data.positive + data.neutral + data.negative;
  if (total === 0) return null;
  const chartData = [
    { name: "Positive", value: data.positive, color: COLORS.positive },
    { name: "Neutral", value: data.neutral, color: COLORS.neutral },
    { name: "Negative", value: data.negative, color: COLORS.negative },
  ];
  return (
    <div className="flex items-center gap-4">
      <ResponsiveContainer width="50%" height={160}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={42}
            outerRadius={68}
            paddingAngle={2}
            stroke="none"
          >
            {chartData.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
              fontFamily: "var(--font-plex-mono)",
              color: "var(--foreground)",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-2 text-sm">
        {chartData.map((d) => (
          <div key={d.name} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: d.color }}
            />
            <span className="text-foreground">{d.name}</span>
            <span className="ml-auto font-mono text-xs text-muted-foreground">
              {d.value} · {Math.round((d.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
