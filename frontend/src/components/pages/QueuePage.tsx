import { useState } from "react";
import { clsx } from "clsx";
import QueueTable from "@/components/QueueTable";
import { useQueue } from "@/hooks/useApi";
import type { ModerationStatus } from "@/types";

const filters: { label: string; value: ModerationStatus | undefined }[] = [
  { label: "All", value: undefined },
  { label: "Pending", value: "pending" },
  { label: "In review", value: "in_review" },
  { label: "Flagged", value: "flagged" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

export default function QueuePage() {
  const [activeFilter, setActiveFilter] = useState<ModerationStatus | undefined>(
    undefined
  );
  const { data, isLoading } = useQueue(activeFilter, 50);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Review queue</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review and take action on flagged content
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        {filters.map((f) => (
          <button
            key={f.label}
            onClick={() => setActiveFilter(f.value)}
            className={clsx(
              "rounded-md px-3 py-1.5 text-xs font-medium transition",
              activeFilter === f.value
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        </div>
      ) : (
        <QueueTable items={data ?? []} />
      )}
    </div>
  );
}
