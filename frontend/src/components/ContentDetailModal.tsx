import { X, ExternalLink, User, Clock, Youtube } from "lucide-react";
import { format, parseISO } from "date-fns";
import { StatusBadge, CategoryBadge } from "@/components/StatusBadge";
import { useReviewContent } from "@/hooks/useApi";
import type { ContentWithResults } from "@/types";

interface Props {
  item: ContentWithResults;
  onClose: () => void;
}

/** Parse the `[youtube:COMMENT_ID|v:VIDEO_ID|author:NAME]` tag from text_content */
function parseSourceMeta(text: string | null) {
  if (!text) return { comment: text, videoId: null, author: null, commentId: null };

  const tagMatch = text.match(
    /\[youtube:([^\]|]+)(?:\|v:([^\]|]+))?(?:\|author:([^\]]+))?\]$/
  );

  if (!tagMatch) return { comment: text, videoId: null, author: null, commentId: null };

  const comment = text.slice(0, text.lastIndexOf("\n\n[youtube:")).trim();
  return {
    comment,
    commentId: tagMatch[1],
    videoId: tagMatch[2] || null,
    author: tagMatch[3] || null,
  };
}

export default function ContentDetailModal({ item, onClose }: Props) {
  const reviewMutation = useReviewContent();
  const { comment, videoId, author } = parseSourceMeta(item.text_content);

  const canReview =
    item.status === "pending" ||
    item.status === "in_review" ||
    item.status === "flagged";

  const handleAction = (action: "approved" | "rejected") => {
    reviewMutation.mutate(
      { id: item.id, action: { action } },
      { onSuccess: onClose }
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative mx-4 w-full max-w-2xl rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Content Details
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {/* Source info */}
          <div className="grid grid-cols-2 gap-4">
            {author && (
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User className="h-4 w-4 text-gray-400" />
                <span className="font-medium">{author}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Clock className="h-4 w-4 text-gray-400" />
              <span>
                {format(parseISO(item.created_at), "MMM d, yyyy 'at' h:mm a")}
              </span>
            </div>
            {videoId && (
              <div className="col-span-2 flex items-center gap-2 text-sm">
                <Youtube className="h-4 w-4 text-red-500" />
                <a
                  href={`https://www.youtube.com/watch?v=${videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 hover:text-brand-700 hover:underline inline-flex items-center gap-1"
                >
                  View source video
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>

          {/* Full comment */}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">
              Full Comment
            </label>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
              {comment || "No text content"}
            </div>
          </div>

          {/* Moderation results */}
          {item.moderation_results.length > 0 && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">
                Moderation Results
              </label>
              <div className="space-y-2">
                {item.moderation_results.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2.5"
                  >
                    <div className="flex items-center gap-3">
                      <CategoryBadge category={r.category} />
                      <span className="text-xs text-gray-500">
                        {r.model_name}
                      </span>
                    </div>
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        r.confidence >= 0.85
                          ? "text-red-600"
                          : r.confidence >= 0.65
                          ? "text-amber-600"
                          : "text-emerald-600"
                      }`}
                    >
                      {(r.confidence * 100).toFixed(1)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium uppercase tracking-wider text-gray-500">
              Status
            </label>
            <StatusBadge status={item.status} />
          </div>
        </div>

        {/* Footer actions */}
        {canReview && (
          <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
            <button
              onClick={() => handleAction("rejected")}
              disabled={reviewMutation.isPending}
              className="rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={() => handleAction("approved")}
              disabled={reviewMutation.isPending}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition disabled:opacity-50"
            >
              Approve
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
