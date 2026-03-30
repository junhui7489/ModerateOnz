import { useState } from "react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { MessageSquare, Image, AlertTriangle, X } from "lucide-react";
import { StatusBadge, CategoryBadge } from "@/components/StatusBadge";
import { useReviewContent } from "@/hooks/useApi";
import ContentDetailModal from "@/components/ContentDetailModal";
import type { ContentWithResults, FlagCategory } from "@/types";

const REJECT_CATEGORIES: { value: FlagCategory; label: string }[] = [
  { value: "toxicity", label: "Toxicity" },
  { value: "nsfw", label: "NSFW" },
  { value: "spam", label: "Spam" },
  { value: "violence", label: "Violence" },
  { value: "hate_speech", label: "Hate Speech" },
];

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

function getTopResult(results: ContentWithResults["moderation_results"]): {
  category: FlagCategory;
  confidence: number;
} | null {
  if (!results.length) return null;
  // Prefer non-clean flags; fall back to the top clean result
  const flags = results.filter((r) => r.category !== "clean");
  if (flags.length) {
    flags.sort((a, b) => b.confidence - a.confidence);
    return { category: flags[0].category, confidence: flags[0].confidence };
  }
  // All clean — return the highest-confidence clean result
  const sorted = [...results].sort((a, b) => b.confidence - a.confidence);
  return { category: sorted[0].category, confidence: sorted[0].confidence };
}

export default function QueueTable({ items }: Props) {
  const [selectedItem, setSelectedItem] = useState<ContentWithResults | null>(
    null
  );
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectCategory, setRejectCategory] = useState<FlagCategory>("toxicity");
  const [rejectReason, setRejectReason] = useState("");
  const reviewMutation = useReviewContent();

  const handleApprove = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    reviewMutation.mutate({ id, action: { action: "approved" } });
  };

  const openRejectModal = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setRejectingId(id);
    setRejectCategory("toxicity");
    setRejectReason("");
  };

  const submitReject = () => {
    if (!rejectingId) return;
    reviewMutation.mutate(
      {
        id: rejectingId,
        action: { action: "rejected", category: rejectCategory, reason: rejectReason || undefined },
      },
      { onSuccess: () => setRejectingId(null) }
    );
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
              const topFlag = getTopResult(item.moderation_results);
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
                          topFlag.category === "clean"
                            ? "text-emerald-600"
                            : topFlag.confidence >= 0.85
                            ? "text-red-600"
                            : topFlag.confidence >= 0.65
                            ? "text-amber-600"
                            : "text-gray-500"
                        }
                      >
                        {(topFlag.confidence * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
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
                          onClick={(e) => handleApprove(e, item.id)}
                          disabled={reviewMutation.isPending}
                          className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition"
                        >
                          Approve
                        </button>
                        <button
                          onClick={(e) => openRejectModal(e, item.id)}
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

      {rejectingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setRejectingId(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Reject Content</h3>
              <button
                onClick={() => setRejectingId(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              value={rejectCategory}
              onChange={(e) => setRejectCategory(e.target.value as FlagCategory)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {REJECT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason (optional)
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="Why is this content being rejected?"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRejectingId(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={submitReject}
                disabled={reviewMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition disabled:opacity-50"
              >
                {reviewMutation.isPending ? "Rejecting..." : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
