import { clsx } from "clsx";
import type { ModerationStatus, FlagCategory } from "@/types";

const statusStyles: Record<ModerationStatus, string> = {
  pending: "bg-amber-50 text-amber-700 ring-amber-600/20",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  flagged: "bg-red-50 text-red-700 ring-red-600/20",
  in_review: "bg-blue-50 text-blue-700 ring-blue-600/20",
  rejected: "bg-gray-100 text-gray-700 ring-gray-600/20",
};

const categoryStyles: Record<FlagCategory, string> = {
  toxicity: "bg-red-50 text-red-700 ring-red-600/20",
  nsfw: "bg-orange-50 text-orange-700 ring-orange-600/20",
  spam: "bg-amber-50 text-amber-700 ring-amber-600/20",
  violence: "bg-red-100 text-red-800 ring-red-700/20",
  hate_speech: "bg-purple-50 text-purple-700 ring-purple-600/20",
  clean: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

const statusLabels: Record<ModerationStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  flagged: "Flagged",
  in_review: "In review",
  rejected: "Rejected",
};

const categoryLabels: Record<FlagCategory, string> = {
  toxicity: "Toxicity",
  nsfw: "NSFW",
  spam: "Spam",
  violence: "Violence",
  hate_speech: "Hate speech",
  clean: "Clean",
};

export function StatusBadge({ status }: { status: ModerationStatus }) {
  return (
    <span
      className={clsx(
        "badge ring-1 ring-inset",
        statusStyles[status]
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

export function CategoryBadge({ category }: { category: FlagCategory }) {
  return (
    <span
      className={clsx(
        "badge ring-1 ring-inset",
        categoryStyles[category]
      )}
    >
      {categoryLabels[category]}
    </span>
  );
}
