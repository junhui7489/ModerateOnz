import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { CategoryBreakdown } from "@/types";

const COLORS: Record<string, string> = {
  toxicity: "#ef4444",
  nsfw: "#f97316",
  spam: "#eab308",
  violence: "#dc2626",
  hate_speech: "#a855f7",
};

interface Props {
  data: CategoryBreakdown[];
}

export default function CategoryChart({ data }: Props) {
  if (!data.length) {
    return (
      <div className="flex h-60 items-center justify-center text-sm text-gray-400">
        No category data yet
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-3">
        {data.map((item) => (
          <span key={item.category} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: COLORS[item.category] || "#94a3b8" }}
            />
            {item.category} {item.percentage}%
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="count"
            nameKey="category"
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={90}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((entry) => (
              <Cell
                key={entry.category}
                fill={COLORS[entry.category] || "#94a3b8"}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [
              `${value} (${data.find((d) => d.category === name)?.percentage ?? 0}%)`,
              name,
            ]}
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              fontSize: "13px",
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
