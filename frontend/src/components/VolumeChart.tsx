import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { DailyVolume } from "@/types";
import { format, parseISO } from "date-fns";

interface Props {
  data: DailyVolume[];
}

export default function VolumeChart({ data }: Props) {
  if (!data.length) {
    return (
      <div className="flex h-60 items-center justify-center text-sm text-gray-400">
        No volume data yet
      </div>
    );
  }

  const formatted = data.map((d) => ({
    ...d,
    label: format(parseISO(d.date), "EEE"),
  }));

  return (
    <div>
      <div className="flex gap-4 mb-3">
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />
          Approved
        </span>
        <span className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="h-2.5 w-2.5 rounded-sm bg-red-500" />
          Flagged
        </span>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={formatted} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
          <XAxis
            dataKey="label"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#9ca3af" }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 12, fill: "#9ca3af" }}
            tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : String(v))}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid #e5e7eb",
              fontSize: "13px",
            }}
          />
          <Bar dataKey="approved" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
          <Bar dataKey="flagged" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
