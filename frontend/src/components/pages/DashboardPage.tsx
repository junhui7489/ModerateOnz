import {
  BarChart3,
  ShieldAlert,
  CheckCircle2,
  Clock,
} from "lucide-react";
import MetricCard from "@/components/MetricCard";
import CategoryChart from "@/components/CategoryChart";
import VolumeChart from "@/components/VolumeChart";
import QueueTable from "@/components/QueueTable";
import { useDashboard, useQueue } from "@/hooks/useApi";

export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboard();
  const { data: recentItems } = useQueue(undefined, 5);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="card text-center text-sm text-red-600">
        Failed to load dashboard data. Make sure the backend is running.
      </div>
    );
  }

  const { metrics, categories, daily_volume } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">
          ModerateOnz
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Real-time overview of moderation activity
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total reviewed"
          value={metrics.total_reviewed}
          icon={<BarChart3 className="h-5 w-5" />}
        />
        <MetricCard
          label="Flagged"
          value={metrics.flagged_count}
          subtext={`${metrics.flag_rate}% flag rate`}
          subtextColor="red"
          icon={<ShieldAlert className="h-5 w-5" />}
        />
        <MetricCard
          label="Auto-approved"
          value={metrics.auto_approved}
          subtext={`${metrics.approval_rate}% approval rate`}
          subtextColor="green"
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <MetricCard
          label="Pending review"
          value={metrics.pending_count}
          subtext={`~${metrics.avg_wait_hours}h avg wait`}
          subtextColor="amber"
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">
            Flags by category
          </h2>
          <CategoryChart data={categories} />
        </div>
        <div className="card">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">
            Daily volume (last 7 days)
          </h2>
          <VolumeChart data={daily_volume} />
        </div>
      </div>

      {/* Recent queue */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">
          Recent items
        </h2>
        <QueueTable items={recentItems ?? []} />
      </div>
    </div>
  );
}
