import SubmitForm from "@/components/SubmitForm";

export default function SubmitPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Submit content</h1>
        <p className="mt-1 text-sm text-gray-500">
          Submit text or images to test the moderation pipeline
        </p>
      </div>
      <div className="max-w-2xl">
        <SubmitForm />
      </div>
    </div>
  );
}
