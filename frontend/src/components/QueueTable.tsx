import { useState } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { MessageSquare, Image, AlertTriangle } from "lucide-react";
import { StatusBadge, CategoryBadge } from "@/components/StatusBadge";
import { useReviewContent } from "@/hooks/useApi";
import ContentDetailModal from "@/components/ContentDetailModal";
import type { ContentWithResults, FlagCategory } from "@/types";

interface Props {
  items: ContentWithResults[];
}

function ContentIcon({ type }: { type: string }) {
  if (type === "image") return <Image className="h-5 w-5" />;
  if (type === "mixed")
    return (
      <div className="flex gap-0.5">
        <MessageSquare className="h-4 w-4" />
        <Image className="h-4 w-4" />
      </div>
    );
  return <MessageSquare className="h-5 w-5" />;
}

/** Strip the [youtube:...] source tag for the preview */
function getPreviewText(text: string | null): string {
  if (!text) return "Image upload";
  return text.replace(/\n\n\[youtube:[^\]]+\]$/, "").trim();
}

/** Extract the YouTube commenter name from the source tag */
function getCommenterName(text: string | null, fallback: string): string {
  if (!text) return fallback;
  const match = text.match(/\|author:([^\]]+)\]$/);
  return match ? match[1] : fallback;
}

function getTopFlag(results: ContentWithResults["moderation_results"]): {
  category: FlagCategory;
  confidence: number;
} | null {
  const flags = results.filter((r) => r.category !== "clean");
  if (!flags.length) return null;
  flags.sort((a, b) => b.confidence - a.confidence);
  return { category: flags[0].category, confidence: flags[0].confidence };
}

export default function QueueTable({ items }: Props) {
  const [selectedItem, setSelectedItem] = useState<ContentWithResults | null>(
    null
  );
  const reviewMutation = useReviewContent();

  const handleAction = (
    e: React.MouseEvent,
    id: string,
    action: "approved" | "rejected"
  ) => {
    e.stopPropagation();
    reviewMutation.mutate({ id, action: { action } });
  };

  if (!items.length) {
    return (
      <div className="card flex flex-col items-center justify-center py-12 text-gray-400">
        <AlertTriangle className="mb-2 h-8 w-8" />
        <p className="text-sm">No items in the queue</p>
      </div>
    );
  }

  return (
    <>
      <div className="card overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/60 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-5 py-3 w-10"></th>
              <th className="px-5 py-3">Content</th>
              <th className="px-5 py-3">Category</th>
              <th className="px-5 py-3">Confidence</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((item) => {
              const topFlag = getTopFlag(item.moderation_results);
              return (
                <tr
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className="hover:bg-gray-50/50 transition cursor-pointer"
                >
                  <td className="px-5 py-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
                      <ContentIcon type={item.content_type} />
                    </div>
                  </td>
                  <td className="px-5 py-4 max-w-xs">
                    <p className="truncate font-medium text-gray-900">
                      {getPreviewText(item.text_content)}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {getCommenterName(item.text_content, item.author?.username ?? "unknown")} &middot;{" "}
                      {formatDistanceToNow(parseISO(item.created_at), {
                        addSuffix: true,
                      })}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    {topFlag ? (
                      <CategoryBadge category={topFlag.category} />
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 font-medium tabular-nums">
                    {topFlag ? (
                      <span
                        className={
                          topFlag.confidence >= 0.85
                            ? "text-red-600"
                            : topFlag.confidence >= 0.65
                            ? "text-amber-600"
                            : "text-gray-500"
                        }
                      >
                        {(topFlag.confidence * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-emerald-600">Clean</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-5 py-4">
                    {(item.status === "pending" ||
                      item.status === "in_review" ||
                      item.status === "flagged") && (
                      <div className="flex gap-2">
                        <button
                          onClick={(e) => handleAction(e, item.id, "approved")}
                          disabled={reviewMutation.isPending}
                          className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition"
                        >
                          Approve
                        </button>
                        <button
                          onClick={(e) => handleAction(e, item.id, "rejected")}
                          disabled={reviewMutation.isPending}
                          className="rounded-md bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 transition"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedItem && (
        <ContentDetailModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </>
  );
}
