"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-10">
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm font-medium text-red-700">문제가 발생했습니다.</p>
        <p className="mt-1 text-xs text-red-600">{error.message || "알 수 없는 오류"}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 cursor-pointer rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
