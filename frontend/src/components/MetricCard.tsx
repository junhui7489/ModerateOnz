import { clsx } from "clsx";
import type { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  subtextColor?: "green" | "red" | "amber" | "gray";
  icon?: ReactNode;
}

const subtextColors = {
  green: "text-emerald-600",
  red: "text-red-600",
  amber: "text-amber-600",
  gray: "text-gray-500",
};

export default function MetricCard({
  label,
  value,
  subtext,
  subtextColor = "gray",
  icon,
}: MetricCardProps) {
  return (
    <div className="rounded-xl bg-white border border-gray-200 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {subtext && (
            <p className={clsx("mt-1 text-sm", subtextColors[subtextColor])}>
              {subtext}
            </p>
          )}
        </div>
        {icon && (
          <div className="rounded-lg bg-gray-50 p-2 text-gray-400">{icon}</div>
        )}
      </div>
    </div>
  );
}
