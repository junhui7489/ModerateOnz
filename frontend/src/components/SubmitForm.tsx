import { useState, useRef } from "react";
import { Upload, Send, X } from "lucide-react";
import { useSubmitContent } from "@/hooks/useApi";

export default function SubmitForm() {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mutation = useSubmitContent();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text && !file) return;

    const formData = new FormData();
    if (text) formData.append("text_content", text);
    if (file) formData.append("media", file);

    mutation.mutate(formData, {
      onSuccess: () => {
        setText("");
        setFile(null);
        if (fileRef.current) fileRef.current.value = "";
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="card">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">
        Submit content for moderation
      </h3>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter text content to moderate..."
        rows={3}
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder-gray-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 resize-none"
      />

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="hidden"
            id="media-upload"
          />
          <label
            htmlFor="media-upload"
            className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload image
          </label>
          {file && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              {file.name}
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>

        <button
          type="submit"
          disabled={(!text && !file) || mutation.isPending}
          className="btn-primary flex items-center gap-1.5 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" />
          {mutation.isPending ? "Submitting..." : "Submit"}
        </button>
      </div>

      {mutation.isError && (
        <p className="mt-2 text-xs text-red-600">
          Failed to submit. Please try again.
        </p>
      )}
      {mutation.isSuccess && (
        <p className="mt-2 text-xs text-emerald-600">
          Content submitted and queued for moderation.
        </p>
      )}
    </form>
  );
}
